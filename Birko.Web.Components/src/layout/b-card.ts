import { BaseComponent, define } from 'birko-web-core';

export class BCard extends BaseComponent {
  static get observedAttributes() { return ['header', 'padding']; }

  static get styles() {
    return `
      :host { display: block; }
      .card {
        background: var(--b-bg-elevated); border: var(--b-border-width, 1px) solid var(--b-border);
        border-radius: var(--b-radius-lg, 0.625rem);
        /*
         * Elevation is a per-instance axis (flat vs raised), so it is a card token rather than a baked-in
         * value — the component already lets a consumer retint --b-card-header-bg / --b-card-header-text, and
         * fixing the shadow while exposing the header colour is an inconsistent line to draw. The alternative,
         * overriding --b-shadow-sm to flatten one card, silently flattens every other component in scope.
         * Defaults to --b-shadow-sm, so an existing card is unchanged.
         */
        box-shadow: var(--b-card-shadow, var(--b-shadow-sm));
        overflow: hidden; display: flex; flex-direction: column;
      }
      .card-header {
        padding: var(--b-space-md, 0.75rem) var(--b-space-lg, 1rem);
        border-bottom: var(--b-border-width, 1px) solid var(--b-border);
        background: var(--b-card-header-bg, transparent);
        color: var(--b-card-header-text, var(--b-text));
        font-family: var(--b-font-heading, var(--b-font));
        font-weight: var(--b-font-weight-semibold, 600); font-size: var(--b-text-lg, 1rem);
        display: flex; align-items: center; justify-content: space-between;
        flex-shrink: 0;
      }
      /* none | sm | md | lg (default) | xl — the --b-space-* scale, one rung each. md was missing from an
         otherwise complete ladder, so a card wanting the 12px rung had to round up to lg. */
      .card-body { padding: var(--b-space-lg, 1rem); flex: 1; }
      :host([padding="none"]) .card-body { padding: 0; }
      :host([padding="sm"]) .card-body { padding: var(--b-space-sm, 0.5rem); }
      :host([padding="md"]) .card-body { padding: var(--b-space-md, 0.75rem); }
      :host([padding="xl"]) .card-body { padding: var(--b-space-xl, 1.5rem); }
      .card-footer {
        padding: var(--b-space-sm, 0.5rem) var(--b-space-lg, 1rem);
        border-top: var(--b-border-width, 1px) solid var(--b-border);
        font-size: var(--b-text-xs, 0.6875rem);
        color: var(--b-text-muted);
        flex-shrink: 0;
      }
      /* Hide header/footer slots when empty */
      .card-header-slot, .card-footer-slot { display: none; }
      ::slotted([slot="header"]) { display: contents; }
      ::slotted([slot="footer"]) { display: contents; }
    `;
  }

  render() {
    const headerAttr = this.attr('header');
    // Text header attribute takes precedence; slot header is used when no attribute
    const hasTextHeader = !!headerAttr;

    return `
      <div class="card">
        ${hasTextHeader
          ? `<div class="card-header"><span>${headerAttr}</span><slot name="actions"></slot></div>`
          : '<div class="card-header" style="display:none;"><slot name="header" id="header-slot"></slot><slot name="actions"></slot></div>'
        }
        <div class="card-body"><slot></slot></div>
        <div class="card-footer" style="display:none;"><slot name="footer" id="footer-slot"></slot></div>
      </div>
    `;
  }

  protected onUpdated() {
    // Show/hide header slot container based on whether slotted content exists
    if (!this.attr('header')) {
      const headerSlot = this.shadowRoot?.querySelector('#header-slot') as HTMLSlotElement | null;
      const headerDiv = headerSlot?.closest('.card-header') as HTMLElement | null;
      if (headerSlot && headerDiv) {
        const hasContent = headerSlot.assignedNodes().length > 0;
        headerDiv.style.display = hasContent ? '' : 'none';
      }
    }

    // Show/hide footer container based on whether slotted content exists
    const footerSlot = this.shadowRoot?.querySelector('#footer-slot') as HTMLSlotElement | null;
    const footerDiv = footerSlot?.closest('.card-footer') as HTMLElement | null;
    if (footerSlot && footerDiv) {
      const hasContent = footerSlot.assignedNodes().length > 0;
      footerDiv.style.display = hasContent ? '' : 'none';
    }
  }

  protected onMount() {
    // Re-check slot visibility when slotted content changes
    this.shadowRoot?.querySelectorAll('slot').forEach(slot => {
      slot.addEventListener('slotchange', () => this.onUpdated());
    });
  }
}

define('b-card', BCard);
