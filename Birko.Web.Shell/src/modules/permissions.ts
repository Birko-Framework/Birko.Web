import type { Store } from 'birko-web-core/state';
import type { ModuleManifest, ModuleOption, ModuleState } from './module-types.js';

/** Check if user has a specific permission in the currently active module. */
export function hasPermission(store: Store<ModuleState>, permission: string): boolean {
  const moduleId = store.get('activeModuleId');
  const modules = store.get('modules');
  const mod = modules.find((m: ModuleManifest) => m.id === moduleId);
  return mod?.permissions.includes('*') || mod?.permissions.includes(permission) || false;
}

/** Check permission across any module. */
export function hasModulePermission(store: Store<ModuleState>, moduleId: string, permission: string): boolean {
  const modules = store.get('modules');
  const mod = modules.find((m: ModuleManifest) => m.id === moduleId);
  return mod?.permissions.includes('*') || mod?.permissions.includes(permission) || false;
}

/** Get visible options for a module (filtered by user's permissions). */
export function getVisibleOptions(mod: ModuleManifest): ModuleOption[] {
  if (mod.permissions.includes('*')) return mod.options;
  return mod.options.filter(opt =>
    !opt.permission || mod.permissions.includes(opt.permission),
  );
}
