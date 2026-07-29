import { BaseComponent, define } from 'birko-web-core';
import { escapeAttr } from '../dom-utils';

export class BSplitPanel extends BaseComponent {
  static get observedAttributes() { return ['master-width', 'detail-width', 'collapse-at', 'gap']; }

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
      /* Breakpoints are in rem so they track the reader's browser font size. In a media
         query rem resolves against the browser default (16px), NOT a :root override —
         48rem is the old 768px for a default-sized browser. */
      @media (max-width: ${DEFAULT_COLLAPSE_AT}) {
        :host(:not([collapse-at])) .split { grid-template-columns: 1fr; }
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
    const observer = new MutationObserver(update);
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

/** `collapse-at` → a media-query length, or `null` when absent/unparseable. */
function parseBreakpoint(value: string | null): string | null {
  const raw = (value ?? '').trim();
  if (!raw) return null;
  const m = /^(\d*\.?\d+)(px|rem|em)?$/.exec(raw);
  if (!m) return null;
  return m[2] ? raw : `${m[1]}px`;
}

define('b-split-panel', BSplitPanel);
