import { BaseComponent, define } from 'birko-web-core';
import { spinSheet } from '../shared-styles';

export class BSpinner extends BaseComponent {
  static get observedAttributes() { return ['size']; }

  static get sharedStyles() {
    return [spinSheet];
  }

  static get styles() {
    return `
      :host { display: inline-flex; align-items: center; justify-content: center; }
      .spinner {
        border: 3px solid var(--b-border);
        border-top-color: var(--b-color-primary);
        border-radius: 50%;
        animation: spin var(--b-spinner-speed, 0.7s) linear infinite;
      }
      :host([size="sm"]) .spinner { width: var(--b-spinner-size-sm, 1rem); height: var(--b-spinner-size-sm, 1rem); border-width: 2px; }
      :host(:not([size])) .spinner, :host([size="md"]) .spinner { width: var(--b-spinner-size, 1.5rem); height: var(--b-spinner-size, 1.5rem); }
      :host([size="lg"]) .spinner { width: var(--b-spinner-size-lg, 2.5rem); height: var(--b-spinner-size-lg, 2.5rem); border-width: 4px; }
    `;
  }

  render() { return '<div class="spinner" role="status" aria-label="Loading"></div>'; }
}

define('b-spinner', BSpinner);
