/**
 * Minimal fetch-based HTTP client with interceptors and auth support.
 */
import { appendQuery } from './http-utils.js';

/**
 * How long a single request may take before it is aborted (ms).
 *
 * `fetch` has **no timeout of its own**: a connection that dies without sending a reset — a phone whose
 * screen sleeps, a tunnel that drops, a captive network that black-holes the packet — leaves the promise
 * pending for the life of the page. That is not a theoretical failure. It cost a fully-performed workout on
 * the 2026-08-10 Reps device pass: the write never reached the server, was never queued (queueing keys off a
 * *rejected* fetch), and every caller awaiting it stayed wedged — an `await` on a never-settling promise does
 * not continue, not even into a `finally`.
 *
 * Generous rather than tight, because the cost of firing early is low and well-handled: an aborted request is
 * reported exactly like a network error, so a write goes to the outbox and a read falls back to its mirror.
 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;

/** Metadata for offline-queueable write actions. */
export interface ActionMeta {
  moduleId: string;
  description: string;
  entityType?: string;
  entityId?: string;
  /**
   * This write names its own target id, so a replay cannot create a second entity — set it on a `POST`
   * whose body carries a client-minted id. See `ActionMetadata.idPinned` in `offline/action-queue.ts` for
   * the full contract, including when **not** to set it.
   */
  idPinned?: boolean;
}

export interface ApiClientOptions {
  baseUrl: string;
  getToken?: () => string | null;
  getTenant?: () => string | null;
  onUnauthorized?: () => void;
  /**
   * Called on 401 before onUnauthorized. Should attempt to refresh the token
   * and return the new access token, or null if refresh failed.
   * When this returns a new token, the original request is retried automatically.
   */
  onRefreshToken?: () => Promise<string | null>;
  /**
   * Called when a write action is made while offline and `meta` is provided.
   * Should persist the action for later sync. Returns the queue entry ID.
   */
  onQueueAction?: (
    method: 'POST' | 'PUT' | 'DELETE',
    path: string,
    body: unknown,
    meta: ActionMeta,
  ) => Promise<string>;
  /**
   * Abort a request that has not completed within this many ms.
   * Defaults to {@link DEFAULT_REQUEST_TIMEOUT_MS}. Set `0` to disable (not recommended — see that constant).
   */
  timeoutMs?: number;
}

export interface ApiResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
  headers: Headers;
  /** True when the action was queued offline instead of sent. */
  queued?: boolean;
  /** ID of the queued action (set when `queued` is true). */
  queueId?: string;
  /** True when the response was served from the service worker cache. */
  fromCache?: boolean;
  /** Timestamp (ms) when the cached response was stored. */
  cachedAt?: number;
}

export class ApiClient {
  private _options: ApiClientOptions;
  private _refreshPromise: Promise<string | null> | null = null;

  constructor(options: ApiClientOptions) {
    this._options = options;
  }

  get baseUrl(): string {
    return this._options.baseUrl;
  }

  async get<T = unknown>(path: string, params?: Record<string, string>): Promise<ApiResponse<T>> {
    // `appendQuery` picks '&' when the caller's path ALREADY carries a query string. This used to append
    // '?' unconditionally, which silently corrupted such calls — see that helper for the failure it caused
    // and for why it now lives in http-utils rather than here.
    const url = params ? appendQuery(path, new URLSearchParams(params).toString()) : path;
    return this._fetch<T>(url, { method: 'GET' });
  }

  async post<T = unknown>(path: string, body?: unknown, meta?: ActionMeta): Promise<ApiResponse<T>> {
    return this._sendWrite<T>('POST', path, body, meta, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  async put<T = unknown>(path: string, body?: unknown, meta?: ActionMeta): Promise<ApiResponse<T>> {
    return this._sendWrite<T>('PUT', path, body, meta, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T = unknown>(path: string, meta?: ActionMeta): Promise<ApiResponse<T>> {
    return this._sendWrite<T>('DELETE', path, undefined, meta, { method: 'DELETE' });
  }

  /**
   * Issue a queueable write. `navigator.onLine` is only advisory — it reports the network *interface*,
   * not server reachability, and stays `true` under DevTools-offline on a service-worker-served page or
   * on a captive/dead network. So we queue in two cases: proactively when we already know we're offline
   * (skip a doomed fetch), and — the robust fallback — when the fetch actually fails with a network error
   * (status 0). Either way an offline write lands in the outbox instead of being silently lost.
   */
  private async _sendWrite<T>(
    method: 'POST' | 'PUT' | 'DELETE',
    path: string,
    body: unknown,
    meta: ActionMeta | undefined,
    init: RequestInit,
  ): Promise<ApiResponse<T>> {
    if (!navigator.onLine && meta) return this._queue<T>(method, path, body, meta);
    const res = await this._fetch<T>(path, init);
    if (meta && !res.ok && res.status === 0) return this._queue<T>(method, path, body, meta);
    return res;
  }

  private async _queue<T>(
    method: 'POST' | 'PUT' | 'DELETE',
    path: string,
    body: unknown,
    meta: ActionMeta,
  ): Promise<ApiResponse<T>> {
    const queueId = await this._options.onQueueAction?.(method, path, body, meta);
    return { ok: true, status: 0, data: null as T, headers: new Headers(), queued: true, queueId };
  }

  /**
   * Run a request under a timeout, so a stalled connection fails instead of hanging forever.
   *
   * The abort deliberately surfaces as the **same `{ ok: false, status: 0 }` envelope a network error already
   * produces** (`_send`'s catch treats them alike). That is the whole design: a timeout is folded into a
   * failure mode the stack already handles end-to-end — `_sendWrite` diverts the write to the outbox and
   * `SyncManager` retries it; a read falls back to its mirror. No new failure mode reaches callers.
   *
   * The timer spans the **body read as well as the response**, which is why it is cleared here rather than
   * around the `fetch` call alone: a response whose headers arrive and whose body then stalls hangs just as
   * completely, and `await response.json()` is where that would land.
   */
  private async _fetch<T>(path: string, init: RequestInit): Promise<ApiResponse<T>> {
    const timeoutMs = this._options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    if (timeoutMs <= 0) return this._send<T>(path, init);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await this._send<T>(path, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  private async _send<T>(path: string, init: RequestInit): Promise<ApiResponse<T>> {
    const url = this._options.baseUrl.replace(/\/$/, '') + '/' + path.replace(/^\//, '');

    const headers = new Headers(init.headers);

    const token = this._options.getToken?.();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const tenant = this._options.getTenant?.();
    if (tenant) {
      headers.set('X-Tenant-Id', tenant);
    }

    let response: Response;
    try {
      response = await fetch(url, { ...init, headers });
    } catch (err) {
      // Network error (server unreachable, DNS failure, CORS, …) OR our own timeout abort. Both are
      // reported as status 0 on purpose — see `_fetch`. Only the log distinguishes them, because when a
      // request stalls the difference between "refused" and "never answered" is the first thing you want.
      const timedOut = (err as Error)?.name === 'AbortError';
      console.error(
        `[ApiClient] ${timedOut ? 'Timed out' : 'Network error'}: ${init.method ?? 'GET'} ${path}`,
        err,
      );
      return { ok: false, status: 0, data: null as T, headers: new Headers() };
    }

    if (response.status === 401 && this._options.onRefreshToken) {
      // Deduplicate concurrent refresh attempts
      if (!this._refreshPromise) {
        this._refreshPromise = this._options.onRefreshToken().finally(() => {
          this._refreshPromise = null;
        });
      }
      const newToken = await this._refreshPromise;
      if (newToken) {
        // Retry original request with new token
        headers.set('Authorization', `Bearer ${newToken}`);
        try {
          response = await fetch(url, { ...init, headers });
        } catch (err) {
          // Deliberate: a network error on the post-refresh retry is NOT an auth
          // failure. The refresh itself succeeded (newToken is truthy), so this is
          // a transient connectivity blip on an otherwise-authenticated session.
          // Return status 0 (same shape as the first-fetch network path above) and
          // do NOT call onUnauthorized — logging the user out over a network hiccup
          // would be wrong. onUnauthorized is reserved for an explicit 401.
          //
          // Logged for the same reason the other two catches are: this arm shares one timeout budget with
          // the first fetch AND the refresh call, so it is the arm most likely to be the one that aborts —
          // and it used to return the status-0 envelope with no log at all, making a timed-out retry the
          // single completely silent failure in this client.
          const timedOut = (err as Error)?.name === 'AbortError';
          console.error(
            `[ApiClient] ${timedOut ? 'Timed out' : 'Network error'} on post-refresh retry: ` +
            `${init.method ?? 'GET'} ${path}`,
            err,
          );
          return { ok: false, status: 0, data: null as T, headers: new Headers() };
        }
      }
      // Log out only on an explicit 401 — still 401 after a successful refresh
      // (token rejected) or refresh returned null (refresh failed).
      if (response.status === 401) {
        this._options.onUnauthorized?.();
      }
    } else if (response.status === 401) {
      this._options.onUnauthorized?.();
    }

    let data: T;
    try {
      const contentType = response.headers.get('Content-Type') ?? '';
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        data = text as unknown as T;
      }
    } catch (err) {
      // A TIMEOUT here is not a malformed body, and the difference decides whether the caller's data
      // survives. The abort can land on the body read as easily as on the response — headers arrive, the
      // body stalls — and this catch used to swallow that as `data = null`, returning the response's own
      // `ok: true, status: 200`. A write would then be reported as SUCCEEDED and never queued to the
      // outbox, and a read would render empty instead of falling back to its mirror: the fix's own
      // failure mode, moved from "hangs forever" to "silently reports the wrong answer".
      //
      // Must be re-checked here rather than only in the fetch catch above, because a stalled body throws
      // from `response.json()`, not from `fetch`.
      if ((err as Error)?.name === 'AbortError') {
        console.error(
          `[ApiClient] Timed out reading body: ${init.method ?? 'GET'} ${path}`,
          err,
        );
        return { ok: false, status: 0, data: null as T, headers: new Headers() };
      }
      // Malformed response body
      data = null as T;
    }

    if (!response.ok) {
      const method = init.method ?? 'GET';
      const detail = data && typeof data === 'object' && 'Detail' in (data as any)
        ? (data as any).Detail
        : undefined;
      const error = data && typeof data === 'object' && 'Error' in (data as any)
        ? (data as any).Error
        : undefined;
      console.error(
        `[API ${response.status}] ${method} ${path}` +
        (error ? `\n  Error: ${error}` : '') +
        (detail ? `\n  Detail: ${detail}` : ''),
      );
    }

    return {
      ok: response.ok,
      status: response.status,
      data,
      headers: response.headers,
    };
  }
}
