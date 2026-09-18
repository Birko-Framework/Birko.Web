import { BaseComponent, define } from 'birko-web-core';
import { dialogBaseSheet, overlayFooterSheet } from '../shared-styles';
import { escapeHtml, escapeAttr } from '../dom-utils';

export class BConfirmDialog extends BaseComponent {
  static get observedAttributes() {
    return ['title', 'message', 'message-html', 'confirm-text', 'cancel-text', 'variant'];
  }

  private _resolve: ((value: boolean) => void) | null = null;

  static get sharedStyles() {
    return [dialogBaseSheet, overlayFooterSheet];
  }

  static get styles() {
    return `
      :host { display: contents; }
      /* Width is measured against the VIEWPORT, not the parent. The parent is the <dialog>, which the UA
         sizes as fit-content — so a percentage there resolves against a box whose width is itself derived
         from this child, and .dialog settled at 90% of its own content width. The visible card then sat 10%
         narrower than the <dialog> it lives in, pinned to the left of it: with the footer's
         justify-content:flex-end the buttons ended ~39px short of the dialog's right edge while starting 3px
         from its left, which reads as "the buttons are shifted left". Found on the Reps device pass
         2026-08-01, measured at 183px dialog / 165px card.
         vw does include a classic desktop scrollbar, but max-width caps this card well below 90vw on any
         screen wide enough to have one, so the difference is never visible. */
      .dialog {
        background: var(--b-bg-elevated); border-radius: var(--b-radius-xl);
        box-shadow: var(--b-shadow-xl); width: 90vw; max-width: var(--b-modal-width-sm, 23.75rem);
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
      /* On phones the two right-aligned compact buttons look cramped; make them
         equal-width and fill the footer row (flex:1 1 0 → same width regardless
         of label length). Desktop consumers keep the flex-end compact layout. */
      @media (max-width: 30rem) {
        .overlay-footer b-button { flex: 1 1 0; }
      }
    `;
  }

  render() {
    const title = this.label('title', 'bwc.confirm.title', 'Confirm');
    const message = this.attr('message');
    const confirmText = this.label('confirm-text', 'bwc.confirm.confirmText', 'Confirm');
    const cancelText = this.label('cancel-text', 'bwc.confirm.cancelText', 'Cancel');
    const variant = this.attr('variant', 'primary');
    // SECURITY: `message`/`title` are caller-supplied and often built from user data (e.g. a
    // member's username in a "remove {name}?" prompt). Render them as TEXT by default so markup
    // like `<img src=x onerror=…>` can never execute — matching the alert/prompt helpers, which
    // write their body via `textContent`. The opt-in `message-html` boolean attribute renders the
    // message as raw HTML for the rare intentional-markup case (`allowHtml` on the dialog helpers).
    const body = message ? (this.boolAttr('message-html') ? message : escapeHtml(message)) : '';
    return `
      <dialog id="dlg" aria-labelledby="${this.uid}-title" ${message ? `aria-describedby="${this.uid}-body"` : ''}>
        <div class="dialog">
          <div class="dialog-header" id="${this.uid}-title">${escapeHtml(title)}</div>
          <div class="dialog-body" id="${this.uid}-body">${body}</div>
          <div class="overlay-footer">
            <b-button variant="secondary" class="btn-cancel">${escapeHtml(cancelText)}</b-button>
            <b-button variant="${escapeAttr(variant)}" class="btn-confirm">${escapeHtml(confirmText)}</b-button>
          </div>
        </div>
      </dialog>
    `;
  }

  protected onUpdated() {
    const dlg = this.$<HTMLDialogElement>('#dlg');
    if (!dlg) return;

    const cancelBtn = this.$('.btn-cancel');
    if (cancelBtn) this.listen(cancelBtn, 'click', () => this._answer(false));
    const confirmBtn = this.$('.btn-confirm');
    if (confirmBtn) this.listen(confirmBtn, 'click', () => this._answer(true));

    // Prevent ESC from closing without resolving — force explicit choice
    this.listen(dlg, 'cancel', (e) => {
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
