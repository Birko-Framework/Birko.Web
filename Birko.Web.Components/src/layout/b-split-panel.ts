import { BaseComponent, define, findScrollParent } from 'birko-web-core';
import { escapeAttr } from '../dom-utils';

/** The panel's column sizes, as CSS lengths (`18rem`, `320px`, `1fr`). */
export interface SplitSizes {
  master: string;
  detail: string;
}

/**
 * Master/detail split. With `resizable`, a separator between the columns can be dragged, or moved with
 * the arrow keys (Shift for bigger steps, Home/End for the limits); each change emits `split-resize`
 * with `{ sizes }`. `persist-key` saves the sizes in localStorage under that key and restores them on
 * mount; `sizes` reads and sets them (TASK-525). Save a whole layout with `captureLayout`.
 */
export class BSplitPanel extends BaseComponent {
  static get observedAttributes() { return ['master-width', 'detail-width', 'collapse-at', 'gap', 'resizable', 'persist-key']; }

  /** The current sizes (the attributes, or their defaults). */
  get sizes(): SplitSizes {
    return { master: this.attr('master-width', '18rem'), detail: this.attr('detail-width', '1fr') };
  }

  /** Sets the sizes. Each must be a CSS length; anything else is refused with a TypeError. Emits nothing. */
  set sizes(value: SplitSizes) {
    if (!isSize(value?.master) || !isSize(value?.detail)) {
      throw new TypeError('b-split-panel sizes must be CSS lengths such as 320px, 18rem or 1fr.');
    }
    this.setAttribute('master-width', value.master);
    this.setAttribute('detail-width', value.detail);
  }

  private _scrollport: HTMLElement | null = null;
  private _scrollportRO: ResizeObserver | null = null;
  private _detailMO: MutationObserver | null = null;

  static get styles() {
    return `
      :host { display: block; }
      .split {
        display: grid;
        grid-template-columns: var(--_master-w, 18rem) var(--_detail-w, 1fr);
        gap: var(--_gap, var(--b-space-lg, 1rem));
        align-items: start;
      }
      .split.no-detail {
        grid-template-columns: 1fr;
      }
      .split.no-detail .detail { display: none; }
      .master { position: relative; min-width: 0; }
      .resizer {
        position: absolute; top: 0; bottom: 0; width: 0.5rem; z-index: 1;
        right: calc(-0.5 * var(--_gap, var(--b-space-lg, 1rem)) - 0.25rem);
        cursor: col-resize; touch-action: none; border-radius: var(--b-radius-sm, 2px);
      }
      .resizer:hover, .resizer.dragging { background: var(--b-border); }
      .resizer:focus-visible { outline: none; box-shadow: var(--b-focus-ring); }
      .split.no-detail .resizer { display: none; }

      /* The detail column STICKS to the top of the scrollport (opt out with "static-detail").
         The master can be far taller than the viewport — a 100-row table — and the detail is a
         grid SIBLING pinned to the top of the row, so selecting a row near the bottom of a long
         list used to render its detail off-screen ABOVE: nothing visible changed and the reader
         had to scroll back up to see what they just clicked.
         What makes this work without constraining any ancestor's height: a grid item's containing
         block is its grid AREA, whose height is the row height (i.e. the tall master), while
         "align-items: start" keeps the card itself content-sized — so the card has room to travel.
         --_scrollport-h is measured in JS (see _trackScrollport) rather than written as 100dvh:
         the scrollport is the app shell's scrolling content region, not the viewport, so a dvh
         cap would let a tall detail card run below the fold by the height of the app header. */
      :host(:not([static-detail])) .split > .detail {
        position: sticky;
        top: var(--b-split-detail-sticky-top, 0.75rem);
        max-height: calc(var(--_scrollport-h, 100dvh) - 2 * var(--b-split-detail-sticky-top, 0.75rem));
        overflow-y: auto;
        overscroll-behavior: contain;
      }
      /* Breakpoints are in rem so they track the reader's browser font size. In a media
         query rem resolves against the browser default (16px), NOT a :root override —
         48rem is the old 768px for a default-sized browser. */
      @media (max-width: ${DEFAULT_COLLAPSE_AT}) {
        :host(:not([collapse-at])) .split { grid-template-columns: 1fr; }
        :host(:not([collapse-at])) .resizer { display: none; }
        ${collapsedDetailReset(':host(:not([collapse-at])) .split > .detail')}
      }
    `;
  }

  render() {
    const masterWidth = this.attr('master-width', '18rem');
    const detailWidth = this.attr('detail-width', '1fr');
    const gap = this.attr('gap');
    const collapseAt = this.attr('collapse-at');

    const vars = [
      `--_master-w: ${escapeAttr(masterWidth)}`,
      `--_detail-w: ${escapeAttr(detailWidth)}`,
      gap ? `--_gap: ${escapeAttr(gap)}` : '',
    ].filter(Boolean).join('; ');

    // `collapse-at` takes a CSS length — prefer rem/em (tracks the reader's font size);
    // a bare number stays px for back-compat. An unparseable value falls back to the
    // default breakpoint rather than being interpolated into the <style> block below.
    const collapseWidth = collapseAt ? parseBreakpoint(collapseAt) ?? DEFAULT_COLLAPSE_AT : null;
    const breakpoint = collapseWidth ? `
      <style>
        @media (max-width: ${collapseWidth}) {
          .split { grid-template-columns: 1fr !important; }
          .resizer { display: none !important; }
          ${collapsedDetailReset('.split > .detail', true)}
        }
      </style>
    ` : '';

    const resizer = this.boolAttr('resizable')
      ? `<div class="resizer" role="separator" aria-orientation="vertical" tabindex="0"
           aria-label="${escapeAttr(this.attr('resize-label', 'Resize panels'))}"></div>`
      : '';

    return `
      ${breakpoint}
      <div class="split" style="${vars}">
        <div class="master"><slot name="master"></slot>${resizer}</div>
        <div class="detail"><slot name="detail"></slot></div>
      </div>
    `;
  }

  protected onMount() {
    this._restoreSizes();
    this._observeDetailSlot();
    this._trackScrollport();
  }

  protected onUpdated() {
    const handle = this.$<HTMLElement>('.resizer');
    const split = this.$<HTMLElement>('.split');
    const master = this.$<HTMLElement>('.master');
    if (!handle || !split || !master) return;

    const limits = () => {
      const total = split.getBoundingClientRect().width;
      return { min: MIN_COLUMN_PX, max: Math.max(MIN_COLUMN_PX, total - MIN_COLUMN_PX) };
    };
    const clamp = (px: number) => { const { min, max } = limits(); return Math.round(Math.min(max, Math.max(min, px))); };
    const describe = (px: number) => {
      const { min, max } = limits();
      handle.setAttribute('aria-valuenow', String(Math.round(px)));
      handle.setAttribute('aria-valuemin', String(min));
      handle.setAttribute('aria-valuemax', String(Math.round(max)));
    };
    describe(master.getBoundingClientRect().width);

    let start: { x: number; width: number } | null = null;
    this.listen(handle, 'pointerdown', (e: Event) => {
      const pe = e as PointerEvent;
      if (pe.button !== 0) return;
      pe.preventDefault();
      // Capture keeps the drag going outside the handle; it throws for a pointer the browser no longer tracks.
      try { handle.setPointerCapture?.(pe.pointerId); } catch { /* the drag still works while over the handle */ }
      handle.classList.add('dragging');
      start = { x: pe.clientX, width: master.getBoundingClientRect().width };
    });
    this.listen(handle, 'pointermove', (e: Event) => {
      if (!start) return;
      const px = clamp(start.width + (e as PointerEvent).clientX - start.x);
      // Live feedback without a re-render: only the variable moves until the drag ends.
      split.style.setProperty('--_master-w', `${px}px`);
      describe(px);
    });
    const end = (e: Event) => {
      if (!start) return;
      const px = clamp(start.width + (e as PointerEvent).clientX - start.x);
      start = null;
      handle.classList.remove('dragging');
      this._commit(px);
    };
    this.listen(handle, 'pointerup', end);
    this.listen(handle, 'pointercancel', end);
    this.listen(handle, 'keydown', (e: Event) => {
      const ke = e as KeyboardEvent;
      const width = master.getBoundingClientRect().width;
      const step = ke.shiftKey ? 64 : 16;
      const target = ke.key === 'ArrowRight' ? width + step : ke.key === 'ArrowLeft' ? width - step
        : ke.key === 'Home' ? limits().min : ke.key === 'End' ? limits().max : null;
      if (target === null) return;
      ke.preventDefault();
      this._commit(clamp(target));
      this.$<HTMLElement>('.resizer')?.focus();
    });
  }

  /** Applies a master width chosen by the user: sets it, saves it under `persist-key`, emits `split-resize`. */
  private _commit(px: number): void {
    this.setAttribute('master-width', `${px}px`);
    const sizes = this.sizes;
    const key = this.attr('persist-key');
    if (key) {
      try { localStorage.setItem(storageKey(key), JSON.stringify(sizes)); } catch { /* storage full or blocked */ }
    }
    this.emit('split-resize', { sizes });
  }

  /** Restores sizes saved under `persist-key`. A stored value that is not a CSS length is ignored. */
  private _restoreSizes(): void {
    const key = this.attr('persist-key');
    if (!key) return;
    let saved: unknown;
    try { saved = JSON.parse(localStorage.getItem(storageKey(key)) ?? 'null'); } catch { return; }
    const sizes = saved as Partial<SplitSizes> | null;
    if (sizes && isSize(sizes.master) && isSize(sizes.detail)) {
      this.setAttribute('master-width', sizes.master!);
      this.setAttribute('detail-width', sizes.detail!);
    }
  }

  protected onUnmount() {
    this._scrollportRO?.disconnect();
    this._scrollportRO = null;
    this._detailMO?.disconnect();
    this._detailMO = null;
    this._scrollport = null;
  }

  /**
   * Feed the sticky detail column its `max-height` budget: the height of the scrolling region the
   * panel actually lives in, which for an app shell is the content pane BELOW the header/ribbon —
   * not the viewport. Re-measured on resize (the shell's chrome grows and shrinks with width), so a
   * detail card taller than the pane scrolls INSIDE itself instead of running past the fold where
   * its lower half would be unreachable while stuck.
   */
  private _trackScrollport() {
    this._scrollport = findScrollParent(this) ?? document.documentElement;
    const measure = () => this.style.setProperty('--_scrollport-h', `${this._scrollport?.clientHeight ?? 0}px`);
    measure();
    this._scrollportRO = new ResizeObserver(measure);
    this._scrollportRO.observe(this._scrollport);
  }

  private _observeDetailSlot() {
    const detailSlot = this.shadowRoot?.querySelector('slot[name="detail"]') as HTMLSlotElement | null;
    if (!detailSlot) return;

    const update = () => {
      const assigned = detailSlot.assignedElements();
      const hasVisible = assigned.some(el => !(el as HTMLElement).hidden);
      this.shadowRoot?.querySelector('.split')?.classList.toggle('no-detail', !hasVisible);
    };

    detailSlot.addEventListener('slotchange', update);

    // Also observe hidden attribute changes on slotted elements
    const observer = this._detailMO = new MutationObserver(update);
    const observe = () => {
      observer.disconnect();
      for (const el of detailSlot.assignedElements()) {
        observer.observe(el, { attributes: true, attributeFilter: ['hidden'] });
      }
    };
    detailSlot.addEventListener('slotchange', observe);

    update();
    observe();
  }
}

/** The narrowest a column can be dragged to. */
const MIN_COLUMN_PX = 120;

const storageKey = (key: string) => `birko-split:${key}`;

/**
 * A size the panel accepts from a caller or from storage: one CSS length. It is interpolated into an inline
 * `style`, where escaping alone stops an attribute breakout but not a second declaration (`1px; background: …`).
 */
function isSize(value: unknown): value is string {
  return typeof value === 'string' && /^\d*\.?\d+(px|rem|em|%|fr|vw|ch)$/.test(value.trim());
}

/** Default collapse breakpoint — 768px at a default 16px browser. See CLAUDE.md § Breakpoints. */
const DEFAULT_COLLAPSE_AT = '48rem';

/**
 * Undo the sticky detail column once the panel has collapsed to ONE column.
 *
 * Stacked, the detail is no longer beside the master but below it, so its grid area is exactly its
 * own height — sticky has nowhere to travel, and the `max-height` would only shrink the card into a
 * second nested scroller inside a page that already scrolls. Emitted into both the default
 * breakpoint and the `collapse-at` override so the two can't drift apart. The override lives in an
 * inline style element, which the cascade places BEFORE the adopted sheet carrying the sticky rule —
 * so it only wins with `important`, exactly as the column reset next to it already does.
 */
function collapsedDetailReset(selector: string, important = false): string {
  const bang = important ? ' !important' : '';
  return `${selector} {
          position: static${bang};
          max-height: none${bang};
          overflow-y: visible${bang};
        }`;
}

/** `collapse-at` → a media-query length, or `null` when absent/unparseable. */
function parseBreakpoint(value: string | null): string | null {
  const raw = (value ?? '').trim();
  if (!raw) return null;
  const m = /^(\d*\.?\d+)(px|rem|em)?$/.exec(raw);
  if (!m) return null;
  return m[2] ? raw : `${m[1]}px`;
}

define('b-split-panel', BSplitPanel);
