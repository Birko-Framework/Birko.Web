import type { Store } from 'birko-web-core/state';
import type { CommandProvider, CommandItem } from 'birko-web-components/command';
import type { ModuleState, ModuleManifest } from '../modules/module-types.js';
import { getVisibleOptions } from '../modules/permissions.js';

export interface ModuleNavProviderOptions {
  moduleStore: Store<ModuleState>;
  /** Translate a key; returns the key itself when no translation is found. */
  t?: (key: string) => string;
  order?: number;
}

/** Create a command palette provider that searches module navigation items. */
export function createModuleNavProvider(options: ModuleNavProviderOptions): CommandProvider {
  const { moduleStore, t = (k: string) => k, order = 20 } = options;

  return {
    id: 'module-nav',
    label: 'Navigation',
    order,
    search(query: string): CommandItem[] {
      const modules = moduleStore.get('modules');
      if (!query) return [];

      const q = query.toLowerCase();
      const items: CommandItem[] = [];

      for (const mod of modules) {
        if (mod.label.toLowerCase().includes(q)) {
          const firstOption = getVisibleOptions(mod)[0];
          if (firstOption) {
            items.push({
              id: `nav:${mod.id}`,
              label: mod.label,
              description: 'Module',
              icon: mod.icon,
              category: 'Navigation',
              href: firstOption.route,
            });
          }
        }

        for (const opt of getVisibleOptions(mod)) {
          const optLabel = t(opt.labelKey ?? '') || opt.label;
          if (optLabel.toLowerCase().includes(q) || opt.id.includes(q)) {
            items.push({
              id: `nav:${mod.id}:${opt.id}`,
              label: `${mod.label} \u203A ${optLabel}`,
              description: opt.route,
              icon: mod.icon,
              category: 'Navigation',
              href: opt.route,
            });
          }
        }
      }

      return items;
    },
  };
}
