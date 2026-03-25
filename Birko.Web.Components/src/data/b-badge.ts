import { BaseComponent, define } from 'birko-web-core';

export class BBadge extends BaseComponent {
  static get observedAttributes() { return ['variant', 'size']; }

  static get styles() {
    return `
      :host { display: inline-block; }
      .badge {
        display: inline-flex; align-items: center; padding: 2px var(--b-space-sm);
        border-radius: var(--b-radius-full, 9999px); font-size: var(--b-text-xs, 0.6875rem);
        font-weight: var(--b-font-weight-medium, 500); line-height: 1.6; white-space: nowrap;
      }
      .primary { background: var(--b-color-primary-light); color: var(--b-color-primary); }
      .success { background: var(--b-color-success-light); color: var(--b-color-success); }
      .warning { background: var(--b-color-warning-light); color: var(--b-color-warning); }
      .danger { background: var(--b-color-danger-light); color: var(--b-color-danger); }
      .info { background: var(--b-color-info-light); color: var(--b-color-info); }
      .neutral { background: var(--b-bg-tertiary); color: var(--b-text-secondary); }
      :host([size="lg"]) .badge { padding: var(--b-space-xs) var(--b-space-md); font-size: var(--b-text-sm); }
    `;
  }

  render() {
    return `<span class="badge ${this.attr('variant', 'neutral')}"><slot></slot></span>`;
  }
}

define('b-badge', BBadge);
