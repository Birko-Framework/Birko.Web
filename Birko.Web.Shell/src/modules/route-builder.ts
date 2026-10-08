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

/** What {@link resolveModuleFromHash} decided. `resolved: false` means the hash names no declared module. */
export interface ModuleResolution {
  moduleId: string;
  optionId: string;
  entityId?: string;
  resolved: boolean;
}

function segments(path: string): string[] {
  return path.replace(/^#/, '').split('?')[0].split('/').filter(Boolean);
}

/** Segment-wise prefix match; a `:name` segment in the declared route matches any one segment. */
function matchLength(route: string[], hash: string[]): number {
  if (route.length === 0 || route.length > hash.length) return -1;
  for (let i = 0; i < route.length; i++) {
    if (!route[i].startsWith(':') && route[i] !== hash[i]) return -1;
  }
  return route.length;
}

/**
 * Resolve the active module/option from a hash path against the **declared** option routes in
 * `store.modules`, and write the result to the store.
 *
 * - The longest declared route that prefixes the hash wins, so an option whose route is not
 *   `/{moduleId}/{optionId}` resolves to the module that declared it. A declared route is also how a
 *   module claims a path outside its own subtree — there is no separate ownership field.
 * - `entityId` is the one segment right after the matched route (segment 2 for the conventional
 *   shape); deeper segments are left to the page.
 * - A hash whose first segment is a module id but matches none of its options (e.g. `/inventory`)
 *   resolves the module with `optionId: ''`.
 * - **A hash matching nothing clears `activeModuleId` / `activeOptionId` to `null`** and returns
 *   `resolved: false`. Clearing, not preserving, is deliberate: on `/settings` the user is in no
 *   module, and a preserved id would keep module-scoped permission checks and live-refresh gating
 *   acting for a page that is not shown. Before modules are loaded nothing matches either — callers
 *   resolve again once `modules` is set.
 *
 * TASK-140: this used to split the hash by position and write `parts[0]` unconditionally, so every
 * non-module route (`/settings`, `/dashboard`) set `activeModuleId` to a module that does not exist.
 */
export function resolveModuleFromHash(store: Store<ModuleState>, hash: string): ModuleResolution {
  const parts = segments(hash);
  const modules = store.get('modules') ?? [];

  let best: RouteEntry | null = null;
  let bestLength = -1;
  for (const entry of buildModuleRoutes(modules)) {
    const length = matchLength(segments(entry.route), parts);
    if (length > bestLength) {
      best = entry;
      bestLength = length;
    }
  }

  let result: ModuleResolution;
  if (best) {
    result = { moduleId: best.moduleId, optionId: best.optionId, entityId: parts[bestLength] || undefined, resolved: true };
  } else if (parts.length > 0 && modules.some((m) => m.id === parts[0])) {
    result = { moduleId: parts[0], optionId: '', resolved: true };
  } else {
    result = { moduleId: '', optionId: '', resolved: false };
  }

  store.set('activeModuleId', result.moduleId || null);
  store.set('activeOptionId', result.optionId || null);
  return result;
}
