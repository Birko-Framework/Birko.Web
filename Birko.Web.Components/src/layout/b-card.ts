import { BaseComponent, define } from 'birko-web-core';

export class BCard extends BaseComponent {
  static get observedAttributes() { return ['header', 'padding']; }

  static get styles() {
    return `
      :host { display: block; }
      .card {
        background: var(--b-bg-elevated); border: var(--b-border-width, 1px) solid var(--b-border);
        border-radius: var(--b-radius-lg, 0.625rem); box-shadow: var(--b-shadow-sm);
        overflow: hidden;
      }
      .card-header {
        padding: var(--b-space-lg); border-bottom: var(--b-border-width, 1px) solid var(--b-border);
        font-weight: var(--b-font-weight-semibold, 600); font-size: var(--b-text-lg, 1rem);
        display: flex; align-items: center; justify-content: space-between;
      }
      .card-body { padding: var(--b-space-lg, 1rem); }
      :host([padding="none"]) .card-body { padding: 0; }
      :host([padding="sm"]) .card-body { padding: var(--b-space-sm, 0.5rem); }
      :host([padding="xl"]) .card-body { padding: var(--b-space-xl, 1.5rem); }
    `;
  }

  render() {
    const header = this.attr('header');
    return `
      <div class="card">
        ${header ? `<div class="card-header"><span>${header}</span><slot name="actions"></slot></div>` : ''}
        <div class="card-body"><slot></slot></div>
      </div>
    `;
  }
}

define('b-card', BCard);
