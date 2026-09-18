import { Store } from 'birko-web-core/state';
import type { ModuleManifest, ModuleOption, ModuleState } from './module-types.js';
import { hasPermission as _hasPermission, hasModulePermission as _hasModulePermission, getVisibleOptions } from './permissions.js';
import { resolveModuleFromHash as _resolveModuleFromHash } from './route-builder.js';

/** Create a module store with bound helper functions. */
export function createModuleStore() {
  const store = new Store<ModuleState>({
    modules: [],
    activeModuleId: null,
    activeOptionId: null,
  });

  return {
    store,
    hasPermission: (permission: string) => _hasPermission(store, permission),
    hasModulePermission: (moduleId: string, permission: string) => _hasModulePermission(store, moduleId, permission),
    getVisibleOptions,
    resolveModuleFromHash: (hash: string) => _resolveModuleFromHash(store, hash),
  };
}
