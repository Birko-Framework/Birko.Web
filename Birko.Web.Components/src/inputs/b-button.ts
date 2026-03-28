import { BaseComponent, define } from 'birko-web-core';
import { spinSheet } from '../shared-styles';

export class BButton extends BaseComponent {
  static get observedAttributes() {
    return ['variant', 'size', 'disabled', 'loading'];
  }

  static get sharedStyles() {
    return [spinSheet];
  }

  static get styles() {
    return `
      :host { display: inline-block; }
      :host([hidden]) { display: none; }
      button {
        display: inline-flex; align-items: center; justify-content: center; gap: var(--b-space-sm);
        width: 100%; box-sizing: border-box;
        padding: var(--b-space-sm) var(--b-space-lg);
        border: var(--b-border-width, 1px) solid transparent;
        border-radius: var(--b-radius);
        font-size: var(--b-text-sm); font-weight: var(--b-font-weight-medium);
        cursor: pointer; transition: all var(--b-transition);
        line-height: var(--b-line-height-tight, 1.4); white-space: nowrap;
      }
      button:disabled, button.loading { opacity: var(--b-disabled-opacity); cursor: not-allowed; pointer-events: none; }
      /* Variants */
      .primary { background: var(--b-color-primary); color: var(--b-text-inverse); }
      .primary:hover { background: var(--b-color-primary-hover); }
      .secondary { background: var(--b-bg-tertiary); color: var(--b-text); border-color: var(--b-border); }
      .secondary:hover { background: var(--b-border); }
      .danger { background: var(--b-color-danger); color: var(--b-text-inverse); }
      .danger:hover { background: var(--b-color-danger-hover); }
      .ghost { background: transparent; color: var(--b-text-secondary); }
      .ghost:hover { background: var(--b-bg-tertiary); }
      /* Sizes */
      .sm { padding: var(--b-space-xs) var(--b-space-sm); font-size: var(--b-text-xs); }
      .lg { padding: var(--b-space-sm) var(--b-space-xl); font-size: var(--b-text-base); }
      .spinner {
        width: var(--b-icon-sm, 0.875rem); height: var(--b-icon-sm, 0.875rem);
        border: 2px solid currentColor; border-top-color: transparent;
        border-radius: 50%; animation: spin var(--b-spinner-speed, 0.7s) linear infinite;
      }
    `;
  }

  render() {
    const variant = this.attr('variant', 'primary');
    const size = this.attr('size', '');
    const loading = this.boolAttr('loading');
    return `
      <button class="${variant} ${size}" ${this.boolAttr('disabled') || loading ? 'disabled' : ''} ${loading ? 'class="loading"' : ''}>
        ${loading ? '<span class="spinner"></span>' : ''}
        <slot></slot>
      </button>
    `;
  }

  protected onUpdated() {
    // Re-slot light DOM children
    const slot = this.$('slot');
    if (slot) {
      const btn = this.$('button');
      if (btn && !btn.querySelector('slot')) {
        btn.appendChild(slot);
      }
    }
  }
}

define('b-button', BButton);
