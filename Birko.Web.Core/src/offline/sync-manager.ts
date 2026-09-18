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
}

/**
 * How a replayed write's response is read when draining the outbox.
 *
 * `applied` is the case the first version of this class had no name for: the write **did** land, and the
 * only evidence is a non-2xx status. Reading it as `failed` retries it forever; reading it as `conflict`
 * asks the user to resolve a write that already succeeded.
 */
type ReplayOutcome = 'applied' | 'conflict' | 'failed';

// ── SyncManager ────────────────────────────────────────────────────────────

export class SyncManager {
  private _syncing = false;
  private _conflictListeners = new Set<(action: QueuedAction, serverResponse: unknown) => void>();
  private _completeListeners = new Set<(result: SyncResult) => void>();
  private _queue: ActionQueue;
  private _api: ApiClient;
  private _conflictStatus: number;
  private _deleteMissingIsApplied: boolean;
  private _intervalId: ReturnType<typeof setInterval> | null = null;
  // Retained so dispose() can unregister it — an inline arrow can't be removed and would keep the
  // disposed SyncManager (and its captured `this`) alive, firing sync() on every reconnect.
  private _onlineHandler = () => { this.sync(); };

  constructor(queue: ActionQueue, api: ApiClient, options: SyncManagerOptions = {}) {
    this._queue = queue;
    this._api = api;
    this._conflictStatus = options.conflictStatus ?? 409;
    this._deleteMissingIsApplied = options.deleteMissingIsApplied ?? true;

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

  /** Process all pending actions in FIFO order. */
  async sync(): Promise<SyncResult> {
    if (this._syncing) return { synced: 0, failed: 0, conflicts: 0 };
    this._syncing = true;

    let synced = 0;
    let failed = 0;
    let conflicts = 0;

    // try/finally so _syncing is always cleared — otherwise an exception from getPending()
    // (e.g. an IndexedDB open failure) or a queue write would leave _syncing stuck at true and
    // the guard above would permanently disable every future sync for the session.
    try {
      const pending = await this._queue.getPending();

      for (const action of pending) {
        action.status = 'syncing';
        await this._queue.update(action);

        try {
          const resp = action.method === 'POST'
            ? await this._api.post(action.path, action.body)
            : action.method === 'PUT'
              ? await this._api.put(action.path, action.body)
              : await this._api.delete(action.path);

          const outcome = this._classifyReplay(action, resp.ok, resp.status);
          if (outcome === 'applied') {
            await this._queue.remove(action.id);
            synced++;
          } else if (outcome === 'conflict') {
            action.status = 'conflict';
            await this._queue.update(action);
            conflicts++;
            this._notifyConflict(action, resp.data);
          } else {
            action.status = 'failed';
            action.retries++;
            action.lastError = `HTTP ${resp.status}`;
            await this._queue.update(action);
            failed++;
          }
        } catch (e) {
          action.status = 'failed';
          action.retries++;
          action.lastError = (e as Error).message;
          await this._queue.update(action);
          failed++;
        }
      }
    } finally {
      this._syncing = false;
    }

    const result = { synced, failed, conflicts };
    this._notifyComplete(result);
    return result;
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
    return 'failed';
  }

  private _notifyConflict(action: QueuedAction, serverResponse: unknown): void {
    for (const fn of this._conflictListeners) fn(action, serverResponse);
  }

  private _notifyComplete(result: SyncResult): void {
    for (const fn of this._completeListeners) fn(result);
  }
}
