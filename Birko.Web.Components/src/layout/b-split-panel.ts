import { BaseComponent, define } from 'birko-web-core';

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
      @media (max-width: 768px) {
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
      `--_master-w: ${masterWidth}`,
      `--_detail-w: ${detailWidth}`,
      gap ? `--_gap: ${gap}` : '',
    ].filter(Boolean).join('; ');

    const breakpoint = collapseAt ? `
      <style>
        @media (max-width: ${collapseAt.includes('px') ? collapseAt : collapseAt + 'px'}) {
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

define('b-split-panel', BSplitPanel);
