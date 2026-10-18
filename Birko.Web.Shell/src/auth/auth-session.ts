import type { createAuthStore } from './auth-store.js';

/** What {@link createAuthStore} returns. */
export type AuthStoreHandle = ReturnType<typeof createAuthStore>;

/** Tokens read from an OAuth redirect's URL fragment. */
export interface AuthFragment {
  accessToken: string;
  refreshToken?: string;
  /** `expires_in`, in seconds, when the provider sent one. */
  expiresIn?: number;
}

/**
 * Decodes a JWT's payload segment (base64url, UTF-8), or returns null when the token is not a readable JWT.
 * Never throws: an opaque token is a valid access token, it just carries no claims we can read.
 */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const segment = token.split('.')[1];
  if (!segment) return null;
  try {
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(segment.length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return payload !== null && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/** The token's `exp` as epoch milliseconds, or null when it has none (or is not a readable JWT). */
export function tokenExpiresAt(token: string): number | null {
  const exp = decodeJwtPayload(token)?.exp;
  return typeof exp === 'number' && Number.isFinite(exp) ? exp * 1000 : null;
}

/**
 * Reads an OAuth redirect's fragment (`#access_token=…&refresh_token=…&expires_in=…`) and removes it from the
 * address bar, so the tokens are not left in history, bookmarks or a shared screenshot.
 *
 * Returns null, and leaves the URL alone, when the fragment carries no `access_token`: a hash route (`#/orders`)
 * is not an auth fragment. An `error` parameter (a refused sign-in) is returned as null too, and its fragment is
 * cleared, since it is the provider's answer rather than a route.
 */
export function readAuthFragment(
  location: Pick<Location, 'hash' | 'pathname' | 'search'> = window.location,
  history: Pick<History, 'replaceState' | 'state'> = window.history,
): AuthFragment | null {
  const hash = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash;
  if (!hash || hash.startsWith('/')) return null;
  const params = new URLSearchParams(hash);
  const accessToken = params.get('access_token');
  if (!accessToken && !params.has('error')) return null;

  history.replaceState(history.state, '', location.pathname + location.search);
  if (!accessToken) return null;

  const expiresIn = Number(params.get('expires_in'));
  return {
    accessToken,
    refreshToken: params.get('refresh_token') ?? undefined,
    expiresIn: params.has('expires_in') && Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : undefined,
  };
}

/** The result of a refresh call: the new access token and, when the server rotated it, the new refresh token. */
export interface RefreshedTokens {
  accessToken: string;
  refreshToken?: string;
}

export interface AuthSessionOptions {
  /** The auth store the session reads tokens from and writes refreshed ones to. */
  auth: AuthStoreHandle;
  /**
   * Exchanges a refresh token for new tokens (e.g. `POST /oauth/token` with `grant_type=refresh_token`).
   * Resolve null when the server refused it (the session is then over); reject on a network failure (the session
   * is kept, and the refresh is retried).
   */
  refresh: (refreshToken: string) => Promise<RefreshedTokens | null>;
  /** Refresh this long before `exp`. Default 60 000 ms. */
  leadMs?: number;
  /** After a refresh that rejected, retry after this long. Default 30 000 ms. */
  retryMs?: number;
  /** Called once when a refresh was refused and the auth store cleared. */
  onSessionEnded?: () => void;
  /** Clock and timers, for tests. */
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface AuthSession {
  /** The token every client should send: pass as `getToken` to ApiClient, WsClient and SseClient. */
  getToken: () => string | null;
  /** For ApiClient's `onRefreshToken`: refreshes after a 401 (sharing an in-flight refresh). */
  onRefreshToken: () => Promise<string | null>;
  /** Refreshes now. One refresh at a time: concurrent calls share it. */
  refreshNow: () => Promise<string | null>;
  /** Starts scheduling refreshes ahead of expiry, following the store's token from now on. */
  start: () => void;
  /** Stops scheduling. */
  stop: () => void;
}

/** setTimeout's ceiling (2^31 - 1 ms, ~24.8 days); a longer delay fires at once in browsers, so it is capped. */
const MAX_TIMER_MS = 2_147_483_647;

/**
 * Keeps an auth store's access token fresh: refreshes `leadMs` before the JWT's `exp`, after a 401 (through
 * ApiClient's `onRefreshToken`), and retries a refresh that failed on the network.
 *
 * Wire it as the token source of every client, so they all send what the store holds:
 * ```ts
 * const auth = createAuthStore();
 * const fragment = readAuthFragment();
 * if (fragment) auth.setAuth({ accessToken: fragment.accessToken, refreshToken: fragment.refreshToken });
 * const session = createAuthSession({ auth, refresh: (rt) => callTokenEndpoint(rt) });
 * session.start();
 * const api = new ApiClient({ baseUrl, getToken: session.getToken, onRefreshToken: session.onRefreshToken,
 *   onUnauthorized: () => router.navigate('/login') });
 * const ws = new WsClient({ url, getToken: session.getToken });
 * ```
 */
export function createAuthSession(options: AuthSessionOptions): AuthSession {
  const { auth, refresh } = options;
  const leadMs = options.leadMs ?? 60_000;
  const retryMs = options.retryMs ?? 30_000;
  const now = options.now ?? (() => Date.now());
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));

  let timer: unknown = null;
  let inFlight: Promise<string | null> | null = null;
  let unsubscribe: (() => void) | null = null;

  const getToken = () => auth.store.get('token');

  function cancelTimer(): void {
    if (timer !== null) clearTimer(timer);
    timer = null;
  }

  function scheduleIn(ms: number): void {
    cancelTimer();
    timer = setTimer(() => {
      timer = null;
      const delay = dueIn();
      // The capped wait ended early (a long-lived token): wait again rather than refresh months ahead.
      if (delay !== null && delay > 0) { scheduleIn(Math.min(delay, MAX_TIMER_MS)); return; }
      void refreshNow().catch(() => scheduleIn(retryMs));
    }, Math.max(0, ms));
  }

  /** Milliseconds until the refresh is due, or null when there is nothing to schedule. */
  function dueIn(): number | null {
    const token = getToken();
    if (!token || !auth.store.get('refreshToken')) return null;
    const expiresAt = tokenExpiresAt(token);
    return expiresAt === null ? null : expiresAt - leadMs - now();
  }

  function reschedule(): void {
    if (!unsubscribe) return;
    const delay = dueIn();
    if (delay === null) { cancelTimer(); return; }
    scheduleIn(Math.min(delay, MAX_TIMER_MS));
  }

  function refreshNow(): Promise<string | null> {
    if (inFlight) return inFlight;
    const refreshToken = auth.store.get('refreshToken');
    if (!refreshToken) return Promise.resolve(null);
    inFlight = (async () => {
      const result = await refresh(refreshToken);
      if (!result?.accessToken) {
        cancelTimer();
        auth.clearAuth();
        options.onSessionEnded?.();
        return null;
      }
      // Keep the old refresh token when the server did not rotate it: setAuth would otherwise store null.
      auth.setAuth({ accessToken: result.accessToken, refreshToken: result.refreshToken ?? refreshToken });
      return result.accessToken;
    })().finally(() => { inFlight = null; });
    return inFlight;
  }

  return {
    getToken,
    onRefreshToken: refreshNow,
    refreshNow,
    start() {
      if (unsubscribe) return;
      // Any new token (a sign-in, a refresh, a tenant switch) moves the schedule; a cleared one stops it.
      unsubscribe = auth.store.onChange('token', () => reschedule());
      reschedule();
    },
    stop() {
      unsubscribe?.();
      unsubscribe = null;
      cancelTimer();
    },
  };
}
