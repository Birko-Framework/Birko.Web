import { BaseComponent, define } from 'birko-web-core';

/** A single step in a guided tour. */
export interface TourStep {
  /** Target to spotlight — a CSS selector or an element. Missing target = centered step. */
  target?: string | HTMLElement;
  /** Optional step heading. */
  title?: string;
  /** Step body — plain text or trusted HTML. */
  body: string;
  /** Preferred popover placement relative to the target. Default: `auto`. */
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
}

/** Options for `tour.start()`. */
export interface TourOptions {
  /** Stable id — used as the localStorage "seen" key so the tour shows once per user. */
  id: string;
  /** Show only if not seen before (default true). Set false to always show. */
  once?: boolean;
  /** localStorage key prefix (default `b-tour`). */
  storagePrefix?: string;
}

const SEEN_PREFIX = 'b-tour';

/**
 * Global guided-onboarding manager — call `tour.start(steps, { id })` from anywhere.
 * Mirrors the `toast` singleton pattern: one host element is created lazily and
 * appended to `<body>`.
 *
 * ```ts
 * tour.start([
 *   { target: '#new-btn', title: 'Create', body: 'Start a new record here.' },
 *   { target: '.sidebar',  title: 'Modules', body: 'Switch modules from the sidebar.' },
 * ], { id: 'eshop-orders-v1' });
 * ```
 */
class TourManager {
  private _el: BTour | null = null;

  /** localStorage key for a tour id. */
  private _key(id: string, prefix = SEEN_PREFIX): string {
    return `${prefix}:${id}`;
  }

  /** True if this tour has already been completed/skipped by the user. */
  seen(id: string, prefix = SEEN_PREFIX): boolean {
    try { return localStorage.getItem(this._key(id, prefix)) !== null; }
    catch { return false; }
  }

  /** Re-arm a tour so it shows again on the next `start()`. */
  reset(id: string, prefix = SEEN_PREFIX): void {
    try { localStorage.removeItem(this._key(id, prefix)); } catch { /* ignore */ }
  }

  /**
   * Start a tour. Returns `true` if it was shown, `false` if skipped because
   * already seen (and `once` is not disabled) or there are no steps.
   */
  start(steps: TourStep[], options: TourOptions): boolean {
    const { id, once = true, storagePrefix = SEEN_PREFIX } = options;
    if (!steps.length) return false;
    if (once && this.seen(id, storagePrefix)) return false;

    if (!this._el) {
      this._el = document.createElement('b-tour') as BTour;
      document.body.appendChild(this._el);
    }
    this._el.run(steps, () => {
      try { localStorage.setItem(this._key(id, storagePrefix), '1'); } catch { /* ignore */ }
    });
    return true;
  }
}

export const tour = new TourManager();

export class BTour extends BaseComponent {
  private _steps: TourStep[] = [];
  private _index = 0;
  private _onDone: (() => void) | null = null;
  private _reposition = () => this._position();

  static get styles() {
    return `
      :host {
        position: fixed; inset: 0; z-index: var(--b-z-modal, 400);
        display: block; pointer-events: none;
      }
      :host([hidden]) { display: none; }
      .backdrop {
        position: fixed; inset: 0; pointer-events: auto;
        animation: tour-fade var(--b-duration-base, 250ms) var(--b-ease-out, ease);
      }
      .spotlight {
        position: fixed; border-radius: var(--b-radius, 0.375rem);
        box-shadow: 0 0 0 9999px var(--b-backdrop-bg, rgba(0,0,0,0.4));
        pointer-events: none;
        transition: top var(--b-duration-base, 250ms) var(--b-ease, ease),
                    left var(--b-duration-base, 250ms) var(--b-ease, ease),
                    width var(--b-duration-base, 250ms) var(--b-ease, ease),
                    height var(--b-duration-base, 250ms) var(--b-ease, ease);
      }
      /* Centered step (no target): dim the whole screen, no cutout. */
      .spotlight.centered { box-shadow: 0 0 0 9999px var(--b-backdrop-bg, rgba(0,0,0,0.4)); width: 0; height: 0; top: 50%; left: 50%; }
      .pop {
        position: fixed; pointer-events: auto; box-sizing: border-box;
        width: max-content; max-width: var(--b-tooltip-max-width, 16rem);
        background: var(--b-bg-elevated); color: var(--b-text);
        border: var(--b-border-width, 1px) solid var(--b-border);
        border-radius: var(--b-radius-lg, 0.625rem); box-shadow: var(--b-shadow-xl);
        padding: var(--b-space-md, 0.75rem) var(--b-space-lg, 1rem);
        animation: tour-pop var(--b-duration-fast, 150ms) var(--b-ease-out, ease);
      }
      .pop-title {
        font-size: var(--b-text-base, 0.875rem); font-weight: var(--b-font-weight-semibold, 600);
        margin: 0 0 var(--b-space-2xs, 0.125rem);
      }
      .pop-body { font-size: var(--b-text-sm, 0.8125rem); color: var(--b-text-secondary); line-height: 1.5; }
      .pop-footer {
        display: flex; align-items: center; justify-content: space-between;
        gap: var(--b-space-sm, 0.5rem); margin-top: var(--b-space-md, 0.75rem);
      }
      .counter { font-size: var(--b-text-xs, 0.6875rem); color: var(--b-text-muted); }
      .actions { display: flex; gap: var(--b-space-xs, 0.25rem); }
      button {
        font: inherit; font-size: var(--b-text-sm, 0.8125rem); cursor: pointer;
        border-radius: var(--b-radius, 0.375rem); padding: var(--b-space-2xs, 0.125rem) var(--b-space-md, 0.75rem);
        border: var(--b-border-width, 1px) solid var(--b-border);
        background: var(--b-bg); color: var(--b-text);
        transition: background var(--b-transition), border-color var(--b-transition);
      }
      button:hover { border-color: var(--b-border-hover); }
      button.skip { border: none; background: none; color: var(--b-text-muted); padding-inline: var(--b-space-xs, 0.25rem); }
      button.primary { background: var(--b-color-primary); border-color: var(--b-color-primary); color: var(--b-text-inverse); }
      button.primary:hover { background: var(--b-color-primary-hover); border-color: var(--b-color-primary-hover); }
      button:focus-visible { outline: none; box-shadow: var(--b-focus-ring); }
      @keyframes tour-fade { from { opacity: 0; } to { opacity: 1; } }
      @keyframes tour-pop { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
    `;
  }

  /** Begin a tour run. `onDone` fires once when finished or skipped. */
  run(steps: TourStep[], onDone: () => void): void {
    this._steps = steps;
    this._index = 0;
    this._onDone = onDone;
    this.removeAttribute('hidden');
    this._scrollIntoViewThenRender();
  }

  private get _current(): TourStep | undefined { return this._steps[this._index]; }

  private _resolveTarget(): HTMLElement | null {
    const t = this._current?.target;
    if (!t) return null;
    return typeof t === 'string' ? document.querySelector<HTMLElement>(t) : t;
  }

  next(): void {
    if (this._index >= this._steps.length - 1) { this._finish(); return; }
    this._index++;
    this._scrollIntoViewThenRender();
    this.emit('tour-step', { index: this._index });
  }

  back(): void {
    if (this._index === 0) return;
    this._index--;
    this._scrollIntoViewThenRender();
    this.emit('tour-step', { index: this._index });
  }

  skip(): void {
    this.emit('tour-skip', { index: this._index });
    this._end();
  }

  private _finish(): void {
    this.emit('tour-finish', { index: this._index });
    this._end();
  }

  private _end(): void {
    this._onDone?.();
    this._onDone = null;
    this.setAttribute('hidden', '');
    this._steps = [];
  }

  private _scrollIntoViewThenRender(): void {
    const el = this._resolveTarget();
    if (el) el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' });
    this.update();
  }

  render(): string {
    const step = this._current;
    if (!step) return '';
    const total = this._steps.length;
    const isLast = this._index === total - 1;
    const isFirst = this._index === 0;

    const nextLabel = isLast
      ? this.label('label-done', 'bwc.tour.done', 'Done')
      : this.label('label-next', 'bwc.tour.next', 'Next');
    const backLabel = this.label('label-back', 'bwc.tour.back', 'Back');
    const skipLabel = this.label('label-skip', 'bwc.tour.skip', 'Skip');

    const titleHtml = step.title ? `<p class="pop-title" id="tour-title">${step.title}</p>` : '';

    return `
      <div class="backdrop" id="backdrop"></div>
      <div class="spotlight ${step.target ? '' : 'centered'}" id="spot"></div>
      <div class="pop" id="pop" role="dialog" aria-modal="true"
           ${step.title ? 'aria-labelledby="tour-title"' : 'aria-label="' + skipLabel + '"'}>
        ${titleHtml}
        <div class="pop-body">${step.body}</div>
        <div class="pop-footer">
          <span class="counter">${this._index + 1} / ${total}</span>
          <div class="actions">
            <button class="skip" id="btn-skip">${skipLabel}</button>
            ${isFirst ? '' : `<button id="btn-back">${backLabel}</button>`}
            <button class="primary" id="btn-next">${nextLabel}</button>
          </div>
        </div>
      </div>
    `;
  }

  protected onUpdated(): void {
    if (this.hasAttribute('hidden')) return;
    const next = this.$<HTMLButtonElement>('#btn-next');
    const back = this.$<HTMLButtonElement>('#btn-back');
    const skip = this.$<HTMLButtonElement>('#btn-skip');
    if (next) this.listen(next, 'click', () => this.next());
    if (back) this.listen(back, 'click', () => this.back());
    if (skip) this.listen(skip, 'click', () => this.skip());

    // Keyboard: Esc skips, ←/→ navigate. Tab is trapped inside the popover.
    this.listen(document, 'keydown', (e: Event) => {
      const ke = e as KeyboardEvent;
      if (this.hasAttribute('hidden')) return;
      if (ke.key === 'Escape') { ke.preventDefault(); this.skip(); }
      else if (ke.key === 'ArrowRight') { ke.preventDefault(); this.next(); }
      else if (ke.key === 'ArrowLeft') { ke.preventDefault(); this.back(); }
      else if (ke.key === 'Tab') this._trapTab(ke);
    });

    // Reposition on scroll/resize while a step is shown.
    this.listen(window, 'scroll', this._reposition, { capture: true, passive: true });
    this.listen(window, 'resize', this._reposition);

    this._position();
    requestAnimationFrame(() => next?.focus());
  }

  protected onUnmount(): void {
    super.onUnmount();
  }

  private _trapTab(ke: KeyboardEvent): void {
    const pop = this.$<HTMLElement>('#pop');
    if (!pop) return;
    const focusable = pop.querySelectorAll<HTMLElement>('button:not([disabled])');
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = this.shadowRoot?.activeElement;
    if (ke.shiftKey && active === first) { ke.preventDefault(); last.focus(); }
    else if (!ke.shiftKey && active === last) { ke.preventDefault(); first.focus(); }
  }

  /** Position the spotlight over the target and anchor the popover beside it. */
  private _position(): void {
    const spot = this.$<HTMLElement>('#spot');
    const pop = this.$<HTMLElement>('#pop');
    if (!spot || !pop) return;
    const step = this._current;
    const target = this._resolveTarget();
    const pad = 4;
    const gap = 10;

    if (!target) {
      // Centered step — no cutout, popover in the middle.
      pop.style.top = `${(window.innerHeight - pop.offsetHeight) / 2}px`;
      pop.style.left = `${(window.innerWidth - pop.offsetWidth) / 2}px`;
      return;
    }

    const r = target.getBoundingClientRect();
    spot.style.top = `${r.top - pad}px`;
    spot.style.left = `${r.left - pad}px`;
    spot.style.width = `${r.width + pad * 2}px`;
    spot.style.height = `${r.height + pad * 2}px`;

    const pr = pop.getBoundingClientRect();
    const placement = step?.placement ?? 'auto';
    let top: number;
    let left: number;

    const fitsBelow = r.bottom + gap + pr.height <= window.innerHeight - 8;
    const place = placement === 'auto' ? (fitsBelow ? 'bottom' : 'top') : placement;

    switch (place) {
      case 'top':    top = r.top - pr.height - gap; left = r.left; break;
      case 'left':   top = r.top; left = r.left - pr.width - gap; break;
      case 'right':  top = r.top; left = r.right + gap; break;
      default:       top = r.bottom + gap; left = r.left; break; // bottom
    }

    // Clamp to viewport.
    left = Math.min(Math.max(8, left), window.innerWidth - pr.width - 8);
    top = Math.min(Math.max(8, top), window.innerHeight - pr.height - 8);
    pop.style.top = `${top}px`;
    pop.style.left = `${left}px`;
  }
}

define('b-tour', BTour);
