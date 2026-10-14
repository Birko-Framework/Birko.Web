import { BaseComponent, define, escapeHtml } from 'birko-web-core';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';
export type ToastPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';

/**
 * A button rendered beside the toast's message. Clicking it dismisses the toast, then runs `onClick`.
 * `label` defaults to `bwc.common.undo` ("Undo"), the action this exists for.
 */
export interface ToastAction {
  label?: string;
  onClick: () => void | Promise<void>;
}

export interface ToastShowOptions {
  action?: ToastAction;
}

export interface NotifyOptions {
  variant?: ToastVariant;
  durationMs?: number;
  href?: string;
  icon?: string;
  action?: ToastAction;
}

/** Default lifetime of a toast that carries an action: long enough to read the message and reach the button. */
const ACTION_DURATION_MS = 10000;

export interface ToastConfig {
  /** Position for system toasts (show/success/error/warning/info). Default: 'bottom-right' */
  systemPosition?: ToastPosition;
  /** Position for notification toasts (notify). Default: 'top-right' */
  notifyPosition?: ToastPosition;
  /** Bottom offset for bottom-* positions (e.g. above status bar). Default: '2.75rem' */
  bottomOffset?: string;
}

/** Global toast manager — call toast.show() / toast.notify() from anywhere. */
class ToastManager {
  private _containers = new Map<string, HTMLElement>();
  private _systemPosition: ToastPosition = 'bottom-right';
  private _notifyPosition: ToastPosition = 'top-right';
  private _bottomOffset = '2.75rem';

  /** Configure toast positions. Call once during app boot. */
  configure(config: ToastConfig) {
    if (config.systemPosition) this._systemPosition = config.systemPosition;
    if (config.notifyPosition) this._notifyPosition = config.notifyPosition;
    if (config.bottomOffset) this._bottomOffset = config.bottomOffset;
    // Reset containers so they recreate with new positions
    this._containers.forEach(c => c.remove());
    this._containers.clear();
  }

  private _ensureContainer(id: string, position: ToastPosition): HTMLElement {
    let container = this._containers.get(id);
    if (!container) {
      container = document.createElement('div');
      container.id = id;
      container.setAttribute('role', 'status');
      container.setAttribute('aria-live', id === 'b-toast-system' ? 'polite' : 'polite');
      container.setAttribute('aria-atomic', 'false');

      const isTop = position.startsWith('top');
      const isLeft = position.endsWith('left');
      const offset = 'var(--b-toast-offset, var(--b-space-lg, 1rem))';

      Object.assign(container.style, {
        position: 'fixed',
        [isTop ? 'top' : 'bottom']: isTop ? offset : this._bottomOffset,
        [isLeft ? 'left' : 'right']: offset,
        display: 'flex',
        flexDirection: isTop ? 'column' : 'column-reverse',
        gap: 'var(--b-space-sm, 0.5rem)',
        zIndex: 'var(--b-z-toast, 500)',
        pointerEvents: 'none',
      });

      document.body.appendChild(container);
      this._containers.set(id, container);
    }
    return container;
  }

  private _add(container: HTMLElement, message: string, variant: ToastVariant, durationMs: number, href?: string, icon?: string, action?: ToastAction): BToastItem {
    const el = document.createElement('b-toast-item') as BToastItem;
    el.setAttribute('variant', variant);
    el.setAttribute('message', message);
    if (href) el.setAttribute('href', href);
    if (icon) el.setAttribute('icon', icon);
    // A property, not an attribute: a callback cannot be serialised. Set before connecting so the first render has it.
    if (action) el.action = action;
    container.appendChild(el);
    el.autoDismiss(durationMs);
    return el;
  }

  /**
   * System feedback (default: bottom-right). Immediate action confirmation.
   * `durationMs` defaults to 4 s, or 10 s when the toast carries an `action`.
   */
  show(message: string, variant: ToastVariant = 'info', durationMs?: number, options: ToastShowOptions = {}): BToastItem {
    const { action } = options;
    return this._add(this._ensureContainer('b-toast-system', this._systemPosition), message, variant,
      durationMs ?? (action ? ACTION_DURATION_MS : 4000), undefined, undefined, action);
  }

  success(msg: string) { this.show(msg, 'success'); }
  error(msg: string) { this.show(msg, 'error', 6000); }
  warning(msg: string) { this.show(msg, 'warning'); }
  info(msg: string) { this.show(msg, 'info'); }

  /** User notifications (default: top-right). SSE/push events, click to navigate. */
  notify(message: string, options: NotifyOptions = {}): BToastItem {
    const { variant = 'info', href, icon, action } = options;
    const durationMs = options.durationMs ?? (action ? ACTION_DURATION_MS : 8000);
    return this._add(this._ensureContainer('b-toast-notify', this._notifyPosition), message, variant, durationMs, href, icon, action);
  }
}

export const toast = new ToastManager();

/** What is left of a paused toast's lifetime is never less than this, so leaving it gives time to see it go. */
const MIN_REMAINING_MS = 1000;

export class BToastItem extends BaseComponent {
  static get observedAttributes() { return ['variant', 'message', 'href', 'icon', 'label-dismiss', 'label-action']; }

  /** The toast's action button, if any. Set before the item is connected. */
  action: ToastAction | null = null;

  private _remaining = 0;
  private _deadline = 0;
  private _timer: ReturnType<typeof setTimeout> | null = null;
  private _hovered = false;
  private _focused = false;

  constructor() {
    super();
    // Raw listeners for the item's whole life, not `this.listen` (aborted on every update()). A toast the user is
    // pointing at or has focus in does not disappear under them (WCAG 2.2.1); it resumes when they leave.
    this.addEventListener('pointerenter', () => { this._hovered = true; this._pause(); });
    this.addEventListener('pointerleave', () => { this._hovered = false; this._resume(); });
    this.addEventListener('focusin', () => { this._focused = true; this._pause(); });
    this.addEventListener('focusout', () => { this._focused = false; this._resume(); });
  }

  /** Start the lifetime timer. Paused while hovered or focused. A non-positive or non-finite value never dismisses. */
  autoDismiss(ms: number): void {
    if (!(ms > 0) || !Number.isFinite(ms)) return;
    this._remaining = ms;
    this._resume();
  }

  /** Fade out and remove. */
  dismiss(): void {
    this._clearTimer();
    this._remaining = 0;
    this.classList.add('fade-out');
    setTimeout(() => this.remove(), 300);
  }

  /** Move focus to the action button. Returns false when the toast has none. */
  focusAction(): boolean {
    const btn = this.$<HTMLButtonElement>('.action');
    if (!btn) return false;
    btn.focus();
    return true;
  }

  private _pause(): void {
    if (!this._timer) return;
    this._clearTimer();
    this._remaining = Math.max(this._deadline - Date.now(), MIN_REMAINING_MS);
  }

  private _resume(): void {
    if (this._hovered || this._focused || this._timer || this._remaining <= 0) return;
    this._deadline = Date.now() + this._remaining;
    this._timer = setTimeout(() => { this._timer = null; this.dismiss(); }, this._remaining);
  }

  private _clearTimer(): void {
    if (this._timer) clearTimeout(this._timer);
    this._timer = null;
  }

  static get styles() {
    return `
      :host {
        display: block; pointer-events: auto;
        min-width: var(--b-toast-min-width, 17.5rem); max-width: var(--b-toast-max-width, 26.25rem);
        animation: slide-in var(--b-transition) ease;
        transition: opacity var(--b-transition-slow), transform var(--b-transition-slow);
      }
      :host(.fade-out) { opacity: 0; transform: translateX(20px); }
      .toast {
        display: flex; align-items: center; gap: var(--b-space-sm);
        padding: var(--b-space-md) var(--b-space-lg);
        border-radius: var(--b-radius-lg); box-shadow: var(--b-shadow-lg);
        font-size: var(--b-text-sm); font-weight: var(--b-font-weight-medium);
        cursor: default;
      }
      :host([href]) .toast { cursor: pointer; }
      .success { background: var(--b-color-success); color: var(--b-text-on-success, var(--b-text-inverse)); }
      .error { background: var(--b-color-danger); color: var(--b-text-on-danger, var(--b-text-inverse)); }
      .warning { background: var(--b-color-warning); color: var(--b-text-on-warning, var(--b-text-inverse)); }
      .info { background: var(--b-color-info); color: var(--b-text-on-info, var(--b-text-inverse)); }
      .icon { flex-shrink: 0; }
      .msg { flex: 1; }
      .action {
        flex-shrink: 0; background: none; color: inherit; cursor: pointer;
        border: 1px solid currentColor; border-radius: var(--b-radius); padding: var(--b-space-xs) var(--b-space-sm);
        font: inherit; font-weight: var(--b-font-weight-semibold, 600);
      }
      .action:hover { background: color-mix(in srgb, currentColor 15%, transparent); }
      .action:focus-visible, .close:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
      .close { background: none; border: none; color: inherit; cursor: pointer; opacity: 0.7; font-size: var(--b-icon-base); margin-left: auto; flex-shrink: 0; }
      .close:hover { opacity: 1; }
      @keyframes slide-in { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: none; } }
    `;
  }

  render() {
    const icon = this.attr('icon');
    const variant = this.attr('variant', 'info');
    const role = variant === 'error' ? 'alert' : 'status';
    const live = variant === 'error' ? 'assertive' : 'polite';
    return `
      <div class="toast ${variant}" role="${role}" aria-live="${live}">
        ${icon ? `<span class="icon" aria-hidden="true">${escapeHtml(icon)}</span>` : ''}
        <span class="msg">${escapeHtml(this.attr('message'))}</span>
        ${this.action ? `<button type="button" class="action">${escapeHtml(this.action.label ?? this.label('label-action', 'bwc.common.undo', 'Undo'))}</button>` : ''}
        <button class="close" aria-label="${this.label('label-dismiss', 'bwc.common.dismiss', 'Dismiss')}">&times;</button>
      </div>
    `;
  }

  protected onUpdated() {
    const closeBtn = this.$('.close');
    if (closeBtn) this.listen(closeBtn, 'click', (e: Event) => {
      e.stopPropagation();
      this.remove();
    });

    const actionBtn = this.$('.action');
    const action = this.action;
    if (actionBtn && action) this.listen(actionBtn, 'click', (e: Event) => {
      e.stopPropagation();
      // Dismissed first, so a slow callback cannot be started twice. A throw is reported, never swallowed.
      this.dismiss();
      Promise.resolve().then(() => action.onClick()).catch((err) => console.error('b-toast: action threw', err));
    });

    const href = this.attr('href');
    if (href) {
      const toastEl = this.$('.toast');
      if (toastEl) this.listen(toastEl, 'click', () => {
        window.location.hash = href.startsWith('#') ? href : `#${href}`;
        this.remove();
      });
    }
  }
}

define('b-toast-item', BToastItem);
