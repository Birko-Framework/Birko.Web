import { BaseComponent, define } from 'birko-web-core';
import {
  dialogBaseSheet, closeButtonSheet,
  overlayHeaderSheet, overlayBodySheet, overlayFooterSheet,
} from '../shared-styles';
import { escapeHtml } from '../dom-utils';

export class BModal extends BaseComponent {
  static get observedAttributes() { return ['title', 'heading-level', 'size', 'label-close']; }

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
      /* The title is a heading for the document outline only: it keeps the header bar's type, as the <span> did. */
      .overlay-title { margin: 0; font: inherit; letter-spacing: inherit; }
      /* Viewport-relative width, not 90% — the <dialog> parent is UA-sized as fit-content, so a percentage
         resolves against a box derived from this very child and the card lands narrower than the dialog
         around it (see the same fix in b-confirm-dialog). Here it also fought min-width, so the card could
         come out WIDER than its <dialog> and slotted controls overhung the modal edge. */
      .modal {
        background: var(--b-bg-elevated); border-radius: var(--b-radius-xl);
        box-shadow: var(--b-shadow-xl); width: 90vw; min-width: min(25rem, 95vw);
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
    // h2 by default: a dialog sits under the page's h1. `heading-level` for one opened from deeper in the outline.
    const level = Number(this.attr('heading-level', '2'));
    const tag = Number.isInteger(level) && level >= 1 && level <= 6 ? `h${level}` : 'h2';
    // Text, never HTML: titles carry record and tenant names (TASK-580; b-toast's TASK-597 is the same defect).
    const heading = title
      ? `<${tag} id="${titleId}" class="overlay-title">${escapeHtml(title)}</${tag}>`
      : '<span></span>';
    return `
      <dialog id="dlg" role="dialog" aria-modal="true"${title ? ` aria-labelledby="${titleId}"` : ''}>
        <div class="modal">
          <div class="overlay-header">
            ${heading}
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

    // No Tab trap of our own: showModal() already makes the page behind inert and tabs through the slotted
    // content in flat-tree order. The custom trap queried this shadow tree only, so it saw just Close and
    // pinned focus there; nothing a consumer slotted in was reachable by keyboard (TASK-568).
  }

  open() {
    const dlg = this.$<HTMLDialogElement>('#dlg');
    // A no-op while open: consumers sync open() from state on every render, and a second call would pull focus
    // back to the first control and make a control inside the dialog the one close() returns to (TASK-573).
    if (dlg?.open) return;
    this._previousFocus = document.activeElement as HTMLElement;
    dlg?.showModal();

    // Start on the first content control, not the header's Close that showModal() picks. The content is
    // slotted, so look through the slots (and into a slotted b-button's own shadow root), not this tree.
    requestAnimationFrame(() => {
      for (const slot of this.$$<HTMLSlotElement>('.overlay-body slot, .overlay-footer slot')) {
        const first = firstFocusable(slot.assignedElements({ flatten: true }));
        if (first) { first.focus(); return; }
      }
    });
  }

  close() {
    this.$<HTMLDialogElement>('#dlg')?.close();
    // Restore focus to previously focused element
    this._previousFocus?.focus();
    this._previousFocus = null;
  }
}

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]';

/** First keyboard-focusable element in document order, descending into open shadow roots. */
function firstFocusable(elements: Iterable<Element>): HTMLElement | null {
  for (const el of elements) {
    if (!(el instanceof HTMLElement) || el.hidden) continue;
    // No boxes means not rendered, except display: contents, whose children still are.
    if (el.getClientRects().length === 0 && getComputedStyle(el).display !== 'contents') continue;
    if (el.matches(FOCUSABLE) && !el.matches(':disabled') && el.tabIndex >= 0) return el;
    const inner = (el.shadowRoot && firstFocusable(el.shadowRoot.children)) || firstFocusable(el.children);
    if (inner) return inner;
  }
  return null;
}

define('b-modal', BModal);
