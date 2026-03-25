import { BaseComponent, define } from 'birko-web-core';
import {
  dialogBaseSheet, closeButtonSheet,
  overlayHeaderSheet, overlayBodySheet, overlayFooterSheet,
} from '../shared-styles';

export class BModal extends BaseComponent {
  static get observedAttributes() { return ['title', 'size']; }

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
    return `
      <dialog id="dlg">
        <div class="modal">
          <div class="overlay-header">
            <span>${title}</span>
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
      // Close on backdrop click (click on dialog element itself, not children)
      if (e.target === dlg) this.close();
    });
    dlg.addEventListener('close', () => this.emit('close'));
  }

  open() {
    this.$<HTMLDialogElement>('#dlg')?.showModal();
  }

  close() {
    this.$<HTMLDialogElement>('#dlg')?.close();
  }
}

define('b-modal', BModal);
