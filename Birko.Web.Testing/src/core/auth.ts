// Driver-agnostic auth: log in over the API with fetch, then produce the exact localStorage
// shape birko-web-shell expects so a test can seed an authenticated session without driving the
// login UI. Mirrors Birko.Web.Shell/src/auth/auth-store.ts (createAuthStore + setAuth):
//   localStorage[storageKey] = JSON.stringify(<AuthState snapshot>)
// and the JWT claim mapping used there.

/** JWT claim → snapshot field mapping. Configure per consumer (matches createAuthStore's claimMappings). */
export interface ClaimMappings {
  userName?: string;
  email?: string;
  tenantId?: string;
  permissions?: string;
}

/** Default claim URIs/keys — identical to auth-store.ts defaults (when a consumer passes none). */
const DEFAULT_CLAIMS: Required<ClaimMappings> = {
  userName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name',
  email: 'email',
  tenantId: 'tenant_id',
  permissions: 'permission',
};

export interface AuthConfig {
  /** API origin, e.g. 'http://localhost:5000'. */
  apiBaseUrl: string;
  /** localStorage key the app persists auth under (Symbio: 'symbio_auth'; shell default: 'app_auth'). */
  storageKey: string;
  /** Login endpoint path. Default 'api/auth/login'. */
  loginPath?: string;
  /** Override the JWT claim mapping (matches the app's createAuthStore claimMappings, e.g. DraCode uses userName:'name'). */
  claimMappings?: ClaimMappings;
}

export interface Credentials {
  login: string;
  password: string;
}

/** The auth snapshot persisted to localStorage — same field set as AuthState. */
export interface AuthSnapshot {
  token: string;
  refreshToken: string | null;
  userId: string | null;
  userName: string | null;
  email: string | null;
  tenantId: string | null;
  permissions: string[];
  isAuthenticated: boolean;
  challengeId: null;
  twoFactorPending: boolean;
}

export interface AuthResult {
  token: string;
  refreshToken: string | null;
  userId: string | null;
  snapshot: AuthSnapshot;
  /** Ready to `localStorage.setItem(storageKey, storageValue)`. */
  storageKey: string;
  storageValue: string;
}

/** Minimal fetch surface so this works under Node 18+, Playwright's APIRequest, or the browser. */
export type FetchLike = (url: string, init?: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

/** base64url-decode a JWT payload without verifying the signature. */
export function decodeJwt(token: string): Record<string, any> {
  const part = token.split('.')[1] ?? '';
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
  const json = typeof atob === 'function'
    ? atob(b64)
    : Buffer.from(b64, 'base64').toString('binary');
  try { return JSON.parse(decodeURIComponent(escape(json))); }
  catch { return JSON.parse(json); }
}

function normalizePermissions(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  return raw ? [String(raw)] : [];
}

/** Build the persisted snapshot from a JWT — mirrors auth-store.ts setAuth() claim mapping. */
export function buildAuthSnapshot(
  token: string,
  opts: { refreshToken?: string | null; userId?: string | null; claimMappings?: ClaimMappings } = {},
): AuthSnapshot {
  const payload = decodeJwt(token);
  const claims = { ...DEFAULT_CLAIMS, ...opts.claimMappings };
  return {
    token,
    refreshToken: opts.refreshToken ?? null,
    userId: opts.userId ?? null,
    userName: payload[claims.userName] ?? payload.sub ?? null,
    email: payload[claims.email] ?? null,
    tenantId: payload[claims.tenantId] ?? null,
    permissions: normalizePermissions(payload[claims.permissions]),
    isAuthenticated: true,
    challengeId: null,
    twoFactorPending: false,
  };
}

/**
 * Log in over the API and return the JWT + the localStorage payload the app expects.
 * Endpoint contract (Symbio): POST api/auth/login { login, password }.
 * Token is read from accessToken/token (also unwraps a `data` envelope).
 */
export async function loginViaApi(
  cfg: AuthConfig,
  creds: Credentials,
  fetchImpl?: FetchLike,
): Promise<AuthResult> {
  const doFetch = (fetchImpl ?? (globalThis.fetch as unknown as FetchLike));
  if (!doFetch) throw new Error('No fetch available — pass a FetchLike (e.g. Playwright request) or run on Node 18+.');

  const base = cfg.apiBaseUrl.replace(/\/+$/, '');
  const path = (cfg.loginPath ?? 'api/auth/login').replace(/^\/+/, '');
  const res = await doFetch(`${base}/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ login: creds.login, password: creds.password }),
  });
  if (!res.ok) throw new Error(`[birko-web-testing] login failed: HTTP ${res.status} at ${base}/${path}`);

  const body = await res.json();
  const data = body?.data ?? body;
  const token: string | undefined = data?.accessToken ?? data?.token;
  if (!token) throw new Error('[birko-web-testing] login response had no accessToken/token field');

  const snapshot = buildAuthSnapshot(token, {
    refreshToken: data?.refreshToken ?? null,
    userId: data?.userId ?? null,
    claimMappings: cfg.claimMappings,
  });

  return {
    token,
    refreshToken: snapshot.refreshToken,
    userId: snapshot.userId,
    snapshot,
    storageKey: cfg.storageKey,
    storageValue: JSON.stringify(snapshot),
  };
}
