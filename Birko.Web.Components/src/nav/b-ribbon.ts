import { BaseComponent, define } from 'birko-web-core';
import { resolveRibbonSizes, RIBBON_SIZE_LADDER, type RibbonGroupMetrics } from './ribbon-scaling.js';

// ── Interfaces ───────────────────────────────────────────────────────────────

export interface RibbonTab {
  id: string;
  label: string;
  icon?: string;
  badge?: number;
  disabled?: boolean;
  category?: string;
  groups: RibbonGroup[];
  /**
   * Suppress the dropdown panel for this tab — the tab itself is the
   * navigation. Unset = auto: a tab whose groups hold exactly one plain nav
   * link (href, not action) is panelless, since its panel would only
   * duplicate the tab click. Set `false` to force the panel even then.
   */
  noPanel?: boolean;
}

/**
 * How much room a `RibbonGroup` is being given, smallest last. The ribbon picks the largest set of
 * variants that fits the available width and degrades from there — Office's model, where the ribbon
 * body **resizes rather than scrolls**, because a scroll offset destroys the spatial memory the
 * ribbon exists to provide ("Cut is top-left of Clipboard").
 *
 * - `large`  — 32px icon, label underneath, one item per column
 * - `medium` — 16px icon with the label to its right, three items stacked per column
 * - `small`  — 16px icon only, three per column; the label is not drawn, so `title` carries the name
 * - `popup`  — the whole group collapses to one button (group icon + label + ▾) whose flyout holds
 *              its items at `large`. Lossless: the group keeps its identity and its position.
 *
 * **Neither skin renders all four yet** — TASK-099/TASK-100 build them. As of TASK-098 `b-ribbon`
 * renders every item as `medium` while the Avalonia `Ribbon` renders every item as `large` — a
 * pre-existing parity gap named here so TASK-099 reconciles it deliberately.
 *
 * Mirrors `RibbonGroupSize` in `Birko.Xaml.Core/Ribbon/RibbonModels.cs`; keep the two in step.
 */
export type RibbonGroupSize = 'large' | 'medium' | 'small' | 'popup';

export interface RibbonGroup {
  id: string;
  label: string;
  items: RibbonItem[];
  /**
   * Optional glyph naming the group. Shown on the collapsed chunk button when the group degrades to
   * `popup`; unused at the roomier sizes.
   */
  icon?: string;
  /**
   * How important this group is, and therefore how late it degrades: a **lower** value degrades
   * **first**. Groups sharing a value degrade left-to-right. Default 0, so a ribbon that sets nothing
   * degrades uniformly — the outcome to avoid, since shrinking every group at the same rate turns the
   * ribbon into a row of anonymous icons instead of keeping the primary group legible. Give the hero
   * group (Clipboard, Font) a higher value.
   *
   * The direction is **Birko's convention** — priority means importance. Office's RibbonX has its own
   * `scalingPriority` whose numeric sense is not what is documented here; do not assume they agree.
   */
  scalingPriority?: number;
  /**
   * The tightest variant this group may degrade to. Defaults to `popup` (fully collapsible). Raise it
   * to protect a group — `minSize: 'small'` keeps it visible as icons rather than folding into a
   * flyout, at the cost of another group degrading further.
   */
  minSize?: RibbonGroupSize;
}

export interface RibbonItem {
  id: string;
  label: string;
  icon?: string;
  href?: string;
  action?: boolean;
  badge?: number;
  disabled?: boolean;
  active?: boolean;
  variant?: 'primary' | 'danger';
}

// ── Component ────────────────────────────────────────────────────────────────

export class BRibbon extends BaseComponent {
  static get observedAttributes() { return ['active', 'expanded', 'pinned', 'tabs-only',
    'label-ribbon', 'label-open-nav', 'label-expand', 'label-collapse',
    'label-pin', 'label-unpin', 'label-navigation', 'label-actions', 'label-close',
    'label-scroll-tabs-left', 'label-scroll-tabs-right',
    'label-scroll-groups-left', 'label-scroll-groups-right',
    'preferred-group-size']; }

  private _tabs: RibbonTab[] = [];
  private _contextActions: RibbonItem[] = [];
  private _expandTimer: ReturnType<typeof setTimeout> | null = null;
  private _collapseTimer: ReturnType<typeof setTimeout> | null = null;
  private _mobileOpen = false;
  private _hoverTabId: string | null = null;
  private _scrollSyncs: Array<() => void> = [];
  private _scrollObserver: ResizeObserver | null = null;
  private _panelSync: (() => void) | null = null;
  /**
   * Which chevrons are currently warranted, per track. This has to be *state*, not just a class
   * `sync()` toggles: `update()` morphs synchronously and the template's `class` attribute overwrites
   * an imperatively-added one, so a re-render would blank the chevron until the next animation frame.
   * On an unpinned ribbon, hover expand/collapse re-renders on nearly every mouse move across the
   * strip — so the button strobed, the flex row reflowed each time it vanished, and a tab slid under
   * the cursor and swallowed the click. Same hazard `_hoverTabId` documents below.
   */
  private _tabScroll = { left: false, right: false, overflowing: false };
  private _panelScroll = { left: false, right: false, overflowing: false };
  private _syncQueued = false;
  /**
   * The variant each group of the shown tab renders at. State, not a class stamped on after the fact:
   * render() re-emits it, so a morph cannot revert the row for a frame. That mistake produced three
   * separate flicker bugs in TASK-097 — see the `_tabScroll` note above.
   */
  private _groupSizes: string[] = [];
  /** Whether collapsed chunks are drawn without their group names — the narrowest row possible. */
  private _compactChunks = false;
  private _measuring = false;

  static get styles() {
    // NO BACKTICKS anywhere below, comments included: this is a template literal, and a stray pair
    // terminates it. Costs a build error and a confusing PAGEERROR dumping the stylesheet. Done it 3x.
    return `
      :host { display: block; flex-shrink: 0; z-index: var(--b-z-sticky, 200); position: relative; }

      /* ── Tab Row ── */
      .ribbon-tab-row {
        display: flex; align-items: center;
        height: var(--b-ribbon-tab-height, 2.75rem);
        background: var(--b-bg-elevated);
        border-bottom: 1px solid var(--b-border);
        padding: 0;
      }
      .ribbon-before { display: flex; align-items: center; height: 100%; flex-shrink: 0; }
      .ribbon-tabs {
        display: flex; align-items: stretch; height: 100%;
        flex: 1; min-width: 0; overflow-x: auto;
        scrollbar-width: none;
        gap: 0;
        scroll-behavior: smooth;
      }
      .ribbon-tabs::-webkit-scrollbar { display: none; }

      .ribbon-scroll-btn {
        display: none; background: var(--b-bg-elevated); border: none; cursor: pointer;
        color: var(--b-text-muted); padding: 0 var(--b-space-xs, 0.25rem);
        font-size: 0.75rem; flex-shrink: 0; align-items: center; justify-content: center;
        z-index: 1;
      }
      /* Once a track overflows at all, BOTH slots are reserved and only their VISIBILITY changes —
         so scrolling to either end, or a container jittering by a scrollbar's width, never reflows
         the strip and never moves the click target. Before this, hiding a chevron let a tab slide
         into its slot and swallow the click. A track that fits reserves nothing.
         The .visible rule must FOLLOW .reserved — same specificity, so source order decides.
         (No backticks in here: this comment lives inside a JS template literal.) */
      .ribbon-scroll-btn.reserved { display: flex; visibility: hidden; }
      .ribbon-scroll-btn.visible { display: flex; visibility: visible; }
      .ribbon-scroll-btn:hover { color: var(--b-text); background: var(--b-bg-tertiary); }

      .ribbon-tab {
        display: flex; align-items: center; gap: var(--b-space-xs, 0.25rem);
        padding: 0 var(--b-space-lg, 1rem);
        background: none; border: none; cursor: pointer;
        font-size: var(--b-text-sm, 0.8125rem); font-weight: var(--b-font-weight-medium, 500);
        color: var(--b-text-muted); white-space: nowrap;
        border-bottom: 2px solid transparent;
        margin-bottom: -1px;
        transition: color var(--b-transition, 150ms ease), border-color var(--b-transition, 150ms ease);
      }
      .ribbon-tab:hover { color: var(--b-text); }
      .ribbon-tab:focus-visible { outline: none; box-shadow: var(--b-focus-ring); }
      .ribbon-tab[aria-selected="true"] {
        color: var(--b-color-primary); border-bottom-color: var(--b-color-primary);
      }
      .ribbon-tab[aria-disabled="true"] {
        opacity: var(--b-disabled-opacity, 0.5); pointer-events: none;
      }
      .ribbon-tab-icon { font-size: var(--b-icon-base, 1rem); }
      .ribbon-tab-badge {
        min-width: 1.125rem; height: 1.125rem; padding: 0 0.25rem;
        border-radius: var(--b-radius-full, 9999px);
        background: var(--b-color-danger); color: var(--b-text-inverse);
        font-size: var(--b-text-2xs, 0.625rem); font-weight: var(--b-font-weight-bold, 700);
        display: inline-flex; align-items: center; justify-content: center; line-height: 1;
      }

      .ribbon-tab-divider {
        width: 1px; height: 1.25rem; align-self: center; flex-shrink: 0;
        background: var(--b-border); margin: 0 var(--b-space-xs, 0.25rem);
      }

      .ribbon-after { display: flex; align-items: center; height: 100%; flex-shrink: 0; }

      .ribbon-ctrl {
        background: none; border: none; cursor: pointer;
        color: var(--b-text-muted); padding: var(--b-space-xs, 0.25rem) var(--b-space-sm, 0.5rem);
        border-radius: var(--b-radius, 0.375rem); font-size: var(--b-text-base, 0.875rem);
        display: flex; align-items: center;
      }
      .ribbon-ctrl:hover { color: var(--b-text); background: var(--b-bg-tertiary); }
      .ribbon-ctrl:focus-visible { outline: none; box-shadow: var(--b-focus-ring); }
      .ribbon-ctrl[aria-pressed="true"] { color: var(--b-color-primary); }

      /* ── Panel Row ── */
      .ribbon-panel {
        max-height: 0; overflow: hidden;
        background: var(--b-bg-elevated);
        border-bottom: 1px solid var(--b-border);
        transition: max-height var(--b-transition-slow, 300ms ease);
        /* Flex row so the scroll chevrons can flank the scrolling inner track. */
        display: flex; align-items: stretch;
      }
      :host([expanded]) .ribbon-panel {
        max-height: var(--b-ribbon-panel-height, 8rem);
      }
      /* Unpinned: overlay content instead of pushing it down */
      :host(:not([pinned])) .ribbon-panel {
        position: absolute; left: 0; right: 0; top: 100%;
        z-index: var(--b-z-dropdown, 300);
        box-shadow: var(--b-shadow-md, 0 4px 6px -1px rgba(0,0,0,.1));
      }
      .ribbon-panel-inner {
        display: flex; align-items: flex-start;
        gap: var(--b-ribbon-group-gap, var(--b-space-xl, 1.5rem));
        padding: var(--b-space-sm, 0.5rem) var(--b-space-lg, 1rem);
        height: var(--b-ribbon-panel-height, 8rem);
        /* The ribbon BODY resizes, it never scrolls (STORY-049): a scroll offset destroys the spatial
           memory the ribbon exists to provide. Groups degrade instead — down to a single chunk button
           each — so nothing can be unreachable and no scroller is needed. TASK-097's interim panel
           scroller is gone; the TAB STRIP keeps scrolling, the deliberate exception. */
        flex: 1; min-width: 0;
        overflow: hidden;
      }
      .ribbon-panel-inner::-webkit-scrollbar { display: none; }

      /* Gap tightens as the row does, mirroring the Avalonia panel's EffectiveGap. Not cosmetic: the gap
         sets the row's hard minimum, so collapsed chunks sitting a full group-gap apart waste exactly the
         width the collapse just bought. The tightest variant present wins, so the popup rule comes last. */
      .ribbon-panel-inner:has(> .ribbon-group.size-small) { gap: calc(var(--b-ribbon-group-gap) * 0.5); }
      .ribbon-panel-inner:has(> .ribbon-group.size-popup) { gap: calc(var(--b-ribbon-group-gap) * 0.25); }

      /* ── Groups ── */
      .ribbon-group {
        display: flex; flex-direction: column; gap: var(--b-space-xs, 0.25rem);
        flex-shrink: 0; min-width: 0;
      }
      .ribbon-group-label {
        font-size: var(--b-text-xs, 0.6875rem);
        color: var(--b-text-muted);
        text-transform: uppercase;
        letter-spacing: var(--b-letter-spacing-caps, 0.03125rem);
        font-weight: var(--b-font-weight-semibold, 600);
        line-height: 1;
        padding: 0 var(--b-space-xs, 0.25rem);
      }
      .ribbon-group-items {
        display: flex; align-items: center;
        gap: var(--b-ribbon-item-gap, var(--b-space-xs, 0.25rem));
      }

      /* ── Size variants (STORY-049) ────────────────────────────────────────────
         The group carries the variant as a class and the items restyle from it. Medium and Small stack
         three per column and flow columns horizontally, as Office does -- that is what makes them
         NARROWER, not merely smaller. Sizes come from the TASK-098 tokens, never hand-authored here. */

      /* Large: 32px icon above the label, one item per column. */
      .ribbon-group.size-large .ribbon-group-items { align-items: flex-start; }
      .ribbon-group.size-large .ribbon-item {
        flex-direction: column; gap: 0.125rem; min-width: 3.25rem; text-align: center;
      }
      .ribbon-group.size-large .ribbon-item-icon { font-size: var(--b-ribbon-icon-large); }

      /* Medium (the default look): 16px icon, label to its right, three per column. */
      .ribbon-group.size-medium .ribbon-group-items,
      .ribbon-group.size-small .ribbon-group-items {
        display: grid; grid-auto-flow: column;
        grid-template-rows: repeat(3, auto);
        justify-items: start;
      }
      .ribbon-group.size-medium .ribbon-item-icon,
      .ribbon-group.size-small .ribbon-item-icon { font-size: var(--b-ribbon-icon-small); }

      /* Small: icon only. The label is not rendered, so the title attribute carries the name -- an icon-only
         command with no accessible name trades "unreachable" for "unnameable". */
      .ribbon-group.size-small .ribbon-item-label { display: none; }
      .ribbon-group.size-small .ribbon-item { padding: var(--b-space-xs, 0.25rem); }

      /* Popup: the whole group folded into one chunk button whose flyout holds it at Large. Lossless --
         the group keeps its identity AND its position, which is what separates this from a flat
         overflow menu that dumps every leftover command into one list. */
      .ribbon-chunk {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 0.125rem; min-width: var(--b-ribbon-chunk-width);
        padding: var(--b-space-xs, 0.25rem) var(--b-space-sm, 0.5rem);
        border: none; background: none; cursor: pointer;
        border-radius: var(--b-radius, 0.375rem);
        color: var(--b-text-secondary); font-size: var(--b-text-xs, 0.6875rem);
        white-space: nowrap;
      }
      .ribbon-chunk:hover { background: var(--b-bg-tertiary); color: var(--b-text); }
      .ribbon-chunk:focus-visible { outline: none; box-shadow: var(--b-focus-ring); }
      .ribbon-chunk-icon { font-size: var(--b-ribbon-icon-small); }
      /* The extreme: even a row of labelled chunks can be too wide, because a chunk shows its group NAME
         and a name has a minimum width. Dropping it roughly halves the row's minimum. The name stays in
         title/aria-label, so no button becomes anonymous -- the same trade the small variant makes. */
      .ribbon-group.size-popup.compact .ribbon-chunk { min-width: 0; }
      .ribbon-group.size-popup.compact .ribbon-chunk-name { display: none; }
      .ribbon-group.size-popup { position: relative; }
      .ribbon-flyout {
        position: absolute; top: 100%; left: 0; z-index: var(--b-z-dropdown, 300);
        display: none;
        background: var(--b-bg-elevated); border: 1px solid var(--b-border);
        border-radius: var(--b-radius, 0.375rem); box-shadow: var(--b-shadow-md, 0 4px 6px -1px rgba(0,0,0,.1));
        padding: var(--b-space-sm, 0.5rem);
      }
      .ribbon-group.size-popup[data-open] .ribbon-flyout { display: block; }
      .ribbon-flyout .ribbon-group-items { display: flex; align-items: flex-start; }
      .ribbon-flyout .ribbon-item { flex-direction: column; gap: 0.125rem; min-width: 3.25rem; text-align: center; }
      .ribbon-flyout .ribbon-item-icon { font-size: var(--b-ribbon-icon-large); }

      /* ── Items ── */
      .ribbon-item {
        display: inline-flex; align-items: center; gap: var(--b-space-xs, 0.25rem);
        padding: var(--b-space-xs, 0.25rem) var(--b-space-sm, 0.5rem);
        border-radius: var(--b-radius, 0.375rem);
        font-size: var(--b-text-sm, 0.8125rem); font-weight: var(--b-font-weight-medium, 500);
        color: var(--b-text-secondary); text-decoration: none;
        border: none; background: none; cursor: pointer;
        white-space: nowrap;
        transition: all var(--b-transition, 150ms ease);
      }
      .ribbon-item:hover { background: var(--b-bg-tertiary); color: var(--b-text); }
      .ribbon-item:focus-visible { outline: none; box-shadow: var(--b-focus-ring); }
      .ribbon-item.active { background: var(--b-color-primary-light); color: var(--b-color-primary); }
      .ribbon-item[aria-disabled="true"] {
        opacity: var(--b-disabled-opacity, 0.5); pointer-events: none;
      }
      .ribbon-item.variant-primary { color: var(--b-color-primary); font-weight: var(--b-font-weight-semibold, 600); }
      .ribbon-item.variant-danger { color: var(--b-color-danger); }
      .ribbon-item-icon { font-size: var(--b-icon-base, 1rem); }
      .ribbon-item-badge {
        min-width: 1rem; height: 1rem; padding: 0 0.2rem;
        border-radius: var(--b-radius-full, 9999px);
        background: var(--b-color-danger); color: var(--b-text-inverse);
        font-size: 0.5625rem; font-weight: var(--b-font-weight-bold, 700);
        display: inline-flex; align-items: center; justify-content: center; line-height: 1;
      }

      /* ── Group separator ── */
      /* Separator only — the spacing is owned by the flex gap alone. This used to ALSO add a full
         --b-ribbon-group-gap of padding-left, so the real inter-group spacing was double the gap while the
         measure pass (which measures a group with no preceding sibling, so no padding applies) assumed
         single. That under-count made the pass under-degrade and clip the row. One mechanism, one number. */
      .ribbon-group + .ribbon-group { border-left: 1px solid var(--b-border); }

      /* ── Mobile ── */
      .mobile-hamburger {
        display: none; background: none; border: none; cursor: pointer;
        color: var(--b-text-secondary); font-size: var(--b-text-xl, 1.25rem);
        padding: var(--b-space-xs, 0.25rem); border-radius: var(--b-radius, 0.375rem);
        align-items: center; justify-content: center;
      }
      .mobile-hamburger:hover { background: var(--b-bg-tertiary); }
      .mobile-active-label {
        display: none; font-size: var(--b-text-sm, 0.8125rem);
        font-weight: var(--b-font-weight-semibold, 600); color: var(--b-text);
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }

      .mobile-dialog {
        position: fixed; inset: 0; z-index: var(--b-z-modal, 400);
        background: var(--b-bg); border: none; padding: 0; margin: 0;
        width: 100%; max-width: 100%; height: 100%; max-height: 100%;
      }
      .mobile-dialog::backdrop { background: var(--b-backdrop-bg); }
      .mobile-dialog-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: var(--b-space-md, 0.75rem) var(--b-space-lg, 1rem);
        border-bottom: 1px solid var(--b-border);
        font-weight: var(--b-font-weight-bold, 700);
        font-size: var(--b-text-lg, 1rem);
      }
      .mobile-dialog-close {
        background: none; border: none; cursor: pointer;
        font-size: var(--b-text-xl, 1.25rem); color: var(--b-text-muted); padding: var(--b-space-xs, 0.25rem);
        border-radius: var(--b-radius, 0.375rem);
      }
      .mobile-dialog-close:hover { background: var(--b-bg-tertiary); color: var(--b-text); }
      .mobile-dialog-body { padding: var(--b-space-sm, 0.5rem); overflow-y: auto; height: calc(100% - 3rem); }
      .mobile-tab-section { margin-bottom: var(--b-space-sm, 0.5rem); }
      .mobile-tab-header {
        display: flex; align-items: center; gap: var(--b-space-sm, 0.5rem);
        padding: var(--b-space-sm, 0.5rem) var(--b-space-md, 0.75rem);
        font-weight: var(--b-font-weight-semibold, 600);
        color: var(--b-text); cursor: pointer; border-radius: var(--b-radius, 0.375rem);
        border: none; background: none; width: 100%; text-align: left;
        font-size: var(--b-text-base, 0.875rem);
      }
      .mobile-tab-header:hover { background: var(--b-bg-tertiary); }
      .mobile-tab-header.active { color: var(--b-color-primary); background: var(--b-color-primary-light); }
      .mobile-group { padding-left: var(--b-space-lg, 1rem); }
      .mobile-group-label {
        font-size: var(--b-text-xs, 0.6875rem); color: var(--b-text-muted);
        text-transform: uppercase; letter-spacing: var(--b-letter-spacing-caps, 0.03125rem);
        padding: var(--b-space-xs, 0.25rem) var(--b-space-md, 0.75rem);
        font-weight: var(--b-font-weight-semibold, 600);
      }
      .mobile-item {
        display: flex; align-items: center; gap: var(--b-space-sm, 0.5rem);
        padding: var(--b-space-sm, 0.5rem) var(--b-space-md, 0.75rem);
        color: var(--b-text-secondary); text-decoration: none; border-radius: var(--b-radius, 0.375rem);
        font-size: var(--b-text-sm, 0.8125rem); border: none; background: none; cursor: pointer;
        width: 100%; text-align: left; min-height: var(--b-ribbon-tab-height, 2.75rem);
      }
      .mobile-item:hover { background: var(--b-bg-tertiary); color: var(--b-text); }

      /* rem breakpoints (48rem/64rem = the old 768px/1024px at a default 16px browser) —
         in a media query rem resolves against the browser default, not a :root override,
         so the ribbon collapses earlier for a reader who scaled their font up. */
      @media (max-width: 48rem) {
        .ribbon-tabs { display: none; }
        .ribbon-panel { display: none; }
        .ribbon-ctrl { display: none; }
        .ribbon-scroll-btn { display: none !important; }
        .mobile-hamburger { display: flex; }
        .mobile-active-label { display: block; flex: 1; min-width: 0; }
      }
      @media (max-width: 64rem) {
        .ribbon-tab-icon + .ribbon-tab-label { display: none; }
      }
    `;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  setTabs(tabs: RibbonTab[]) {
    this._tabs = tabs;
    if (!this.attr('active') && tabs.length > 0) {
      this.setAttribute('active', tabs[0].id);
    }
    this.update();
  }

  setContextActions(items: RibbonItem[]) {
    this._contextActions = items;
    this.update();
  }

  /**
   * Whether a tab suppresses its dropdown panel. Explicit `noPanel` wins;
   * otherwise auto: exactly one plain nav-link item (and no context actions)
   * means the panel would only duplicate the tab click.
   */
  private _isPanelless(tab: RibbonTab | undefined): boolean {
    if (!tab) return false;
    if (tab.noPanel != null) return tab.noPanel;
    if (this._contextActions.length > 0) return false;
    const items = tab.groups.flatMap(g => g.items);
    return items.length === 1 && !!items[0].href && !items[0].action;
  }

  /** Pure tab-strip mode: forced via the `tabs-only` attribute, or every tab is panelless. */
  private get _tabsOnlyMode(): boolean {
    return this.boolAttr('tabs-only')
      || (this._tabs.length > 0 && this._tabs.every(t => this._isPanelless(t)));
  }

  expand()  {
    // tabs-only: there is no panel to expand — keep the attribute clean and
    // emit nothing (hover handlers and refreshRibbon() may still call this).
    if (this._tabsOnlyMode) return;
    this.setAttribute('expanded', ''); this.emit('expand', { expanded: true });
  }
  collapse() { this.removeAttribute('expanded'); this.emit('expand', { expanded: false }); }

  toggleExpand() {
    if (this.boolAttr('expanded')) this.collapse(); else this.expand();
  }

  pin()   {
    if (this._tabsOnlyMode) return;
    this.setAttribute('pinned', ''); this.expand(); this.emit('pin', { pinned: true });
  }
  unpin() { this.removeAttribute('pinned'); this.emit('pin', { pinned: false }); }

  togglePin() {
    if (this.boolAttr('pinned')) this.unpin(); else this.pin();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  render() {
    const active = this.attr('active');
    const expanded = this.boolAttr('expanded');
    const pinned = this.boolAttr('pinned');
    // tabs-only: pure tab-strip navigation — no panel, no expand/pin controls.
    // Forced via attribute, or automatic when every tab is panelless (single
    // nav-link tabs whose panel would only duplicate the tab's navigation).
    const tabsOnly = this._tabsOnlyMode;
    const activeTab = this._tabs.find(t => t.id === active);
    const activeLabel = activeTab?.label ?? '';
    // The panel previews the HOVERED tab when one is set (unpinned flyout / pinned preview),
    // else the active tab. Deriving it here — not only imperatively via _showTabContent — keeps
    // the preview correct across full re-renders (e.g. expand() flips the `expanded` attribute,
    // which triggers update()), so the panel's buttons always carry the shown tab's data-tab.
    // Without this, hovering an unpinned tab then clicking a button resolved to the active tab.
    const panelTabId = (this._hoverTabId && this._tabs.some(t => t.id === this._hoverTabId))
      ? this._hoverTabId : active;
    const panelTab = this._tabs.find(t => t.id === panelTabId);

    return `
      <div class="ribbon" role="toolbar" aria-label="${this.label('label-ribbon', 'bwc.ribbon.title', 'Module ribbon')}">
        <div class="ribbon-tab-row">
          <div class="ribbon-before"><slot name="before-tabs"></slot></div>

          <button class="mobile-hamburger" id="mobile-hamburger" aria-label="${this.label('label-open-nav', 'bwc.ribbon.openNav', 'Open navigation menu')}">&#9776;</button>
          <span class="mobile-active-label">${activeLabel}</span>

          <button class="ribbon-scroll-btn${this._tabScroll.overflowing ? ' reserved' : ''}${this._tabScroll.left ? ' visible' : ''}" id="scroll-left" aria-label="${this.label('label-scroll-tabs-left', 'bwc.ribbon.scrollTabsLeft', 'Scroll tabs left')}">&#9666;</button>
          <div class="ribbon-tabs" role="tablist">
            ${this._tabs.map((tab, i) => {
              const isActive = tab.id === active;
              const badge = tab.badge ? `<span class="ribbon-tab-badge">${tab.badge > 99 ? '99+' : tab.badge}</span>` : '';
              const icon = tab.icon ? `<span class="ribbon-tab-icon" aria-hidden="true">${tab.icon}</span>` : '';
              const disabled = tab.disabled ? 'aria-disabled="true"' : '';
              const prevCat = i > 0 ? this._tabs[i - 1].category : undefined;
              const divider = tab.category && prevCat && tab.category !== prevCat
                ? '<span class="ribbon-tab-divider" aria-hidden="true"></span>' : '';
              return `${divider}<button class="ribbon-tab" role="tab"
                aria-selected="${isActive}" ${tabsOnly ? '' : 'aria-controls="ribbon-panel"'}
                id="ribbon-tab-${tab.id}" tabindex="${isActive ? '0' : '-1'}"
                data-tab="${tab.id}" ${disabled}>
                ${icon}<span class="ribbon-tab-label">${tab.label}</span>${badge}
              </button>`;
            }).join('')}
          </div>
          <button class="ribbon-scroll-btn${this._tabScroll.overflowing ? ' reserved' : ''}${this._tabScroll.right ? ' visible' : ''}" id="scroll-right" aria-label="${this.label('label-scroll-tabs-right', 'bwc.ribbon.scrollTabsRight', 'Scroll tabs right')}">&#9656;</button>

          <div class="ribbon-after"><slot name="after-tabs"></slot></div>

          ${tabsOnly ? '' : `
          <button class="ribbon-ctrl" id="ribbon-toggle"
            aria-label="${expanded ? this.label('label-collapse', 'bwc.ribbon.collapse', 'Collapse ribbon') : this.label('label-expand', 'bwc.ribbon.expand', 'Expand ribbon')}"
            aria-expanded="${expanded}"
            title="${expanded ? this.label('label-collapse', 'bwc.ribbon.collapse', 'Collapse ribbon') : this.label('label-expand', 'bwc.ribbon.expand', 'Expand ribbon')}">
            ${expanded ? '&#9650;' : '&#9660;'}
          </button>
          <button class="ribbon-ctrl" id="ribbon-pin"
            aria-label="${pinned ? this.label('label-unpin', 'bwc.ribbon.unpin', 'Unpin ribbon') : this.label('label-pin', 'bwc.ribbon.pin', 'Pin ribbon open')}"
            aria-pressed="${pinned}"
            title="${pinned ? this.label('label-unpin', 'bwc.ribbon.unpin', 'Unpin ribbon') : this.label('label-pin', 'bwc.ribbon.pin', 'Pin ribbon open')}">
            ${pinned ? '&#128204;' : '&#128205;'}
          </button>`}
        </div>

        ${tabsOnly ? '' : this._renderPanel(panelTabId, panelTab)}

        <dialog class="mobile-dialog" id="mobile-dialog" aria-labelledby="mobile-dialog-title">
          <div class="mobile-dialog-header">
            <span id="mobile-dialog-title">${this.label('label-navigation', 'bwc.ribbon.navigation', 'Navigation')}</span>
            <button class="mobile-dialog-close" id="mobile-dialog-close" aria-label="${this.label('label-close', 'bwc.common.close', 'Close')}">&#10005;</button>
          </div>
          <div class="mobile-dialog-body">
            ${this._tabs.map(tab => `
              <div class="mobile-tab-section">
                <button class="mobile-tab-header ${tab.id === active ? 'active' : ''}" data-mobile-tab="${tab.id}"
                  aria-expanded="${tab.id === active}" aria-controls="mobile-group-${tab.id}">
                  ${tab.icon ? `<span aria-hidden="true">${tab.icon}</span>` : ''}
                  ${tab.label}
                </button>
                <div class="mobile-group" id="mobile-group-${tab.id}" data-mobile-group="${tab.id}" ${tab.id !== active ? 'hidden' : ''}>
                  ${tab.groups.map(group => `
                    <div class="mobile-group-label">${group.label}</div>
                    ${group.items.map(item => {
                      const tag = item.href ? 'a' : 'button';
                      const href = item.href ? `href="${item.href}"` : '';
                      return `<${tag} class="mobile-item" ${href}
                        data-tab="${tab.id}" data-group="${group.id}" data-item="${item.id}">
                        ${item.icon ? `<span aria-hidden="true">${item.icon}</span>` : ''}
                        ${item.label}
                      </${tag}>`;
                    }).join('')}
                  `).join('')}
                </div>
              </div>
            `).join('')}
          </div>
        </dialog>
      </div>
    `;
  }

  private _renderPanel(panelTabId: string, panelTab: RibbonTab | undefined): string {
    const labelledBy = panelTab ? ` aria-labelledby="ribbon-tab-${panelTabId}"` : '';
    return `
      <div class="ribbon-panel" role="tabpanel" id="ribbon-panel"${labelledBy}>
        <div class="ribbon-panel-inner">
          ${panelTab ? this._renderPanelInner(panelTab) : '<slot name="empty"></slot>'}
        </div>
      </div>
    `;
  }

  private _renderPanelInner(tab: RibbonTab): string {
    const hasContext = this._contextActions.length > 0;

    return `
      ${tab.groups.map((group, i) => this._renderGroup(tab.id, group, this._groupSizes[i] ?? 'medium')).join('')}
      ${hasContext ? `
        <div class="ribbon-group" role="group" aria-label="${this.label('label-actions', 'bwc.common.actions', 'Actions')}">
          <span class="ribbon-group-label">${this.label('label-actions', 'bwc.common.actions', 'Actions')}</span>
          <div class="ribbon-group-items">
            ${this._contextActions.map(item => this._renderItem(tab.id, '_context', item)).join('')}
          </div>
        </div>
      ` : ''}
    `;
  }

  /**
   * One group at one variant. `popup` collapses the whole group into a chunk button whose flyout holds
   * its items at `large` — lossless, and the group keeps its position in the row.
   */
  private _renderGroup(tabId: string, group: RibbonGroup, size: string): string {
    const items = group.items.map(item => this._renderItem(tabId, group.id, item)).join('');

    if (size === 'popup') {
      const compact = this._compactChunks ? ' compact' : '';
      const label = this.label('label-actions', 'bwc.common.actions', 'Actions'); // unused, keeps API stable
      void label;
      return `
        <div class="ribbon-group size-popup${compact}" role="group" aria-label="${group.label}" data-group="${group.id}">
          <button class="ribbon-chunk" data-chunk="${group.id}"
            aria-expanded="false" aria-haspopup="true" aria-label="${group.label}" title="${group.label}">
            ${group.icon ? `<span class="ribbon-chunk-icon" aria-hidden="true">${group.icon}</span>` : ''}
            <span class="ribbon-chunk-name">${group.label} &#9662;</span>
          </button>
          <div class="ribbon-flyout" role="group" aria-label="${group.label}">
            <div class="ribbon-group-items">${items}</div>
          </div>
        </div>`;
    }

    return `
      <div class="ribbon-group size-${size}" role="group" aria-label="${group.label}" data-group="${group.id}">
        <span class="ribbon-group-label">${group.label}</span>
        <div class="ribbon-group-items">${items}</div>
      </div>`;
  }

  private _showTabContent(tabId: string) {
    const tab = this._tabs.find(t => t.id === tabId);
    const panelInner = this.$<HTMLElement>('.ribbon-panel-inner');
    if (!panelInner || !tab) return;
    panelInner.innerHTML = this._renderPanelInner(tab);
    this._bindPanelItems();
    this._bindChunks();
    // Different tab, different group widths — the chevrons must re-evaluate against the new content.
    this._panelSync?.();
  }

  private _bindPanelItems() {
    this.$$<HTMLElement>('.ribbon-panel .ribbon-item').forEach(el => {
      this.listen(el, 'click', (e: Event) => {
        const target = e.currentTarget as HTMLElement;
        this.emit('item-click', {
          tabId: target.dataset.tab,
          groupId: target.dataset.group,
          itemId: target.dataset.item,
        });
        if (!this.boolAttr('pinned')) { this._hoverTabId = null; this.collapse(); }
      });
    });
  }

  private _renderItem(tabId: string, groupId: string, item: RibbonItem): string {
    const cls = [
      'ribbon-item',
      item.active ? 'active' : '',
      item.variant ? `variant-${item.variant}` : '',
    ].filter(Boolean).join(' ');
    const icon = item.icon ? `<span class="ribbon-item-icon" aria-hidden="true">${item.icon}</span>` : '';
    const badge = item.badge ? `<span class="ribbon-item-badge">${item.badge > 99 ? '99+' : item.badge}</span>` : '';
    const disabled = item.disabled ? 'aria-disabled="true"' : '';
    const data = `data-tab="${tabId}" data-group="${groupId}" data-item="${item.id}"`;

    // `title` matters at the Small variant, where the label is not rendered: an icon-only command with
    // no accessible name would trade "unreachable" for "unnameable".
    const named = `title="${item.label}" aria-label="${item.label}"`;
    const body = `${icon}<span class="ribbon-item-label">${item.label}</span>${badge}`;

    if (item.href && !item.action) {
      return `<a class="${cls}" href="${item.href}" ${disabled} ${data} ${named}>${body}</a>`;
    }
    return `<button class="${cls}" ${disabled} ${data} ${named}>${body}</button>`;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  protected onUpdated() {
    // Scroll affordance for the overflowing tab strip AND the overflowing panel. `listen()` is
    // aborted each update, so the sync list is rebuilt here rather than accumulating stale closures.
    this._scrollSyncs = [];
    const tabTrack = this.$<HTMLElement>('.ribbon-tabs');
    const panelTrack = this.$<HTMLElement>('.ribbon-panel-inner');
    this._setupScroll(tabTrack, this.$<HTMLElement>('#scroll-left'), this.$<HTMLElement>('#scroll-right'), this._tabScroll);
    this._observeScrollTracks([tabTrack, panelTrack]); // panel observed for RESIZE, not for scrolling

    // Tab clicks
    this.$$<HTMLElement>('.ribbon-tab').forEach(btn => {
      this.listen(btn, 'click', () => this._selectTab(btn.dataset.tab!));
    });

    // Tab keyboard navigation
    const tabsEl = this.$('.ribbon-tabs');
    if (tabsEl) this.listen(tabsEl, 'keydown', (e: Event) => {
      const ke = e as KeyboardEvent;
      const tabs = this.$$<HTMLElement>('.ribbon-tab');
      const current = Array.from(tabs).findIndex(t => t.dataset.tab === this.attr('active'));
      let next = -1;

      if (ke.key === 'ArrowRight' || ke.key === 'ArrowLeft') {
        ke.preventDefault();
        next = ke.key === 'ArrowRight'
          ? (current + 1) % tabs.length
          : (current - 1 + tabs.length) % tabs.length;
      } else if (ke.key === 'Home') {
        ke.preventDefault(); next = 0;
      } else if (ke.key === 'End') {
        ke.preventDefault(); next = tabs.length - 1;
      } else if (ke.key === 'ArrowDown') {
        ke.preventDefault();
        // Move focus into panel first item
        const firstItem = this.$<HTMLElement>('.ribbon-panel .ribbon-item');
        firstItem?.focus();
        return;
      }

      if (next >= 0) {
        this._selectTab(tabs[next].dataset.tab!);
        tabs[next].focus();
      }
    });

    // Panel keyboard: Escape returns to tab row
    const panelEl = this.$('.ribbon-panel');
    if (panelEl) this.listen(panelEl, 'keydown', (e: Event) => {
      const ke = e as KeyboardEvent;
      if (ke.key === 'Escape') {
        ke.preventDefault();
        const active = this.attr('active');
        this.$<HTMLElement>(`#ribbon-tab-${active}`)?.focus();
      }
      // Left/Right between items
      if (ke.key === 'ArrowRight' || ke.key === 'ArrowLeft') {
        ke.preventDefault();
        const items = this.$$<HTMLElement>('.ribbon-panel .ribbon-item');
        const idx = Array.from(items).indexOf(ke.target as HTMLElement);
        if (idx < 0) return;
        const next = ke.key === 'ArrowRight'
          ? (idx + 1) % items.length
          : (idx - 1 + items.length) % items.length;
        items[next]?.focus();
      }
    });

    // Panel item clicks
    this._bindPanelItems();

    this._bindChunks();

    // First measure once layout exists. requestAnimationFrame, not now: clientWidth is 0 pre-layout.
    requestAnimationFrame(() => this._measureAndScale());

    // Expand/collapse toggle
    const toggleBtn = this.$('#ribbon-toggle');
    if (toggleBtn) this.listen(toggleBtn, 'click', () => this.toggleExpand());
    const pinBtn = this.$('#ribbon-pin');
    if (pinBtn) this.listen(pinBtn, 'click', () => this.togglePin());

    // Hover expand/collapse (desktop only) — per-tab hover with panel content preview
    let overTab = false;
    let overPanel = false;

    const maybeCollapse = () => {
      this._clearTimers();
      if (!overTab && !overPanel && !this.boolAttr('pinned') && this.boolAttr('expanded')) {
        this._collapseTimer = setTimeout(() => {
          this.collapse();
          // Revert panel to active tab content
          this._hoverTabId = null;
          this._showTabContent(this.attr('active'));
        }, 300);
      }
      // Pinned: revert to active tab when leaving
      if (!overTab && !overPanel && this.boolAttr('pinned') && this._hoverTabId) {
        this._collapseTimer = setTimeout(() => {
          this._hoverTabId = null;
          this._showTabContent(this.attr('active'));
        }, 200);
      }
    };

    // Each tab button gets its own mouseenter
    this.$$<HTMLElement>('.ribbon-tab').forEach(btn => {
      this.listen(btn, 'mouseenter', () => {
        overTab = true;
        this._clearTimers();
        const tabId = btn.dataset.tab!;
        // Panelless tab: nothing to preview or expand — the tab IS the link.
        if (this._isPanelless(this._tabs.find(t => t.id === tabId))) return;
        this._hoverTabId = tabId;
        // Show hovered tab's panel content
        this._showTabContent(tabId);
        // Expand if unpinned and collapsed
        if (!this.boolAttr('pinned') && !this.boolAttr('expanded')) {
          this._expandTimer = setTimeout(() => this.expand(), 100);
        }
      });
      this.listen(btn, 'mouseleave', () => {
        overTab = false;
        maybeCollapse();
      });
    });

    const panel = this.$<HTMLElement>('.ribbon-panel');
    if (panel) {
      this.listen(panel, 'mouseenter', () => { overPanel = true; this._clearTimers(); });
      this.listen(panel, 'mouseleave', () => { overPanel = false; maybeCollapse(); });
    }

    // Mobile dialog
    const hamburger = this.$('#mobile-hamburger');
    if (hamburger) this.listen(hamburger, 'click', () => this._openMobileMenu());
    const dialogClose = this.$('#mobile-dialog-close');
    if (dialogClose) this.listen(dialogClose, 'click', () => this._closeMobileMenu());

    // Mobile tab headers (toggle group visibility)
    this.$$<HTMLElement>('.mobile-tab-header').forEach(btn => {
      this.listen(btn, 'click', () => {
        const tabId = btn.dataset.mobileTab!;
        // Select tab
        this._selectTab(tabId);
        // Toggle visibility of groups
        this.$$<HTMLElement>('[data-mobile-group]').forEach(g => {
          g.hidden = g.dataset.mobileGroup !== tabId;
        });
        this.$$<HTMLElement>('.mobile-tab-header').forEach(h => {
          const isSel = h.dataset.mobileTab === tabId;
          h.classList.toggle('active', isSel);
          h.setAttribute('aria-expanded', String(isSel));
        });
      });
    });

    // Mobile item clicks
    this.$$<HTMLElement>('.mobile-item').forEach(el => {
      this.listen(el, 'click', () => {
        this.emit('item-click', {
          tabId: el.dataset.tab,
          groupId: el.dataset.group,
          itemId: el.dataset.item,
        });
        this._closeMobileMenu();
      });
    });
  }

  protected onUnmount() {
    this._clearTimers();
    this._scrollObserver?.disconnect();
    this._scrollObserver = null;
    this._scrollSyncs = [];
    this._panelSync = null;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _selectTab(tabId: string) {
    const tab = this._tabs.find(t => t.id === tabId);
    if (!tab || tab.disabled) return;

    const changed = tabId !== this.attr('active');
    if (changed) {
      this.setAttribute('active', tabId);
      this.emit('tab-change', { tab: tabId });
    }
    // Always expand panel so sub-pages are visible
    this.expand();
  }

  /**
   * Wire chevron scroll buttons to a horizontally overflowing track, and return its sync function.
   * Shared by the tab strip and the panel — the panel used to be `overflow-x: auto` with the
   * scrollbar hidden and no buttons, i.e. scrollable with no affordance whatsoever (TASK-097).
   */
  private _setupScroll(
    track: HTMLElement | null,
    leftBtn: HTMLElement | null,
    rightBtn: HTMLElement | null,
    state: { left: boolean; right: boolean; overflowing: boolean },
  ): (() => void) | null {
    if (!track || !leftBtn || !rightBtn) return null;

    const apply = (btn: HTMLElement, visible: boolean) => {
      btn.classList.toggle('reserved', state.overflowing);
      btn.classList.toggle('visible', visible);
    };

    const sync = () => {
      const over = track.scrollWidth - track.clientWidth;
      // Hysteresis on "does this track overflow at all", with a dead zone the width of the two
      // reserved slots. Reserving them shrinks clientWidth, which would otherwise let the slots'
      // own width decide whether they are needed — a bistable boundary. Now the slots are only
      // given back once the content fits with MORE room to spare than they occupy, so the decision
      // cannot flip itself, and a container jittering by a scrollbar's width cannot flip it either.
      const reserved = state.overflowing ? (leftBtn.offsetWidth + rightBtn.offsetWidth) || 40 : 40;
      state.overflowing = state.overflowing ? over > -reserved : over > 1;

      // Record into state as well as toggling classes, so render() can re-emit them and a
      // synchronous morph cannot blank the button for a frame.
      state.left = state.overflowing && track.scrollLeft > 1;
      state.right = state.overflowing && track.scrollLeft + track.clientWidth < track.scrollWidth - 1;
      apply(leftBtn, state.left);
      apply(rightBtn, state.right);
    };

    this.listen(track, 'scroll', sync, { passive: true });
    this.listen(leftBtn, 'click', () => { track.scrollLeft -= track.clientWidth * 0.5; });
    this.listen(rightBtn, 'click', () => { track.scrollLeft += track.clientWidth * 0.5; });

    this._scrollSyncs.push(sync);
    // Check on next frame (layout may not be ready yet)
    requestAnimationFrame(sync);
    return sync;
  }

  /**
   * Re-evaluate the chevrons when a track's box changes size. A resize alters overflow without
   * firing `scroll` and without re-rendering, so before this the right arrow stayed hidden while
   * the tabs overflowed — you had to reload the page to see it.
   *
   * Re-observed on every update because a re-render can replace the tracked elements.
   */
  private _observeScrollTracks(tracks: Array<HTMLElement | null>) {
    this._scrollObserver?.disconnect();
    const live = tracks.filter((t): t is HTMLElement => !!t);
    if (!live.length) return;
    this._scrollObserver ??= new ResizeObserver(() => this._queueSync());
    live.forEach(t => this._scrollObserver!.observe(t));
  }

  /**
   * Wire the collapsed-group chunk buttons and their flyouts.
   *
   * Called from onUpdated AND from _showTabContent, because the measure pass re-renders the panel — and
   * imperative wiring that is only applied in onUpdated silently dies on that re-render. Exactly the
   * hazard that produced the chevron bugs in TASK-097; here it made the chunk button stop opening.
   */
  private _bindChunks() {
    // Collapsed groups: chunk button toggles its flyout; Escape closes and returns focus. Keyboard
    // reach matters more here than anywhere else in the ribbon -- with no KeyTips yet, a collapsed
    // group that only opens on click would remove commands from keyboard users specifically.
    this.$$<HTMLElement>('.ribbon-chunk').forEach(chunk => {
      const group = chunk.closest('.ribbon-group') as HTMLElement | null;
      if (!group) return;
      this.listen(chunk, 'click', (e: Event) => {
        e.stopPropagation();
        const open = group.hasAttribute('data-open');
        this.$$<HTMLElement>('.ribbon-group.size-popup').forEach(g => g.removeAttribute('data-open'));
        if (!open) group.setAttribute('data-open', '');
        chunk.setAttribute('aria-expanded', String(!open));
      });
      this.listen(group, 'keydown', (e: Event) => {
        if ((e as KeyboardEvent).key !== 'Escape') return;
        e.preventDefault();
        group.removeAttribute('data-open');
        chunk.setAttribute('aria-expanded', 'false');
        chunk.focus();
      });
    });

    // Invoking from a flyout dismisses it, as Office does.
    this.$$<HTMLElement>('.ribbon-flyout .ribbon-item').forEach(el => {
      this.listen(el, 'click', () => {
        const group = el.closest('.ribbon-group') as HTMLElement | null;
        group?.removeAttribute('data-open');
        group?.querySelector('.ribbon-chunk')?.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /**
   * Measure each group at each variant and apply what the shared policy picks.
   *
   * Measuring means rendering: each variant is written into an off-screen probe, measured, and thrown
   * away. That is more work than reading a cached number, but it is the only honest way to know what a
   * variant costs with the consumer's real labels, fonts and tokens — and it runs only on resize, not
   * per frame.
   *
   * The result goes into `_groupSizes`, which `render()` re-emits, so a morph cannot revert the row.
   */
  private _measureAndScale() {
    if (this._measuring) return; // applying the result re-renders; do not recurse
    const track = this.$<HTMLElement>('.ribbon-panel-inner');
    const tab = this._tabs.find(t => t.id === (this._hoverTabId ?? this.attr('active')));
    if (!track || !tab || !tab.groups.length) return;

    const available = track.clientWidth
      - parseFloat(getComputedStyle(track).paddingLeft || '0')
      - parseFloat(getComputedStyle(track).paddingRight || '0');
    if (available <= 0) return;

    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;left:-9999px;top:0;';
    track.appendChild(probe);

    const metrics: RibbonGroupMetrics[] = tab.groups.map(group => {
      const widths: RibbonGroupMetrics['widths'] = {};
      for (const size of RIBBON_SIZE_LADDER) {
        probe.innerHTML = this._renderGroup(tab.id, group, size);
        const measured = probe.firstElementChild as HTMLElement | null;
        widths[size] = measured ? measured.getBoundingClientRect().width : 0;
      }
      return { widths, scalingPriority: group.scalingPriority ?? 0, minSize: group.minSize ?? 'popup' };
    });

    probe.remove();

    // The FULL token gap, not the live computed one: the rendered gap tightens once groups collapse, and
    // deciding against the tightened value could under-degrade and clip. Deciding against the larger value
    // is conservative — the row it picks then fits with room to spare. Same split as the Avalonia panel.
    const gap = parseFloat(getComputedStyle(this).getPropertyValue('--b-ribbon-group-gap'))
      || parseFloat(getComputedStyle(track).columnGap || '0') || 0;
    const preferred = (this.attr('preferred-group-size') || 'medium') as never;
    const next = resolveRibbonSizes(metrics, available, preferred, gap);

    // Last resort, below even an all-popup row: drop the group name from every chunk. A rendering choice
    // rather than a fifth variant, so the shared policy stays at Office's four -- and still a pure function
    // of the width, so it cannot oscillate.
    const allPopup = next.every((s) => s === 'popup');
    const popupRow = allPopup
      ? next.reduce((sum, _, i) => sum + (metrics[i].widths.popup ?? 0) + (i ? gap : 0), 0)
      : 0;
    const compact = allPopup && popupRow > available;

    if (next.join(',') === this._groupSizes.join(',') && compact === this._compactChunks) return;
    this._groupSizes = next;
    this._compactChunks = compact;
    this._measuring = true;
    try { this._showTabContent(tab.id); } finally { this._measuring = false; }
  }

  /**
   * Coalesce sync into one animation frame. A ResizeObserver can fire several times per frame
   * (two observed tracks, plus the reflow a class change causes), and each raw callback would
   * be another chance to toggle a class mid-frame — visible as strobing.
   */
  private _queueSync() {
    if (this._syncQueued) return;
    this._syncQueued = true;
    requestAnimationFrame(() => {
      this._syncQueued = false;
      this._measureAndScale();
      this._scrollSyncs.forEach(s => s());
    });
  }

  private _clearTimers() {
    if (this._expandTimer) { clearTimeout(this._expandTimer); this._expandTimer = null; }
    if (this._collapseTimer) { clearTimeout(this._collapseTimer); this._collapseTimer = null; }
  }

  private _openMobileMenu() {
    const dialog = this.$<HTMLDialogElement>('#mobile-dialog');
    dialog?.showModal();
    this._mobileOpen = true;
  }

  private _closeMobileMenu() {
    const dialog = this.$<HTMLDialogElement>('#mobile-dialog');
    dialog?.close();
    this._mobileOpen = false;
  }
}

define('b-ribbon', BRibbon);
