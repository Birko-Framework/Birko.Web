import { BaseComponent, define } from 'birko-web-core';

/**
 * Visual cluster of related action buttons: a bordered, padded, rounded
 * container that reads as one unit (e.g. Start / Pause / Stop transport
 * controls). Purely presentational — slotted b-buttons keep their own
 * variant, size, and click handling. Pairs with <b-toolbar> for laying out
 * several clusters in a row.
 */
export class BButtonGroup extends BaseComponent {
  static get observedAttributes() { return ['label']; }

  static get styles() {
    return `
      :host { display: inline-flex; }
      .group {
        display: inline-flex; align-items: center; gap: var(--b-space-xs, 0.25rem);
        padding: var(--b-space-xs, 0.25rem);
        border: var(--b-border-width, 1px) solid var(--b-border);
        border-radius: var(--b-radius-lg, 0.625rem);
        background: var(--b-bg-secondary);
      }
    `;
  }

  render() {
    const label = this.attr('label');
    return `
      <div class="group" role="group"${label ? ` aria-label="${label}"` : ''}>
        <slot></slot>
      </div>
    `;
  }
}

define('b-button-group', BButtonGroup);
