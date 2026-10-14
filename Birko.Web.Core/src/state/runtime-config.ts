/**
 * Layered runtime configuration (TASK-526): built-in defaults, then what the server says, then what this user set
 * locally — each layer overriding the one before, with change notification.
 *
 * ```ts
 * const config = new RuntimeConfig({
 *   defaults: { serverUrl: 'ws://localhost:5000', refreshMs: 5000, authToken: '' },
 *   serverUrl: '/api/config',     // or fetchServer: () => …
 *   storageKey: 'myapp-config',   // the local layer persists here
 *   secretKeys: ['authToken'],    // never written to storage
 * });
 * await config.load();            // non-fatal: false when the server could not be read
 * config.set({ serverUrl: 'wss://other' });
 * config.onChange((c) => reconnect(c.serverUrl));
 * ```
 *
 * Only keys the defaults declare are taken from the server or from storage, and only with the default's type
 * (`typeof`), so a renamed setting or a hand-edited value cannot smuggle in something the app never expects.
 */
export interface RuntimeConfigOptions<T extends object> {
  /** Every setting and its built-in value. Declares the keys and types the other layers may set. */
  defaults: T;
  /** `localStorage` key of the local override layer. Without one, local overrides live in memory only. */
  storageKey?: string;
  /** GET this URL (JSON) for the server layer. Ignored when `fetchServer` is given. */
  serverUrl?: string;
  /** Read the server layer yourself. Resolve `null` (or throw) when it is unavailable. */
  fetchServer?: () => Promise<Partial<T> | null>;
  /**
   * Keys that are never written to storage: a local value for one lives in memory only, and a copy already in storage
   * (from an older build) is ignored and removed on load. Tokens belong to the auth store, not here.
   */
  secretKeys?: (keyof T)[];
  /** Storage for the local layer (default `localStorage`). */
  storage?: Storage;
}

export class RuntimeConfig<T extends object> {
  private _defaults: T;
  private _server: Partial<T> = {};
  private _local: Partial<T> = {};
  private _merged: T;
  private _secret: Set<keyof T>;
  private _options: RuntimeConfigOptions<T>;
  private _listeners = new Set<(config: T) => void>();

  constructor(options: RuntimeConfigOptions<T>) {
    this._options = options;
    this._defaults = { ...options.defaults };
    this._secret = new Set(options.secretKeys ?? []);
    this._local = this._readStored();
    this._merged = this._merge();
  }

  /** The merged configuration (a copy). */
  get(): T {
    return { ...this._merged };
  }

  /**
   * Read the server layer. Returns false — and keeps the current values — when it cannot be read, so a caller may
   * try again later. A setting the user set locally still wins over what the server says.
   */
  async load(): Promise<boolean> {
    let data: unknown;
    try {
      if (this._options.fetchServer) {
        data = await this._options.fetchServer();
      } else if (this._options.serverUrl) {
        const res = await fetch(this._options.serverUrl, { headers: { Accept: 'application/json' } });
        if (!res.ok) return false;
        data = await res.json();
      } else {
        return false;
      }
    } catch {
      return false;
    }
    if (!data || typeof data !== 'object') return false;
    this._server = this._accept(data as Record<string, unknown>);
    this._changed();
    return true;
  }

  /** Set local overrides. Non-secret keys are persisted; secret ones are kept in memory only. */
  set(updates: Partial<T>): void {
    this._local = { ...this._local, ...this._accept(updates as Record<string, unknown>) };
    this._writeStored();
    this._changed();
  }

  /** Drop local overrides — the given keys, or all — so the server or default value shows through again. */
  reset(keys?: (keyof T)[]): void {
    if (!keys) {
      this._local = {};
    } else {
      const next = { ...this._local };
      for (const k of keys) delete next[k];
      this._local = next;
    }
    this._writeStored();
    this._changed();
  }

  /** Subscribe to changes; called with the merged configuration. Returns the unsubscribe. */
  onChange(fn: (config: T) => void): () => void {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  // ── Private ──

  private _merge(): T {
    return { ...this._defaults, ...this._server, ...this._local };
  }

  private _changed(): void {
    this._merged = this._merge();
    const snapshot = this.get();
    for (const fn of this._listeners) {
      try { fn(snapshot); } catch (err) { console.error('[RuntimeConfig] change listener threw', err); }
    }
  }

  /** Keep only declared keys whose value has the default's type. */
  private _accept(input: Record<string, unknown>): Partial<T> {
    const out: Partial<T> = {};
    const defaults = this._defaults as Record<string, unknown>;
    for (const key of Object.keys(input)) {
      if (!Object.prototype.hasOwnProperty.call(defaults, key)) continue;
      const value = input[key];
      const expected = defaults[key];
      if (expected !== null && expected !== undefined && typeof value !== typeof expected) continue;
      (out as Record<string, unknown>)[key] = value;
    }
    return out;
  }

  private get _storage(): Storage | null {
    if (!this._options.storageKey) return null;
    try { return this._options.storage ?? globalThis.localStorage ?? null; } catch { return null; }
  }

  private _readStored(): Partial<T> {
    const storage = this._storage;
    if (!storage) return {};
    let parsed: unknown;
    try {
      const raw = storage.getItem(this._options.storageKey!);
      if (!raw) return {};
      parsed = JSON.parse(raw);
    } catch {
      return {};
    }
    if (!parsed || typeof parsed !== 'object') return {};
    const stored = parsed as Record<string, unknown>;
    const hadSecret = [...this._secret].some((k) => Object.prototype.hasOwnProperty.call(stored, k));
    for (const k of this._secret) delete stored[k as string];
    const accepted = this._accept(stored);
    if (hadSecret) this._write(storage, accepted); // scrub a secret an older build persisted
    return accepted;
  }

  private _writeStored(): void {
    const storage = this._storage;
    if (!storage) return;
    const persisted: Record<string, unknown> = { ...this._local };
    for (const k of this._secret) delete persisted[k as string];
    this._write(storage, persisted);
  }

  private _write(storage: Storage, value: object): void {
    try {
      storage.setItem(this._options.storageKey!, JSON.stringify(value));
    } catch (err) {
      console.warn('[RuntimeConfig] could not persist local overrides', err);
    }
  }
}
