/**
 * Typed wrapper around EventSource (SSE) with auto-reconnect.
 *
 * Special internal events (subscribe via `on()`):
 * - `_open`      — connection established (first or reconnect)
 * - `_error`     — connection error (before reconnect attempt)
 * - `_reconnect` — successfully reconnected after a drop
 * - `_failing`   — `failingAfter` consecutive failures without an open; data `{ failures, nextDelayMs }`.
 *                  Fires once per outage; `_reconnect` signals the recovery
 *
 * One retry loop (TASK-547): on an error the native source is closed, so the browser's own retry (or a
 * server `retry:` field) never runs alongside this client's schedule. Before, both ran, and when the
 * native retry won, the pending timer closed the healthy connection and opened another.
 */
import { appendQuery } from './http-utils.js';

export interface SseOptions {
  url: string;
  getToken?: () => string | null;
  onMessage?: (event: MessageEvent) => void;
  onError?: (event: Event) => void;
  /** One fixed delay before every retry (default schedule when neither option is given: see
   *  `reconnectDelays`). `0` disables reconnecting. Not combinable with `reconnectDelays`. */
  reconnectMs?: number;
  /** Delay per consecutive failure, the last one repeating; resets when a connection opens.
   *  Default `[5000, 10000, 30000, 60000]`; a `0` entry stops retrying. Not combinable with `reconnectMs`. */
  reconnectDelays?: number[];
  /** Consecutive failures after which `_failing` fires once. Default 5 (≈2¾ minutes on the default
   *  schedule); `0` never fires. */
  failingAfter?: number;
}

/** Data of the `_failing` event. */
export interface SseFailing {
  failures: number;
  nextDelayMs: number;
}

const DEFAULT_DELAYS = [5000, 10000, 30000, 60000];
const DEFAULT_FAILING_AFTER = 5;

export type SseReadyState = 'connecting' | 'open' | 'closed';

export class SseClient {
  private _source: EventSource | null = null;
  private _options: SseOptions;
  private _handlers = new Map<string, Set<(data: unknown) => void>>();
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _wasConnected = false;
  private _failures = 0;
  private readonly _delays: number[];

  constructor(options: SseOptions) {
    if (options.reconnectMs !== undefined && options.reconnectDelays !== undefined) {
      throw new TypeError('SseClient: pass reconnectMs (one fixed delay) or reconnectDelays (a schedule), not both');
    }
    const delays = options.reconnectDelays ?? (options.reconnectMs !== undefined ? [options.reconnectMs] : DEFAULT_DELAYS);
    if (delays.length === 0 || delays.some((d) => !Number.isFinite(d) || d < 0)) {
      throw new TypeError('SseClient: reconnectDelays must be a non-empty list of non-negative numbers');
    }
    this._options = options;
    this._delays = [...delays];
  }

  /** Open the stream. Starts the retry schedule fresh. */
  connect(): void {
    this._failures = 0;
    this._open();
  }

  private _open(): void {
    this.disconnect();

    let url = this._options.url;
    const token = this._options.getToken?.();
    if (token) {
      url = appendQuery(url, `token=${encodeURIComponent(token)}`);
    }

    this._source = new EventSource(url);

    // Re-register named event listeners on the new EventSource
    for (const event of this._handlers.keys()) {
      if (event.startsWith('_') || event === 'message') continue;
      this._attachSourceListener(event);
    }

    this._source.onopen = () => {
      const isReconnect = this._wasConnected;
      this._wasConnected = true;
      this._failures = 0;
      this._dispatch('_open', null);
      if (isReconnect) {
        this._dispatch('_reconnect', null);
      }
    };

    this._source.onmessage = (event) => {
      this._options.onMessage?.(event);
      this._dispatch('message', event.data);
    };

    this._source.onerror = (event) => {
      // Close first: a native source in CONNECTING would otherwise retry on its own, in parallel.
      this._source?.close();
      this._options.onError?.(event);
      this._dispatch('_error', event);
      this._scheduleReconnect();
    };
  }

  /** Listen for a named event type (or internal: `_open`, `_error`, `_reconnect`, `_failing`). */
  on(event: string, handler: (data: unknown) => void): () => void {
    if (!this._handlers.has(event)) {
      this._handlers.set(event, new Set());

      // Attach to the current EventSource (if connected)
      if (!event.startsWith('_') && event !== 'message') {
        this._attachSourceListener(event);
      }
    }

    this._handlers.get(event)!.add(handler);
    return () => this._handlers.get(event)?.delete(handler);
  }

  disconnect(): void {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this._source?.close();
    this._source = null;
  }

  get connected(): boolean {
    return this._source?.readyState === EventSource.OPEN;
  }

  /** Consecutive failures since the last open (or since `connect()`). */
  get failures(): number {
    return this._failures;
  }

  /** `'connecting'` also while a retry is pending. */
  get state(): SseReadyState {
    if (this._reconnectTimer) return 'connecting';
    switch (this._source?.readyState) {
      case EventSource.CONNECTING: return 'connecting';
      case EventSource.OPEN:       return 'open';
      default:                     return 'closed';
    }
  }

  /** Reset the wasConnected flag (e.g. on intentional disconnect + fresh connect). */
  resetReconnectState(): void {
    this._wasConnected = false;
  }

  private _attachSourceListener(event: string): void {
    this._source?.addEventListener(event, (e: Event) => {
      const me = e as MessageEvent;
      try {
        this._dispatch(event, JSON.parse(me.data));
      } catch {
        this._dispatch(event, me.data);
      }
    });
  }

  private _dispatch(event: string, data: unknown): void {
    const handlers = this._handlers.get(event);
    if (handlers) {
      for (const h of handlers) {
        try { h(data); } catch (err) { console.error(`[SseClient] Handler error for "${event}":`, err); }
      }
    }
  }

  private _scheduleReconnect(): void {
    if (this._reconnectTimer) return;
    this._failures++;
    const ms = this._delays[Math.min(this._failures - 1, this._delays.length - 1)];
    if (this._failures === (this._options.failingAfter ?? DEFAULT_FAILING_AFTER)) {
      this._dispatch('_failing', { failures: this._failures, nextDelayMs: ms } satisfies SseFailing);
    }
    // A `0` delay means "do not reconnect" (the old `reconnectMs: 0`).
    if (ms <= 0) return;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this._open();
    }, ms);
  }
}
