import type { RibbonTab, RibbonGroup, RibbonItem, RibbonMenuEntry } from 'birko-web-components';
import type { ModuleManifest, ModuleOption } from './module-types.js';
import { getVisibleOptions } from './permissions.js';

export type LabelResolver = (key: string | undefined, fallback: string) => string;

/** Default label resolver — returns the fallback (no i18n). */
const defaultResolver: LabelResolver = (_key, fallback) => fallback;

/** Options for {@link buildCategoryRibbon}. */
export interface CategoryRibbonOptions {
  /** A module with two or more pages is a split button whose ▾ menu lists them (TASK-803). Default true. */
  moduleMenus?: boolean;
  /** The active module's pages as a second group of the tab. Default true. */
  activePagesGroup?: boolean;
}

/** A tooltip line from a text and/or a key; empty means none. */
function describe(resolve: LabelResolver, key: string | undefined, text: string | undefined): string | undefined {
  const value = key ? resolve(key, text ?? '') : text;
  return value || undefined;
}

/**
 * A module's pages as menu choices, `<moduleId>:<optionId>`, with a separator wherever `ModuleOption.group` changes.
 * A page is a link to its route; an `actionOnly` one has no link and is left to `item-click`.
 */
function pageMenu(mod: ModuleManifest, visible: ModuleOption[], resolve: LabelResolver): RibbonMenuEntry[] {
  const entries: RibbonMenuEntry[] = [];
  let group: string | undefined;
  visible.forEach((opt, i) => {
    const current = opt.group ?? 'main';
    if (i > 0 && current !== group) entries.push({ separator: true });
    group = current;
    entries.push({
      id: `${mod.id}:${opt.id}`,
      label: resolve(opt.labelKey, opt.label),
      icon: opt.icon,
      href: opt.actionOnly ? undefined : `#${opt.route}`,
    });
  });
  return entries;
}

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
          description: describe(resolve, opt.descriptionKey, opt.description),
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
 *   Group 1 (category label): a button per module, to its first page. A module with two or more pages is a split
 *     button whose ▾ menu lists every page, so another module's page is one pick away (TASK-803).
 *   Group 2 (active module label): sub-pages of the currently active module (`activePagesGroup`, default on)
 */
export function buildCategoryRibbon(
  modules: ModuleManifest[],
  categories: CategoryDef[],
  resolveLabel?: LabelResolver,
  activeModuleId?: string,
  activeRoute?: string,
  options?: CategoryRibbonOptions,
): RibbonTab[] {
  const resolve = resolveLabel ?? defaultResolver;
  const moduleMenus = options?.moduleMenus ?? true;
  const activePagesGroup = options?.activePagesGroup ?? true;
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
      const item: RibbonItem = {
        id: mod.id,
        label: modLabel,
        icon: mod.icon,
        href: firstRoute ? `#${firstRoute}` : undefined,
        active: mod.id === activeModuleId,
        description: describe(resolve, mod.descriptionKey, mod.description),
      };
      if (moduleMenus && visible.length >= 2) {
        item.split = true;
        item.menu = pageMenu(mod, visible, resolve);
      }
      moduleItems.push(item);
    }
    if (moduleItems.length > 0) {
      groups.push({ id: '_modules', label: catLabel, items: moduleItems });
    }

    // Group 2: active module's sub-pages (if the active module is in this category)
    if (activePagesGroup && activeModuleId) {
      const activeMod = mods.find(m => m.id === activeModuleId);
      if (activeMod) {
        const visible = getVisibleOptions(activeMod);
        const modLabel = resolve(activeMod.labelKey, activeMod.label);
        const activeHref = activeRoute ? `#${activeRoute}` : '';
        const pageItems: RibbonItem[] = visible.map(opt => ({
          id: `${activeMod.id}:${opt.id}`,
          label: resolve(opt.labelKey, opt.label),
          icon: opt.icon,
          href: opt.actionOnly ? undefined : `#${opt.route}`,
          action: opt.actionOnly,
          badge: opt.badge,
          active: !opt.actionOnly && activeHref === `#${opt.route}`,
          description: describe(resolve, opt.descriptionKey, opt.description),
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
      description: describe(resolve, opt.descriptionKey, opt.description),
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
