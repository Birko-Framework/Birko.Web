import type { RibbonTab, RibbonGroup, RibbonItem } from 'birko-web-components';
import type { ModuleManifest } from './module-types.js';
import { getVisibleOptions } from './permissions.js';

export type LabelResolver = (key: string | undefined, fallback: string) => string;

/** Default label resolver — returns the fallback (no i18n). */
const defaultResolver: LabelResolver = (_key, fallback) => fallback;

/** Category definition for grouped ribbon mode. */
export interface CategoryDef {
  id: string;
  label: string;
  labelKey?: string;
  icon?: string;
  order: number;
}

/** Build ribbon tabs from module manifests — one tab per module. */
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
        category: mod.category,
        groups,
      };
    });
}

/**
 * Build ribbon tabs grouped by category.
 *
 * Panel layout per category tab:
 *   Group 1 ("Modules"): compact module buttons (icon + name → dashboard)
 *   Group 2 (active module label): sub-pages of the currently active module
 *
 * This keeps the panel clean — modules in one row, pages in another.
 */
export function buildCategoryRibbon(
  modules: ModuleManifest[],
  categories: CategoryDef[],
  resolveLabel?: LabelResolver,
  activeModuleId?: string,
): RibbonTab[] {
  const resolve = resolveLabel ?? defaultResolver;
  const sorted = modules.slice().sort((a, b) => a.order - b.order);

  // Group modules by category
  const catMap = new Map<string, ModuleManifest[]>();
  const uncategorized: ModuleManifest[] = [];

  for (const mod of sorted) {
    if (mod.category) {
      if (!catMap.has(mod.category)) catMap.set(mod.category, []);
      catMap.get(mod.category)!.push(mod);
    } else {
      uncategorized.push(mod);
    }
  }

  // Build category tabs
  const catDefs = categories.slice().sort((a, b) => a.order - b.order);
  const tabs: RibbonTab[] = [];

  for (const cat of catDefs) {
    const mods = catMap.get(cat.id);
    if (!mods || mods.length === 0) continue;

    const catLabel = resolve(cat.labelKey, cat.label);
    const groups: RibbonGroup[] = [];

    // Group 1: module buttons (icon + label → first page)
    const moduleItems: RibbonItem[] = [];
    for (const mod of mods) {
      const visible = getVisibleOptions(mod);
      if (visible.length === 0) continue;
      const modLabel = resolve(mod.labelKey, mod.label);
      const firstRoute = visible[0]?.route;
      moduleItems.push({
        id: mod.id,
        label: modLabel,
        icon: mod.icon,
        href: firstRoute ? `#${firstRoute}` : undefined,
      });
    }
    if (moduleItems.length > 0) {
      groups.push({ id: '_modules', label: catLabel, items: moduleItems });
    }

    // Group 2: active module's sub-pages (if the active module is in this category)
    if (activeModuleId) {
      const activeMod = mods.find(m => m.id === activeModuleId);
      if (activeMod) {
        const visible = getVisibleOptions(activeMod);
        const modLabel = resolve(activeMod.labelKey, activeMod.label);
        const pageItems: RibbonItem[] = visible.map(opt => ({
          id: `${activeMod.id}:${opt.id}`,
          label: resolve(opt.labelKey, opt.label),
          icon: opt.icon,
          href: opt.actionOnly ? undefined : `#${opt.route}`,
          action: opt.actionOnly,
          badge: opt.badge,
        }));
        if (pageItems.length > 0) {
          groups.push({ id: activeMod.id, label: modLabel, items: pageItems });
        }
      }
    }

    if (groups.length > 0) {
      tabs.push({
        id: cat.id,
        label: catLabel,
        icon: cat.icon,
        category: cat.id,
        groups,
      });
    }
  }

  // Uncategorized modules get standalone tabs
  for (const mod of uncategorized) {
    const visible = getVisibleOptions(mod);
    if (visible.length === 0) continue;
    const modLabel = resolve(mod.labelKey, mod.label);
    const items: RibbonItem[] = visible.map(opt => ({
      id: opt.id,
      label: resolve(opt.labelKey, opt.label),
      icon: opt.icon,
      href: opt.actionOnly ? undefined : `#${opt.route}`,
      action: opt.actionOnly,
      badge: opt.badge,
    }));
    tabs.push({
      id: mod.id,
      label: modLabel,
      icon: mod.icon,
      groups: [{ id: 'main', label: modLabel, items }],
    });
  }

  return tabs;
}
