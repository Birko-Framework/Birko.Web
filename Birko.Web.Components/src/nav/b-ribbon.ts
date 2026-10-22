import { BaseComponent, define } from 'birko-web-core';
import { escapeHtml, escapeAttr } from '../dom-utils';
import '../layout/b-tooltip.js';
import type { BTooltip, TooltipContent } from '../layout/b-tooltip.js';
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
  /**
   * Options this command opens as a menu. Without `split` the whole button opens it (a menu button, shown with ▾);
   * with `split` the button runs the command and a separate ▾ part opens the menu (Office's "Paste ▾"). A choice
   * emits `item-click` with the choice's id as `itemId` and this command's id as `parentId`.
   */
  menu?: RibbonMenuEntry[];
  split?: boolean;
  /** One line shown under the name in the command's tooltip, and its accessible description. Text. */
  description?: string;
  /** Shown in the tooltip, e.g. `Ctrl+V`, and exposed as aria-keyshortcuts. Display only: the app binds the key. */
  shortcut?: string;
  /**
   * An on/off command (Bold). A click flips it and emits `item-click` with `pressed`. Not combined with `menu`.
   * `pressed` is the initial state; {@link BRibbon.setPressed} changes it later without an event.
   */
  toggle?: boolean;
  pressed?: boolean;
  /**
   * Commands of one ribbon group sharing this name form a set where exactly one is on (alignment left / centre /
   * right): pressing one turns the others off, and pressing the one that is on keeps it on. A screen reader hears a
   * radio group named after the ribbon group. Implies `toggle`.
   */
  toggleGroup?: string;
}

/** One choice of a {@link RibbonItem.menu}. Label and shortcut are text, never markup. */
export interface RibbonMenuItem {
  id: string;
  label: string;
  icon?: string;
  /** Shown right-aligned, e.g. `Ctrl+Shift+V`. Display only: the app binds the key itself. */
  shortcut?: string;
  disabled?: boolean;
}

/** A menu entry: a choice, or a divider line between sets of choices. */
export type RibbonMenuEntry = RibbonMenuItem | { separator: true };

// ── Component ────────────────────────────────────────────────────────────────

/**
 * The stop nearest to `from` in a direction, by on-screen position: Left/Right take anything wholly beyond it that
 * way, weighting vertical distance so the same row wins; Up/Down stay in `from`'s column (its horizontal
 * extent), so they never jump to a neighbouring group.
 */
function nearestInDirection(from: HTMLElement, stops: HTMLElement[], dir: 'left' | 'right' | 'up' | 'down'): HTMLElement | null {
  const a = from.getBoundingClientRect();
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of stops) {
    if (el === from) continue;
    const b = el.getBoundingClientRect();
    if (b.width === 0 && b.height === 0) continue;
    const dx = b.left + b.width / 2 - ax;
    const dy = b.top + b.height / 2 - ay;
    let score: number;
    if (dir === 'left' || dir === 'right') {
      // Wholly beyond `from`, not merely centred past it: a wider command BELOW (Copy under Cut) has its centre a
      // little to the right, and was picked by ArrowRight as if it were the next column.
      if (dir === 'right' ? b.left < a.right - 2 : b.right > a.left + 2) continue;
      score = Math.abs(dx) + Math.abs(dy) * 4;
    } else {
      if (dir === 'down' ? dy <= 1 : dy >= -1) continue;
      if (b.right <= a.left || b.left >= a.right) continue;
      score = Math.abs(dy) + Math.abs(dx) * 4;
    }
    if (score < bestScore) { bestScore = score; best = el; }
  }
  return best;
}

export class BRibbon extends BaseComponent {
  static get observedAttributes() { return ['active', 'expanded', 'pinned', 'tabs-only', 'tooltip-theme', 'collapse-shortcut',
    'label-ribbon', 'label-open-nav', 'label-expand', 'label-collapse',
    'label-pin', 'label-unpin', 'label-navigation', 'label-actions', 'label-close',
    'label-scroll-tabs-left', 'label-scroll-tabs-right',
    'label-scroll-groups-left', 'label-scroll-groups-right',
    'preferred-group-size']; }

  private _tabs: RibbonTab[] = [];
  /** Toggle states by tab/group/item, seeded from RibbonItem.pressed (see _isPressed). */
  private _pressed = new Map<string, boolean>();
  private _contextActions: RibbonItem[] = [];
  private _expandTimer: ReturnType<typeof setTimeout> | null = null;
  private _collapseTimer: ReturnType<typeof setTimeout> | null = null;
  private _mobileOpen = false;
  private _hoverTabId: string | null = null;
  /** The panel stop that holds tabindex 0 (see _stopKey); null means the first. */
  private _rovingKey: string | null = null;
  /** Hover delay before a command's tooltip shows, unless one was showing a moment ago. */
  static TOOLTIP_DELAY_MS = 500;
  private _tipAnchor: HTMLElement | null = null;
  private _tipTimer: ReturnType<typeof setTimeout> | null = null;
  private _tipWarmUntil = 0;
  private _shortcutAC: AbortController | null = null;
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
  /**
   * Which tab `_groupSizes` was measured for. Without this, hovering a tab re-rendered the panel with the
   * PREVIOUS tab's variant decisions — a different group count and different widths — so its groups could
   * overflow, and since the panel is `overflow: hidden` they were silently clipped and unreachable. A
   * decision is only valid for the tab it was measured against.
   */
  private _groupSizesTab: string | null = null;
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
        background: var(--b-color-danger); color: var(--b-text-on-danger, var(--b-text-inverse));
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
        /* stretch, not flex-start: every group takes the tallest group's height, so the separators (each
           group's border-left) run the full panel height instead of stopping at each group's own content.
           Measured before (TASK-730): the Home tab's six groups were 97, 95, 94, 68, 71 and 97px tall. */
        display: flex; align-items: stretch;
        gap: var(--b-ribbon-group-gap, var(--b-space-xl, 1.5rem));
        padding: var(--b-space-sm, 0.5rem) var(--b-space-lg, 1rem);
        /* CONTENT-SIZED, with --b-ribbon-panel-height acting as a CEILING on .ribbon-panel rather than
           as this element's height. The panel then fits whichever variant is currently rendered: a
           one-row large layout is ~70px, a degraded three-row medium is ~107px, and neither leaves dead
           space nor clips.

           It used to set height to that token, which was wrong twice over:
           - it forced the panel to the token height regardless of content, so an app preferring the
             large variant showed ~42px of empty panel, because the token has to be big enough for a
             degraded medium; and
           - combined with the default content-box, its OUTER height became token + vertical padding —
             always taller than the parent capped at token — so it clipped by exactly the padding at
             EVERY token value (measured 14px at 4.5rem, 8rem, 12rem and 20rem alike), which read as a
             content problem while being pure arithmetic.
           box-sizing stays border-box so padding can never re-open that gap if a height is ever
           reintroduced here. */
        box-sizing: border-box;
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
      /* The label is FIRST in the markup, so a screen reader meets the group's name before its commands, and is
         drawn LAST (order) so it sits centred under the group, as in Office (TASK-730, picked from a live preview). */
      .ribbon-group-label {
        order: 2;
        text-align: center;
        font-size: var(--b-text-xs, 0.6875rem);
        color: var(--b-text-muted);
        line-height: 1;
        /* Horizontal padding MATCHES .ribbon-item's, so the group label lines up with the commands it
           names instead of sitting further left than all of them. It used to be --b-space-xs against the
           items' --b-space-sm: measured, the label's ink started 3.5px from the group edge while the
           items' started 7px+, so the label read as stuck to the group separator (a border-left on
           .ribbon-group + .ribbon-group) while the buttons sat comfortably inset. Keep these two values
           equal — if the item padding changes, this changes with it. */
        padding: 0 var(--b-space-sm, 0.5rem);
      }
      .ribbon-group-items {
        display: flex; align-items: center;
        gap: var(--b-ribbon-item-gap, var(--b-space-xs, 0.25rem));
        /* Fills the stretched group, so every group's command area has one height and its label one baseline. */
        flex: 1;
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
      /* Three EQUAL rows of the shared command area, not "auto" ones sized by their content: auto rows drifted
         with each command's icon, so "Delete" sat lower than "Cut" in the next group. A group with fewer than
         three commands leaves its last rows empty instead of spreading the ones it has. Commands fill their row
         (stretch): centred, they still differed by the 1-2px their icons differ by. */
      .ribbon-group.size-medium .ribbon-group-items,
      .ribbon-group.size-small .ribbon-group-items {
        display: grid; grid-auto-flow: column;
        grid-template-rows: repeat(3, 1fr);
        justify-items: start; align-items: stretch;
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
      /* A folded group is one full-height button, as Office's collapsed groups are. Basis auto, not 0: with every
         group folded, a zero basis left nothing to set the row's height and the buttons collapsed to 7px. */
      .ribbon-group.size-popup > .ribbon-chunk { flex: 1 0 auto; }
      /* A POPOVER, not an absolutely-positioned child. The panel clips on both axes -- .ribbon-panel is
         overflow:hidden for its max-height collapse, and .ribbon-panel-inner became overflow:hidden when the
         scroller was removed -- and an absolutely-positioned element cannot escape an overflow:hidden
         ancestor, so a flyout was cut off on the right AND the bottom. The top layer escapes both, and
         brings Escape + light dismiss with it. Positioned from the chunk rect in _bindChunks. */
      .ribbon-flyout {
        position: fixed; inset: auto; margin: 0; z-index: var(--b-z-dropdown, 300);
        background: var(--b-bg-elevated); border: 1px solid var(--b-border);
        border-radius: var(--b-radius, 0.375rem); box-shadow: var(--b-shadow-md, 0 4px 6px -1px rgba(0,0,0,.1));
        padding: var(--b-space-sm, 0.5rem);
      }
      .ribbon-flyout::backdrop { background: none; }
      .ribbon-flyout { max-width: min(92vw, 32rem); max-height: 60vh; overflow: auto; }
      .ribbon-flyout .ribbon-group-items { display: flex; align-items: flex-start; }
      .ribbon-flyout .ribbon-item { flex-direction: column; gap: 0.125rem; min-width: 3.25rem; text-align: center; }
      .ribbon-flyout .ribbon-item-icon { font-size: var(--b-ribbon-icon-large); }

      /* ── Split and menu buttons (TASK-732, option A picked by the user: the divider shows on hover) ──
         A split button is two buttons in one frame: the command, and a narrow ▾ part that opens its menu. At large
         size (and in a flyout) the parts stack as in Office: the icon runs the command, "Label ▾" below opens. */
      .ribbon-split { display: inline-flex; align-items: stretch; border-radius: var(--b-radius, 0.375rem); }
      .ribbon-split > .ribbon-split-main { border-radius: var(--b-radius, 0.375rem) 0 0 var(--b-radius, 0.375rem); }
      .ribbon-split-arrow {
        display: inline-flex; align-items: center; justify-content: center; gap: var(--b-space-xs, 0.25rem);
        padding: 0 var(--b-space-xs, 0.25rem);
        border: none; border-left: 1px solid transparent; background: none; cursor: pointer;
        border-radius: 0 var(--b-radius, 0.375rem) var(--b-radius, 0.375rem) 0;
        font: inherit; font-size: var(--b-text-sm, 0.8125rem); color: var(--b-text-muted);
        white-space: nowrap;
      }
      .ribbon-split:hover > .ribbon-split-main, .ribbon-split:hover > .ribbon-split-arrow { background: var(--b-bg-tertiary); }
      .ribbon-split:hover > .ribbon-split-arrow,
      .ribbon-split:focus-within > .ribbon-split-arrow { border-left-color: var(--b-border); }
      .ribbon-split-arrow:hover { color: var(--b-text); }
      .ribbon-split-arrow:focus-visible { outline: none; box-shadow: var(--b-focus-ring); }
      .ribbon-split-arrow[aria-disabled="true"] { opacity: var(--b-disabled-opacity, 0.5); pointer-events: none; }
      .ribbon-split-arrow-label { display: none; }
      .ribbon-caret { font-size: 0.7em; color: var(--b-text-muted); }
      .ribbon-group.size-large .ribbon-split, .ribbon-flyout .ribbon-split { flex-direction: column; }
      .ribbon-group.size-large .ribbon-split > .ribbon-split-main,
      .ribbon-flyout .ribbon-split > .ribbon-split-main {
        border-radius: var(--b-radius, 0.375rem) var(--b-radius, 0.375rem) 0 0; padding-bottom: 0;
      }
      .ribbon-group.size-large .ribbon-split-main .ribbon-item-label,
      .ribbon-flyout .ribbon-split-main .ribbon-item-label { display: none; }
      .ribbon-group.size-large .ribbon-split-arrow, .ribbon-flyout .ribbon-split-arrow {
        border-left: 0; border-top: 1px solid transparent;
        border-radius: 0 0 var(--b-radius, 0.375rem) var(--b-radius, 0.375rem);
        padding: 0.125rem var(--b-space-sm, 0.5rem) var(--b-space-xs, 0.25rem);
        color: var(--b-text-secondary); font-weight: var(--b-font-weight-medium, 500);
      }
      .ribbon-group.size-large .ribbon-split:hover > .ribbon-split-arrow,
      .ribbon-group.size-large .ribbon-split:focus-within > .ribbon-split-arrow,
      .ribbon-flyout .ribbon-split:hover > .ribbon-split-arrow,
      .ribbon-flyout .ribbon-split:focus-within > .ribbon-split-arrow { border-top-color: var(--b-border); }
      .ribbon-group.size-large .ribbon-split-arrow-label, .ribbon-flyout .ribbon-split-arrow-label { display: inline; }

      /* The menu is a POPOVER for the same reason as the flyout: the panel clips on both axes. Inside a flyout it is
         the flyout's DOM descendant, so opening it keeps the flyout open (the popover ancestor chain). */
      .ribbon-menu {
        position: fixed; inset: auto; margin: 0; z-index: var(--b-z-dropdown, 300);
        min-width: 12rem; max-height: 60vh; overflow: auto;
        background: var(--b-bg-elevated); border: 1px solid var(--b-border);
        border-radius: var(--b-radius, 0.375rem); box-shadow: var(--b-shadow-md, 0 4px 6px -1px rgba(0,0,0,.1));
        padding: var(--b-space-xs, 0.25rem);
      }
      .ribbon-menu::backdrop { background: none; }
      .ribbon-menu-item {
        display: flex; align-items: center; gap: var(--b-space-sm, 0.5rem); width: 100%;
        padding: var(--b-space-xs, 0.25rem) var(--b-space-sm, 0.5rem);
        border: none; background: none; border-radius: var(--b-radius-sm, 0.25rem); cursor: pointer;
        font: inherit; font-size: var(--b-text-sm, 0.8125rem); color: var(--b-text); text-align: start;
        white-space: nowrap;
      }
      .ribbon-menu-item:hover, .ribbon-menu-item:focus-visible {
        background: var(--b-color-primary-light); color: var(--b-color-primary-text, var(--b-color-primary)); outline: none;
      }
      .ribbon-menu-item[aria-disabled="true"] { opacity: var(--b-disabled-opacity, 0.5); cursor: default; }
      .ribbon-menu-item[aria-disabled="true"]:hover { background: none; color: var(--b-text); }
      .ribbon-menu-icon { width: 1.25em; text-align: center; flex-shrink: 0; }
      .ribbon-menu-shortcut {
        margin-inline-start: auto; padding-inline-start: var(--b-space-lg, 1rem);
        font: inherit; font-size: var(--b-text-xs, 0.6875rem); color: var(--b-text-muted);
      }
      .ribbon-menu-separator { height: 1px; background: var(--b-border); margin: var(--b-space-xs, 0.25rem) 0; }
      .mobile-subitem { padding-inline-start: calc(var(--b-space-md, 0.75rem) * 2.5); }
      .mobile-item-heading { padding: var(--b-space-xs, 0.25rem) var(--b-space-md, 0.75rem); font-size: var(--b-text-sm, 0.8125rem); color: var(--b-text-muted); }

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
      .ribbon-item.active { background: var(--b-color-primary-light); color: var(--b-color-primary-text, var(--b-color-primary)); }
      /* A pressed toggle (TASK-739, option A picked by the user): the accent tint plus a thin accent outline, drawn as an
         inset shadow so pressing never shifts the layout. The outline is what tells "on" apart from "active". */
      .ribbon-item[aria-pressed="true"], .ribbon-item[aria-checked="true"],
      .mobile-item[aria-pressed="true"], .mobile-item[aria-checked="true"] {
        background: var(--b-color-primary-light); color: var(--b-color-primary-text, var(--b-color-primary));
        box-shadow: inset 0 0 0 1px var(--b-color-primary);
      }
      .ribbon-item[aria-pressed="true"]:focus-visible, .ribbon-item[aria-checked="true"]:focus-visible {
        box-shadow: inset 0 0 0 1px var(--b-color-primary), var(--b-focus-ring);
      }
      .ribbon-radiogroup { display: contents; }
      .ribbon-item[aria-disabled="true"] {
        opacity: var(--b-disabled-opacity, 0.5); pointer-events: none;
      }
      .ribbon-item.variant-primary { color: var(--b-color-primary); font-weight: var(--b-font-weight-semibold, 600); }
      .ribbon-item.variant-danger { color: var(--b-color-danger); }
      .ribbon-item-icon { font-size: var(--b-icon-base, 1rem); }
      .ribbon-item-badge {
        min-width: 1rem; height: 1rem; padding: 0 0.2rem;
        border-radius: var(--b-radius-full, 9999px);
        background: var(--b-color-danger); color: var(--b-text-on-danger, var(--b-text-inverse));
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
      .mobile-tab-header.active { color: var(--b-color-primary-text, var(--b-color-primary)); background: var(--b-color-primary-light); }
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
    this._pressed.clear(); // new data: its `pressed` values are the state again
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
   * Sets a toggle's state from the app (the selection changed), without emitting `item-click`. In a `toggleGroup`,
   * pressing one releases the others; releasing the one that is on leaves none on. `tabId` narrows an id used in
   * several tabs; without it every match changes.
   */
  setPressed(itemId: string, pressed: boolean, tabId?: string) {
    for (const tab of this._tabs) {
      if (tabId && tab.id !== tabId) continue;
      for (const group of tab.groups) {
        const item = group.items.find(i => i.id === itemId);
        if (item) this._setPressedState(tab.id, group, item, pressed);
      }
    }
    this._syncPressed();
  }

  /** Whether a toggle is on. */
  isPressed(itemId: string, tabId?: string): boolean {
    for (const tab of this._tabs) {
      if (tabId && tab.id !== tabId) continue;
      for (const group of tab.groups) {
        const item = group.items.find(i => i.id === itemId);
        if (item && this._isPressed(tab.id, group.id, item)) return true;
      }
    }
    return false;
  }

  private _pressKey(tabId: string, groupId: string, itemId: string) { return `${tabId}/${groupId}/${itemId}`; }

  private _isToggle(item: RibbonItem) { return !item.menu?.length && (item.toggle || !!item.toggleGroup); }

  /** The state lives here, seeded from `item.pressed`: the caller's objects are never written to. */
  private _isPressed(tabId: string, groupId: string, item: RibbonItem): boolean {
    return this._pressed.get(this._pressKey(tabId, groupId, item.id)) ?? !!item.pressed;
  }

  private _setPressedState(tabId: string, group: RibbonGroup, item: RibbonItem, pressed: boolean) {
    if (item.toggleGroup && pressed) {
      for (const other of group.items) {
        if (other !== item && other.toggleGroup === item.toggleGroup) this._pressed.set(this._pressKey(tabId, group.id, other.id), false);
      }
    }
    this._pressed.set(this._pressKey(tabId, group.id, item.id), pressed);
  }

  /** Writes the current states onto the rendered buttons (panel, flyouts, mobile list) without a re-render. */
  private _syncPressed() {
    this.$$<HTMLElement>('[data-toggle]').forEach(el => {
      const tab = this._tabs.find(t => t.id === el.dataset.tab);
      const group = tab?.groups.find(g => g.id === el.dataset.group);
      const item = group?.items.find(i => i.id === el.dataset.item);
      if (!tab || !group || !item) return;
      el.setAttribute(el.getAttribute('role') === 'radio' ? 'aria-checked' : 'aria-pressed', String(this._isPressed(tab.id, group.id, item)));
    });
  }

  /** A click on a toggle: flip it (or select it, in a set) and report the new state. */
  private _clickToggle(el: HTMLElement): boolean | null {
    const tab = this._tabs.find(t => t.id === el.dataset.tab);
    const group = tab?.groups.find(g => g.id === el.dataset.group);
    const item = group?.items.find(i => i.id === el.dataset.item);
    if (!tab || !group || !item || !this._isToggle(item)) return null;
    const next = item.toggleGroup ? true : !this._isPressed(tab.id, group.id, item);
    this._setPressedState(tab.id, group, item, next);
    this._syncPressed();
    return next;
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

  /**
   * Office's "collapse the ribbon" (double-click a tab, Ctrl+F1): between the panel always shown (pinned) and tabs
   * only, where the panel opens over the page when a tab is used (unpinned). Toggling `expanded` alone would undo
   * itself on a collapsed ribbon: the double-click's own first click expands it again.
   */
  toggleRibbon() {
    if (this._tabsOnlyMode) return;
    if (this.boolAttr('pinned')) { this.unpin(); this.collapse(); } else { this.pin(); }
  }

  /** `collapse-shortcut` parsed: default Ctrl+F1, `none` (or empty) turns it off. */
  private _collapseShortcut(): { key: string; ctrl: boolean; alt: boolean; shift: boolean; meta: boolean } | null {
    const raw = (this.getAttribute('collapse-shortcut') ?? 'Ctrl+F1').trim();
    if (!raw || raw.toLowerCase() === 'none') return null;
    const parts = raw.split('+').map(p => p.trim().toLowerCase()).filter(Boolean);
    const key = parts.pop();
    if (!key) return null;
    return {
      key, ctrl: parts.includes('ctrl') || parts.includes('control'), alt: parts.includes('alt'),
      shift: parts.includes('shift'), meta: parts.includes('meta') || parts.includes('cmd'),
    };
  }

  private _shortcutLabel(): string {
    const raw = (this.getAttribute('collapse-shortcut') ?? 'Ctrl+F1').trim();
    return !raw || raw.toLowerCase() === 'none' ? '' : raw;
  }

  protected onMount() {
    // App-wide (decided by the user): the key works wherever focus is. On window, bubbling, so an app that handles the
    // same key first and calls preventDefault() keeps it; `collapse-shortcut="none"` turns it off entirely.
    this._shortcutAC?.abort();
    this._shortcutAC = new AbortController();
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      const sc = this._collapseShortcut();
      if (!sc || e.defaultPrevented || e.repeat) return;
      if (e.key.toLowerCase() !== sc.key || e.ctrlKey !== sc.ctrl || e.altKey !== sc.alt
        || e.shiftKey !== sc.shift || e.metaKey !== sc.meta) return;
      e.preventDefault();
      this.toggleRibbon();
    }, { signal: this._shortcutAC.signal });
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
      ${this._renderTooltip()}
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
            aria-expanded="${expanded}"${this._shortcutLabel() ? ` aria-keyshortcuts="${escapeAttr(this._shortcutLabel().replace(/ctrl/i, 'Control'))}"` : ''}
            title="${expanded ? this.label('label-collapse', 'bwc.ribbon.collapse', 'Collapse ribbon') : this.label('label-expand', 'bwc.ribbon.expand', 'Expand ribbon')}${this._shortcutLabel() ? ` (${escapeAttr(this._shortcutLabel())})` : ''}">
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
                      // A menu's choices are listed under their command; a menu-only command is just their heading.
                      const choices = (item.menu ?? []).filter((e): e is RibbonMenuItem => !('separator' in e)).map(m => `
                        <button class="mobile-item mobile-subitem" ${m.disabled ? 'disabled' : ''}
                          data-tab="${tab.id}" data-group="${group.id}" data-item="${escapeAttr(m.id)}" data-parent="${item.id}">
                          ${m.icon ? `<span aria-hidden="true">${escapeHtml(m.icon)}</span>` : ''}
                          ${escapeHtml(m.label)}
                        </button>`).join('');
                      if (item.menu?.length && !item.split) {
                        return `<div class="mobile-item-heading">${item.label}</div>${choices}`;
                      }
                      const toggle = this._isToggle(item)
                        ? ` data-toggle ${item.toggleGroup ? 'role="radio" aria-checked' : 'aria-pressed'}="${this._isPressed(tab.id, group.id, item)}"` : '';
                      return `<${tag} class="mobile-item" ${href}${toggle}
                        data-tab="${tab.id}" data-group="${group.id}" data-item="${item.id}">
                        ${item.icon ? `<span aria-hidden="true">${item.icon}</span>` : ''}
                        ${item.label}
                      </${tag}>${choices}`;
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

  /** The one tooltip every command shares (TASK-738): a b-tooltip shown for the command under the pointer or focus. */
  private _renderTooltip(): string {
    const theme = this.attr('tooltip-theme') || 'light';
    return `<b-tooltip class="ribbon-tooltip" theme="${escapeAttr(theme)}" position="bottom" aria-hidden="true"></b-tooltip>`;
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
      ${(() => {
        // Only apply a decision measured for THIS tab; otherwise start from the preferred variant and let
        // the measure pass queued by _showTabContent correct it a frame later.
        const sizes = this._groupSizesTab === tab.id ? this._groupSizes : [];
        const preferred = this.attr('preferred-group-size') || 'medium';
        return tab.groups
          .map((group, i) => this._renderGroup(tab.id, group, sizes[i] ?? preferred, this._compactChunks))
          .join('');
      })()}
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
  private _renderGroup(tabId: string, group: RibbonGroup, size: string, compactChunk = false): string {
    const items = this._renderGroupItems(tabId, group);

    if (size === 'popup') {
      // Explicit argument, NEVER this._compactChunks. The measure pass renders through here, and reading the
      // applied state made the measurement a function of the current layout: an already-compact row measured
      // its compact chunks (176px), a labelled row measured labelled ones (362px), so `compact` flipped every
      // pass and the panel narrowed on some renders and not others. Exactly the feedback loop
      // RibbonScaling's docs warn about — a decision must depend only on its inputs.
      const compact = compactChunk ? ' compact' : '';
      const label = this.label('label-actions', 'bwc.common.actions', 'Actions'); // unused, keeps API stable
      void label;
      return `
        <div class="ribbon-group size-popup${compact}" role="group" aria-label="${group.label}" data-group="${group.id}">
          <button class="ribbon-chunk" data-chunk="${group.id}"
            aria-expanded="false" aria-haspopup="true" aria-label="${group.label}">
            ${group.icon ? `<span class="ribbon-chunk-icon" aria-hidden="true">${group.icon}</span>` : ''}
            <span class="ribbon-chunk-name">${group.label} &#9662;</span>
          </button>
          <div class="ribbon-flyout" popover role="group" aria-label="${group.label}">
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
    const refocus = this._focusInPanel();
    this._hideTip(); // its anchor is about to be replaced
    panelInner.innerHTML = this._renderPanelInner(tab);
    this._bindPanelItems();
    this._bindChunks();
    this._bindMenus();
    if (refocus) this._rovingStop()?.focus();
    // Different tab, different group widths — so both the chevrons AND the scaling have to re-evaluate.
    // Queued rather than immediate: _measureAndScale re-renders, and _queueSync coalesces into one frame
    // (the _measuring guard stops the nested call recursing).
    this._panelSync?.();
    this._queueSync();
  }

  private _bindPanelItems() {
    this._applyRoving();
    const inner = this.$<HTMLElement>('.ribbon-panel-inner');
    if (inner) this.listen(inner, 'focusin', (e: Event) => {
      const stop = this._panelStops().find(el => el === e.target);
      if (!stop) return;
      this._rovingKey = this._stopKey(stop);
      this._applyRoving();
    });
    this.$$<HTMLElement>('.ribbon-panel .ribbon-item:not([data-menu-trigger])').forEach(el => {
      this.listen(el, 'click', (e: Event) => {
        const target = e.currentTarget as HTMLElement;
        if (target.getAttribute('aria-disabled') === 'true') return;
        const pressed = target.hasAttribute('data-toggle') ? this._clickToggle(target) : null;
        this.emit('item-click', {
          tabId: target.dataset.tab,
          groupId: target.dataset.group,
          itemId: target.dataset.item,
          ...(pressed === null ? {} : { pressed }),
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
    let data = `data-tab="${tabId}" data-group="${groupId}" data-item="${item.id}"`;
    if (this._isToggle(item)) {
      const on = String(this._isPressed(tabId, groupId, item));
      data += item.toggleGroup ? ` data-toggle role="radio" aria-checked="${on}"` : ` data-toggle aria-pressed="${on}"`;
    }

    // aria-label matters at the Small variant, where the label is not rendered: an icon-only command with no
    // accessible name would trade "unreachable" for "unnameable". The visible name there is the tooltip's heading
    // (TASK-738), which replaced the native title: both showed at once, and the title was announced twice.
    const described = (item.description ? ` aria-description="${escapeAttr(item.description)}"` : '')
      + (item.shortcut ? ` aria-keyshortcuts="${escapeAttr(item.shortcut.replace(/\s+/g, ''))}"` : '');
    const named = `aria-label="${item.label}"${described}`;
    const body = `${icon}<span class="ribbon-item-label">${item.label}</span>${badge}`;

    if (item.menu?.length) {
      const menuId = `${this.uid}-menu-${groupId}-${item.id}`;
      const trigger = `data-menu-trigger aria-haspopup="menu" aria-expanded="false" aria-controls="${escapeAttr(menuId)}"`;
      const menu = this._renderMenu(menuId, tabId, groupId, item);
      if (!item.split) {
        return `<button class="${cls} has-menu" ${disabled} ${data} ${named} ${trigger}>${icon}<span class="ribbon-item-label">${item.label}</span><span class="ribbon-caret" aria-hidden="true">&#9662;</span>${badge}</button>${menu}`;
      }
      const more = this.label('label-more-options', 'bwc.ribbon.moreOptions', 'More options: {label}', { label: item.label });
      return `<span class="ribbon-split">`
        + `<button class="${cls} ribbon-split-main" ${disabled} ${data} ${named}>${body}</button>`
        + `<button class="ribbon-split-arrow" ${disabled} data-tab="${tabId}" data-group="${groupId}" data-arrow="${item.id}" ${trigger} aria-label="${escapeAttr(more)}">`
        + `<span class="ribbon-split-arrow-label" aria-hidden="true">${item.label}</span><span class="ribbon-caret" aria-hidden="true">&#9662;</span></button>`
        + `</span>${menu}`;
    }

    if (item.href && !item.action) {
      return `<a class="${cls}" href="${item.href}" ${disabled} ${data} ${named}>${body}</a>`;
    }
    return `<button class="${cls}" ${disabled} ${data} ${named}>${body}</button>`;
  }

  /** The command, folded group or ▾ part a tooltip is for, or null. Menu choices have none: the menu says it all. */
  private _tipTarget(node: EventTarget | null): HTMLElement | null {
    const el = node instanceof Element ? node.closest<HTMLElement>('.ribbon-item, .ribbon-chunk, .ribbon-split-arrow') : null;
    return el && this.shadowRoot?.contains(el) && !el.closest('.ribbon-menu') ? el : null;
  }

  private _tipContent(el: HTMLElement): TooltipContent | null {
    const tab = this._tabs.find(t => t.id === el.dataset.tab) ?? this._tabs.find(t => t.id === (this._hoverTabId ?? this.attr('active')));
    if (el.dataset.chunk) {
      const group = tab?.groups.find(g => g.id === el.dataset.chunk);
      return group ? { heading: group.label } : null;
    }
    const items = el.dataset.group === '_context' ? this._contextActions : tab?.groups.find(g => g.id === el.dataset.group)?.items ?? [];
    const item = items.find(i => i.id === (el.dataset.arrow ?? el.dataset.item));
    if (!item) return null;
    if (el.dataset.arrow) {
      return { heading: this.label('label-more-options', 'bwc.ribbon.moreOptions', 'More options: {label}', { label: item.label }) };
    }
    return { heading: item.label, text: item.description, shortcut: item.shortcut };
  }

  private _showTip(el: HTMLElement) {
    const tip = this.$<HTMLElement>('.ribbon-tooltip') as BTooltip | null;
    const content = this._tipContent(el);
    if (!tip || !content) return;
    this._tipAnchor = el;
    tip.showFor(el, content);
  }

  private _hideTip() {
    if (this._tipTimer) { clearTimeout(this._tipTimer); this._tipTimer = null; }
    if (this._tipAnchor) this._tipWarmUntil = Date.now() + 300;
    this._tipAnchor = null;
    (this.$<HTMLElement>('.ribbon-tooltip') as BTooltip | null)?.hide();
  }

  /**
   * Hover shows the tooltip after a delay; once one is up (or was, a moment ago) the next command's shows at once, as
   * in Office. Keyboard focus shows it at once; Escape, a click, or opening a menu hides it.
   */
  private _bindTooltips() {
    const panel = this.$<HTMLElement>('.ribbon-panel');
    if (!panel) return;
    this.listen(panel, 'mouseover', (e: Event) => {
      const el = this._tipTarget(e.target);
      if (!el || el === this._tipAnchor) return;
      if (this._tipTimer) clearTimeout(this._tipTimer);
      if (this._tipAnchor || Date.now() < this._tipWarmUntil) { this._showTip(el); return; }
      this._tipTimer = setTimeout(() => { this._tipTimer = null; this._showTip(el); }, BRibbon.TOOLTIP_DELAY_MS);
    });
    this.listen(panel, 'mouseout', (e: Event) => {
      const to = this._tipTarget((e as MouseEvent).relatedTarget);
      if (to && to === this._tipTarget(e.target)) return; // moving within the same command
      if (!to) this._hideTip();
    });
    this.listen(panel, 'focusin', (e: Event) => {
      const el = this._tipTarget(e.target);
      if (el?.matches(':focus-visible')) this._showTip(el); else if (this._tipAnchor) this._hideTip();
    });
    this.listen(panel, 'focusout', () => { if (this._tipAnchor) this._hideTip(); });
    this.listen(panel, 'pointerdown', () => this._hideTip());
    // Capture, so a visible tooltip takes Escape before the panel's own Escape (back to the tab) sees it.
    this.listen(panel, 'keydown', (e: Event) => {
      const ke = e as KeyboardEvent;
      if (!this._tipAnchor) return;
      if (ke.key === 'Escape') { ke.preventDefault(); ke.stopImmediatePropagation(); this._hideTip(); this._tipWarmUntil = 0; return; }
      if (ke.key === 'Enter' || ke.key === ' ') this._hideTip();
    }, { capture: true });
  }

  /**
   * When `popover` closes with focus inside it (Escape, a choice that ran, Tab), focus goes back to `opener`. Read on
   * `beforetoggle`, while focus is still where the user left it: by `toggle` the focused command is hidden. A close
   * that focus had already left — a click elsewhere, another popover or modal opening — leaves focus alone; checking
   * only "is focus outside the ribbon" at `toggle` time pulled it back from wherever the page had put it.
   */
  private _returnFocusOnClose(popover: HTMLElement, opener: HTMLElement) {
    let hadFocus = false;
    this.listen(popover, 'beforetoggle', (e: Event) => {
      if ((e as ToggleEvent).newState !== 'closed') return;
      const active = this.shadowRoot?.activeElement ?? null;
      hadFocus = !!active && popover.contains(active);
    });
    this.listen(popover, 'toggle', (e: Event) => {
      if ((e as ToggleEvent).newState !== 'closed' || !hadFocus) return;
      hadFocus = false;
      const active = this.shadowRoot?.activeElement ?? null;
      const page = document.activeElement;
      // Still inside the hidden popover, or dropped to <body>: nobody else has taken it, so give it back.
      if ((active && popover.contains(active)) || !page || page === document.body) opener.focus();
    });
  }

  /**
   * A group's commands. Consecutive members of one `toggleGroup` are wrapped in a radiogroup with display: contents,
   * so they keep their grid cells (and their place in the arrow-key order) while a screen reader hears a set.
   */
  private _renderGroupItems(tabId: string, group: RibbonGroup): string {
    let out = '';
    let i = 0;
    while (i < group.items.length) {
      const set = group.items[i].toggleGroup;
      if (!set || group.items[i].menu?.length) { out += this._renderItem(tabId, group.id, group.items[i]); i++; continue; }
      let j = i;
      let members = '';
      while (j < group.items.length && group.items[j].toggleGroup === set && !group.items[j].menu?.length) {
        members += this._renderItem(tabId, group.id, group.items[j]); j++;
      }
      out += `<span class="ribbon-radiogroup" role="radiogroup" aria-label="${escapeAttr(group.label)}">${members}</span>`;
      i = j;
    }
    return out;
  }

  /** A command's menu, as a popover. Every choice is a menuitem reached with the arrows (tabindex -1). */
  private _renderMenu(menuId: string, tabId: string, groupId: string, item: RibbonItem): string {
    const entries = item.menu ?? [];
    const withIcons = entries.some(e => !('separator' in e) && e.icon);
    const rows = entries.map(e => {
      if ('separator' in e) return '<div class="ribbon-menu-separator" role="separator"></div>';
      const icon = withIcons ? `<span class="ribbon-menu-icon" aria-hidden="true">${e.icon ? escapeHtml(e.icon) : ''}</span>` : '';
      const shortcut = e.shortcut ? `<kbd class="ribbon-menu-shortcut">${escapeHtml(e.shortcut)}</kbd>` : '';
      const keyshortcuts = e.shortcut ? ` aria-keyshortcuts="${escapeAttr(e.shortcut.replace(/\s+/g, ''))}"` : '';
      return `<button class="ribbon-menu-item" role="menuitem" tabindex="-1"${e.disabled ? ' aria-disabled="true"' : ''}${keyshortcuts}`
        + ` data-tab="${tabId}" data-group="${groupId}" data-parent="${item.id}" data-menu-item="${escapeAttr(e.id)}">`
        + `${icon}<span class="ribbon-menu-label">${escapeHtml(e.label)}</span>${shortcut}</button>`;
    }).join('');
    return `<div class="ribbon-menu" id="${escapeAttr(menuId)}" popover role="menu" aria-label="${escapeAttr(item.label)}">${rows}</div>`;
  }

  /** Opens a command's menu under its trigger (the whole split frame for a split button), inside the viewport. */
  private _openMenu(trigger: HTMLElement, focusFirst: boolean) {
    const menu = this.shadowRoot?.getElementById(trigger.getAttribute('aria-controls') ?? '');
    if (!menu || trigger.getAttribute('aria-disabled') === 'true') return;
    if (menu.matches(':popover-open')) { menu.hidePopover(); return; }
    const anchor = (trigger.closest('.ribbon-split') as HTMLElement | null) ?? trigger;
    const rect = anchor.getBoundingClientRect();
    menu.style.left = `${rect.left}px`;
    menu.style.top = `${rect.bottom + 2}px`;
    menu.showPopover();
    const box = menu.getBoundingClientRect();
    if (box.right > window.innerWidth - 4) menu.style.left = `${Math.max(4, window.innerWidth - box.width - 4)}px`;
    if (box.bottom > window.innerHeight - 4) menu.style.top = `${Math.max(4, rect.top - box.height - 2)}px`;
    if (focusFirst) this._menuItems(menu)[0]?.focus();
  }

  private _menuItems(menu: HTMLElement): HTMLElement[] {
    return [...menu.querySelectorAll<HTMLElement>('.ribbon-menu-item')].filter(el => el.getAttribute('aria-disabled') !== 'true');
  }

  private _menuKey(ke: KeyboardEvent, menu: HTMLElement, target: HTMLElement) {
    const items = this._menuItems(menu);
    const i = items.indexOf(target);
    let next: HTMLElement | undefined;
    if (ke.key === 'ArrowDown') next = items[(i + 1) % items.length];
    else if (ke.key === 'ArrowUp') next = items[(i - 1 + items.length) % items.length];
    else if (ke.key === 'Home') next = items[0];
    else if (ke.key === 'End') next = items.at(-1);
    else if (ke.key === 'Tab') { ke.preventDefault(); menu.hidePopover(); return; }
    else return; // Escape: the popover closes itself; its toggle listener gives focus back to the trigger
    ke.preventDefault();
    next?.focus();
  }

  private _bindMenus() {
    this.$$<HTMLElement>('[data-menu-trigger]').forEach(trigger => {
      const menu = this.shadowRoot?.getElementById(trigger.getAttribute('aria-controls') ?? '');
      if (!menu) return;
      this.listen(trigger, 'click', (e: Event) => {
        e.stopPropagation();
        // Opened by Enter or Space (a click with no pointer): move into it, as a menu button does.
        this._openMenu(trigger, (e as MouseEvent).detail === 0);
      });
      this._returnFocusOnClose(menu, trigger);
      this.listen(menu, 'beforetoggle', () => this._hideTip());
      this.listen(menu, 'toggle', (e: Event) => {
        trigger.setAttribute('aria-expanded', String((e as ToggleEvent).newState === 'open'));
      });
    });
    this.$$<HTMLElement>('.ribbon-menu-item').forEach(el => {
      this.listen(el, 'click', (e: Event) => {
        e.stopPropagation();
        if (el.getAttribute('aria-disabled') === 'true') return;
        this.emit('item-click', {
          tabId: el.dataset.tab, groupId: el.dataset.group, itemId: el.dataset.menuItem, parentId: el.dataset.parent,
        });
        el.closest<HTMLElement>('.ribbon-menu')?.hidePopover();
        const flyout = el.closest<HTMLElement>('.ribbon-flyout');
        if (flyout?.matches(':popover-open')) flyout.hidePopover();
        if (!this.boolAttr('pinned')) { this._hoverTabId = null; this.collapse(); }
      });
    });
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

    // Tab clicks; a double-click collapses or brings back the ribbon, as in Office (TASK-735)
    this.$$<HTMLElement>('.ribbon-tab').forEach(btn => {
      this.listen(btn, 'click', () => this._selectTab(btn.dataset.tab!));
      this.listen(btn, 'dblclick', () => {
        if (this._isPanelless(this._tabs.find(t => t.id === btn.dataset.tab))) return;
        this.toggleRibbon();
      });
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
        // Into the panel at its one Tab stop: the command last focused there, else the first.
        this._rovingStop()?.focus();
        return;
      }

      if (next >= 0) {
        this._selectTab(tabs[next].dataset.tab!);
        tabs[next].focus();
      }
    });

    // Panel keyboard (TASK-731). The panel is ONE Tab stop (roving tabindex); the arrows move between commands by
    // where they are on screen, so they cross group boundaries and follow a group's columns at every size. It used
    // to walk every .ribbon-item in a flat list: that included the commands inside CLOSED flyouts (focus went
    // nowhere) and skipped the folded groups' own buttons, and every command was a Tab stop of its own.
    const panelEl = this.$('.ribbon-panel');
    if (panelEl) this.listen(panelEl, 'keydown', (e: Event) => {
      const ke = e as KeyboardEvent;
      const target = ke.target as HTMLElement;
      const menu = target.closest<HTMLElement>('.ribbon-menu');
      if (menu) { this._menuKey(ke, menu, target); return; }
      // Alt+ArrowDown opens a command's menu from the command itself or from its ▾ part, as in Office.
      if (ke.key === 'ArrowDown' && ke.altKey) {
        const trigger = target.matches('[data-menu-trigger]') ? target
          : target.closest('.ribbon-split')?.querySelector<HTMLElement>('[data-menu-trigger]');
        if (trigger) { ke.preventDefault(); this._openMenu(trigger, true); return; }
      }
      const flyout = target.closest<HTMLElement>('.ribbon-flyout');
      if (flyout) { this._flyoutKey(ke, flyout, target); return; }

      const stops = this._panelStops();
      if (!stops.includes(target)) return;
      const dirs: Record<string, 'left' | 'right' | 'up' | 'down'> = {
        ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
      };
      let next: HTMLElement | null | undefined;
      if (ke.key === 'Escape') {
        next = this.$<HTMLElement>(`#ribbon-tab-${this.attr('active')}`);
      } else if (ke.key === 'Home') {
        next = stops[0];
      } else if (ke.key === 'End') {
        next = stops.at(-1);
      } else if (ke.key === 'ArrowDown' && target.classList.contains('ribbon-chunk')) {
        ke.preventDefault();
        target.click();
        this._focusFlyout(target);
        return;
      } else if (dirs[ke.key]) {
        const dir = dirs[ke.key];
        next = nearestInDirection(target, stops, dir);
        // Left/Right wrap at the ends; Up from the top row goes back to the active tab, as in Office.
        if (!next && dir === 'right') next = stops[0];
        if (!next && dir === 'left') next = stops.at(-1);
        if (!next && dir === 'up') next = this.$<HTMLElement>(`#ribbon-tab-${this.attr('active')}`);
      } else {
        return;
      }
      ke.preventDefault();
      next?.focus();
    });

    // Panel item clicks
    this._bindPanelItems();

    this._bindChunks();
    this._bindMenus();
    this._bindTooltips();

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
        const pressed = el.hasAttribute('data-toggle') ? this._clickToggle(el) : null;
        this.emit('item-click', {
          tabId: el.dataset.tab,
          groupId: el.dataset.group,
          itemId: el.dataset.item,
          ...(el.dataset.parent ? { parentId: el.dataset.parent } : {}),
          ...(pressed === null ? {} : { pressed }),
        });
        this._closeMobileMenu();
      });
    });
  }

  protected onUnmount() {
    this._shortcutAC?.abort();
    this._shortcutAC = null;
    this._clearTimers();
    if (this._tipTimer) { clearTimeout(this._tipTimer); this._tipTimer = null; }
    this._scrollObserver?.disconnect();
    this._scrollObserver = null;
    this._scrollSyncs = [];
    this._panelSync = null;
  }

  /** A morph can replace the focused command (a scaling change re-renders the row): put focus back on it. */
  protected update(): void {
    const refocus = this._focusInPanel();
    super.update();
    if (refocus) this._rovingStop()?.focus();
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
      const flyout = group?.querySelector('.ribbon-flyout') as HTMLElement | null;
      if (!group || !flyout) return;

      // Keep aria in step with whatever opened or closed it — including Escape and light dismiss, which the
      // popover handles itself, so there is no path that leaves the button lying about its state.
      this._returnFocusOnClose(flyout, chunk);
      this.listen(flyout, 'beforetoggle', () => this._hideTip());
      this.listen(flyout, 'toggle', (e: Event) => {
        chunk.setAttribute('aria-expanded', String((e as ToggleEvent).newState === 'open'));
      });

      this.listen(chunk, 'click', (e: Event) => {
        e.stopPropagation();
        if (flyout.matches(':popover-open')) { flyout.hidePopover(); return; }

        // A popover lives in the top layer, so it is positioned against the viewport rather than the group.
        const rect = chunk.getBoundingClientRect();
        flyout.style.left = `${rect.left}px`;
        flyout.style.top = `${rect.bottom + 2}px`;
        flyout.showPopover();

        // Then pull it back inside the viewport. A collapsed group sits in a narrow ribbon and its
        // full-size contents are often wider than the space to its right.
        const box = flyout.getBoundingClientRect();
        if (box.right > window.innerWidth - 4) {
          flyout.style.left = `${Math.max(4, window.innerWidth - box.width - 4)}px`;
        }
        // Opened by Enter or Space (a click with no pointer): move into it, as a menu button does.
        if ((e as MouseEvent).detail === 0) this._focusFlyout(chunk);
      });
    });

    // Invoking from a flyout dismisses it, as Office does. Opening a menu from it does not.
    this.$$<HTMLElement>('.ribbon-flyout .ribbon-item:not([data-menu-trigger])').forEach(el => {
      this.listen(el, 'click', () => {
        const flyout = el.closest('.ribbon-flyout') as HTMLElement | null;
        if (flyout?.matches(':popover-open')) flyout.hidePopover();
      });
    });
  }

  /** The panel's keyboard stops in reading order: each visible command and each folded group's button. The
   *  commands inside a flyout are not stops: they are reached by opening it. */
  private _panelStops(): HTMLElement[] {
    return this.$$<HTMLElement>([
      '.ribbon-panel-inner > .ribbon-group > .ribbon-group-items > .ribbon-item',
      '.ribbon-panel-inner > .ribbon-group > .ribbon-group-items > .ribbon-radiogroup > .ribbon-item',
      '.ribbon-panel-inner > .ribbon-group > .ribbon-group-items > .ribbon-split > .ribbon-item',
      '.ribbon-panel-inner > .ribbon-group > .ribbon-group-items > .ribbon-split > .ribbon-split-arrow',
      '.ribbon-panel-inner > .ribbon-group > .ribbon-chunk',
    ].join(', '));
  }

  /** Identity of a stop that survives a re-render: the same command, or the same folded group. */
  private _stopKey(el: HTMLElement): string {
    if (el.dataset.chunk) return `chunk:${el.dataset.chunk}`;
    if (el.dataset.arrow) return `arrow:${el.dataset.group}/${el.dataset.arrow}`;
    return `item:${el.dataset.group}/${el.dataset.item}`;
  }

  /** The stop holding tabindex 0: the one focused last, else the first (also when the last one is gone). */
  private _rovingStop(): HTMLElement | undefined {
    const stops = this._panelStops();
    return stops.find(el => this._stopKey(el) === this._rovingKey) ?? stops[0];
  }

  private _applyRoving() {
    const current = this._rovingStop();
    for (const el of this._panelStops()) el.tabIndex = el === current ? 0 : -1;
  }

  /** Whether focus is on a panel stop — checked before a re-render that replaces it, to put it back after. */
  private _focusInPanel(): boolean {
    const active = this.shadowRoot?.activeElement as HTMLElement | null | undefined;
    return !!active && this._panelStops().includes(active);
  }

  private _focusFlyout(chunk: HTMLElement) {
    const flyout = chunk.closest('.ribbon-group')?.querySelector<HTMLElement>('.ribbon-flyout');
    if (flyout?.matches(':popover-open')) flyout.querySelector<HTMLElement>('.ribbon-item')?.focus();
  }

  private _flyoutKey(ke: KeyboardEvent, flyout: HTMLElement, target: HTMLElement) {
    const items = [...flyout.querySelectorAll<HTMLElement>(':scope > .ribbon-group-items > .ribbon-item, :scope > .ribbon-group-items > .ribbon-radiogroup > .ribbon-item, :scope > .ribbon-group-items > .ribbon-split > *')];
    if (!items.includes(target)) return;
    const dirs: Record<string, 'left' | 'right' | 'up' | 'down'> = {
      ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
    };
    let next: HTMLElement | null | undefined;
    if (ke.key === 'Home') next = items[0];
    else if (ke.key === 'End') next = items.at(-1);
    else if (dirs[ke.key]) next = nearestInDirection(target, items, dirs[ke.key]);
    else return; // Escape: the popover closes itself and gives focus back to its button
    ke.preventDefault();
    next?.focus();
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
        // compactChunk: false — the popup width this pass compares against is the LABELLED chunk's, so the
        // measurement stays independent of whether the row is currently compact.
        probe.innerHTML = this._renderGroup(tab.id, group, size, false);
        const measured = probe.firstElementChild as HTMLElement | null;
        widths[size] = measured ? measured.getBoundingClientRect().width : 0;
      }
      return { widths, scalingPriority: group.scalingPriority ?? 0, minSize: group.minSize ?? 'popup' };
    });

    probe.remove();

    // The FULL token gap, not the live computed one: the rendered gap tightens once groups collapse, and
    // deciding against the tightened value could under-degrade and clip. Deciding against the larger value
    // is conservative — the row it picks then fits with room to spare. Same split as the Avalonia panel.
    // SEPARATOR_SLACK is added per gap because the probe measures each group ALONE: it cannot see the 1px
    // border `.ribbon-group + .ribbon-group` adds to every group after the first, nor the sub-pixel rounding
    // between getBoundingClientRect and layout. Six groups under-counted by ~14px, which overflowed a 420px
    // track -- and the panel is overflow:hidden, so the surplus is clipped, not merely untidy. Charged to the
    // gap rather than deducted from the available width, since that is where the cost actually lives.
    const SEPARATOR_SLACK = 3;
    const gap = (parseFloat(getComputedStyle(this).getPropertyValue('--b-ribbon-group-gap'))
      || parseFloat(getComputedStyle(track).columnGap || '0') || 0) + SEPARATOR_SLACK;
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
    this._groupSizesTab = tab.id;
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
