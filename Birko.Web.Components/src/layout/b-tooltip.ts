import { BaseComponent, define } from 'birko-web-core';
import { escapeHtml } from '../dom-utils';

/** What {@link BTooltip.showFor} shows. Every field is text, never markup. */
export interface TooltipContent {
  heading?: string;
  text?: string;
  shortcut?: string;
}

/**
 * A tooltip for its slotted trigger, or — through {@link showFor} — for an element it does not wrap, such as a command
 * inside another component's shadow root (b-ribbon holds one and points it at the hovered command).
 *
 * `theme="light"` is a card in the page's surface colours; the default is the dark bubble. `heading` and `shortcut`
 * are text. `text` keeps its old meaning (inserted as markup) when used alone, for the controls that already pass it.
 */
export class BTooltip extends BaseComponent {
  static get observedAttributes() {
    return ['text', 'position', 'heading', 'shortcut', 'theme'];
  }

  private _floating: TooltipContent | null = null;

  static get styles() {
    return `
      :host { display: inline-flex; position: relative; cursor: help; }
      .trigger { display: inline-flex; align-items: center; }
      .tip {
        display: none;
        position: fixed;
        padding: var(--b-space-xs, 0.25rem) var(--b-space-sm, 0.5rem);
        background: var(--b-tooltip-bg, #1e293b);
        color: var(--b-tooltip-text, #e2e8f0);
        border: var(--b-border-width, 1px) solid var(--b-tooltip-border, #334155);
        border-radius: var(--b-radius, 0.375rem);
        box-shadow: var(--b-shadow-md);
        font-size: var(--b-text-xs, 0.6875rem);
        white-space: normal;
        max-width: var(--b-tooltip-max-width, 16rem);
        width: max-content;
        z-index: 9999;
        pointer-events: none;
        line-height: 1.4;
      }
      .tip.visible { display: block; }
      /* Anchored mode is a manual POPOVER, so it is drawn in the top layer — above a popover the anchor sits in (a
         ribbon flyout), which a z-index cannot reach. Closed, it stays display:none like the inline tip. */
      .tip.floating { margin: 0; inset: auto; }
      .tip.floating:popover-open { display: block; }
      .tip-heading { font-weight: var(--b-font-weight-semibold, 600); }
      .tip-shortcut { opacity: 0.8; }
      .tip-title + .tip-text { margin-top: 0.125rem; }
      :host([theme="light"]) .tip {
        background: var(--b-bg-elevated);
        color: var(--b-text);
        border-color: var(--b-border);
        font-size: var(--b-text-sm, 0.8125rem);
        padding: var(--b-space-sm, 0.5rem) var(--b-space-sm, 0.5rem);
      }
      :host([theme="light"]) .tip-shortcut { color: var(--b-text-muted); opacity: 1; }
      :host([theme="light"]) .tip-title + .tip-text { color: var(--b-text-secondary); margin-top: var(--b-space-xs, 0.25rem); }
    `;
  }

  /**
   * Shows the tooltip next to `anchor` with `content`, as a top-layer popover. For components that cannot wrap each
   * trigger in a b-tooltip; they own the timing (hover delay, focus) and call {@link hide}. The anchor's accessible
   * description is the caller's to set: an IDREF cannot cross into this shadow root.
   */
  showFor(anchor: HTMLElement, content: TooltipContent) {
    this._floating = content;
    this.update();
    const tip = this.$<HTMLElement>('.tip');
    if (!tip || !anchor.isConnected) return;
    tip.style.visibility = 'hidden';
    if (!tip.matches(':popover-open')) tip.showPopover();
    this._place(anchor.getBoundingClientRect(), tip);
  }

  hide() {
    const tip = this.$<HTMLElement>('.tip');
    if (tip?.matches(':popover-open')) tip.hidePopover();
    tip?.classList.remove('visible');
  }

  /** Whether the tooltip is currently shown (in either mode). */
  get shown(): boolean {
    const tip = this.$<HTMLElement>('.tip');
    return !!tip && (tip.matches(':popover-open') || tip.classList.contains('visible'));
  }

  render() {
    const tipId = `${this.uid}-tip`;
    if (this._floating) {
      return `<slot></slot><div class="tip floating" id="${tipId}" popover="manual" role="tooltip">${this._content(this._floating, true)}</div>`;
    }
    const text = this.attr('text');
    const heading = this.attr('heading');
    const shortcut = this.attr('shortcut');
    const has = !!(text || heading || shortcut);
    return `
      <span class="trigger" ${has ? `aria-describedby="${tipId}"` : ''}>
        <slot></slot>
      </span>
      ${has ? `<div class="tip" id="${tipId}" role="tooltip">${this._content({ heading, text, shortcut }, false)}</div>` : ''}
    `;
  }

  /** `text` alone keeps the old markup behaviour (trusted callers); in the structured form every part is text. */
  private _content(c: TooltipContent, escapeText: boolean): string {
    if (!c.heading && !c.shortcut) return escapeText ? escapeHtml(c.text ?? '') : (c.text ?? '');
    const title = `<div class="tip-title">${c.heading ? `<span class="tip-heading">${escapeHtml(c.heading)}</span>` : ''}`
      + `${c.shortcut ? ` <span class="tip-shortcut">(${escapeHtml(c.shortcut)})</span>` : ''}</div>`;
    return `${title}${c.text ? `<div class="tip-text">${escapeHtml(c.text)}</div>` : ''}`;
  }

  protected onUpdated() {
    if (this._floating) return;
    const trigger = this.$<HTMLElement>('.trigger');
    const tip = this.$<HTMLElement>('.tip');
    if (!trigger || !tip) return;

    this.listen(trigger, 'mouseenter', () => this._show(trigger, tip));
    this.listen(trigger, 'focusin', () => this._show(trigger, tip));
    this.listen(trigger, 'mouseleave', () => tip.classList.remove('visible'));
    this.listen(trigger, 'focusout', () => tip.classList.remove('visible'));
  }

  private _show(trigger: HTMLElement, tip: HTMLElement) {
    // Show briefly to measure
    tip.style.visibility = 'hidden';
    tip.classList.add('visible');
    this._place(trigger.getBoundingClientRect(), tip);
  }

  private _place(rect: DOMRect, tip: HTMLElement) {
    const pos = this.attr('position', 'top');
    const tipRect = tip.getBoundingClientRect();

    let top: number;
    let left: number;

    switch (pos) {
      case 'bottom':
        top = rect.bottom + 6;
        left = rect.left;
        break;
      case 'left':
        top = rect.top + rect.height / 2 - tipRect.height / 2;
        left = rect.left - tipRect.width - 6;
        break;
      case 'right':
        top = rect.top + rect.height / 2 - tipRect.height / 2;
        left = rect.right + 6;
        break;
      default: // top
        top = rect.top - tipRect.height - 6;
        left = rect.left;
        break;
    }

    // Clamp to viewport
    if (left + tipRect.width > window.innerWidth - 8) {
      left = window.innerWidth - tipRect.width - 8;
    }
    if (left < 8) left = 8;
    if (top < 8) {
      // Flip to bottom
      top = rect.bottom + 6;
    } else if (top + tipRect.height > window.innerHeight - 8 && pos === 'bottom') {
      // Flip to top
      top = Math.max(8, rect.top - tipRect.height - 6);
    }

    tip.style.top = `${top}px`;
    tip.style.left = `${left}px`;
    tip.style.visibility = '';
  }
}

define('b-tooltip', BTooltip);
