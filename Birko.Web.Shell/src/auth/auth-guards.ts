import type { Store } from 'birko-web-core/state';
import type { AuthState } from './auth-types.js';

/** Create a route guard that checks authentication. */
export function createAuthGuard(
  authStore: Store<AuthState>,
  loginRoute = '/login',
): () => boolean | string {
  return () => authStore.get('isAuthenticated') ? true : loginRoute;
}

/** Create a factory for module-level route guards (auth + permission). */
export function createModuleGuard(
  authStore: Store<AuthState>,
  hasPermission: (moduleId: string, permission: string) => boolean,
  loginRoute = '/login',
  noAccessRoute = '/no-access',
): (moduleId: string, permission?: string) => () => boolean | string {
  return (moduleId: string, permission?: string) => {
    return () => {
      if (!authStore.get('isAuthenticated')) return loginRoute;
      if (permission && !hasPermission(moduleId, permission)) return noAccessRoute;
      return true;
    };
  };
}
