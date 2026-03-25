import { BaseComponent, define } from 'birko-web-core';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';
export type ToastPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';

export interface NotifyOptions {
  variant?: ToastVariant;
  durationMs?: number;
  href?: string;
  icon?: string;
}

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

  private _add(container: HTMLElement, message: string, variant: ToastVariant, durationMs: number, href?: string, icon?: string) {
    const el = document.createElement('b-toast-item') as BToastItem;
    el.setAttribute('variant', variant);
    el.setAttribute('message', message);
    if (href) el.setAttribute('href', href);
    if (icon) el.setAttribute('icon', icon);
    container.appendChild(el);

    setTimeout(() => {
      el.classList.add('fade-out');
      setTimeout(() => el.remove(), 300);
    }, durationMs);
  }

  /** System feedback (default: bottom-right). Immediate action confirmation. */
  show(message: string, variant: ToastVariant = 'info', durationMs = 4000): void {
    this._add(this._ensureContainer('b-toast-system', this._systemPosition), message, variant, durationMs);
  }

  success(msg: string) { this.show(msg, 'success'); }
  error(msg: string) { this.show(msg, 'error', 6000); }
  warning(msg: string) { this.show(msg, 'warning'); }
  info(msg: string) { this.show(msg, 'info'); }

  /** User notifications (default: top-right). SSE/push events, click to navigate. */
  notify(message: string, options: NotifyOptions = {}): void {
    const { variant = 'info', durationMs = 8000, href, icon } = options;
    this._add(this._ensureContainer('b-toast-notify', this._notifyPosition), message, variant, durationMs, href, icon);
  }
}

export const toast = new ToastManager();

export class BToastItem extends BaseComponent {
  static get observedAttributes() { return ['variant', 'message', 'href', 'icon']; }

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
      .success { background: var(--b-color-success); color: var(--b-text-inverse); }
      .error { background: var(--b-color-danger); color: var(--b-text-inverse); }
      .warning { background: var(--b-color-warning); color: var(--b-text-inverse); }
      .info { background: var(--b-color-info); color: var(--b-text-inverse); }
      .icon { flex-shrink: 0; }
      .msg { flex: 1; }
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
        ${icon ? `<span class="icon" aria-hidden="true">${icon}</span>` : ''}
        <span class="msg">${this.attr('message')}</span>
        <button class="close" aria-label="Dismiss">&times;</button>
      </div>
    `;
  }

  protected onUpdated() {
    this.$('.close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.remove();
    });

    const href = this.attr('href');
    if (href) {
      this.$('.toast')?.addEventListener('click', () => {
        window.location.hash = href.startsWith('#') ? href : `#${href}`;
        this.remove();
      });
    }
  }
}

define('b-toast-item', BToastItem);
