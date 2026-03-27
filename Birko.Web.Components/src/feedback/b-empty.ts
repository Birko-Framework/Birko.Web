import { BaseComponent, define } from 'birko-web-core';

export class BEmpty extends BaseComponent {
  static get observedAttributes() { return ['icon', 'message', 'label-empty']; }

  static get styles() {
    return `
      :host { display: block; }
      .empty {
        display: flex; flex-direction: column; align-items: center; gap: var(--b-space-md, 0.75rem);
        padding: var(--b-space-3xl, 3rem); color: var(--b-text-muted);
      }
      .icon { font-size: var(--b-icon-xl, 2.5rem); opacity: var(--b-muted-opacity); }
      .message { font-size: var(--b-text-sm, 0.8125rem); }
    `;
  }

  render() {
    return `
      <div class="empty">
        <span class="icon">${this.attr('icon', '📭')}</span>
        <span class="message">${this.attr('message', this.attr('label-empty', 'Nothing here yet'))}</span>
        <slot></slot>
      </div>
    `;
  }
}

define('b-empty', BEmpty);
