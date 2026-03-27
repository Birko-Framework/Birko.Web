import type { RibbonTab, RibbonGroup, RibbonItem } from 'birko-web-components';
import type { ModuleManifest } from './module-types.js';
import { getVisibleOptions } from './permissions.js';

export type LabelResolver = (key: string | undefined, fallback: string) => string;

/** Default label resolver — returns the fallback (no i18n). */
const defaultResolver: LabelResolver = (_key, fallback) => fallback;

/** Build ribbon tabs from module manifests. */
export function buildRibbon(
  modules: ModuleManifest[],
  resolveLabel?: LabelResolver,
): RibbonTab[] {
  const resolve = resolveLabel ?? defaultResolver;

  return modules
    .slice()
    .sort((a, b) => a.order - b.order)
    .map(mod => {
      const visible = getVisibleOptions(mod);
      const groupMap = new Map<string, { label: string; items: RibbonItem[] }>();
      const modLabel = resolve(mod.labelKey, mod.label);

      for (const opt of visible) {
        const groupId = opt.group ?? 'main';
        if (!groupMap.has(groupId)) {
          const label = opt.groupLabelKey
            ? resolve(opt.groupLabelKey, opt.groupLabel ?? modLabel)
            : opt.groupLabel ?? modLabel;
          groupMap.set(groupId, { label, items: [] });
        }
        groupMap.get(groupId)!.items.push({
          id: opt.id,
          label: resolve(opt.labelKey, opt.label),
          icon: opt.icon,
          href: opt.actionOnly ? undefined : `#${opt.route}`,
          action: opt.actionOnly,
          badge: opt.badge,
        });
      }

      const groups: RibbonGroup[] = Array.from(groupMap.entries()).map(([id, g]) => ({
        id, label: g.label, items: g.items,
      }));

      return {
        id: mod.id,
        label: modLabel,
        icon: mod.icon,
        groups,
      };
    });
}
