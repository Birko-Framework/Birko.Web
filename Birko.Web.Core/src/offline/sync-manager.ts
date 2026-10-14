import type { ActionQueue, QueuedAction, SyncResult } from './action-queue.js';
import type { ApiClient } from '../http/api-client.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface SyncManagerOptions {
  /** Interval in milliseconds for periodic sync attempts (default: 30000). */
  syncInterval?: number;
  /** HTTP status code treated as conflict (default: 409). */
  conflictStatus?: number;
  /**
   * Treat `404` on a replayed `DELETE` as **already applied** rather than as a failure (default: `true`).
   *
   * A DELETE's desired end state is "the resource is not there", which a 404 confirms — so re-sending it
   * can never do anything but 404 again. Left as a failure it is re-sent on every sync forever, because
   * `getPending()` includes `failed`.
   *
   * Turn this off only if your API uses 404 on DELETE to mean something a retry could fix. Note that a
   * 404 may also mean *someone else's row* (Birko's `RequireOwned` answers 404 for a foreign entity rather
   * than disclosing its existence); that is still drained, on the grounds that a write the caller may not
   * make will not start succeeding.
   */
  deleteMissingIsApplied?: boolean;
  /**
   * Delay before the first retry of a failed action, in ms (default: 5000). Each further failure doubles it, up
   * to `retryMaxMs`. An action is not re-sent before its delay is up, however often `sync()` runs.
   */
  retryBaseMs?: number;
  /** Longest delay between two attempts of one action, in ms (default: 900000, 15 minutes). */
  retryMaxMs?: number;
  /**
   * Attempts after which a failing action becomes `dead` instead of being retried (default: 10). A response that a
   * retry cannot fix makes it `dead` at once — see {@link SyncManager} for which ones.
   */
  maxRetries?: number;
  /**
   * The lock manager that lets one tab drain the queue at a time (default: `navigator.locks`, or `null` where the
   * browser has none). While a tab holds the lock, another tab's `sync()` sends nothing. Pass `null` to opt out.
   */
  locks?: LockManager | null;
  /**
   * Without a lock manager, how old a `syncing` action must be before it counts as abandoned by a closed tab, in ms
   * (default: 300000, 5 minutes). Keep it above the longest a request can take, or a slow send is sent twice.
   */
  syncLeaseMs?: number;
  /** Clock, for tests (default: `Date.now`). */
  now?: () => number;
}

/**
 * How a replayed write's response is read when draining the outbox.
 *
 * `applied` is the case the first version of this class had no name for: the write **did** land, and the
 * only evidence is a non-2xx status. Reading it as `failed` retries it forever; reading it as `conflict`
 * asks the user to resolve a write that already succeeded.
 */
type ReplayOutcome = 'applied' | 'conflict' | 'failed' | 'dead';

const NOTHING: SyncResult = { synced: 0, failed: 0, conflicts: 0, dead: 0 };

// ── SyncManager ────────────────────────────────────────────────────────────

/**
 * Drains an {@link ActionQueue} against the API, oldest first.
 *
 * A write that fails is retried with exponential backoff (`retryBaseMs` doubling to `retryMaxMs`), and becomes
 * `dead` after `maxRetries` attempts — or at once when the server's answer is one a retry cannot change: a 4xx
 * other than 401, 408, 409 (the conflict status) and 429. A `dead` action stays in the queue for a failed-action
 * UI: {@link getDead}, {@link retry}, {@link discard}, {@link onDead}.
 *
 * Order is kept **per entity**: while one write to an entity is backing off or dead, later writes to the same
 * entity wait behind it, and writes to other entities go ahead. The entity is `metadata.entityType` +
 * `metadata.entityId`, or the action's `path` when no `entityId` is declared.
 *
 * An action is stored `syncing` while it is sent. One a closed tab left `syncing` (it may or may not have reached the
 * server) is recovered by the next sync: a PUT, a DELETE or an `idPinned` POST is sent again, keeping its retry count,
 * because a replay that already landed reads as applied; a plain POST or a PATCH becomes `dead`, because sending it
 * again could apply it twice, and the user decides through {@link retry} / {@link discard}. One tab drains at a time,
 * under a Web Lock; without Web Locks, a `syncing` action is abandoned once it is older than `syncLeaseMs`.
 */
export class SyncManager {
  private _syncing = false;
  private _conflictListeners = new Set<(action: QueuedAction, serverResponse: unknown) => void>();
  private _completeListeners = new Set<(result: SyncResult) => void>();
  private _deadListeners = new Set<(action: QueuedAction) => void>();
  private _retryBaseMs: number;
  private _retryMaxMs: number;
  private _maxRetries: number;
  private _now: () => number;
  private _queue: ActionQueue;
  private _api: ApiClient;
  private _conflictStatus: number;
  private _deleteMissingIsApplied: boolean;
  private _locks: LockManager | null;
  private _syncLeaseMs: number;
  private _intervalId: ReturnType<typeof setInterval> | null = null;
  // Retained so dispose() can unregister it — an inline arrow can't be removed and would keep the
  // disposed SyncManager (and its captured `this`) alive, firing sync() on every reconnect.
  private _onlineHandler = () => { this.sync(); };

  constructor(queue: ActionQueue, api: ApiClient, options: SyncManagerOptions = {}) {
    this._queue = queue;
    this._api = api;
    this._conflictStatus = options.conflictStatus ?? 409;
    this._deleteMissingIsApplied = options.deleteMissingIsApplied ?? true;
    this._retryBaseMs = options.retryBaseMs ?? 5_000;
    this._retryMaxMs = options.retryMaxMs ?? 900_000;
    this._maxRetries = options.maxRetries ?? 10;
    this._now = options.now ?? Date.now;
    this._locks = options.locks !== undefined ? options.locks : (navigator.locks ?? null);
    this._syncLeaseMs = options.syncLeaseMs ?? 300_000;

    // Auto-sync when coming back online
    window.addEventListener('online', this._onlineHandler);

    // Periodic sync attempt (catches edge cases)
    const interval = options.syncInterval ?? 30_000;
    this._intervalId = setInterval(() => {
      if (navigator.onLine && this._queue.pendingCount > 0) {
        this.sync();
      }
    }, interval);
  }

  get isSyncing(): boolean { return this._syncing; }

  /**
   * Send every action that is due, oldest first. An action still backing off, or one behind a write to the same
   * entity that is backing off, dead or being sent, is left for a later sync. Sends nothing while another tab is
   * draining the same queue.
   */
  async sync(): Promise<SyncResult> {
    if (this._syncing) return { ...NOTHING };
    this._syncing = true;

    let result: SyncResult | null;
    // try/finally so _syncing is always cleared — otherwise an exception from getPending()
    // (e.g. an IndexedDB open failure) or a queue write would leave _syncing stuck at true and
    // the guard above would permanently disable every future sync for the session.
    try {
      result = this._locks
        ? await this._locks.request(`birko-sync:${this._queue.name}`, { ifAvailable: true },
          (lock) => lock ? this._drain(true) : null)
        : await this._drain(false);
    } finally {
      this._syncing = false;
    }

    // Another tab holds the lock and is draining: nothing was done here.
    if (!result) return { ...NOTHING };
    this._notifyComplete(result);
    return result;
  }

  /** One pass over the queue. `exclusive`: this tab holds the drain lock, so no other tab is sending anything. */
  private async _drain(exclusive: boolean): Promise<SyncResult> {
    let synced = 0;
    let failed = 0;
    let conflicts = 0;
    let dead = 0;

    // Entities with a write that is not getting through: later writes to them wait, in order.
    const held = new Set<string>();
    const now = this._now();

    // A `syncing` action is one a closed tab left behind, unless another tab may still be sending it.
    for (const action of (await this._queue.getAll()).filter(a => a.status === 'syncing')) {
      const abandoned = exclusive || action.syncingSince === undefined || now - action.syncingSince >= this._syncLeaseMs;
      if (!abandoned) held.add(entityKey(action));
      else if (await this._recover(action)) dead++;
    }
    for (const action of await this._queue.getDead()) held.add(entityKey(action));
    const pending = await this._queue.getPending();

    for (const action of pending) {
      const key = entityKey(action);
      if (held.has(key)) continue;
      if (action.nextAttemptAt !== undefined && action.nextAttemptAt > now) {
        held.add(key);
        continue;
      }

      action.status = 'syncing';
      action.syncingSince = this._now();
      await this._queue.update(action);

      try {
        const resp = action.method === 'POST'
          ? await this._api.post(action.path, action.body)
          : action.method === 'PUT'
            ? await this._api.put(action.path, action.body)
            : action.method === 'PATCH'
              ? await this._api.patch(action.path, action.body)
              : await this._api.delete(action.path);

        const outcome = this._classifyReplay(action, resp.ok, resp.status);
        if (outcome === 'applied') {
          await this._queue.remove(action.id);
          synced++;
        } else if (outcome === 'conflict') {
          action.status = 'conflict';
          action.syncingSince = undefined;
          await this._queue.update(action);
          conflicts++;
          this._notifyConflict(action, resp.data);
        } else if (await this._fail(action, `HTTP ${resp.status}`, outcome === 'dead')) {
          dead++;
          held.add(key);
        } else {
          failed++;
          held.add(key);
        }
      } catch (e) {
        if (await this._fail(action, (e as Error).message, false)) dead++;
        else failed++;
        held.add(key);
      }
    }

    return { synced, failed, conflicts, dead };
  }

  /**
   * Put an abandoned `syncing` action back in line, or make it dead when sending it again could apply it twice.
   * Returns true when it died.
   */
  private async _recover(action: QueuedAction): Promise<boolean> {
    action.syncingSince = undefined;
    action.nextAttemptAt = undefined;
    const safe = action.method === 'PUT' || action.method === 'DELETE' || (action.method === 'POST' && !!action.metadata?.idPinned);
    if (safe) {
      action.status = 'failed';   // due now, with its retry count
      await this._queue.update(action);
      return false;
    }
    action.status = 'dead';
    action.lastError = 'Interrupted while sending: it may have been applied. Retry or discard it.';
    await this._queue.update(action);
    for (const fn of this._deadListeners) fn(action);
    return true;
  }

  /** Actions that gave up, oldest first. */
  getDead(): Promise<QueuedAction[]> {
    return this._queue.getDead();
  }

  /**
   * Put a `dead` (or `failed`) action back in line with a fresh schedule: sent on the next sync, with the full
   * retry budget. Returns false when there is no such action.
   */
  async retry(id: string): Promise<boolean> {
    const action = await this._queue.get(id);
    if (!action || (action.status !== 'dead' && action.status !== 'failed')) return false;
    action.status = 'pending';
    action.retries = 0;
    action.nextAttemptAt = undefined;
    await this._queue.update(action);
    return true;
  }

  /** Drop an action from the queue for good. Returns false when there is no such action. */
  async discard(id: string): Promise<boolean> {
    if (!await this._queue.get(id)) return false;
    await this._queue.remove(id);
    return true;
  }

  /** Subscribe to actions becoming `dead`. */
  onDead(fn: (action: QueuedAction) => void): () => void {
    this._deadListeners.add(fn);
    return () => this._deadListeners.delete(fn);
  }

  /** Subscribe to conflict events. */
  onConflict(fn: (action: QueuedAction, serverResponse: unknown) => void): () => void {
    this._conflictListeners.add(fn);
    return () => this._conflictListeners.delete(fn);
  }

  /** Subscribe to sync completion. */
  onSyncComplete(fn: (result: SyncResult) => void): () => void {
    this._completeListeners.add(fn);
    return () => this._completeListeners.delete(fn);
  }

  /** Stop periodic sync and unregister the online listener. */
  dispose(): void {
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
    window.removeEventListener('online', this._onlineHandler);
  }

  /**
   * Decide whether a replayed write **landed**, genuinely conflicts, or failed.
   *
   * A replay is not a first attempt, and the two extra cases below are both "the server already has what
   * this action was asking for" wearing a non-2xx status:
   *
   * - **`DELETE` → 404.** The row is gone, which is what the action wanted. Previously `failed`, and since
   *   `getPending()` includes `failed`, it was re-sent on every sync **forever** — for a resource that by
   *   definition can never answer anything else.
   * - **`POST` → conflict, when the action declared `idPinned`.** The write named its own target id, so an
   *   id clash means *this very create* already landed (a client-minted UUID does not collide with a
   *   stranger's row). Previously this raised a conflict, telling the user their **successful** write
   *   conflicted — and left the entry wedged, because a `conflict` entry is neither retried by
   *   `getPending()` nor removed by anything.
   *
   * `idPinned` is opt-in per write rather than inferred, because only the caller knows: a consumer whose
   * server mints ids has no pinned id to clash on, and a POST that can *also* be rejected for a business
   * reason with the same status (a uniqueness rule on some other column) must **not** declare it — that
   * rejection would be drained as success. See {@link ActionMetadata.idPinned}.
   *
   * `PUT` is deliberately absent: it is already addressed by id, so a conflict on one is about the
   * entity's *state* (an optimistic-concurrency clash), which is a real conflict for the user to resolve.
   */
  private _classifyReplay(action: QueuedAction, ok: boolean, status: number): ReplayOutcome {
    if (ok) return 'applied';
    if (action.method === 'DELETE' && status === 404 && this._deleteMissingIsApplied) return 'applied';
    if (status === this._conflictStatus) {
      return action.method === 'POST' && action.metadata?.idPinned ? 'applied' : 'conflict';
    }
    // The opt-out above says this API's 404 on DELETE is something a retry can fix.
    if (action.method === 'DELETE' && status === 404) return 'failed';
    return isUnrecoverable(status) ? 'dead' : 'failed';
  }

  /** Record a failed attempt: schedule the next one, or make the action dead. Returns true when it died. */
  private async _fail(action: QueuedAction, error: string, unrecoverable: boolean): Promise<boolean> {
    action.retries++;
    action.lastError = error;
    action.syncingSince = undefined;
    const dies = unrecoverable || action.retries >= this._maxRetries;
    if (dies) {
      action.status = 'dead';
      action.nextAttemptAt = undefined;
    } else {
      action.status = 'failed';
      const delay = Math.min(this._retryMaxMs, this._retryBaseMs * 2 ** (action.retries - 1));
      action.nextAttemptAt = this._now() + delay;
    }
    await this._queue.update(action);
    if (dies) for (const fn of this._deadListeners) fn(action);
    return dies;
  }

  private _notifyConflict(action: QueuedAction, serverResponse: unknown): void {
    for (const fn of this._conflictListeners) fn(action, serverResponse);
  }

  private _notifyComplete(result: SyncResult): void {
    for (const fn of this._completeListeners) fn(result);
  }
}

/** A 4xx a retry cannot change. 401 (signing in again), 408, 409 and 429 can change. */
function isUnrecoverable(status: number): boolean {
  return status >= 400 && status < 500 && status !== 401 && status !== 408 && status !== 409 && status !== 429;
}

/** The entity a write targets; writes to one entity keep their order. */
function entityKey(action: QueuedAction): string {
  const m = action.metadata;
  return m?.entityId ? `${m.entityType ?? ''}:${m.entityId}` : `path:${action.path}`;
}
