import { BaseComponent, define } from 'birko-web-core';
import { dialogBaseSheet, overlayFooterSheet } from '../shared-styles';

export class BConfirmDialog extends BaseComponent {
  static get observedAttributes() {
    return ['title', 'message', 'confirm-text', 'cancel-text', 'variant'];
  }

  private _resolve: ((value: boolean) => void) | null = null;

  static get sharedStyles() {
    return [dialogBaseSheet, overlayFooterSheet];
  }

  static get styles() {
    return `
      :host { display: contents; }
      .dialog {
        background: var(--b-bg-elevated); border-radius: var(--b-radius-xl);
        box-shadow: var(--b-shadow-xl); width: 90%; max-width: var(--b-modal-width-sm, 23.75rem);
        display: flex; flex-direction: column;
      }
      .dialog-header {
        padding: var(--b-space-xl) var(--b-space-xl) var(--b-space-sm);
        font-weight: var(--b-font-weight-semibold); font-size: var(--b-text-lg);
      }
      .dialog-body {
        padding: var(--b-space-sm) var(--b-space-xl) var(--b-space-xl);
        color: var(--b-text-secondary); font-size: var(--b-text-base);
        line-height: var(--b-line-height);
      }
    `;
  }

  render() {
    const title = this.attr('title', 'Confirm');
    const message = this.attr('message');
    const confirmText = this.attr('confirm-text', 'Confirm');
    const cancelText = this.attr('cancel-text', 'Cancel');
    const variant = this.attr('variant', 'primary');
    return `
      <dialog id="dlg">
        <div class="dialog">
          <div class="dialog-header">${title}</div>
          <div class="dialog-body">${message}</div>
          <div class="overlay-footer">
            <b-button variant="secondary" class="btn-cancel">${cancelText}</b-button>
            <b-button variant="${variant}" class="btn-confirm">${confirmText}</b-button>
          </div>
        </div>
      </dialog>
    `;
  }

  protected onUpdated() {
    const dlg = this.$<HTMLDialogElement>('#dlg');
    if (!dlg) return;

    this.$('.btn-cancel')?.addEventListener('click', () => this._answer(false));
    this.$('.btn-confirm')?.addEventListener('click', () => this._answer(true));

    // Prevent ESC from closing without resolving — force explicit choice
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      this._answer(false);
    });
  }

  private _answer(value: boolean) {
    const resolve = this._resolve;
    this._resolve = null;
    this.$<HTMLDialogElement>('#dlg')?.close();
    resolve?.(value);
  }

  show(): Promise<boolean> {
    return new Promise((resolve) => {
      this._resolve = resolve;
      this.$<HTMLDialogElement>('#dlg')?.showModal();
    });
  }
}

define('b-confirm-dialog', BConfirmDialog);
