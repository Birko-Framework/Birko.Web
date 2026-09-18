import { BaseComponent, define, findScrollParent } from 'birko-web-core';
import { escapeAttr } from '../dom-utils';

export class BSplitPanel extends BaseComponent {
  static get observedAttributes() { return ['master-width', 'detail-width', 'collapse-at', 'gap']; }

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
          ${collapsedDetailReset('.split > .detail', true)}
        }
      </style>
    ` : '';

    return `
      ${breakpoint}
      <div class="split" style="${vars}">
        <div class="master"><slot name="master"></slot></div>
        <div class="detail"><slot name="detail"></slot></div>
      </div>
    `;
  }

  protected onMount() {
    this._observeDetailSlot();
    this._trackScrollport();
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
