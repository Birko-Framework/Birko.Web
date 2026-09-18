import { BaseComponent, define } from 'birko-web-core';

/**
 * Horizontal action bar: lays out <b-button-group> clusters (or free-standing
 * buttons) with a consistent gap and wrapping. Content in the `end` slot is
 * pushed to the far edge — the conventional spot for destructive or exit
 * actions, kept away from the primary controls.
 */
export class BToolbar extends BaseComponent {
  static get observedAttributes() { return ['label']; }

  static get styles() {
    return `
      :host { display: block; }
      .toolbar {
        display: flex; align-items: center; gap: var(--b-space-lg, 1rem);
        flex-wrap: wrap;
      }
      .end {
        display: flex; align-items: center; gap: var(--b-space-lg, 1rem);
        margin-left: auto;
      }
    `;
  }

  render() {
    const label = this.attr('label');
    return `
      <div class="toolbar" role="toolbar"${label ? ` aria-label="${label}"` : ''}>
        <slot></slot>
        <div class="end" style="display:none;"><slot name="end" id="end-slot"></slot></div>
      </div>
    `;
  }

  protected onUpdated() {
    // Hide the end container when nothing is slotted — an empty flex item
    // would otherwise add a phantom trailing gap (same pattern as b-card's
    // header/footer slots).
    const endSlot = this.shadowRoot?.querySelector('#end-slot') as HTMLSlotElement | null;
    const endDiv = endSlot?.closest('.end') as HTMLElement | null;
    if (endSlot && endDiv) {
      endDiv.style.display = endSlot.assignedNodes().length > 0 ? '' : 'none';
    }
  }

  protected onMount() {
    // Re-check slot visibility when slotted content changes
    this.shadowRoot?.querySelectorAll('slot').forEach(slot => {
      slot.addEventListener('slotchange', () => this.onUpdated());
    });
  }
}

define('b-toolbar', BToolbar);
