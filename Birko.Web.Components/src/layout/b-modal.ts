import { BaseComponent, define } from 'birko-web-core';
import {
  dialogBaseSheet, closeButtonSheet,
  overlayHeaderSheet, overlayBodySheet, overlayFooterSheet,
} from '../shared-styles';

export class BModal extends BaseComponent {
  static get observedAttributes() { return ['title', 'size']; }

  private _previousFocus: HTMLElement | null = null;

  static get sharedStyles() {
    return [dialogBaseSheet, closeButtonSheet, overlayHeaderSheet, overlayBodySheet, overlayFooterSheet];
  }

  static get styles() {
    return `
      :host { display: contents; }
      .modal {
        background: var(--b-bg-elevated); border-radius: var(--b-radius-xl);
        box-shadow: var(--b-shadow-xl); width: 90%; max-width: var(--b-modal-width, 32.5rem);
        max-height: 85vh; display: flex; flex-direction: column;
      }
      :host([size="sm"]) .modal { max-width: var(--b-modal-width-sm, 23.75rem); }
      :host([size="lg"]) .modal { max-width: var(--b-modal-width-lg, 45rem); }
      :host([size="xl"]) .modal { max-width: var(--b-modal-width-xl, 60rem); }
    `;
  }

  render() {
    const title = this.attr('title');
    const titleId = 'modal-title-' + (this.id || 'default');
    return `
      <dialog id="dlg" role="dialog" aria-modal="true" aria-labelledby="${titleId}">
        <div class="modal">
          <div class="overlay-header">
            <span id="${titleId}">${title}</span>
            <button class="close-btn" aria-label="Close">&times;</button>
          </div>
          <div class="overlay-body"><slot></slot></div>
          <div class="overlay-footer"><slot name="footer"></slot></div>
        </div>
      </dialog>
    `;
  }

  protected onUpdated() {
    const dlg = this.$<HTMLDialogElement>('#dlg');
    if (!dlg) return;

    this.$('.close-btn')?.addEventListener('click', () => this.close());
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) this.close();
    });
    dlg.addEventListener('close', () => this.emit('close'));

    // Focus trap: Tab cycles within modal
    dlg.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const focusable = dlg.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first || this.shadowRoot?.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last || this.shadowRoot?.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    });
  }

  open() {
    this._previousFocus = document.activeElement as HTMLElement;
    const dlg = this.$<HTMLDialogElement>('#dlg');
    dlg?.showModal();

    // Auto-focus first focusable element inside modal
    requestAnimationFrame(() => {
      const first = dlg?.querySelector<HTMLElement>(
        'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not(.close-btn):not([disabled])'
      );
      if (first) first.focus();
    });
  }

  close() {
    this.$<HTMLDialogElement>('#dlg')?.close();
    // Restore focus to previously focused element
    this._previousFocus?.focus();
    this._previousFocus = null;
  }
}

define('b-modal', BModal);
