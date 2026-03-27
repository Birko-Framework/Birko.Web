import type { Store } from 'birko-web-core/state';
import type { ModuleManifest, ModuleState } from './module-types.js';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

/**
 * Build breadcrumb items from module/option context.
 * - List page:   Module > Option
 * - Detail page: Module > Option > entityName
 */
export function buildBreadcrumb(
  store: Store<ModuleState>,
  moduleId: string,
  optionId: string,
  entityName?: string,
): BreadcrumbItem[] {
  const modules = store.get('modules');
  const mod = modules.find((m: ModuleManifest) => m.id === moduleId);
  const option = mod?.options.find(o => o.id === optionId);

  const items: BreadcrumbItem[] = [
    { label: mod?.label ?? moduleId, href: `#${mod?.options[0]?.route ?? '/'}` },
  ];

  if (option) {
    items.push(
      entityName
        ? { label: option.label, href: `#${option.route}` }
        : { label: option.label },
    );
  }

  if (entityName) {
    items.push({ label: entityName });
  }

  return items;
}
