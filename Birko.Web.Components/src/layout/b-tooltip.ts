import { BaseComponent, define } from 'birko-web-core';

export class BTooltip extends BaseComponent {
  static get observedAttributes() {
    return ['text', 'position'];
  }

  private _showTimer: ReturnType<typeof setTimeout> | null = null;
  private _hideTimer: ReturnType<typeof setTimeout> | null = null;

  static get styles() {
    return `
      :host { display: inline-block; position: relative; }
      .trigger { display: inline-block; }
      .tip {
        position: absolute;
        padding: var(--b-space-xs, 0.25rem) var(--b-space-sm, 0.5rem);
        background: var(--b-bg-elevated);
        border: var(--b-border-width, 1px) solid var(--b-border);
        border-radius: var(--b-radius, 0.375rem);
        box-shadow: var(--b-shadow-md);
        font-size: var(--b-text-xs, 0.6875rem);
        color: var(--b-text);
        white-space: nowrap;
        max-width: 15rem;
        pointer-events: none;
        z-index: 1;
      }
      .tip:popover-open { display: block; }
      /* Arrow — 4px CSS triangle */
      .arrow {
        position: absolute;
        width: 0.5rem;
        height: 0.5rem;
        background: var(--b-bg-elevated);
        border: var(--b-border-width, 1px) solid var(--b-border);
        transform: rotate(45deg);
      }
      /* Position: top (default) */
      :host(:not([position])) .tip, :host([position="top"]) .tip {
        bottom: 100%;
        left: 50%;
        transform: translateX(-50%);
        margin-bottom: var(--b-space-xs, 0.25rem);
      }
      :host(:not([position])) .arrow, :host([position="top"]) .arrow {
        bottom: -0.3125rem;
        left: 50%;
        transform: translateX(-50%) rotate(45deg);
        border-top: none;
        border-left: none;
      }
      /* Position: bottom */
      :host([position="bottom"]) .tip {
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        margin-top: var(--b-space-xs, 0.25rem);
      }
      :host([position="bottom"]) .arrow {
        top: -0.3125rem;
        left: 50%;
        transform: translateX(-50%) rotate(45deg);
        border-bottom: none;
        border-right: none;
      }
      /* Position: left */
      :host([position="left"]) .tip {
        right: 100%;
        top: 50%;
        transform: translateY(-50%);
        margin-right: var(--b-space-xs, 0.25rem);
      }
      :host([position="left"]) .arrow {
        right: -0.3125rem;
        top: 50%;
        transform: translateY(-50%) rotate(45deg);
        border-bottom: none;
        border-left: none;
      }
      /* Position: right */
      :host([position="right"]) .tip {
        left: 100%;
        top: 50%;
        transform: translateY(-50%);
        margin-left: var(--b-space-xs, 0.25rem);
      }
      :host([position="right"]) .arrow {
        left: -0.3125rem;
        top: 50%;
        transform: translateY(-50%) rotate(45deg);
        border-top: none;
        border-right: none;
      }
    `;
  }

  render() {
    const text = this.attr('text');
    const tipId = 'tip-' + (this.id || 'tt');

    return `
      <span class="trigger">
        <slot></slot>
      </span>
      ${text ? `
        <div class="tip" id="${tipId}" popover="manual" role="tooltip">
          <span class="arrow"></span>
          ${text}
        </div>
      ` : ''}
    `;
  }

  protected onUpdated() {
    const trigger = this.$<HTMLElement>('.trigger');
    const tip = this.$<HTMLElement>('.tip');
    if (!trigger || !tip) return;

    trigger.addEventListener('mouseenter', () => this._scheduleShow(tip));
    trigger.addEventListener('focusin', () => this._scheduleShow(tip));
    trigger.addEventListener('mouseleave', () => this._scheduleHide(tip));
    trigger.addEventListener('focusout', () => this._scheduleHide(tip));
  }

  protected onUnmount() {
    if (this._showTimer) clearTimeout(this._showTimer);
    if (this._hideTimer) clearTimeout(this._hideTimer);
  }

  private _scheduleShow(tip: HTMLElement) {
    if (this._hideTimer) { clearTimeout(this._hideTimer); this._hideTimer = null; }
    this._showTimer = setTimeout(() => {
      tip.showPopover();
    }, 300);
  }

  private _scheduleHide(tip: HTMLElement) {
    if (this._showTimer) { clearTimeout(this._showTimer); this._showTimer = null; }
    this._hideTimer = setTimeout(() => {
      tip.hidePopover();
    }, 100);
  }
}

define('b-tooltip', BTooltip);
