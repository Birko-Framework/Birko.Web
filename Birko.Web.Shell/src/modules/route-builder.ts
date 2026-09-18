import type { Store } from 'birko-web-core/state';
import type { ModuleManifest, ModuleState, RouteEntry } from './module-types.js';

/** Build flat route entries from module manifests. */
export function buildModuleRoutes(modules: ModuleManifest[]): RouteEntry[] {
  const routes: RouteEntry[] = [];
  for (const mod of modules) {
    for (const opt of mod.options) {
      routes.push({ moduleId: mod.id, optionId: opt.id, route: opt.route });
    }
  }
  return routes;
}

/** Resolve active module/option from a hash path and update the store. */
export function resolveModuleFromHash(
  store: Store<ModuleState>,
  hash: string,
): { moduleId: string; optionId: string; entityId?: string } {
  const parts = hash.replace(/^\//, '').split('/').filter(Boolean);
  const moduleId = parts[0] ?? '';
  const optionId = parts[1] ?? '';
  const entityId = parts[2] || undefined;

  store.set('activeModuleId', moduleId || null);
  store.set('activeOptionId', optionId || null);

  return { moduleId, optionId, entityId };
}
