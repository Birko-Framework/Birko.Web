import { BaseComponent, define } from 'birko-web-core';
import {
  dialogBaseSheet, closeButtonSheet,
  overlayHeaderSheet, overlayBodySheet, overlayFooterSheet,
} from '../shared-styles';

export class BModal extends BaseComponent {
  static get observedAttributes() { return ['title', 'size', 'label-close']; }

  private _previousFocus: HTMLElement | null = null;

  private get _hasForm(): boolean {
    return this.querySelector('b-form') !== null;
  }

  static get sharedStyles() {
    return [dialogBaseSheet, closeButtonSheet, overlayHeaderSheet, overlayBodySheet, overlayFooterSheet];
  }

  static get styles() {
    return `
      :host { display: contents; }
      .modal {
        background: var(--b-bg-elevated); border-radius: var(--b-radius-xl);
        box-shadow: var(--b-shadow-xl); width: 90%; min-width: min(25rem, 95vw);
        max-width: var(--b-modal-width, 32.5rem);
        max-height: 85vh; display: flex; flex-direction: column;
      }
      :host([size="sm"]) .modal { max-width: var(--b-modal-width-sm, 23.75rem); }
      :host([size="lg"]) .modal { max-width: var(--b-modal-width-lg, 45rem); }
      :host([size="xl"]) .modal { max-width: var(--b-modal-width-xl, 60rem); }
      :host([size="xxl"]) .modal { max-width: var(--b-modal-width-xxl, 80rem); }
      /* full: an editor surface (WYSIWYG, complex form editor) — the viewport minus a
         gutter, in BOTH axes, so the body gets the full height too. Sized off the fixed
         dialog rather than 100vw/100dvh: those include the page scrollbar showModal()
         leaves in place, which would overflow horizontally. */
      :host([size="full"]) dialog {
        position: fixed; inset: var(--b-modal-full-inset, 2rem); margin: 0;
        /* The UA stylesheet sizes <dialog> as fit-content, which wins over the inset
           rectangle and collapses the box to its content — auto lets the insets resolve. */
        width: auto; height: auto;
      }
      :host([size="full"]) .modal {
        width: 100%; height: 100%;
        min-width: 0; max-width: none; max-height: none;
      }
      /* 40rem = 640px at a default 16px browser; rem in a media query tracks the reader's
         browser font size (a :root override does not affect it). */
      @media (max-width: 40rem) {
        /* No room for a gutter — go edge to edge and drop the corners. */
        :host([size="full"]) dialog { inset: 0; }
        :host([size="full"]) .modal { border-radius: 0; }
      }
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
    this.listen(dlg, 'click', (e) => {
      if (e.target === dlg && !this._hasForm) this.close();
    });
    this.listen(dlg, 'close', () => this.emit('close'));

    // Focus trap: Tab cycles within modal
    this.listen(dlg, 'keydown', (e: Event) => {
      const ke = e as KeyboardEvent;
      if (ke.key === 'Tab') {
        const focusable = dlg.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (ke.shiftKey) {
          if (document.activeElement === first || this.shadowRoot?.activeElement === first) {
            ke.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last || this.shadowRoot?.activeElement === last) {
            ke.preventDefault();
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
