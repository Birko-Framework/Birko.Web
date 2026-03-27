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
      dialog {
        margin: 0;
        margin-left: auto;
        height: 100%;
        max-height: 100vh;
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
      @media (max-width: 640px) {
        .drawer { width: 100vw !important; }
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
            <button class="close-btn" aria-label="${this.attr('label-close', 'Close')}">&times;</button>
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

    // Backdrop click closes in modal mode
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg && this.boolAttr('modal')) this.close();
    });

    dlg.addEventListener('close', () => this.emit('close'));
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
