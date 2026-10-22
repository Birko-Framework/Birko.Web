import { BaseComponent, define } from 'birko-web-core';
import { escapeHtml, escapeAttr } from '../dom-utils';
import '../layout/b-tooltip.js';
import type { BTooltip, TooltipContent } from '../layout/b-tooltip.js';
import '../inputs/b-input.js';
import '../inputs/b-select.js';
import type { BSelect } from '../inputs/b-select.js';
import { resolveRibbonSizes, RIBBON_SIZE_LADDER, type RibbonGroupMetrics } from './ribbon-scaling.js';

// ── Interfaces ───────────────────────────────────────────────────────────────

export interface RibbonTab {
  id: string;
  label: string;
  icon?: string;
  /**
   * The contextual set this tab belongs to (TASK-734): shown only while the app shows that set, after the normal tabs,
   * under the set's colour and name. See {@link BRibbon.setContextualSets}.
   */
  contextualSet?: string;
  /** Key tip letter or digit (TASK-736). Unset: the first free letter of the label. */
  keytip?: string;
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
/** One tile of a gallery: `preview` is a short text or glyph drawn large (Aa, H1); text, never markup. */
export interface RibbonGalleryItem {
  id: string;
  label: string;
  preview?: string;
  keytip?: string;
}

export type RibbonGalleryStyle = 'framed' | 'open' | 'dropdown';

/**
 * A row of choices inside the ribbon with a full grid behind it (Office's Styles). Picking a tile makes it the current
 * choice and emits `item-click` with the choice as `itemId` and this command as `parentId`.
 */
export interface RibbonGallery {
  items: RibbonGalleryItem[];
  /** The current choice. Later changes: {@link BRibbon.setGallerySelection}. */
  selected?: string;
  /** Tiles shown inline (default 4; small groups show 2). */
  visible?: number;
  /** Columns of the full grid (default 4). */
  columns?: number;
  /** Overrides the ribbon's `gallery-style`. */
  style?: RibbonGalleryStyle;
}

export type RibbonFieldCaption = 'none' | 'beside' | 'above';

export interface RibbonFieldOption {
  value: string;
  label: string;
}

/**
 * A small input inside the ribbon (TASK-741), like Office's font name and size boxes: a text or number box, or a
 * dropdown. A committed value (Enter, a pick, or leaving the box) emits `item-change` with `value`.
 */
export interface RibbonField {
  type: 'text' | 'number' | 'select';
  /** The initial value. Later changes: {@link BRibbon.setFieldValue}. */
  value?: string;
  /** A dropdown's choices. */
  options?: RibbonFieldOption[];
  /** A dropdown that also takes a typed value not in its list (Font size 13). */
  freeText?: boolean;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  /** Width in characters (default 8). */
  width?: number;
  /** Overrides the ribbon's `field-caption`. */
  caption?: RibbonFieldCaption;
}

export type RibbonContextualColor = 'primary' | 'success' | 'warning' | 'danger' | 'info';
/** How a shown set is marked: `band` (Office: tinted band, name above its tabs), `pill` (name as a pill), `edge` (line). */
export type RibbonContextualStyle = 'band' | 'pill' | 'edge';

/** Tabs that appear only while something is selected (Office's "Table Design"). */
export interface RibbonContextualSet {
  id: string;
  label: string;
  color?: RibbonContextualColor;
  /** Overrides the ribbon's `contextual-style` for this set. */
  style?: RibbonContextualStyle;
}

export type RibbonGroupSize = 'large' | 'medium' | 'small' | 'popup';

export interface RibbonGroup {
  id: string;
  label: string;
  items: RibbonItem[];
  /** Key tip letter or digit (TASK-736). Unset: the first free letter of the label. */
  keytip?: string;
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
  /**
   * A small ↘ button at the group's bottom-right corner (Office's dialog launcher), for "more options" the group's
   * commands have no room for. A click emits `group-launcher` with `{ tabId, groupId }`; the app decides what opens.
   * `launcherLabel` names it (tooltip and screen readers); default "More {label} options".
   */
  launcher?: boolean;
  launcherLabel?: string;
}

export interface RibbonItem {
  id: string;
  label: string;
  icon?: string;
  /** Key tip letter or digit (TASK-736). Unset: the first free letter of the label. */
  keytip?: string;
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
  /** Makes this command a gallery of visual choices (TASK-740). See {@link RibbonGallery}. */
  gallery?: RibbonGallery;
  /** Makes this command an input box or dropdown (TASK-741). See {@link RibbonField}. */
  field?: RibbonField;
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
  /** Key tip letter or digit (TASK-736). Unset: the first free letter of the label. */
  keytip?: string;
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
    'qat-key', 'qat-position', 'keytip-shortcut', 'contextual-style', 'gallery-style', 'field-caption',
    'label-ribbon', 'label-open-nav', 'label-expand', 'label-collapse',
    'label-pin', 'label-unpin', 'label-navigation', 'label-actions', 'label-close',
    'label-scroll-tabs-left', 'label-scroll-tabs-right',
    'label-scroll-groups-left', 'label-scroll-groups-right',
    'preferred-group-size']; }

  private _tabs: RibbonTab[] = [];
  /** Contextual sets (TASK-734): declared, which are shown, and the normal tab to go back to when one hides. */
  private _ctxSets: RibbonContextualSet[] = [];
  private _ctxShown = new Set<string>();
  private _lastNormalTab: string | null = null;
  /** Gallery state by tab/group/item: the current choice (seeded from gallery.selected) and the inline row's offset. */
  private _gallerySel = new Map<string, string>();
  private _galleryOffset = new Map<string, number>();
  /** Input values by tab/group/item: as typed, and as last committed (what Escape puts back). */
  private _fieldValues = new Map<string, string>();
  private _fieldCommitted = new Map<string, string>();
  /** Whether the input a key went to had its own list open (read in capture, before the list closes on Escape). */
  private _fieldListWasOpen = false;
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
  /** Quick Access Toolbar (TASK-737): the app's default commands, and the user's list of refs once customised. */
  private _qatDefaults: RibbonItem[] = [];
  /** Whether the app asked for a toolbar at all (setQuickAccess with a list). Off: no toolbar, no "Add" menu. */
  private _qatEnabled = false;
  private _qatRefs: string[] | null = null;
  private _qatLoadedKey: string | null = null;
  private _qatRoving = 0;
  private _menuOpener: HTMLElement | null = null;
  /** Key tip mode (TASK-736): which level is showing, and each badge's letter → the element it acts on. */
  private _keytipLevel: 'tabs' | 'commands' | 'flyout' | 'menu' | null = null;
  private _keytipTargets = new Map<string, HTMLElement>();
  private _keytipScope: HTMLElement | null = null;
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

  /**
   * The contextual sets' colours, one rule set per theme colour. Primary has no alpha tokens, so its tint and border are
   * its light shade and itself; the others use the -alpha-bg / -alpha-border / -text tokens that pass contrast in every
   * theme (TASK-599).
   */
  private static _ctxCss(): string {
    return BRibbon.CTX_COLORS.map(c => {
      const line = `var(--b-color-${c})`;
      const text = `var(--b-color-${c}-text, var(--b-color-${c}))`;
      const bg = c === 'primary' ? 'var(--b-color-primary-light)' : `var(--b-color-${c}-alpha-bg)`;
      const border = c === 'primary' ? 'var(--b-color-primary)' : `var(--b-color-${c}-alpha-border)`;
      return `
      .ribbon-ctx-set.color-${c} .ribbon-ctx-name, .ribbon-ctx-set.color-${c} .ribbon-tab { color: ${text}; }
      .ribbon-ctx-set.color-${c} .ribbon-tab[aria-selected="true"] { border-bottom-color: ${line}; }
      .ribbon-ctx-set.color-${c}.style-band { border-top-color: ${line}; background: ${bg}; }
      .ribbon-ctx-set.color-${c}.style-pill .ribbon-ctx-name { background: ${bg}; border-color: ${border}; }
      .ribbon-ctx-set.color-${c}.style-edge { border-top-color: ${line}; }`;
    }).join('');
  }

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
        border-bottom: var(--b-border-width, 1px) solid var(--b-border);
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
        font-size: var(--b-ribbon-scroll-glyph, 0.75rem); flex-shrink: 0; align-items: center; justify-content: center;
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
        border-bottom: var(--b-border-width-thick, 2px) solid transparent;
        margin-bottom: calc(var(--b-border-width, 1px) * -1);
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
        min-width: var(--b-ribbon-tab-badge-size, 1.125rem); height: var(--b-ribbon-tab-badge-size, 1.125rem); padding: 0 var(--b-space-xs, 0.25rem);
        border-radius: var(--b-radius-full, 9999px);
        background: var(--b-color-danger); color: var(--b-text-on-danger, var(--b-text-inverse));
        font-size: var(--b-text-2xs, 0.625rem); font-weight: var(--b-font-weight-bold, 700);
        display: inline-flex; align-items: center; justify-content: center; line-height: 1;
      }

      /* ── Contextual sets (TASK-734): three looks, all kept by the user; contextual-style picks one ── */
      .ribbon-ctx-set { display: inline-flex; align-self: stretch; flex-shrink: 0; margin-inline-start: var(--b-space-xs, 0.25rem); }
      .ribbon-ctx-tabs { display: flex; align-items: stretch; }
      .ribbon-ctx-name { font-size: var(--b-text-xs, 0.6875rem); font-weight: var(--b-font-weight-semibold, 600); white-space: nowrap; line-height: 1; }
      .ribbon-ctx-set.style-band { flex-direction: column; border-top: var(--b-ribbon-context-accent, 3px) solid transparent; }
      .ribbon-ctx-set.style-band .ribbon-ctx-name { text-align: center; padding: var(--b-space-2xs, 0.125rem) var(--b-space-sm, 0.5rem) 0; }
      .ribbon-ctx-set.style-band .ribbon-ctx-tabs { flex: 1; }
      .ribbon-ctx-set.style-pill { align-items: center; gap: var(--b-space-2xs, 0.125rem); }
      .ribbon-ctx-set.style-pill .ribbon-ctx-name {
        padding: var(--b-space-2xs, 0.125rem) var(--b-space-sm, 0.5rem); border: var(--b-border-width, 1px) solid transparent; border-radius: var(--b-radius-full, 9999px);
      }
      .ribbon-ctx-set.style-pill .ribbon-ctx-tabs { align-self: stretch; }
      .ribbon-ctx-set.style-edge { border-top: var(--b-ribbon-context-accent, 3px) solid transparent; }
      .ribbon-ctx-set.style-edge .ribbon-ctx-name { display: none; }
      ${BRibbon._ctxCss()}

      .ribbon-tab-divider {
        width: var(--b-border-width, 1px); height: var(--b-ribbon-tab-divider-height, 1.25rem); align-self: center; flex-shrink: 0;
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
        border-bottom: var(--b-border-width, 1px) solid var(--b-border);
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
        /* The gap in force, read by the group divider below as well as by the row. */
        --b-ribbon-gap-now: var(--b-ribbon-group-gap, var(--b-space-lg, 1rem));
        gap: var(--b-ribbon-gap-now);
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
      .ribbon-panel-inner:has(> .ribbon-group.size-small) { --b-ribbon-gap-now: calc(var(--b-ribbon-group-gap, var(--b-space-lg, 1rem)) * 0.5); }
      .ribbon-panel-inner:has(> .ribbon-group.size-popup) { --b-ribbon-gap-now: calc(var(--b-ribbon-group-gap, var(--b-space-lg, 1rem)) * 0.25); }

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
        /* Centred over the group's name when the name is the wider of the two (a small group's icons under
           "Records"): the space then splits evenly instead of all sitting before the next divider (TASK-746, the
           user picked Office's centring from a live preview). Columns of a medium or small group move as a block. */
        justify-content: center;
      }

      /* ── Size variants (STORY-049) ────────────────────────────────────────────
         The group carries the variant as a class and the items restyle from it. Medium and Small stack
         three per column and flow columns horizontally, as Office does -- that is what makes them
         NARROWER, not merely smaller. Sizes come from the TASK-098 tokens, never hand-authored here. */

      /* Large: 32px icon above the label, one item per column. */
      .ribbon-group.size-large .ribbon-group-items { align-items: flex-start; }
      .ribbon-group.size-large .ribbon-item {
        flex-direction: column; gap: var(--b-space-2xs, 0.125rem); min-width: var(--b-ribbon-item-min-width, 3.25rem); text-align: center;
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
        gap: var(--b-space-2xs, 0.125rem); min-width: var(--b-ribbon-chunk-width);
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
      /* An icon-less group's initial, shown only where the name is not (TASK-743). */
      .ribbon-chunk-initial { display: none; }
      .ribbon-group.size-popup.compact .ribbon-chunk-initial {
        display: inline-flex; align-items: center; justify-content: center;
        width: var(--b-ribbon-icon-small); height: var(--b-ribbon-icon-small); padding: var(--b-space-2xs, 0.125rem);
        border-radius: var(--b-radius-sm, 0.25rem); background: var(--b-bg-tertiary); color: var(--b-text);
        font-size: var(--b-text-xs, 0.6875rem); font-weight: var(--b-font-weight-semibold, 600); line-height: 1;
      }
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
        background: var(--b-bg-elevated); border: var(--b-border-width, 1px) solid var(--b-border);
        border-radius: var(--b-radius, 0.375rem); box-shadow: var(--b-shadow-md, 0 4px 6px -1px rgba(0,0,0,.1));
        padding: var(--b-space-sm, 0.5rem);
      }
      .ribbon-flyout::backdrop { background: none; }
      .ribbon-flyout { max-width: min(92vw, var(--b-ribbon-flyout-max-width, 32rem)); max-height: var(--b-ribbon-popup-max-height, 60vh); overflow: auto; }
      .ribbon-flyout .ribbon-group-items { display: flex; align-items: flex-start; }
      .ribbon-flyout .ribbon-item { flex-direction: column; gap: var(--b-space-2xs, 0.125rem); min-width: var(--b-ribbon-item-min-width, 3.25rem); text-align: center; }
      .ribbon-flyout .ribbon-item-icon { font-size: var(--b-ribbon-icon-large); }

      /* ── Split and menu buttons (TASK-732, option A picked by the user: the divider shows on hover) ──
         A split button is two buttons in one frame: the command, and a narrow ▾ part that opens its menu. At large
         size (and in a flyout) the parts stack as in Office: the icon runs the command, "Label ▾" below opens. */
      .ribbon-split { display: inline-flex; align-items: stretch; border-radius: var(--b-radius, 0.375rem); }
      .ribbon-split > .ribbon-split-main { border-radius: var(--b-radius, 0.375rem) 0 0 var(--b-radius, 0.375rem); }
      .ribbon-split-arrow {
        display: inline-flex; align-items: center; justify-content: center; gap: var(--b-space-xs, 0.25rem);
        padding: 0 var(--b-space-xs, 0.25rem);
        border: none; border-left: var(--b-border-width, 1px) solid transparent; background: none; cursor: pointer;
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
        border-left: 0; border-top: var(--b-border-width, 1px) solid transparent;
        border-radius: 0 0 var(--b-radius, 0.375rem) var(--b-radius, 0.375rem);
        padding: var(--b-space-2xs, 0.125rem) var(--b-space-sm, 0.5rem) var(--b-space-xs, 0.25rem);
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
        min-width: var(--b-ribbon-menu-min-width, 12rem); max-height: var(--b-ribbon-popup-max-height, 60vh); overflow: auto;
        background: var(--b-bg-elevated); border: var(--b-border-width, 1px) solid var(--b-border);
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
      .ribbon-menu-separator { height: var(--b-border-width, 1px); background: var(--b-border); margin: var(--b-space-xs, 0.25rem) 0; }
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
        box-shadow: inset 0 0 0 var(--b-border-width, 1px) var(--b-color-primary);
      }
      .ribbon-item[aria-pressed="true"]:focus-visible, .ribbon-item[aria-checked="true"]:focus-visible {
        box-shadow: inset 0 0 0 var(--b-border-width, 1px) var(--b-color-primary), var(--b-focus-ring);
      }
      .ribbon-radiogroup { display: contents; }

      /* ── Galleries (TASK-740): framed / open / dropdown, all kept by the user ── */
      /* Inputs (TASK-741): a box in one of the command rows, captioned as field-caption says. Width in characters. */
      .ribbon-field { display: inline-flex; align-items: center; gap: var(--b-space-xs, 0.25rem); align-self: center; }
      .ribbon-field.caption-above { flex-direction: column; align-items: flex-start; gap: calc(var(--b-space-2xs, 0.125rem) / 2); grid-row: span 2; justify-content: center; }
      .ribbon-field-caption { font-size: var(--b-text-xs, 0.6875rem); color: var(--b-text-secondary); white-space: nowrap; }
      .ribbon-field-control { display: block; width: calc(var(--b-ribbon-field-chars, 8) * 1ch + var(--b-ribbon-field-padding, 2rem)); }
      /* Beside: across the column, caption left and box right, so boxes of one width line up as Office's Height / Width. */
      .ribbon-field.caption-beside { justify-self: stretch; justify-content: space-between; }
      .ribbon-group.size-small .ribbon-field.caption-beside .ribbon-field-caption { display: none; }
      .mobile-field { display: flex; justify-content: space-between; padding: var(--b-space-xs, 0.25rem) var(--b-space-md, 0.75rem); }
      .mobile-field .ribbon-field-caption { font-size: var(--b-text-sm, 0.8125rem); color: var(--b-text); }
      .ribbon-gallery { display: inline-flex; align-items: stretch; gap: var(--b-space-2xs, 0.125rem); grid-row: 1 / -1; }
      .ribbon-gallery-row { display: flex; gap: var(--b-space-2xs, 0.125rem); }
      .ribbon-gallery-tile, .ribbon-gallery-current {
        display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--b-space-2xs, 0.125rem);
        width: var(--b-ribbon-gallery-tile-width, 4rem); min-height: var(--b-ribbon-gallery-tile-height, 2.75rem); padding: var(--b-space-2xs, 0.125rem); box-sizing: border-box;
        border: var(--b-border-width, 1px) solid transparent; border-radius: var(--b-radius-sm, 0.25rem); background: none; cursor: pointer;
        color: var(--b-text-secondary); font: inherit;
      }
      .ribbon-gallery-tile:hover, .ribbon-gallery-current:hover { background: var(--b-bg-tertiary); color: var(--b-text); }
      .ribbon-gallery-tile:focus-visible, .ribbon-gallery-current:focus-visible, .ribbon-gallery-btn:focus-visible { outline: none; box-shadow: var(--b-focus-ring); }
      .ribbon-gallery-tile.selected {
        border-color: var(--b-color-primary); background: var(--b-color-primary-light); color: var(--b-color-primary-text, var(--b-color-primary));
      }
      .ribbon-gallery-preview { font-size: var(--b-text-base, 0.875rem); font-weight: var(--b-font-weight-semibold, 600); line-height: 1; }
      .ribbon-gallery-name { font-size: var(--b-text-2xs, 0.625rem); line-height: 1.1; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ribbon-gallery-btn {
        display: inline-flex; align-items: center; justify-content: center; border: none; background: none; cursor: pointer;
        color: var(--b-text-muted); font: inherit; font-size: var(--b-text-2xs, 0.625rem); border-radius: var(--b-radius-sm, 0.25rem);
      }
      .ribbon-gallery-btn:hover { background: var(--b-bg-tertiary); color: var(--b-text); }
      .ribbon-gallery-btn[aria-disabled="true"] { opacity: var(--b-disabled-opacity, 0.5); pointer-events: none; }
      .ribbon-gallery.style-framed { border: var(--b-border-width, 1px) solid var(--b-border); border-radius: var(--b-radius-sm, 0.25rem); background: var(--b-bg); padding: var(--b-space-2xs, 0.125rem); }
      .ribbon-gallery.style-framed .ribbon-gallery-ctl { display: flex; flex-direction: column; border-left: var(--b-border-width, 1px) solid var(--b-border); margin-left: var(--b-space-2xs, 0.125rem); }
      .ribbon-gallery.style-framed .ribbon-gallery-ctl .ribbon-gallery-btn { flex: 1; width: var(--b-ribbon-gallery-button-width, 1rem); border-radius: 0; font-size: var(--b-text-xs, 0.6875rem); }
      .ribbon-gallery.style-open { flex-direction: column; align-items: center; }
      .ribbon-gallery.style-open .ribbon-gallery-line { display: flex; align-items: stretch; }
      .ribbon-gallery.style-open .ribbon-gallery-line > .ribbon-gallery-btn { width: var(--b-ribbon-gallery-button-width, 1rem); font-size: var(--b-text-sm, 0.8125rem); }
      .ribbon-gallery-more { padding: 0 var(--b-space-xs, 0.25rem); border: var(--b-border-width, 1px) solid var(--b-border) !important; font-size: var(--b-text-xs, 0.6875rem); color: var(--b-text-secondary); }
      .ribbon-gallery-current { border-color: var(--b-border); }
      .ribbon-group.size-small .ribbon-gallery-row > .ribbon-gallery-tile:nth-child(n+3) { display: none; }
      .ribbon-gallery-grid {
        position: fixed; inset: auto; margin: 0; z-index: var(--b-z-dropdown, 300); padding: var(--b-space-xs, 0.25rem);
        background: var(--b-bg-elevated); border: var(--b-border-width, 1px) solid var(--b-border); border-radius: var(--b-radius, 0.375rem);
        box-shadow: var(--b-shadow-md, 0 4px 6px -1px rgba(0,0,0,.1)); max-height: var(--b-ribbon-popup-max-height, 60vh); overflow: auto;
      }
      .ribbon-gallery-grid::backdrop { background: none; }
      .ribbon-gallery-grid .ribbon-gallery-tiles { display: grid; grid-template-columns: repeat(var(--b-ribbon-gallery-columns, 4), var(--b-ribbon-gallery-tile-width, 4rem)); gap: var(--b-space-xs, 0.25rem); }

      /* ── Group launcher (TASK-733): Office's corner arrow beside the group's name ── */
      .ribbon-group.has-launcher { position: relative; }
      .ribbon-group.has-launcher > .ribbon-group-label { padding-inline: calc(var(--b-ribbon-launcher-size, 1rem) + var(--b-space-xs, 0.25rem)); }
      .ribbon-launcher {
        display: inline-flex; align-items: center; justify-content: center;
        width: var(--b-ribbon-launcher-size, 1rem); height: var(--b-ribbon-launcher-size, 1rem); padding: 0; border: none; background: none; cursor: pointer;
        border-radius: var(--b-radius-sm, 0.25rem); color: var(--b-text-muted);
      }
      .ribbon-group > .ribbon-launcher { position: absolute; right: 0; bottom: 0; }
      .ribbon-launcher svg { width: var(--b-ribbon-launcher-glyph, 0.5625rem); height: var(--b-ribbon-launcher-glyph, 0.5625rem); stroke: currentColor; stroke-width: 1.4; fill: none; }
      .ribbon-launcher:hover { background: var(--b-bg-tertiary); color: var(--b-text); }
      .ribbon-launcher:focus-visible { outline: none; box-shadow: var(--b-focus-ring); }
      .ribbon-flyout-header {
        display: flex; align-items: center; justify-content: space-between; gap: var(--b-space-sm, 0.5rem);
        padding: 0 0 var(--b-space-xs, 0.25rem); margin-bottom: var(--b-space-xs, 0.25rem);
        border-bottom: var(--b-border-width, 1px) solid var(--b-border); font-size: var(--b-text-xs, 0.6875rem); color: var(--b-text-muted);
      }

      /* ── Quick Access Toolbar (TASK-737; in the tab row before the tabs by default, picked by the user) ── */
      .ribbon-qat { display: flex; align-items: center; gap: var(--b-space-2xs, 0.125rem); flex-shrink: 0; }
      .ribbon-tab-row > .ribbon-qat {
        padding-inline-end: var(--b-space-sm, 0.5rem); margin-inline-end: var(--b-space-xs, 0.25rem);
        border-inline-end: var(--b-border-width, 1px) solid var(--b-border);
      }
      .ribbon-qat-row { display: flex; padding: var(--b-space-2xs, 0.125rem) var(--b-space-sm, 0.5rem); background: var(--b-bg-secondary); }
      .ribbon-qat-row.above { border-bottom: var(--b-border-width, 1px) solid var(--b-border); }
      .ribbon-qat-row.below { border-top: var(--b-border-width, 1px) solid var(--b-border); }
      .ribbon-qat-btn {
        display: inline-flex; align-items: center; justify-content: center;
        min-width: var(--b-ribbon-qat-button-size, 1.75rem); height: var(--b-ribbon-qat-button-size, 1.75rem); padding: 0 var(--b-space-xs, 0.25rem);
        border: none; background: none; cursor: pointer; border-radius: var(--b-radius, 0.375rem);
        color: var(--b-text-secondary); font: inherit; font-size: var(--b-icon-base, 1rem);
      }
      .ribbon-qat-btn:hover { background: var(--b-bg-tertiary); color: var(--b-text); }
      .ribbon-qat-btn:focus-visible { outline: none; box-shadow: var(--b-focus-ring); }
      .ribbon-qat-btn[aria-pressed="true"] {
        background: var(--b-color-primary-light); color: var(--b-color-primary-text, var(--b-color-primary));
        box-shadow: inset 0 0 0 var(--b-border-width, 1px) var(--b-color-primary);
      }
      .ribbon-qat-btn[aria-disabled="true"] { opacity: var(--b-disabled-opacity, 0.5); pointer-events: none; }
      .ribbon-qat-more { min-width: var(--b-ribbon-qat-more-width, 1.25rem); font-size: 0.7em; color: var(--b-text-muted); }
      .ribbon-menu-item[aria-checked="true"] .ribbon-menu-check::before { content: "\\2713"; }
      .ribbon-menu-check { width: 1.25em; text-align: center; flex-shrink: 0; }

      /* ── Key tips (TASK-736; Office's dark squares, picked by the user) — the dark tooltip tokens, dark in every theme ── */
      .ribbon-keytips { position: fixed; inset: 0; margin: 0; padding: 0; border: 0; background: none; pointer-events: none; overflow: visible; }
      .ribbon-keytip {
        position: fixed; transform: translate(-50%, -30%);
        min-width: var(--b-ribbon-keytip-size, 1.1rem); height: var(--b-ribbon-keytip-size, 1.1rem); padding: 0 var(--b-ribbon-badge-padding, 0.2rem); box-sizing: border-box;
        display: inline-flex; align-items: center; justify-content: center;
        background: var(--b-tooltip-bg, #1e293b); color: var(--b-tooltip-text, #e2e8f0);
        border-radius: var(--b-radius-sm, 0.25rem); box-shadow: var(--b-shadow-sm, 0 1px 2px rgba(0,0,0,.25));
        font: var(--b-font-weight-semibold, 600) var(--b-text-xs, 0.6875rem)/1 var(--b-font-sans, system-ui);
      }
      .ribbon-item[aria-disabled="true"] {
        opacity: var(--b-disabled-opacity, 0.5); pointer-events: none;
      }
      .ribbon-item.variant-primary { color: var(--b-color-primary); font-weight: var(--b-font-weight-semibold, 600); }
      .ribbon-item.variant-danger { color: var(--b-color-danger); }
      .ribbon-item-icon { font-size: var(--b-icon-base, 1rem); }
      .ribbon-item-badge {
        min-width: var(--b-ribbon-item-badge-size, 1rem); height: var(--b-ribbon-item-badge-size, 1rem); padding: 0 var(--b-ribbon-badge-padding, 0.2rem);
        border-radius: var(--b-radius-full, 9999px);
        background: var(--b-color-danger); color: var(--b-text-on-danger, var(--b-text-inverse));
        font-size: var(--b-ribbon-item-badge-text, 0.5625rem); font-weight: var(--b-font-weight-bold, 700);
        display: inline-flex; align-items: center; justify-content: center; line-height: 1;
      }

      /* ── Group separator ── */
      /* Separator only — the spacing is owned by the flex gap alone. This used to ALSO add a full
         --b-ribbon-group-gap of padding-left, so the real inter-group spacing was double the gap while the
         measure pass (which measures a group with no preceding sibling, so no padding applies) assumed
         single. That under-count made the pass under-degrade and clip the row. One mechanism, one number. */
      /* Drawn halfway into the gap, not on the group's edge: as a border-left it touched the next group's first command
         (1px) while the whole gap (21px) sat after the previous group's last one (TASK-730, the user picked Office's
         tighter, centred look from a live preview). Out of flow, so it adds no width the measure pass cannot see. */
      .ribbon-group + .ribbon-group { position: relative; }
      .ribbon-group + .ribbon-group::before {
        content: ''; position: absolute; top: 0; bottom: 0; width: var(--b-border-width, 1px); background: var(--b-border);
        left: calc(var(--b-ribbon-gap-now) / -2 - var(--b-border-width, 1px) / 2);
      }

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
        border-bottom: var(--b-border-width, 1px) solid var(--b-border);
        font-weight: var(--b-font-weight-bold, 700);
        font-size: var(--b-text-lg, 1rem);
      }
      .mobile-dialog-close {
        background: none; border: none; cursor: pointer;
        font-size: var(--b-text-xl, 1.25rem); color: var(--b-text-muted); padding: var(--b-space-xs, 0.25rem);
        border-radius: var(--b-radius, 0.375rem);
      }
      .mobile-dialog-close:hover { background: var(--b-bg-tertiary); color: var(--b-text); }
      .mobile-dialog-body { padding: var(--b-space-sm, 0.5rem); overflow-y: auto; height: calc(100% - var(--b-ribbon-mobile-header-height, 3rem)); }
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
        .ribbon-qat, .ribbon-qat-row { display: none; }
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
    this._gallerySel.clear();
    this._galleryOffset.clear();
    this._fieldValues.clear();
    this._fieldCommitted.clear();
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
   * Declares the contextual sets: each one's name, theme colour and (optionally) its own style. Their tabs say which set
   * they belong to with `contextualSet` and stay hidden until {@link showContextual}.
   */
  setContextualSets(sets: RibbonContextualSet[]) {
    this._ctxSets = sets;
    this.update();
  }

  /** Shows a set's tabs, after the normal ones. `select` also opens its first tab. */
  showContextual(id: string, options: { select?: boolean } = {}) {
    this._ctxShown.add(id);
    this.update();
    if (options.select) {
      const first = this._tabs.find(t => t.contextualSet === id && !t.disabled);
      if (first) this._selectTab(first.id);
    }
  }

  /**
   * Hides a set's tabs. If one of them was open, the ribbon goes back to the normal tab that was open before it (or the
   * first tab), and emits `tab-change` (decided by the user).
   */
  hideContextual(id: string) {
    if (!this._ctxShown.delete(id)) return;
    const active = this._tabs.find(t => t.id === this.attr('active'));
    if (active?.contextualSet === id) {
      const back = this._tabs.find(t => t.id === this._lastNormalTab && this._isTabVisible(t))
        ?? this._tabs.find(t => this._isTabVisible(t));
      if (back) {
        this.setAttribute('active', back.id);
        this.emit('tab-change', { tab: back.id });
      }
    }
    this.update();
  }

  isContextualShown(id: string): boolean {
    return this._ctxShown.has(id);
  }

  private _isTabVisible(tab: RibbonTab): boolean {
    return !tab.contextualSet || this._ctxShown.has(tab.contextualSet);
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

  /** Sets a gallery's current choice from the app (its selection changed), without emitting `item-click`. */
  setGallerySelection(itemId: string, choiceId: string | null, tabId?: string) {
    for (const tab of this._tabs) {
      if (tabId && tab.id !== tabId) continue;
      for (const group of tab.groups) {
        if (!group.items.some(i => i.id === itemId && i.gallery)) continue;
        const key = this._pressKey(tab.id, group.id, itemId);
        if (choiceId === null) this._gallerySel.set(key, ''); else this._gallerySel.set(key, choiceId);
      }
    }
    this.update();
  }

  /** A gallery's current choice, or null. */
  getGallerySelection(itemId: string, tabId?: string): string | null {
    for (const tab of this._tabs) {
      if (tabId && tab.id !== tabId) continue;
      for (const group of tab.groups) {
        const item = group.items.find(i => i.id === itemId && i.gallery);
        if (item) return this._galleryChoice(tab.id, group.id, item) || null;
      }
    }
    return null;
  }

  /** Sets a ribbon input's value (TASK-741) without an event. The boxes on screen change in place. */
  setFieldValue(itemId: string, value: string, tabId?: string) {
    for (const tab of this._tabs) {
      if (tabId && tab.id !== tabId) continue;
      for (const group of tab.groups) {
        if (!group.items.some(i => i.id === itemId && i.field)) continue;
        const key = this._pressKey(tab.id, group.id, itemId);
        this._fieldValues.set(key, value);
        this._fieldCommitted.set(key, value);
        this._fieldControls(tab.id, group.id, itemId).forEach(el => { (el as HTMLElement & { value: string }).value = value; });
      }
    }
  }

  /** A ribbon input's committed value, or null when there is no such input. */
  getFieldValue(itemId: string, tabId?: string): string | null {
    for (const tab of this._tabs) {
      if (tabId && tab.id !== tabId) continue;
      for (const group of tab.groups) {
        const item = group.items.find(i => i.id === itemId && i.field);
        if (item) return this._fieldCommitted.get(this._pressKey(tab.id, group.id, item.id)) ?? item.field?.value ?? '';
      }
    }
    return null;
  }

  private _fieldValue(tabId: string, groupId: string, item: RibbonItem): string {
    return this._fieldValues.get(this._pressKey(tabId, groupId, item.id)) ?? item.field?.value ?? '';
  }

  /** Every box of one input: in the panel, in a flyout and in the mobile list. */
  private _fieldControls(tabId: string, groupId: string, itemId: string): HTMLElement[] {
    return this.$$<HTMLElement>(`[data-field-control][data-tab="${CSS.escape(tabId)}"][data-group="${CSS.escape(groupId)}"][data-item="${CSS.escape(itemId)}"]`);
  }

  private _galleryChoice(tabId: string, groupId: string, item: RibbonItem): string {
    return this._gallerySel.get(this._pressKey(tabId, groupId, item.id)) ?? item.gallery?.selected ?? '';
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

  /**
   * The Quick Access Toolbar's default commands: always-visible icon buttons, each emitting `item-click` with
   * `source: 'qat'`. The user can hide them, add ribbon commands (context menu on a command) and remove them; with
   * `qat-key` that choice is saved in localStorage. The toolbar is opt-in: until an app calls this, there is no toolbar
   * and no "Add to Quick Access Toolbar" on a command. `[]` gives an empty toolbar the user can fill; `null` turns it
   * off again.
   */
  setQuickAccess(items: RibbonItem[] | null) {
    this._qatEnabled = items !== null;
    this._qatDefaults = items ?? [];
    this._loadQat();
    this.update();
  }

  /** The toolbar's commands as refs: `qat:<id>` for a default, `item:<tab>/<group>/<item>` for a ribbon command. */
  getQuickAccess(): string[] {
    return this._qatVisible().map(e => e.ref);
  }

  private static readonly QAT_REF = /^(qat:[^\s/]{1,200}|item:[^\s/]{1,200}\/[^\s/]{1,200}\/[^\s/]{1,200})$/;

  private _qatStorageKey(): string | null {
    const key = this.attr('qat-key');
    return key ? `birko-ribbon-qat:${key}` : null;
  }

  /** Reads the saved choice once per key. Anything that is not a list of well-formed refs is ignored, not trusted. */
  private _loadQat() {
    const key = this._qatStorageKey();
    if (key === this._qatLoadedKey) return;
    this._qatLoadedKey = key;
    this._qatRefs = null;
    if (!key) return;
    let saved: unknown = null;
    try { saved = JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { return; }
    if (!Array.isArray(saved)) return;
    this._qatRefs = [...new Set(saved.filter((r): r is string => typeof r === 'string' && BRibbon.QAT_REF.test(r)))].slice(0, 50);
  }

  private _saveQat() {
    const key = this._qatStorageKey();
    if (key && this._qatRefs) {
      try { localStorage.setItem(key, JSON.stringify(this._qatRefs)); } catch { /* storage full or blocked */ }
    }
    this.emit('quick-access-change', { refs: this.getQuickAccess() });
  }

  private _resolveRef(ref: string): { item: RibbonItem; tabId?: string; groupId?: string } | null {
    if (ref.startsWith('qat:')) {
      const item = this._qatDefaults.find(i => i.id === ref.slice(4));
      return item ? { item } : null;
    }
    const [tabId, groupId, itemId] = ref.slice(5).split('/');
    const item = this._tabs.find(t => t.id === tabId)?.groups.find(g => g.id === groupId)?.items.find(i => i.id === itemId);
    return item ? { item, tabId, groupId } : null;
  }

  /** What the toolbar shows: the user's list (unknown refs skipped), or every default until it is customised. */
  private _qatVisible(): Array<{ ref: string; item: RibbonItem; tabId?: string; groupId?: string }> {
    const refs = this._qatRefs ?? this._qatDefaults.map(i => `qat:${i.id}`);
    return refs.map(ref => ({ ref, r: this._resolveRef(ref) }))
      .filter((e): e is { ref: string; r: { item: RibbonItem; tabId?: string; groupId?: string } } => !!e.r)
      .map(e => ({ ref: e.ref, ...e.r }));
  }

  /**
   * Adds a ref. A re-shown default goes back among the defaults in their declared order, as Office places a re-checked
   * command; anything else goes at the end.
   */
  private _insertQatRef(refs: string[], ref: string): string[] {
    if (!ref.startsWith('qat:')) return [...refs, ref];
    const order = (r: string) => this._qatDefaults.findIndex(i => `qat:${i.id}` === r);
    const mine = order(ref);
    const at = refs.findIndex(r => r.startsWith('qat:') && order(r) > mine);
    if (at >= 0) return [...refs.slice(0, at), ref, ...refs.slice(at)];
    const lastDefault = refs.reduce((last, r, i) => (r.startsWith('qat:') ? i : last), -1);
    return [...refs.slice(0, lastDefault + 1), ref, ...refs.slice(lastDefault + 1)];
  }

  private _qatEdit(change: (refs: string[]) => string[]) {
    this._qatRefs = change(this._qatRefs ?? this._qatDefaults.map(i => `qat:${i.id}`));
    this._saveQat();
    this.update();
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
    this._loadQat();
    if (this._qatRefs) this.update();
    // App-wide (decided by the user): the key works wherever focus is. On window, bubbling, so an app that handles the
    // same key first and calls preventDefault() keeps it; `collapse-shortcut="none"` turns it off entirely.
    this._shortcutAC?.abort();
    this._shortcutAC = new AbortController();
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (this._keytipLevel && this._keytipKey(e)) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, { signal: this._shortcutAC.signal, capture: true });
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || !this._isKeytipCombo(e)) return;
      if (this._keytipLevel) { this._exitKeytips(); e.preventDefault(); return; }
      if (!this._keytipsAvailable()) return;
      e.preventDefault();
      this._showKeytips('tabs');
    }, { signal: this._shortcutAC.signal });
    // A click anywhere, the window losing focus, or a resize ends key tips. `blur` is listened to WITHOUT capture: in
    // the capture phase window also sees every element's blur, so focus moving into an opened menu ended the mode.
    const exit = () => { if (this._keytipLevel) this._exitKeytips(); };
    window.addEventListener('pointerdown', exit, { signal: this._shortcutAC.signal, capture: true });
    window.addEventListener('resize', exit, { signal: this._shortcutAC.signal });
    window.addEventListener('blur', (e: FocusEvent) => { if (e.target === window) exit(); }, { signal: this._shortcutAC.signal });
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
    this._loadQat(); // a changed qat-key reads its own saved choice
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

    const qatPos = this.attr('qat-position') === 'above' || this.attr('qat-position') === 'below' ? this.attr('qat-position') : 'tabs';
    const qat = tabsOnly ? '' : this._renderQat();
    return `
      ${this._renderTooltip()}
      ${this._renderSharedMenu()}
      ${this._renderKeytipLayer()}
      <div class="ribbon" role="toolbar" aria-label="${this.label('label-ribbon', 'bwc.ribbon.title', 'Module ribbon')}">
        ${qat && qatPos === 'above' ? `<div class="ribbon-qat-row above">${qat}</div>` : ''}
        <div class="ribbon-tab-row">
          <div class="ribbon-before"><slot name="before-tabs"></slot></div>
          ${qat && qatPos === 'tabs' ? qat : ''}

          <button class="mobile-hamburger" id="mobile-hamburger" aria-label="${this.label('label-open-nav', 'bwc.ribbon.openNav', 'Open navigation menu')}">&#9776;</button>
          <span class="mobile-active-label">${activeLabel}</span>

          <button class="ribbon-scroll-btn${this._tabScroll.overflowing ? ' reserved' : ''}${this._tabScroll.left ? ' visible' : ''}" id="scroll-left" aria-label="${this.label('label-scroll-tabs-left', 'bwc.ribbon.scrollTabsLeft', 'Scroll tabs left')}">&#9666;</button>
          <div class="ribbon-tabs" role="tablist">
            ${this._renderTabStrip(active, tabsOnly)}
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
        ${qat && qatPos === 'below' ? `<div class="ribbon-qat-row below">${qat}</div>` : ''}

        <dialog class="mobile-dialog" id="mobile-dialog" aria-labelledby="mobile-dialog-title">
          <div class="mobile-dialog-header">
            <span id="mobile-dialog-title">${this.label('label-navigation', 'bwc.ribbon.navigation', 'Navigation')}</span>
            <button class="mobile-dialog-close" id="mobile-dialog-close" aria-label="${this.label('label-close', 'bwc.common.close', 'Close')}">&#10005;</button>
          </div>
          <div class="mobile-dialog-body">
            ${this._tabs.filter(t => this._isTabVisible(t)).map(tab => `
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
                      if (item.gallery?.items.length) {
                        const current = this._galleryChoice(tab.id, group.id, item);
                        return `<div class="mobile-item-heading">${item.label}</div>` + item.gallery.items.map(c => `
                          <button class="mobile-item mobile-subitem mobile-gallery" role="radio" aria-checked="${c.id === current}"
                            data-tab="${tab.id}" data-group="${group.id}" data-gallery="${item.id}" data-choice="${escapeAttr(c.id)}">${escapeHtml(c.label)}</button>`).join('');
                      }
                      if (item.field) return this._renderField(tab.id, group.id, item, true);
                      const toggle = this._isToggle(item)
                        ? ` data-toggle ${item.toggleGroup ? 'role="radio" aria-checked' : 'aria-pressed'}="${this._isPressed(tab.id, group.id, item)}"` : '';
                      return `<${tag} class="mobile-item" ${href}${toggle}
                        data-tab="${tab.id}" data-group="${group.id}" data-item="${item.id}">
                        ${item.icon ? `<span aria-hidden="true">${item.icon}</span>` : ''}
                        ${item.label}
                      </${tag}>${choices}`;
                    }).join('')}
                    ${group.launcher ? `<button class="mobile-item mobile-launcher" data-tab="${tab.id}" data-launcher="${escapeAttr(group.id)}">${escapeHtml(this._launcherLabel(group))}</button>` : ''}
                  `).join('')}
                </div>
              </div>
            `).join('')}
          </div>
        </dialog>
      </div>
    `;
  }

  /**
   * The Quick Access Toolbar: favourite commands as icon buttons plus a ▾ that customises it. One Tab stop; ←/→
   * move inside it. Empty (no defaults, nothing added) renders nothing.
   */
  private _renderQat(): string {
    const entries = this._qatVisible();
    if (!this._qatEnabled) return '';
    const name = this.label('label-quick-access', 'bwc.ribbon.quickAccess', 'Quick Access Toolbar');
    const customize = this.label('label-qat-customize', 'bwc.ribbon.qatCustomize', 'Customize Quick Access Toolbar');
    const buttons = entries.map(({ ref, item, tabId, groupId }) => {
      const on = tabId && groupId && this._isToggle(item) ? ` aria-pressed="${this._isPressed(tabId, groupId, item)}"` : '';
      const glyph = item.icon ? item.icon : escapeHtml(item.label.slice(0, 1));
      return `<button class="ribbon-qat-btn" type="button" data-qat-ref="${escapeAttr(ref)}" aria-label="${escapeAttr(item.label)}"${on}`
        + `${item.disabled ? ' aria-disabled="true"' : ''}><span aria-hidden="true">${glyph}</span></button>`;
    }).join('');
    return `<div class="ribbon-qat" role="group" aria-label="${escapeAttr(name)}">${buttons}`
      + `<button class="ribbon-qat-btn ribbon-qat-more" type="button" data-qat-customize aria-haspopup="menu" aria-expanded="false"`
      + ` aria-label="${escapeAttr(customize)}"><span aria-hidden="true">&#9662;</span></button></div>`;
  }

  /** The key tip badges: a manual popover in the top layer, so they also show over a flyout or a menu. */
  private _renderKeytipLayer(): string {
    return `<div class="ribbon-keytips" popover="manual" aria-hidden="true"></div>`;
  }

  /** One popover reused for the "add / remove" context menu and the customise menu; filled when it opens. */
  private _renderSharedMenu(): string {
    return `<div class="ribbon-menu ribbon-shared-menu" popover role="menu"></div>`;
  }

  /** One tab button. `setLabel` names its contextual set for screen readers (the band's name is decoration). */
  private _renderTabButton(tab: RibbonTab, active: string, tabsOnly: boolean, divider: string, setLabel?: string): string {
    const isActive = tab.id === active;
    const badge = tab.badge ? `<span class="ribbon-tab-badge">${tab.badge > 99 ? '99+' : tab.badge}</span>` : '';
    const icon = tab.icon ? `<span class="ribbon-tab-icon" aria-hidden="true">${tab.icon}</span>` : '';
    const disabled = tab.disabled ? 'aria-disabled="true"' : '';
    const described = setLabel ? ` aria-description="${escapeAttr(setLabel)}"` : '';
    return `${divider}<button class="ribbon-tab" role="tab"
                aria-selected="${isActive}" ${tabsOnly ? '' : 'aria-controls="ribbon-panel"'}
                id="ribbon-tab-${tab.id}" tabindex="${isActive ? '0' : '-1'}"
                data-tab="${tab.id}" ${disabled}${described}>
                ${icon}<span class="ribbon-tab-label">${tab.label}</span>${badge}
              </button>`;
  }

  /** The normal tabs, then each shown contextual set's tabs inside its band, pill or edge (TASK-734). */
  private _renderTabStrip(active: string, tabsOnly: boolean): string {
    const normal = this._tabs.filter(t => !t.contextualSet);
    const out = normal.map((tab, i) => {
      const prevCat = i > 0 ? normal[i - 1].category : undefined;
      const divider = tab.category && prevCat && tab.category !== prevCat
        ? '<span class="ribbon-tab-divider" aria-hidden="true"></span>' : '';
      return this._renderTabButton(tab, active, tabsOnly, divider);
    });
    const defaultStyle = (['band', 'pill', 'edge'] as const).find(v => v === this.attr('contextual-style')) ?? 'band';
    for (const set of this._ctxSets) {
      if (!this._ctxShown.has(set.id)) continue;
      const tabs = this._tabs.filter(t => t.contextualSet === set.id);
      if (!tabs.length) continue;
      const color = BRibbon.CTX_COLORS.includes(set.color as RibbonContextualColor) ? set.color : 'primary';
      const style = (['band', 'pill', 'edge'] as const).find(v => v === set.style) ?? defaultStyle;
      out.push(`<span class="ribbon-ctx-set style-${style} color-${color}" role="presentation" data-set="${escapeAttr(set.id)}">`
        + `<span class="ribbon-ctx-name" aria-hidden="true">${escapeHtml(set.label)}</span>`
        + `<span class="ribbon-ctx-tabs" role="presentation">${tabs.map(t => this._renderTabButton(t, active, tabsOnly, '', set.label)).join('')}</span>`
        + `</span>`);
    }
    return out.join('');
  }

  private static readonly CTX_COLORS: readonly RibbonContextualColor[] = ['primary', 'success', 'warning', 'danger', 'info'];

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
            ${group.icon ? `<span class="ribbon-chunk-icon" aria-hidden="true">${group.icon}</span>` : this._chunkInitial(group)}
            <span class="ribbon-chunk-name">${group.label} &#9662;</span>
          </button>
          <div class="ribbon-flyout" popover role="group" aria-label="${group.label}">
            ${group.launcher ? `<div class="ribbon-flyout-header"><span>${group.label}</span>${this._renderLauncher(tabId, group)}</div>` : ''}
            <div class="ribbon-group-items">${items}</div>
          </div>
        </div>`;
    }

    return `
      <div class="ribbon-group size-${size}${group.launcher ? ' has-launcher' : ''}" role="group" aria-label="${group.label}" data-group="${group.id}">
        <span class="ribbon-group-label">${group.label}</span>
        <div class="ribbon-group-items">${items}</div>
        ${this._renderLauncher(tabId, group)}
      </div>`;
  }

  /**
   * What a compact folded group shows when it has no icon: its initial in a small tile (TASK-743, picked by the user
   * from a live preview over a generic glyph). Compact drops the name, so without this the button was empty, 7px tall.
   */
  private _chunkInitial(group: RibbonGroup): string {
    const text = group.label.replace(/<[^>]*>/g, '').trim();
    const initial = Array.from(text)[0]?.toLocaleUpperCase() ?? '';
    return initial ? `<span class="ribbon-chunk-initial" aria-hidden="true">${escapeHtml(initial)}</span>` : '';
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
    if (refocus) this._focusStop(this._rovingStop());
    // Different tab, different group widths — so both the chevrons AND the scaling have to re-evaluate.
    // Queued rather than immediate: _measureAndScale re-renders, and _queueSync coalesces into one frame
    // (the _measuring guard stops the nested call recursing).
    this._panelSync?.();
    this._queueSync();
  }

  private _bindPanelItems() {
    this._applyRoving();
    this._bindGalleries();
    this._bindFields('.ribbon-panel .ribbon-field-control');
    // Panel launchers only: this runs again on every hover preview, which re-renders the panel but not the mobile list,
    // so binding `.mobile-launcher` here would stack a listener per preview (it is bound once per render in onUpdated).
    this.$$<HTMLElement>('.ribbon-panel .ribbon-launcher').forEach(el => {
      this.listen(el, 'click', (e: Event) => {
        e.stopPropagation();
        this.emit('group-launcher', { tabId: el.dataset.tab, groupId: el.dataset.launcher });
        const flyout = el.closest<HTMLElement>('.ribbon-flyout');
        if (flyout?.matches(':popover-open')) flyout.hidePopover();
        if (!this.boolAttr('pinned')) { this._hoverTabId = null; this.collapse(); }
      });
    });
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

  private _galleryStyle(item: RibbonItem): RibbonGalleryStyle {
    const pick = (v: unknown) => (['framed', 'open', 'dropdown'] as const).find(x => x === v);
    return pick(item.gallery?.style) ?? pick(this.attr('gallery-style')) ?? 'framed';
  }

  private _renderGalleryTile(tabId: string, groupId: string, item: RibbonItem, choice: RibbonGalleryItem, selected: string, inGrid: boolean): string {
    const on = choice.id === selected;
    return `<button class="ribbon-gallery-tile${on ? ' selected' : ''}" type="button" role="radio" aria-checked="${on}"`
      + ` aria-label="${escapeAttr(choice.label)}" data-tab="${tabId}" data-group="${groupId}" data-gallery="${item.id}" data-choice="${escapeAttr(choice.id)}"`
      + `${inGrid ? ' tabindex="-1"' : ''}>`
      + `<span class="ribbon-gallery-preview" aria-hidden="true">${escapeHtml(choice.preview ?? choice.label.slice(0, 2))}</span>`
      + `<span class="ribbon-gallery-name" aria-hidden="true">${escapeHtml(choice.label)}</span></button>`;
  }

  /**
   * A gallery (TASK-740), in the look `gallery-style` picks (all three kept by the user): `framed` (Office: a framed
   * row with ▲ ▼ ▾ beside it), `open` (‹ › around the row, "More ▾" under it) or `dropdown` (the current choice only).
   * The full grid is a popover inside the gallery, so inside a flyout it is the flyout's descendant and keeps it open.
   */
  private _renderGallery(tabId: string, groupId: string, item: RibbonItem): string {
    const g = item.gallery!;
    const style = this._galleryStyle(item);
    const key = this._pressKey(tabId, groupId, item.id);
    const selected = this._galleryChoice(tabId, groupId, item);
    const visible = Math.max(1, g.visible ?? 4);
    const offset = Math.min(this._galleryOffset.get(key) ?? 0, Math.max(0, g.items.length - visible));
    const gridId = `${this.uid}-gallery-${groupId}-${item.id}`;
    const name = escapeAttr(item.label);
    const data = `data-tab="${tabId}" data-group="${groupId}" data-gallery="${item.id}"`;
    const expand = (cls: string, label: string, body: string) =>
      `<button class="ribbon-gallery-btn ${cls}" type="button" ${data} data-gallery-expand aria-haspopup="dialog" aria-expanded="false"`
      + ` aria-controls="${escapeAttr(gridId)}" aria-label="${escapeAttr(label)}">${body}</button>`;
    const showAll = this.label('label-gallery-all', 'bwc.ribbon.galleryAll', 'Show all: {label}', { label: item.label });
    const grid = `<div class="ribbon-gallery-grid" id="${escapeAttr(gridId)}" popover role="radiogroup" aria-label="${name}"`
      + ` style="--b-ribbon-gallery-columns:${Math.max(1, Math.min(12, g.columns ?? 4))}">`
      + `<div class="ribbon-gallery-tiles">${g.items.map(c => this._renderGalleryTile(tabId, groupId, item, c, selected, true)).join('')}</div></div>`;
    let inline: string;
    if (style === 'dropdown') {
      const current = g.items.find(c => c.id === selected) ?? g.items[0];
      inline = current ? expand('ribbon-gallery-current', showAll,
        `<span class="ribbon-gallery-preview" aria-hidden="true">${escapeHtml(current.preview ?? current.label.slice(0, 2))}</span>`
        + `<span class="ribbon-gallery-name" aria-hidden="true">${escapeHtml(current.label)} &#9662;</span>`) : '';
    } else {
      const tiles = g.items.slice(offset, offset + visible).map(c => this._renderGalleryTile(tabId, groupId, item, c, selected, false)).join('');
      const atStart = offset === 0;
      const atEnd = offset + visible >= g.items.length;
      const prev = this.label('label-gallery-prev', 'bwc.ribbon.galleryPrev', 'Previous choices');
      const next = this.label('label-gallery-next', 'bwc.ribbon.galleryNext', 'More choices');
      const step = (dir: string, label: string, glyph: string, off: boolean) =>
        `<button class="ribbon-gallery-btn" type="button" ${data} data-gallery-step="${dir}" aria-label="${escapeAttr(label)}"${off ? ' aria-disabled="true"' : ''}>${glyph}</button>`;
      inline = style === 'framed'
        ? `<span class="ribbon-gallery-row" role="radiogroup" aria-label="${name}">${tiles}</span>`
          + `<span class="ribbon-gallery-ctl">${step('-1', prev, '&#9650;', atStart)}${step('1', next, '&#9660;', atEnd)}${expand('', showAll, '&#9662;')}</span>`
        : `<span class="ribbon-gallery-line">${step('-1', prev, '&#8249;', atStart)}<span class="ribbon-gallery-row" role="radiogroup" aria-label="${name}">${tiles}</span>${step('1', next, '&#8250;', atEnd)}</span>`
          + expand('ribbon-gallery-more', showAll, `${escapeHtml(this.label('label-gallery-more', 'bwc.ribbon.galleryMore', 'More'))} &#9662;`);
    }
    return `<span class="ribbon-gallery style-${style}" ${data}>${inline}${grid}</span>`;
  }

  private _fieldCaption(item: RibbonItem): RibbonFieldCaption {
    const pick = (v: unknown) => (['none', 'beside', 'above'] as const).find(x => x === v);
    return pick(item.field?.caption) ?? pick(this.attr('field-caption')) ?? 'none';
  }

  /**
   * An input (TASK-741): a bare, small b-input or b-select, captioned in the look `field-caption` picks (all three kept
   * by the user): `none` (Office: the tooltip and the accessible name say what it is), `beside` or `above`. The box's
   * value is rendered from `_fieldValues`, so a re-render (a resize, a hover preview) keeps what was typed.
   */
  private _renderField(tabId: string, groupId: string, item: RibbonItem, mobile = false): string {
    const f = item.field!;
    const caption = mobile ? 'beside' : this._fieldCaption(item);
    const num = (name: string, v: number | undefined) => (v === undefined || !Number.isFinite(v) ? '' : ` ${name}="${v}"`);
    const attrs = `class="${mobile ? 'mobile-field-control' : 'ribbon-field-control'}" bare size="sm" label="${escapeAttr(item.label)}"`
      + ` value="${escapeAttr(this._fieldValue(tabId, groupId, item))}"${f.placeholder ? ` placeholder="${escapeAttr(f.placeholder)}"` : ''}`
      + `${item.disabled ? ' disabled' : ''} style="--b-ribbon-field-chars:${Math.max(2, Math.min(40, Math.round(f.width ?? 8)))}"`
      + ` data-tab="${tabId}" data-group="${groupId}" data-item="${escapeAttr(item.id)}" data-field-control`;
    const control = f.type === 'select'
      ? `<b-select ${attrs}${f.freeText ? ' searchable allow-free-text no-clear' : ''}></b-select>`
      : `<b-input ${attrs} type="${f.type === 'number' ? 'number' : 'text'}"${num('min', f.min)}${num('max', f.max)}${num('step', f.step)}></b-input>`;
    const cap = caption === 'none' ? '' : `<span class="ribbon-field-caption" aria-hidden="true">${escapeHtml(item.label)}</span>`;
    return `<span class="ribbon-field${mobile ? ' mobile-field' : ''} caption-${caption}">${cap}${control}</span>`;
  }

  /** The focusable element inside an input's box. */
  private _fieldInner(el: HTMLElement): HTMLElement | null {
    return el.shadowRoot?.querySelector<HTMLElement>('input, select') ?? null;
  }

  /** Focuses a panel stop. An input's box is a component whose host is not focusable, so its inner control takes it. */
  private _focusStop(el: HTMLElement | null | undefined) {
    if (!el) return;
    if (el.hasAttribute('data-field-control')) this._fieldInner(el)?.focus(); else el.focus();
  }

  private _fieldFocused(): boolean {
    return !!(this.shadowRoot?.activeElement as HTMLElement | null | undefined)?.hasAttribute('data-field-control');
  }

  /** Wires the boxes `selector` finds: their choices, their value as typed, and the commit on leaving. */
  private _bindFields(selector: string) {
    this.$$<HTMLElement>(selector).forEach(el => {
      const item = this._itemFor(el);
      const f = item?.field;
      const { tab, group } = el.dataset;
      if (!item || !f || !tab || !group) return;
      const key = this._pressKey(tab, group, item.id);
      let seeding = false;
      // The box's own `change` is the ribbon's to report: b-input sends one per keystroke, so it is a draft until
      // committed, and a dropdown's pick commits at once. Neither leaves the ribbon under that name, including the
      // ones b-select sends while its choices and value are filled in below.
      this.listen(el, 'change', (e: Event) => {
        e.stopPropagation();
        if (seeding) return;
        this._fieldValues.set(key, String((e as CustomEvent<{ value?: unknown }>).detail?.value ?? ''));
        if (f.type === 'select') this._commitField(el, !f.freeText);
      });
      if (f.type === 'select') {
        const value = this._fieldValue(tab, group, item);
        seeding = true;
        (el as unknown as BSelect).setOptions(f.options ?? []);
        (el as unknown as BSelect).value = value;
        seeding = false;
      }
      this.listen(el, 'focusout', () => this._commitField(el, false));
    });
    if (selector.includes('ribbon-field-control')) this._applyRoving(); // a dropdown re-rendered its inner control
  }

  /**
   * Reports an input's value when it differs from the last one reported, and shows it in the input's other boxes.
   * An explicit commit (Enter, a pick) closes a folded group's flyout, and an unpinned ribbon, as a command does;
   * leaving the box does not.
   */
  private _commitField(el: HTMLElement, explicit: boolean) {
    const item = this._itemFor(el);
    const { tab, group } = el.dataset;
    if (!item?.field || !tab || !group) return;
    const key = this._pressKey(tab, group, item.id);
    const value = this._fieldValues.get(key) ?? item.field.value ?? '';
    if (value === (this._fieldCommitted.get(key) ?? item.field.value ?? '')) return;
    this._fieldCommitted.set(key, value);
    this._fieldControls(tab, group, item.id).forEach(other => {
      if (other !== el) (other as HTMLElement & { value: string }).value = value;
    });
    this.emit('item-change', { tabId: tab, groupId: group, itemId: item.id, value });
    if (!explicit || el.classList.contains('mobile-field-control')) return;
    el.closest<HTMLElement>('.ribbon-flyout:popover-open')?.hidePopover();
    if (!this.boolAttr('pinned')) { this._hoverTabId = null; this.collapse(); }
  }

  /**
   * Keys inside an input edit it: the arrows, Home and End move the caret, step the number or walk the list, so they
   * never move between commands, and Tab leaves the ribbon as from any command. Enter commits. Escape puts the
   * committed value back and returns to the tab, unless it only closed the box's own list.
   */
  private _fieldKey(ke: KeyboardEvent, el: HTMLElement) {
    if (ke.key === 'Enter') { this._commitField(el, true); return; }
    if (ke.key !== 'Escape' || this._fieldListWasOpen) return;
    const item = this._itemFor(el);
    const { tab, group } = el.dataset;
    if (!item?.field || !tab || !group) return;
    const key = this._pressKey(tab, group, item.id);
    const committed = this._fieldCommitted.get(key) ?? item.field.value ?? '';
    this._fieldValues.set(key, committed);
    (el as HTMLElement & { value: string }).value = committed;
    if (el.closest('.ribbon-flyout')) return; // the flyout closes itself and gives focus back to its button
    ke.preventDefault();
    this.$<HTMLElement>(`#ribbon-tab-${this.attr('active')}`)?.focus();
  }

  private _renderItem(tabId: string, groupId: string, item: RibbonItem): string {
    if (item.gallery?.items.length) return this._renderGallery(tabId, groupId, item);
    if (item.field) return this._renderField(tabId, groupId, item);
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
    // Gallery tiles show their name already, so they get no tooltip (it also took the first Escape in the grid).
    const el = node instanceof Element ? node.closest<HTMLElement>('.ribbon-item, .ribbon-chunk, .ribbon-split-arrow, .ribbon-qat-btn, .ribbon-launcher, .ribbon-gallery-btn, .ribbon-gallery-current, .ribbon-field-control') : null;
    return el && this.shadowRoot?.contains(el) && !el.closest('.ribbon-menu') ? el : null;
  }

  private _tipContent(el: HTMLElement): TooltipContent | null {
    if (el.dataset.qatRef) {
      const found = this._resolveRef(el.dataset.qatRef);
      return found ? { heading: found.item.label, text: found.item.description, shortcut: found.item.shortcut } : null;
    }
    if (el.hasAttribute('data-qat-customize') || el.dataset.launcher || el.dataset.gallery) return { heading: el.getAttribute('aria-label') ?? '' };
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
    // Not over a box being typed in: the tooltip would sit on its list.
    if (el.hasAttribute('data-field-control') && el === this.shadowRoot?.activeElement) return;
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
    for (const area of this.$$<HTMLElement>('.ribbon-panel, .ribbon-qat')) this._bindTooltipArea(area);
  }

  private _bindTooltipArea(panel: HTMLElement) {
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

  /** Opens the shared menu filled with `html`, under `anchor` (or at a point), focusing its first item. */
  private _openSharedMenu(html: string, anchor: HTMLElement | { x: number; y: number }, opener: HTMLElement) {
    const menu = this.$<HTMLElement>('.ribbon-shared-menu');
    if (!menu) return;
    if (menu.matches(':popover-open')) menu.hidePopover();
    menu.innerHTML = html;
    menu.setAttribute('aria-label', opener.getAttribute('aria-label') ?? '');
    this._menuOpener = opener;
    this._hideTip();
    const at = anchor instanceof HTMLElement ? { x: anchor.getBoundingClientRect().left, y: anchor.getBoundingClientRect().bottom + 2 } : anchor;
    menu.style.left = `${at.x}px`;
    menu.style.top = `${at.y}px`;
    menu.showPopover();
    const box = menu.getBoundingClientRect();
    if (box.right > window.innerWidth - 4) menu.style.left = `${Math.max(4, window.innerWidth - box.width - 4)}px`;
    if (box.bottom > window.innerHeight - 4) menu.style.top = `${Math.max(4, at.y - box.height - 4)}px`;
    this._menuItems(menu)[0]?.focus();
  }

  private _menuRow(action: string, ref: string, label: string, checked?: boolean): string {
    const role = checked === undefined ? 'menuitem' : 'menuitemcheckbox';
    const check = checked === undefined ? '' : `<span class="ribbon-menu-check" aria-hidden="true"></span>`;
    return `<button class="ribbon-menu-item" role="${role}" tabindex="-1"${checked === undefined ? '' : ` aria-checked="${checked}"`}`
      + ` data-qat-action="${action}" data-ref="${escapeAttr(ref)}">${check}<span class="ribbon-menu-label">${escapeHtml(label)}</span></button>`;
  }

  /** Arrow keys inside a gallery's grid: by one across, by a row up and down; Home / End. Escape closes it natively. */
  private _gridKey(ke: KeyboardEvent, grid: HTMLElement, target: HTMLElement) {
    const tiles = [...grid.querySelectorAll<HTMLElement>('.ribbon-gallery-tile')];
    const i = tiles.indexOf(target);
    if (i < 0) return;
    const cols = parseInt(grid.style.getPropertyValue('--b-ribbon-gallery-columns') || '4', 10) || 4;
    const next = ({ ArrowRight: i + 1, ArrowLeft: i - 1, ArrowDown: i + cols, ArrowUp: i - cols, Home: 0, End: tiles.length - 1 } as Record<string, number>)[ke.key];
    if (next === undefined) return;
    ke.preventDefault();
    tiles[Math.max(0, Math.min(tiles.length - 1, next))]?.focus();
  }

  private _openGalleryGrid(trigger: HTMLElement, focus: boolean) {
    const grid = this.shadowRoot?.getElementById(trigger.getAttribute('aria-controls') ?? '');
    if (!grid) return;
    if (grid.matches(':popover-open')) { grid.hidePopover(); return; }
    const anchor = (trigger.closest('.ribbon-gallery') as HTMLElement | null) ?? trigger;
    const rect = anchor.getBoundingClientRect();
    grid.style.left = `${rect.left}px`;
    grid.style.top = `${rect.top}px`;
    grid.showPopover();
    const box = grid.getBoundingClientRect();
    if (box.right > window.innerWidth - 4) grid.style.left = `${Math.max(4, window.innerWidth - box.width - 4)}px`;
    if (box.bottom > window.innerHeight - 4) grid.style.top = `${Math.max(4, window.innerHeight - box.height - 4)}px`;
    if (focus) (grid.querySelector<HTMLElement>('.ribbon-gallery-tile.selected') ?? grid.querySelector<HTMLElement>('.ribbon-gallery-tile'))?.focus();
  }

  private _pickGallery(el: HTMLElement) {
    const tab = this._tabs.find(t => t.id === el.dataset.tab);
    const group = tab?.groups.find(gr => gr.id === el.dataset.group);
    const item = group?.items.find(i => i.id === el.dataset.gallery);
    const choice = el.dataset.choice;
    if (!tab || !group || !item?.gallery || !choice) return;
    this._gallerySel.set(this._pressKey(tab.id, group.id, item.id), choice);
    const hadFocus = !!this.shadowRoot?.activeElement && !el.classList.contains('mobile-gallery');
    const grid = el.closest<HTMLElement>('.ribbon-gallery-grid');
    if (grid?.matches(':popover-open')) grid.hidePopover();
    const flyout = el.closest<HTMLElement>('.ribbon-flyout');
    if (flyout?.matches(':popover-open')) flyout.hidePopover();
    this.emit('item-click', { tabId: tab.id, groupId: group.id, itemId: choice, parentId: item.id });
    // The mobile list is part of the full render, not the panel's: keep its radios in step here.
    this.$$<HTMLElement>(`.mobile-gallery[data-tab="${CSS.escape(tab.id)}"][data-group="${CSS.escape(group.id)}"][data-gallery="${CSS.escape(item.id)}"]`)
      .forEach(m => m.setAttribute('aria-checked', String(m.dataset.choice === choice)));
    // Re-render so the highlight moves; that replaces the focused tile, so put focus back on the gallery: on the
    // picked tile when the row shows it, else on its expand button.
    this._showTabContent(this._hoverTabId ?? this.attr('active'));
    if (hadFocus && !flyout) {
      const sel = `.ribbon-panel-inner .ribbon-gallery[data-group="${CSS.escape(group.id)}"][data-gallery="${CSS.escape(item.id)}"]`;
      const back = this.$<HTMLElement>(`${sel} .ribbon-gallery-row > [data-choice="${CSS.escape(choice)}"]`)
        ?? this.$<HTMLElement>(`${sel} [data-gallery-expand]`);
      back?.focus();
    }
    if (!this.boolAttr('pinned')) { this._hoverTabId = null; this.collapse(); }
  }

  private _bindGalleries() {
    this.$$<HTMLElement>('.ribbon-panel .ribbon-gallery-tile').forEach(el =>
      this.listen(el, 'click', (e: Event) => { e.stopPropagation(); this._pickGallery(el); }));
    this.$$<HTMLElement>('.ribbon-panel [data-gallery-step]').forEach(el =>
      this.listen(el, 'click', (e: Event) => {
        e.stopPropagation();
        if (el.getAttribute('aria-disabled') === 'true') return;
        const tab = this._tabs.find(t => t.id === el.dataset.tab);
        const item = tab?.groups.find(gr => gr.id === el.dataset.group)?.items.find(i => i.id === el.dataset.gallery);
        if (!tab || !item?.gallery) return;
        const key = this._pressKey(tab.id, el.dataset.group!, item.id);
        const visible = Math.max(1, item.gallery.visible ?? 4);
        const max = Math.max(0, item.gallery.items.length - visible);
        const now = this._galleryOffset.get(key) ?? 0;
        this._galleryOffset.set(key, Math.max(0, Math.min(max, now + Number(el.dataset.galleryStep) * visible)));
        this._rovingKey = this._stopKey(el);
        this._showTabContent(this._hoverTabId ?? this.attr('active'));
      }));
    this.$$<HTMLElement>('.ribbon-panel [data-gallery-expand]').forEach(el => {
      const grid = this.shadowRoot?.getElementById(el.getAttribute('aria-controls') ?? '');
      if (!grid) return;
      this._returnFocusOnClose(grid, el);
      this.listen(grid, 'beforetoggle', () => this._hideTip());
      this.listen(grid, 'toggle', (e: Event) => el.setAttribute('aria-expanded', String((e as ToggleEvent).newState === 'open')));
      this.listen(el, 'click', (e: Event) => { e.stopPropagation(); this._openGalleryGrid(el, (e as MouseEvent).detail === 0); });
    });
  }

  /** The ref a panel command (or its split main part) would have in the toolbar, or null when it cannot be added. */
  private _refFor(el: HTMLElement): string | null {
    if (el.dataset.qatRef) return el.dataset.qatRef;
    const { tab, group, item } = el.dataset;
    if (!tab || !group || !item || group === '_context') return null;
    const found = this._resolveRef(`item:${tab}/${group}/${item}`);
    if (!found || (found.item.menu?.length && !found.item.split) || found.item.href || found.item.field) return null;
    return `item:${tab}/${group}/${item}`;
  }

  private _bindQat() {
    const qat = this.$<HTMLElement>('.ribbon-qat');
    const buttons = this.$$<HTMLElement>('.ribbon-qat-btn');
    this._qatRoving = Math.min(this._qatRoving, Math.max(0, buttons.length - 1));
    buttons.forEach((b, i) => { b.tabIndex = i === this._qatRoving ? 0 : -1; });
    if (qat) {
      this.listen(qat, 'keydown', (e: Event) => {
        const ke = e as KeyboardEvent;
        const i = buttons.indexOf(ke.target as HTMLElement);
        if (i < 0) return;
        const next = ke.key === 'ArrowRight' ? (i + 1) % buttons.length : ke.key === 'ArrowLeft' ? (i - 1 + buttons.length) % buttons.length
          : ke.key === 'Home' ? 0 : ke.key === 'End' ? buttons.length - 1 : -1;
        if (next < 0) return;
        ke.preventDefault();
        this._qatRoving = next;
        buttons.forEach((b, j) => { b.tabIndex = j === next ? 0 : -1; });
        buttons[next].focus();
      });
      this.listen(qat, 'focusin', (e: Event) => {
        const i = buttons.indexOf(e.target as HTMLElement);
        if (i >= 0) { this._qatRoving = i; buttons.forEach((b, j) => { b.tabIndex = j === i ? 0 : -1; }); }
      });
    }
    buttons.forEach(b => this.listen(b, 'click', (e: Event) => {
      e.stopPropagation();
      if (b.getAttribute('aria-disabled') === 'true') return;
      if (b.hasAttribute('data-qat-customize')) { this._openCustomize(b); return; }
      const ref = b.dataset.qatRef ?? '';
      const found = this._resolveRef(ref);
      if (!found) return;
      let pressed: boolean | null = null;
      if (found.tabId && found.groupId && this._isToggle(found.item)) {
        const group = this._tabs.find(t => t.id === found.tabId)!.groups.find(g => g.id === found.groupId)!;
        pressed = found.item.toggleGroup ? true : !this._isPressed(found.tabId, found.groupId, found.item);
        this._setPressedState(found.tabId, group, found.item, pressed);
        this._syncPressed();
        b.setAttribute('aria-pressed', String(pressed));
      }
      this.emit('item-click', {
        ...(found.tabId ? { tabId: found.tabId, groupId: found.groupId } : {}),
        itemId: found.item.id, source: 'qat', ...(pressed === null ? {} : { pressed }),
      });
    }));

    // Right-click, Shift+F10 or the menu key (all fire contextmenu) on a command: add it; on a toolbar button: remove it.
    for (const area of this.$$<HTMLElement>('.ribbon-panel, .ribbon-qat')) {
      this.listen(area, 'contextmenu', (e: Event) => {
        if (!this._qatEnabled) return; // no toolbar asked for: the browser's own menu, as before
        const me = e as MouseEvent;
        const el = (me.target as Element).closest<HTMLElement>('.ribbon-item, .ribbon-qat-btn');
        if (!el || el.closest('.ribbon-menu') || el.hasAttribute('data-qat-customize')) return;
        const ref = this._refFor(el);
        if (!ref) return;
        me.preventDefault();
        const inBar = this.getQuickAccess().includes(ref);
        const html = inBar
          ? this._menuRow('remove', ref, this.label('label-qat-remove', 'bwc.ribbon.qatRemove', 'Remove from Quick Access Toolbar'))
          : this._menuRow('add', ref, this.label('label-qat-add', 'bwc.ribbon.qatAdd', 'Add to Quick Access Toolbar'));
        const at = me.clientX || me.clientY ? { x: me.clientX, y: me.clientY } : el;
        this._openSharedMenu(html, at, el);
      });
    }

    const menu = this.$<HTMLElement>('.ribbon-shared-menu');
    if (!menu) return;
    this.listen(menu, 'keydown', (e: Event) => {
      const ke = e as KeyboardEvent;
      const target = ke.target as HTMLElement;
      if (ke.key === 'Escape') return; // the popover closes itself
      this._menuKey(ke, menu, target);
    });
    this.listen(menu, 'click', (e: Event) => {
      const el = (e.target as Element).closest<HTMLElement>('[data-qat-action]');
      if (!el) return;
      const ref = el.dataset.ref ?? '';
      const action = el.dataset.qatAction;
      menu.hidePopover();
      if (action === 'add') this._qatEdit(refs => refs.includes(ref) ? refs : [...refs, ref]);
      else if (action === 'remove') this._qatEdit(refs => refs.filter(x => x !== ref));
      else if (action === 'toggle') this._qatEdit(refs => refs.includes(ref) ? refs.filter(x => x !== ref) : this._insertQatRef(refs, ref));
      else if (action === 'reset') {
        this._qatRefs = null;
        const key = this._qatStorageKey();
        if (key) { try { localStorage.removeItem(key); } catch { /* blocked */ } }
        this.emit('quick-access-change', { refs: this.getQuickAccess() });
        this.update();
      }
      this.$<HTMLElement>('.ribbon-qat-more')?.focus();
    });
    let hadFocus = false;
    this.listen(menu, 'beforetoggle', (e: Event) => {
      if ((e as ToggleEvent).newState !== 'closed') return;
      const active = this.shadowRoot?.activeElement ?? null;
      hadFocus = !!active && menu.contains(active);
    });
    this.listen(menu, 'toggle', (e: Event) => {
      const open = (e as ToggleEvent).newState === 'open';
      this.$<HTMLElement>('.ribbon-qat-more')?.setAttribute('aria-expanded', String(open && this._menuOpener?.hasAttribute('data-qat-customize')));
      if (open || !hadFocus) return;
      hadFocus = false;
      const active = this.shadowRoot?.activeElement ?? null;
      const page = document.activeElement;
      if ((active && menu.contains(active)) || !page || page === document.body) {
        (this._menuOpener?.isConnected ? this._menuOpener : this.$<HTMLElement>('.ribbon-qat-more'))?.focus();
      }
    });
  }

  /** The ▾ menu: each default as a checkbox (shown or hidden), the added commands, and Reset. */
  private _openCustomize(button: HTMLElement) {
    const shown = new Set(this.getQuickAccess());
    const defaults = this._qatDefaults.map(i => this._menuRow('toggle', `qat:${i.id}`, i.label, shown.has(`qat:${i.id}`))).join('');
    const added = this._qatVisible().filter(e => e.ref.startsWith('item:'))
      .map(e => this._menuRow('toggle', e.ref, e.item.label, true)).join('');
    const reset = this._menuRow('reset', '', this.label('label-qat-reset', 'bwc.ribbon.qatReset', 'Reset to default'));
    this._openSharedMenu(`${defaults}${added}<div class="ribbon-menu-separator" role="separator"></div>${reset}`, button, button);
  }

  // ── Key tips (TASK-736) ────────────────────────────────────────────────────

  /** `keytip-shortcut` parsed. Default Alt+Meta (Alt+Windows key); on a Mac, Ctrl+Option (Ctrl+Alt). `none`: off. */
  private _keytipCombo(): { mods: Set<string>; key: string | null } | null {
    const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    const raw = (this.getAttribute('keytip-shortcut') ?? (mac ? 'Ctrl+Alt' : 'Alt+Meta')).trim().toLowerCase();
    if (!raw || raw === 'none') return null;
    const alias: Record<string, string> = { control: 'ctrl', cmd: 'meta', win: 'meta', windows: 'meta', option: 'alt' };
    const parts = raw.split('+').map(p => alias[p.trim()] ?? p.trim()).filter(Boolean);
    const isMod = (p: string) => ['ctrl', 'alt', 'shift', 'meta'].includes(p);
    const last = parts.at(-1) ?? '';
    return isMod(last) ? { mods: new Set(parts), key: null } : { mods: new Set(parts.slice(0, -1)), key: last };
  }

  /** Whether a keydown completes the combo: a modifier-only combo on its last modifier's press, else on the key. */
  private _isKeytipCombo(e: KeyboardEvent): boolean {
    const c = this._keytipCombo();
    if (!c) return false;
    const held = { ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey };
    const named = e.key.toLowerCase() === 'control' ? 'ctrl' : e.key.toLowerCase() === 'os' ? 'meta' : e.key.toLowerCase();
    for (const m of ['ctrl', 'alt', 'shift', 'meta'] as const) if (held[m] !== c.mods.has(m)) return false;
    return c.key === null ? c.mods.has(named) : named === c.key;
  }

  /**
   * Letters for a level: declared tips first (as given, upper-cased), then each label's first free letter or digit
   * (accents folded), then any free letter or digit. Single characters only, so 36 per level; the rest get none.
   */
  private _assignKeytips(entries: Array<{ el: HTMLElement; label: string; keytip?: string }>, used = new Set<string>()) {
    const out = new Map<string, HTMLElement>();
    const fold = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase();
    const pending: typeof entries = [];
    for (const e of entries) {
      const k = e.keytip ? fold(e.keytip).slice(0, 1) : '';
      if (k && /[A-Z0-9]/.test(k) && !used.has(k)) { used.add(k); out.set(k, e.el); } else pending.push(e);
    }
    const pool = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    for (const e of pending) {
      const k = [...fold(e.label)].find(ch => /[A-Z0-9]/.test(ch) && !used.has(ch)) ?? [...pool].find(ch => !used.has(ch));
      if (!k) continue;
      used.add(k);
      out.set(k, e.el);
    }
    return out;
  }

  /** A gallery tile's declared key tip, if any; the gallery's buttons have none. */
  private _galleryKeytip(el: HTMLElement): string | undefined {
    if (!el.dataset.choice) return undefined;
    const item = this._tabs.find(t => t.id === el.dataset.tab)?.groups.find(gr => gr.id === el.dataset.group)?.items.find(i => i.id === el.dataset.gallery);
    return item?.gallery?.items.find(c => c.id === el.dataset.choice)?.keytip;
  }

  private _itemFor(el: HTMLElement): RibbonItem | undefined {
    const tab = this._tabs.find(t => t.id === el.dataset.tab);
    const items = el.dataset.group === '_context' ? this._contextActions : tab?.groups.find(g => g.id === el.dataset.group)?.items ?? [];
    return items.find(i => i.id === (el.dataset.item ?? el.dataset.arrow));
  }

  /** Shows the badges of one level: the letter of each target, placed at its bottom edge (tabs) or corner. */
  private _showKeytips(level: NonNullable<BRibbon['_keytipLevel']>, scope: HTMLElement | null = null) {
    const layer = this.$<HTMLElement>('.ribbon-keytips');
    if (!layer) return;
    let entries: Array<{ el: HTMLElement; label: string; keytip?: string }> = [];
    const used = new Set<string>();
    const visible = (el: HTMLElement) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    let qat = new Map<string, HTMLElement>();
    if (level === 'tabs') {
      entries = this.$$<HTMLElement>('.ribbon-tab').filter(visible).map(el => {
        const tab = this._tabs.find(t => t.id === el.dataset.tab);
        return { el, label: tab?.label ?? el.textContent ?? '', keytip: tab?.keytip };
      });
      // Office numbers the Quick Access Toolbar.
      this.$$<HTMLElement>('.ribbon-qat-btn:not([data-qat-customize])').filter(visible).slice(0, 9).forEach((el, i) => { qat.set(String(i + 1), el); used.add(String(i + 1)); });
    } else if (level === 'commands') {
      entries = this._panelStops().filter(visible).map(el => {
        if (el.dataset.chunk) {
          const group = this._tabs.find(t => t.id === (this._hoverTabId ?? this.attr('active')))?.groups.find(g => g.id === el.dataset.chunk);
          return { el, label: group?.label ?? '', keytip: group?.keytip };
        }
        if (el.dataset.launcher) return { el, label: el.getAttribute('aria-label') ?? '' };
        if (el.dataset.gallery) return { el, label: el.getAttribute('aria-label') ?? '', keytip: this._galleryKeytip(el) };
        const item = this._itemFor(el);
        return { el, label: item?.label ?? el.textContent ?? '', keytip: el.dataset.arrow ? undefined : item?.keytip };
      });
    } else if (level === 'flyout' && scope) {
      entries = [...scope.querySelectorAll<HTMLElement>(':scope > .ribbon-group-items > .ribbon-item, :scope > .ribbon-group-items > .ribbon-radiogroup > .ribbon-item, :scope > .ribbon-group-items > .ribbon-split > *, :scope > .ribbon-group-items > .ribbon-field > .ribbon-field-control, :scope > .ribbon-flyout-header > .ribbon-launcher, :scope .ribbon-gallery-row > .ribbon-gallery-tile, :scope > .ribbon-gallery-tiles > .ribbon-gallery-tile, :scope .ribbon-gallery > .ribbon-gallery-current, :scope .ribbon-gallery-btn')]
        .filter(visible).map(el => {
          if (el.dataset.launcher) return { el, label: el.getAttribute('aria-label') ?? '' };
          if (el.dataset.gallery) return { el, label: el.getAttribute('aria-label') ?? '', keytip: this._galleryKeytip(el) };
          const item = this._itemFor(el);
          return { el, label: item?.label ?? '', keytip: el.dataset.arrow ? undefined : item?.keytip };
        });
    } else if (level === 'menu' && scope) {
      entries = this._menuItems(scope).map(el => {
        const owner = this._tabs.find(t => t.id === el.dataset.tab)?.groups.find(g => g.id === el.dataset.group)?.items.find(i => i.id === el.dataset.parent);
        const choice = owner?.menu?.find(m => !('separator' in m) && m.id === el.dataset.menuItem) as RibbonMenuItem | undefined;
        return { el, label: choice?.label ?? el.textContent ?? '', keytip: choice?.keytip };
      });
    }
    this._keytipTargets = new Map([...qat, ...this._assignKeytips(entries, used)]);
    this._keytipLevel = level;
    this._keytipScope = scope;
    layer.innerHTML = [...this._keytipTargets].map(([k, el]) => {
      const rect = el.getBoundingClientRect();
      // Tabs and toolbar buttons: centred under them. Commands: on the bottom-right corner, half outside, so the badge
      // does not cover the end of the label.
      const centred = level === 'tabs' || el.classList.contains('ribbon-qat-btn');
      const x = centred ? rect.left + rect.width / 2 : rect.right;
      const y = rect.bottom - (centred ? 2 : 0);
      return `<span class="ribbon-keytip" data-keytip="${escapeAttr(k)}" style="left:${Math.round(x)}px;top:${Math.round(y)}px">${escapeHtml(k)}</span>`;
    }).join('');
    if (!layer.matches(':popover-open')) layer.showPopover();
  }

  private _exitKeytips() {
    this._keytipLevel = null;
    this._keytipScope = null;
    this._keytipTargets.clear();
    const layer = this.$<HTMLElement>('.ribbon-keytips');
    if (layer) { layer.innerHTML = ''; if (layer.matches(':popover-open')) layer.hidePopover(); }
  }

  /** Whether the ribbon can show key tips now: not in tabs-only mobile layout, and with tabs on screen. */
  private _keytipsAvailable(): boolean {
    const tabs = this.$<HTMLElement>('.ribbon-tabs');
    return !!tabs && tabs.getBoundingClientRect().width > 0;
  }

  /** One key while key tips show. Returns true when the ribbon consumed it. */
  private _keytipKey(e: KeyboardEvent): boolean {
    if (!this._keytipLevel) return false;
    if (['Shift', 'Control', 'Alt', 'Meta', 'OS'].includes(e.key)) return true; // a lone modifier does not end the mode
    if (e.key === 'Escape') {
      const level = this._keytipLevel;
      if (level === 'menu' || level === 'flyout') {
        this._keytipScope?.matches(':popover-open') && this._keytipScope.hidePopover();
        requestAnimationFrame(() => this._showKeytips('commands'));
      } else if (level === 'commands') {
        this._showKeytips('tabs');
      } else {
        this._exitKeytips();
      }
      return true;
    }
    const key = e.key.length === 1 ? e.key.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase() : '';
    const el = key ? this._keytipTargets.get(key) : undefined;
    if (!el) { this._exitKeytips(); return key !== ''; } // a letter with no tip is swallowed rather than typed
    this._actOnKeytip(el);
    return true;
  }

  private _actOnKeytip(el: HTMLElement) {
    if (this._keytipLevel === 'tabs' && el.classList.contains('ribbon-tab')) {
      const tab = this._tabs.find(t => t.id === el.dataset.tab);
      if (!tab || this._isPanelless(tab) || this._tabsOnlyMode) { this._exitKeytips(); el.click(); return; }
      this._selectTab(tab.id);
      this._hoverTabId = null;
      this._showTabContent(tab.id);
      // The panel re-renders and may rescale: place the command tips once it has.
      requestAnimationFrame(() => requestAnimationFrame(() => this._showKeytips('commands')));
      return;
    }
    if (el.classList.contains('ribbon-chunk')) {
      el.click();
      const flyout = el.closest('.ribbon-group')?.querySelector<HTMLElement>('.ribbon-flyout');
      requestAnimationFrame(() => (flyout?.matches(':popover-open') ? this._showKeytips('flyout', flyout) : this._exitKeytips()));
      return;
    }
    if (el.hasAttribute('data-gallery-expand')) {
      this._openGalleryGrid(el, true);
      const grid = this.shadowRoot?.getElementById(el.getAttribute('aria-controls') ?? '') ?? null;
      requestAnimationFrame(() => (grid?.matches(':popover-open') ? this._showKeytips('flyout', grid) : this._exitKeytips()));
      return;
    }
    if (el.hasAttribute('data-menu-trigger')) {
      this._openMenu(el, true);
      const menu = this.shadowRoot?.getElementById(el.getAttribute('aria-controls') ?? '') ?? null;
      requestAnimationFrame(() => (menu?.matches(':popover-open') ? this._showKeytips('menu', menu) : this._exitKeytips()));
      return;
    }
    if (el.hasAttribute('data-field-control')) {
      // Office: the box takes focus with its text selected, ready to type over.
      this._exitKeytips();
      this._focusStop(el);
      (this._fieldInner(el) as HTMLInputElement | null)?.select?.();
      return;
    }
    this._exitKeytips();
    el.click();
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

  private _launcherLabel(group: RibbonGroup): string {
    return group.launcherLabel ?? this.label('label-launcher', 'bwc.ribbon.launcher', 'More {label} options', { label: group.label });
  }

  /** The group's launcher button (TASK-733, Office's corner arrow picked by the user), or nothing. */
  private _renderLauncher(tabId: string, group: RibbonGroup): string {
    if (!group.launcher) return '';
    const name = escapeAttr(this._launcherLabel(group));
    return `<button class="ribbon-launcher" type="button" data-tab="${tabId}" data-launcher="${escapeAttr(group.id)}" aria-label="${name}">`
      + `<svg viewBox="0 0 10 10" aria-hidden="true" focusable="false"><path d="M1.5 1.5 L8.5 8.5 M8.5 4 L8.5 8.5 L4 8.5"/></svg></button>`;
  }

  /** A command's menu, as a popover. Every choice is a menuitem reached with the arrows (tabindex -1). */
  private _renderMenu(menuId: string, tabId: string, groupId: string, item: RibbonItem): string {
    const entries = item.menu ?? [];
    const withIcons = entries.some(e => !('separator' in e) && e.icon);
    const rows = entries.map(e => {
      if ('separator' in e) return '<div class="ribbon-menu-separator" role="separator"></div>';
      const icon = withIcons ? `<span class="ribbon-menu-icon" aria-hidden="true">${e.icon ? escapeHtml(e.icon) : ''}</span>` : '';
      // Hidden from the tree: aria-keyshortcuts announces it, and the visible text made the item's name "Paste as text
      // Ctrl+Shift+V", so a screen reader said the shortcut twice (found by ribbon-a11y-check at sign-off).
      const shortcut = e.shortcut ? `<kbd class="ribbon-menu-shortcut" aria-hidden="true">${escapeHtml(e.shortcut)}</kbd>` : '';
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
    // Commands' menus only. The shared menu (Quick Access Toolbar) is filled when it opens and handles its own clicks;
    // _showTabContent re-runs this binding on a hover preview, which bound these handlers onto an OPEN shared menu,
    // so its choice was swallowed here (stopPropagation) and reported as a meaningless item-click.
    this.$$<HTMLElement>('.ribbon-menu:not(.ribbon-shared-menu) .ribbon-menu-item').forEach(el => {
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
        this._focusStop(this._rovingStop());
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
      const grid = target.closest<HTMLElement>('.ribbon-gallery-grid');
      if (grid) { this._gridKey(ke, grid, target); return; }
      if (target.hasAttribute('data-field-control')) { this._fieldKey(ke, target); return; }
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
      this._focusStop(next);
    });
    // Capture: whether an input's own list was open, before its Escape closes it.
    if (panelEl) this.listen(panelEl, 'keydown', (e: Event) => {
      const target = e.target as HTMLElement;
      this._fieldListWasOpen = target.hasAttribute('data-field-control') && !!target.shadowRoot?.querySelector(':popover-open');
    }, { capture: true });

    // Panel item clicks
    this._bindPanelItems();
    this._bindFields('.mobile-field-control');

    this._bindChunks();
    this._bindMenus();
    this._bindTooltips();
    this._bindQat();

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
      if (this._fieldFocused()) return; // the pointer left while typing: the box stays
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
        if (this._fieldFocused()) return; // a preview would replace the box being typed in
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

    // Mobile launchers: a group's "more options", listed under its commands.
    this.$$<HTMLElement>('.mobile-launcher').forEach(el => {
      this.listen(el, 'click', () => {
        this.emit('group-launcher', { tabId: el.dataset.tab, groupId: el.dataset.launcher });
        this._closeMobileMenu();
      });
    });

    // Mobile item clicks
    this.$$<HTMLElement>('.mobile-gallery').forEach(el => {
      this.listen(el, 'click', () => { this._pickGallery(el); this._closeMobileMenu(); });
    });
    this.$$<HTMLElement>('.mobile-item:not(.mobile-launcher):not(.mobile-gallery)').forEach(el => {
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
    this._exitKeytips();
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
    if (refocus) this._focusStop(this._rovingStop());
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _selectTab(tabId: string) {
    const tab = this._tabs.find(t => t.id === tabId);
    if (!tab || tab.disabled) return;

    if (!tab.contextualSet) this._lastNormalTab = tabId;
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
      '.ribbon-panel-inner > .ribbon-group > .ribbon-launcher',
      '.ribbon-panel-inner > .ribbon-group > .ribbon-group-items > .ribbon-gallery .ribbon-gallery-row > .ribbon-gallery-tile',
      '.ribbon-panel-inner > .ribbon-group > .ribbon-group-items > .ribbon-gallery > .ribbon-gallery-current',
      '.ribbon-panel-inner > .ribbon-group > .ribbon-group-items > .ribbon-gallery .ribbon-gallery-btn',
      '.ribbon-panel-inner > .ribbon-group > .ribbon-group-items > .ribbon-field > .ribbon-field-control',
    ].join(', '));
  }

  /** Identity of a stop that survives a re-render: the same command, or the same folded group. */
  private _stopKey(el: HTMLElement): string {
    if (el.dataset.chunk) return `chunk:${el.dataset.chunk}`;
    if (el.dataset.launcher) return `launcher:${el.dataset.launcher}`;
    if (el.dataset.gallery) {
      const part = el.dataset.choice ? `c:${el.dataset.choice}` : el.dataset.galleryStep ? `s:${el.dataset.galleryStep}` : 'x';
      return `gallery:${el.dataset.group}/${el.dataset.gallery}/${part}`;
    }
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
    for (const el of this._panelStops()) {
      const index = el === current ? 0 : -1;
      // An input's host is not focusable: the roving index goes on the control inside it.
      if (el.hasAttribute('data-field-control')) this._fieldInner(el)?.setAttribute('tabindex', String(index));
      else el.tabIndex = index;
    }
  }

  /** Whether focus is on a panel stop — checked before a re-render that replaces it, to put it back after. */
  private _focusInPanel(): boolean {
    const active = this.shadowRoot?.activeElement as HTMLElement | null | undefined;
    return !!active && this._panelStops().includes(active);
  }

  private _focusFlyout(chunk: HTMLElement) {
    const flyout = chunk.closest('.ribbon-group')?.querySelector<HTMLElement>('.ribbon-flyout');
    if (flyout?.matches(':popover-open')) this._focusStop(flyout.querySelector<HTMLElement>('.ribbon-item, .ribbon-field-control'));
  }

  private _flyoutKey(ke: KeyboardEvent, flyout: HTMLElement, target: HTMLElement) {
    const items = [...flyout.querySelectorAll<HTMLElement>(':scope > .ribbon-flyout-header > .ribbon-launcher, :scope > .ribbon-group-items > .ribbon-item, :scope > .ribbon-group-items > .ribbon-radiogroup > .ribbon-item, :scope > .ribbon-group-items > .ribbon-split > *, :scope > .ribbon-group-items > .ribbon-field > .ribbon-field-control, :scope > .ribbon-group-items > .ribbon-gallery .ribbon-gallery-row > .ribbon-gallery-tile, :scope > .ribbon-group-items > .ribbon-gallery > .ribbon-gallery-current, :scope > .ribbon-group-items > .ribbon-gallery .ribbon-gallery-btn')];
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
    this._focusStop(next);
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

    // The gap token in pixels, whatever its unit (rem, var(), calc()): the probe takes it as a width. It used to be
    // read with parseFloat, so `1.5rem` counted as 1.5px a gap; the row was under-counted by nearly a gap per group,
    // kept groups larger than fitted, and clipped up to 49px of the last group (TASK-746).
    probe.innerHTML = '';
    probe.style.width = 'var(--b-ribbon-group-gap, var(--b-space-lg, 1rem))';
    const tokenGap = probe.getBoundingClientRect().width;
    probe.remove();

    // The FULL token gap, not the live computed one: the rendered gap tightens once groups collapse, and
    // deciding against the tightened value could under-degrade and clip. Deciding against the larger value
    // is conservative — the row it picks then fits with room to spare. Same split as the Avalonia panel.
    // ROUNDING_SLACK is added per gap because the probe measures each group ALONE: it cannot see the sub-pixel
    // rounding between getBoundingClientRect and layout. (The divider was once a 1px border it could not see
    // either; it is drawn out of flow now.) The panel is overflow:hidden, so an under-count is clipped, not merely
    // untidy. Charged to the gap rather than deducted from the available width, since that is where the cost lives.
    const ROUNDING_SLACK = 3;
    const gap = (tokenGap || parseFloat(getComputedStyle(track).columnGap || '0') || 0) + ROUNDING_SLACK;
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
