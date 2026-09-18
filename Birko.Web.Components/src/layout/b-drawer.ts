import { BaseComponent, define } from 'birko-web-core';
import {
  dialogBaseSheet, closeButtonSheet,
  overlayHeaderSheet, overlayBodySheet, overlayFooterSheet,
} from '../shared-styles';

export class BDrawer extends BaseComponent {
  static get observedAttributes() { return ['title', 'size', 'modal', 'label-close']; }

  static get sharedStyles() {
    return [dialogBaseSheet, closeButtonSheet, overlayHeaderSheet, overlayBodySheet, overlayFooterSheet];
  }

  static get styles() {
    return `
      :host { display: contents; }
      /* Pin to the right edge of the viewport regardless of modal/non-modal mode.
         Without position:fixed, dialog.show() (non-modal) flows inline and pushes
         surrounding content; showModal() is fine because the top layer promotes it,
         but we want both modes to look the same visually. */
      dialog {
        position: fixed;
        inset: 0 0 0 auto;
        margin: 0;
        height: 100%;
        max-height: 100vh;
        z-index: var(--b-z-drawer, 260);
      }
      dialog::backdrop {
        background: var(--b-backdrop-bg-light, rgba(0, 0, 0, 0.15));
      }
      :host([modal]) dialog::backdrop {
        background: var(--b-backdrop-bg);
      }
      .drawer {
        width: var(--b-drawer-width, 30rem);
        height: 100%;
        background: var(--b-bg-elevated);
        box-shadow: var(--b-shadow-xl);
        display: flex; flex-direction: column;
      }
      :host([size="sm"]) .drawer { width: var(--b-drawer-width-sm, 22.5rem); }
      :host([size="lg"]) .drawer { width: var(--b-drawer-width-lg, 40rem); }
      :host([size="xl"]) .drawer { width: var(--b-drawer-width-xl, 53.75rem); }
      :host([size="xxl"]) .drawer { width: var(--b-drawer-width-xxl, 72.5rem); }
      /* Full-bleed on phones. 40rem = the old 640px at a default 16px browser; rem in a
         media query tracks the reader's browser font size (a :root override does not).
         The box comes from the dialog's own inset rather than "width: 100vw" on .drawer —
         100vw includes the page scrollbar, which pushed the drawer past the right edge.
         "width: auto" is required because the UA stylesheet sizes <dialog> as fit-content,
         which would beat the inset rectangle. The !important keeps this above the
         higher-specificity ":host([size=…]) .drawer" width rules. */
      @media (max-width: 40rem) {
        dialog { inset: 0; width: auto; }
        .drawer { width: 100% !important; }
      }
      .overlay-footer:empty { display: none; }
    `;
  }

  render() {
    const title = this.attr('title');
    return `
      <dialog id="dlg">
        <div class="drawer">
          <div class="overlay-header">
            <span>${title}</span>
            <button class="close-btn" aria-label="${this.label('label-close', 'bwc.common.close', 'Close')}">&times;</button>
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

    const closeBtn = this.$('.close-btn');
    if (closeBtn) this.listen(closeBtn, 'click', () => this.close());

    // Backdrop click closes in modal mode
    this.listen(dlg, 'click', (e) => {
      if (e.target === dlg && this.boolAttr('modal')) this.close();
    });

    this.listen(dlg, 'close', () => this.emit('close'));
  }

  open() {
    const dlg = this.$<HTMLDialogElement>('#dlg');
    if (!dlg) return;

    if (this.boolAttr('modal')) {
      dlg.showModal();
    } else {
      dlg.show();
    }
  }

  close() {
    this.$<HTMLDialogElement>('#dlg')?.close();
  }
}

define('b-drawer', BDrawer);
