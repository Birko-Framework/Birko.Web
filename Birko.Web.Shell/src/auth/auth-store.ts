import { Store } from 'birko-web-core/state';
import type { AuthState, AuthStoreConfig } from './auth-types.js';

const DEFAULT_NAME_CLAIM = 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name';

export function createAuthStore(config?: AuthStoreConfig) {
  const storageKey = config?.storageKey ?? 'app_auth';
  const claims = {
    userName: config?.claimMappings?.userName ?? DEFAULT_NAME_CLAIM,
    email: config?.claimMappings?.email ?? 'email',
    tenantId: config?.claimMappings?.tenantId ?? 'tenant_id',
    permissions: config?.claimMappings?.permissions ?? 'permission',
  };

  function loadFromStorage(): Partial<AuthState> {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return {};
  }

  const saved = loadFromStorage();

  const store = new Store<AuthState>({
    token: saved.token ?? null,
    refreshToken: saved.refreshToken ?? null,
    userId: saved.userId ?? null,
    userName: saved.userName ?? null,
    email: saved.email ?? null,
    tenantId: saved.tenantId ?? null,
    permissions: saved.permissions ?? [],
    isAuthenticated: !!saved.token,
    challengeId: null,
    twoFactorPending: false,
  });

  function persist(): void {
    localStorage.setItem(storageKey, JSON.stringify(store.snapshot()));
  }

  function setAuth(data: {
    accessToken?: string;
    token?: string;
    refreshToken?: string;
    userId?: string;
    expiresAt?: string;
  }): void {
    const jwt = data.accessToken ?? data.token ?? '';
    if (!jwt) return;

    // Guard the decode: an opaque (non-JWT) token, a missing payload segment, invalid base64,
    // or non-JSON payload must not throw out of setAuth (which would half-write the store and
    // abort the login flow). Keep the token; just derive no claims from a token we can't read.
    let payload: Record<string, any> = {};
    try {
      const segment = jwt.split('.')[1];
      if (segment) {
        payload = JSON.parse(atob(segment));
      }
    } catch {
      payload = {};
    }

    store.set('token', jwt);
    store.set('refreshToken', data.refreshToken ?? null);
    store.set('userId', data.userId ?? null);
    store.set('challengeId', null);
    store.set('twoFactorPending', false);
    store.set('userName', payload[claims.userName] ?? payload.sub);
    store.set('email', payload[claims.email] ?? null);
    store.set('tenantId', payload[claims.tenantId] ?? null);

    const perms = payload[claims.permissions];
    store.set('permissions', Array.isArray(perms) ? perms : perms ? [perms] : []);
    store.set('isAuthenticated', true);

    persist();
  }

  function clearAuth(): void {
    store.set('token', null);
    store.set('refreshToken', null);
    store.set('userId', null);
    store.set('userName', null);
    store.set('email', null);
    store.set('tenantId', null);
    store.set('permissions', []);
    store.set('isAuthenticated', false);
    store.set('challengeId', null);
    store.set('twoFactorPending', false);
    localStorage.removeItem(storageKey);
  }

  function setPendingChallenge(challengeId: string): void {
    store.set('challengeId', challengeId);
    store.set('twoFactorPending', true);
  }

  function clearChallenge(): void {
    store.set('challengeId', null);
    store.set('twoFactorPending', false);
  }

  return { store, setAuth, clearAuth, setPendingChallenge, clearChallenge };
}
