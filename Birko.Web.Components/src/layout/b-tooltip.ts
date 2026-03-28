import { BaseComponent, define } from 'birko-web-core';

export class BTooltip extends BaseComponent {
  static get observedAttributes() {
    return ['text', 'position'];
  }

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
        max-width: 16rem;
        width: max-content;
        z-index: 9999;
        pointer-events: none;
        line-height: 1.4;
      }
      .tip.visible { display: block; }
    `;
  }

  render() {
    const text = this.attr('text');

    return `
      <span class="trigger">
        <slot></slot>
      </span>
      ${text ? `<div class="tip" role="tooltip">${text}</div>` : ''}
    `;
  }

  protected onUpdated() {
    const trigger = this.$<HTMLElement>('.trigger');
    const tip = this.$<HTMLElement>('.tip');
    if (!trigger || !tip) return;

    this.listen(trigger, 'mouseenter', () => this._show(trigger, tip));
    this.listen(trigger, 'focusin', () => this._show(trigger, tip));
    this.listen(trigger, 'mouseleave', () => tip.classList.remove('visible'));
    this.listen(trigger, 'focusout', () => tip.classList.remove('visible'));
  }

  private _show(trigger: HTMLElement, tip: HTMLElement) {
    const rect = trigger.getBoundingClientRect();
    const pos = this.attr('position', 'top');

    // Show briefly to measure
    tip.style.visibility = 'hidden';
    tip.classList.add('visible');
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
    }

    tip.style.top = `${top}px`;
    tip.style.left = `${left}px`;
    tip.style.visibility = '';
  }
}

define('b-tooltip', BTooltip);
