import { signal, type Unsubscribe } from '../state/signal.js';
import { openDatabase, idbRequest } from '../storage/idb.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface QueuedAction {
  id: string;
  timestamp: number;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  metadata: ActionMetadata;
  /**
   * - `pending` — not tried yet. `failed` — tried, will be tried again at `nextAttemptAt`.
   * - `dead` — terminal: the server refused it in a way a retry cannot fix, or it ran out of retries. It is not
   *   sent again until `SyncManager.retry(id)`; `SyncManager.discard(id)` drops it.
   * - `conflict` — the server reported a conflict; see `SyncManager.onConflict`.
   * - `syncing` — being sent since `syncingSince`. One left behind by a closed tab is recovered by the next sync.
   */
  status: 'pending' | 'syncing' | 'failed' | 'dead' | 'conflict';
  retries: number;
  lastError?: string;
  /** Epoch ms before which a `failed` action is not re-sent (exponential backoff). Persisted, so a reload resumes it. */
  nextAttemptAt?: number;
  /** Epoch ms the current send started, while `syncing`. Without Web Locks it decides when the send was abandoned. */
  syncingSince?: number;
}

export interface ActionMetadata {
  moduleId: string;
  description: string;
  entityType?: string;
  entityId?: string;
  /**
   * This write names its own target id, so re-sending it cannot create a second entity.
   *
   * Set it on a `POST` whose **body carries a client-minted id** (`crypto.randomUUID()` at the call site,
   * not a server-assigned one). `SyncManager` then reads a conflict on the replay as *already applied* and
   * drains the entry, instead of raising a conflict against a write that in fact succeeded.
   *
   * **Do not set it** when the same endpoint can reject the POST with the conflict status for a reason a
   * retry could not fix — a uniqueness rule on some other column, say. That rejection would be drained as
   * a success and the write silently discarded. The declaration is about the endpoint's conflict having
   * exactly one meaning, not merely about an id being present in the body.
   *
   * Irrelevant on `PUT`/`DELETE`, which are addressed by id and idempotent already.
   */
  idPinned?: boolean;
  /**
   * Sending this write twice has the same effect as sending it once, so a send that was interrupted may simply be
   * sent again.
   *
   * Set it on a `POST` or `PATCH` whose endpoint **upserts**: the body names its own target (a client-minted id),
   * and a second arrival overwrites the first. Without it, `SyncManager` makes an interrupted `POST`/`PATCH` `dead`,
   * because it cannot tell whether the first send was applied and a second could apply it twice. With it, the
   * interrupted write is put back in line instead.
   *
   * Not the same claim as {@link idPinned}, which says what the endpoint's **409** means: an upsert never answers
   * 409, so it has nothing to pin. **Do not set it** on a write that appends or increments (a counter, a list entry
   * without its own id, a transfer): re-sending that changes the result. Irrelevant on `PUT`/`DELETE`, which are
   * re-sent anyway.
   */
  replaySafe?: boolean;
}

export interface SyncResult {
  synced: number;
  failed: number;
  conflicts: number;
  /** Actions that became `dead` in this sync. */
  dead: number;
}

export interface ActionQueueOptions {
  /** IndexedDB database name. */
  dbName?: string;
  /** IndexedDB version. */
  dbVersion?: number;
}

// ── IndexedDB helpers ──────────────────────────────────────────────────────

const STORE_NAME = 'actions';

function openDb(dbName: string, dbVersion: number): Promise<IDBDatabase> {
  return openDatabase(dbName, dbVersion, (db) => {
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      store.createIndex('status', 'status', { unique: false });
      store.createIndex('timestamp', 'timestamp', { unique: false });
    }
  });
}

function tx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}

// ── ActionQueue ────────────────────────────────────────────────────────────

export class ActionQueue {
  private _pendingCount = signal(0);
  private _deadCount = signal(0);
  private _changeListeners = new Set<(count: number) => void>();
  private _dbName: string;
  private _dbVersion: number;

  constructor(options: ActionQueueOptions = {}) {
    this._dbName = options.dbName ?? 'birko_offline';
    this._dbVersion = options.dbVersion ?? 1;
    // Hydrate the pending count from IndexedDB on construct, so a COLD reload reflects already-queued writes
    // without waiting for the next mutation or a reconnect-sync. Previously `_pendingCount` stayed at its
    // seeded 0 until an enqueue/update/remove or a sync ran, so after an offline reload `<b-sync-status>`
    // showed a bare "Offline" with no count even with writes outstanding. Fire-and-forget + non-throwing:
    // if IndexedDB is unavailable the count simply stays 0. Subscribers (the chip) repaint via _notifyChange.
    void this._refreshCount().catch(() => { /* IDB unavailable — leave count at 0 */ });
  }

  /** The IndexedDB database name; it also names the lock that lets one tab drain this queue at a time. */
  get name(): string { return this._dbName; }

  /**
   * Reactive count of writes not yet on the server: `pending`, `failed` and `syncing`. A `syncing` one counts because
   * it may be left over from a closed tab, and the periodic sync, which runs only while this is above zero, is what
   * recovers it (TASK-598).
   */
  get pendingCount(): number { return this._pendingCount.value; }

  /**
   * Reactive count of `dead` writes: ones `SyncManager` stopped sending, which wait for `retry()` or `discard()`.
   * Kept apart from {@link pendingCount} because nothing will send them on its own; refreshed with it, and announced
   * by the same {@link onChange} notification.
   */
  get deadCount(): number { return this._deadCount.value; }

  /** Add an action to the offline queue. Returns the action ID. */
  async enqueue(action: Omit<QueuedAction, 'id' | 'timestamp' | 'status' | 'retries'>): Promise<string> {
    const entry: QueuedAction = {
      ...action,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      status: 'pending',
      retries: 0,
    };

    const db = await this._open();
    await idbRequest(tx(db, 'readwrite').add(entry));
    db.close();

    await this._refreshCount();
    return entry.id;
  }

  /** Get all queued actions, ordered by timestamp. */
  async getAll(): Promise<QueuedAction[]> {
    const db = await this._open();
    const store = tx(db, 'readonly');
    const items = await idbRequest(store.index('timestamp').getAll()) as QueuedAction[];
    db.close();
    return items;
  }

  /** Get one action by id, or `undefined`. */
  async get(id: string): Promise<QueuedAction | undefined> {
    const db = await this._open();
    const item = await idbRequest(tx(db, 'readonly').get(id)) as QueuedAction | undefined;
    db.close();
    return item;
  }

  /** Get the actions that gave up (`dead`), oldest first — what a failed-action UI lists. */
  async getDead(): Promise<QueuedAction[]> {
    const all = await this.getAll();
    return all.filter(a => a.status === 'dead');
  }

  /** Get only pending actions (FIFO order), including `failed` ones waiting out their backoff. Not `dead`. */
  async getPending(): Promise<QueuedAction[]> {
    const all = await this.getAll();
    return all.filter(a => a.status === 'pending' || a.status === 'failed');
  }

  /** Update an action in the queue. */
  async update(action: QueuedAction): Promise<void> {
    const db = await this._open();
    await idbRequest(tx(db, 'readwrite').put(action));
    db.close();
    await this._refreshCount();
  }

  /** Remove a completed/cancelled action. */
  async remove(id: string): Promise<void> {
    const db = await this._open();
    await idbRequest(tx(db, 'readwrite').delete(id));
    db.close();
    await this._refreshCount();
  }

  /** Clear all actions from the queue. */
  async clear(): Promise<void> {
    const db = await this._open();
    await idbRequest(tx(db, 'readwrite').clear());
    db.close();
    this._pendingCount.value = 0;
    this._deadCount.value = 0;
    this._notifyChange();
  }

  /** Subscribe to count changes. */
  onChange(fn: (count: number) => void): Unsubscribe {
    this._changeListeners.add(fn);
    return () => this._changeListeners.delete(fn);
  }

  // ── Internal ──

  private _open(): Promise<IDBDatabase> {
    return openDb(this._dbName, this._dbVersion);
  }

  private async _refreshCount(): Promise<void> {
    const all = await this.getAll();
    this._pendingCount.value = all.filter(a => a.status === 'pending' || a.status === 'failed' || a.status === 'syncing').length;
    this._deadCount.value = all.filter(a => a.status === 'dead').length;
    this._notifyChange();
  }

  private _notifyChange(): void {
    const count = this._pendingCount.value;
    for (const fn of this._changeListeners) {
      fn(count);
    }
  }
}
