import type { Store } from 'birko-web-core/state';
import type { CommandProvider, CommandItem } from 'birko-web-components/command';
import type { ModuleState, ModuleManifest } from '../modules/module-types.js';
import { getVisibleOptions } from '../modules/permissions.js';

export interface ModuleNavProviderOptions {
  moduleStore: Store<ModuleState>;
  /** Translate a key; returns the key itself when no translation is found. */
  t?: (key: string) => string;
  order?: number;
  /** Number of modules to show when the query is empty. 0 = show all. */
  previewCount?: number;
}

/** Simple fuzzy match: all query characters appear in order within the target. */
function fuzzyMatch(target: string, query: string): boolean {
  let ti = 0;
  for (let qi = 0; qi < query.length; qi++) {
    const ch = query[qi];
    while (ti < target.length && target[ti] !== ch) ti++;
    if (ti >= target.length) return false;
    ti++;
  }
  return true;
}

function matches(label: string, q: string): boolean {
  const lower = label.toLowerCase();
  // Prefer substring match, fall back to fuzzy
  return lower.includes(q) || fuzzyMatch(lower, q);
}

/** Create a command palette provider that searches module navigation items. */
export function createModuleNavProvider(options: ModuleNavProviderOptions): CommandProvider {
  const { moduleStore, t = (k: string) => k, order = 20, previewCount = 0 } = options;

  return {
    id: 'module-nav',
    label: 'Navigation',
    order,
    search(query: string): CommandItem[] {
      const modules = moduleStore.get('modules');
      const q = query.toLowerCase();
      const items: CommandItem[] = [];

      for (const mod of modules) {
        const modLabel = (mod.labelKey ? t(mod.labelKey) : '') || mod.label;
        const visibleOpts = getVisibleOptions(mod);

        // Module-level match
        if (!q || matches(modLabel, q)) {
          const firstOption = visibleOpts[0];
          if (firstOption) {
            items.push({
              id: `nav:${mod.id}`,
              label: modLabel,
              description: t('common.module') || 'Module',
              icon: mod.icon,
              category: t('common.navigation') || 'Navigation',
              href: firstOption.route,
            });
          }
        }

        // Option-level match (skip when empty query — too many results)
        if (q) {
          for (const opt of visibleOpts) {
            const optLabel = (opt.labelKey ? t(opt.labelKey) : '') || opt.label;
            if (matches(optLabel, q) || matches(opt.id, q)) {
              items.push({
                id: `nav:${mod.id}:${opt.id}`,
                label: `${modLabel} \u203A ${optLabel}`,
                description: opt.route,
                icon: mod.icon,
                category: t('common.navigation') || 'Navigation',
                href: opt.route,
              });
            }
          }
        }
      }

      // When no query, limit the preview
      if (!q && previewCount > 0) {
        return items.slice(0, previewCount);
      }

      return items;
    },
  };
}
