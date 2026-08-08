import { FormControlComponent, define, t } from 'birko-web-core';
import { formFieldSheet, formControlSheet } from '../shared-styles';
import { renderField, fieldAria } from './label-hint';

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function parseTime(s: string): { hour: number; minute: number } | null {
  if (!s) return null;
  const parts = s.split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return { hour: Math.max(0, Math.min(23, h)), minute: Math.max(0, Math.min(59, m)) };
}

let _globalLocale: { now?: string; clear?: string } = {};

export class BTime extends FormControlComponent {

  static setLocale(locale: { now?: string; clear?: string }) {
    _globalLocale = locale;
  }

  static get observedAttributes() {
    return ['label', 'name', 'value', 'placeholder', 'error', 'disabled', 'required', 'hint',
            'min', 'max', 'step', 'bare', 'description'];
  }

  static get sharedStyles() {
    return [formFieldSheet, formControlSheet];
  }

  static get styles() {
    return `
      :host { display: block; position: relative; }

      .tp-wrap { position: relative; }
      .tp-input {
        cursor: pointer;
        caret-color: transparent;
      }
      .tp-input:read-only { cursor: pointer; }
      .tp-clear {
        position: absolute;
        right: var(--b-space-sm, 0.5rem);
        top: 50%; transform: translateY(-50%);
        background: none; border: none; cursor: pointer;
        color: var(--b-text-muted); font-size: var(--b-text-base, 0.875rem);
        padding: 0; line-height: 1;
      }
      .tp-clear:hover { color: var(--b-text); }

      .tp-panel {
        display: none;
        position: fixed;
        z-index: 10;
        background: var(--b-bg-elevated);
        border: var(--b-border-width, 1px) solid var(--b-border);
        border-radius: var(--b-radius, 0.375rem);
        box-shadow: var(--b-shadow-md);
        padding: var(--b-space-md, 0.75rem);
        width: var(--b-time-picker-width, 11rem);
        user-select: none;
      }
      .tp-panel.open { display: block; }

      .tp-spinners {
        display: flex; align-items: center; justify-content: center;
        gap: var(--b-space-xs, 0.25rem);
      }

      .tp-spinner {
        display: flex; flex-direction: column; align-items: center;
        gap: var(--b-space-3xs, 0.0625rem);
      }
      .tp-spin-btn {
        background: none; border: none; cursor: pointer;
        color: var(--b-text-muted);
        font-size: var(--b-text-sm, 0.8125rem);
        padding: var(--b-space-3xs, 0.0625rem) var(--b-space-sm, 0.5rem);
        border-radius: var(--b-radius, 0.375rem);
        line-height: 1;
      }
      .tp-spin-btn:hover { background: var(--b-bg-tertiary); color: var(--b-text); }

      .tp-num-input {
        width: 3rem;
        text-align: center;
        padding: var(--b-space-xs, 0.25rem) var(--b-space-xs, 0.25rem);
        border: var(--b-border-width, 1px) solid var(--b-border);
        border-radius: var(--b-radius, 0.375rem);
        font-size: var(--b-text-base, 0.875rem);
        font-weight: var(--b-font-weight-medium, 500);
        color: var(--b-text);
        background: var(--b-bg);
        -moz-appearance: textfield;
      }
      /* iOS 16px focus-zoom floor (TASK-126 sweep). A class selector, so the shared formControl rule cannot
         reach it; measured at 12.25px. The box is 3rem wide around two centred digits, which still fits.
         Coarse-only — a desktop time field stays dense. */
      @media (pointer: coarse) {
        .tp-num-input { font-size: max(16px, var(--b-text-base, 0.875rem)); }
      }
      .tp-num-input::-webkit-inner-spin-button,
      .tp-num-input::-webkit-outer-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }
      .tp-num-input:focus {
        outline: none;
        border-color: var(--b-border-focus);
        box-shadow: var(--b-focus-ring);
      }

      .tp-sep {
        font-size: var(--b-text-lg, 1rem);
        font-weight: var(--b-font-weight-bold, 700);
        color: var(--b-text-muted);
        padding-bottom: 0;
      }

      .tp-footer {
        display: flex; justify-content: space-between; align-items: center;
        margin-top: var(--b-space-sm, 0.5rem);
        padding-top: var(--b-space-sm, 0.5rem);
        border-top: var(--b-border-width, 1px) solid var(--b-border);
      }
      .tp-footer button {
        background: none; border: none; cursor: pointer;
        font-size: var(--b-text-xs, 0.6875rem);
        color: var(--b-color-primary);
        padding: var(--b-space-2xs, 0.125rem) var(--b-space-xs, 0.25rem);
        border-radius: var(--b-radius, 0.375rem);
      }
      .tp-footer button:hover { background: var(--b-bg-tertiary); }
    `;
  }

  private _open = false;
  private _hour = 0;
  private _minute = 0;
  private _outsideClickHandler: ((e: Event) => void) | null = null;

  private _nowLabel(): string { return _globalLocale.now ?? t('bwc.datetime.now', undefined, 'Now'); }
  private _clearLabel(): string { return _globalLocale.clear ?? t('bwc.common.clear', undefined, 'Clear'); }

  private _step(): number {
    return parseInt(this.attr('step') ?? '1', 10) || 1;
  }

  get value(): string { return this.inputValue; }
  set value(v: string) { this.inputValue = v; }

  get inputValue(): string {
    return this.attr('value') ?? '';
  }

  set inputValue(v: string) {
    if (v) this.setAttribute('value', v);
    else this.removeAttribute('value');
    const input = this.$<HTMLInputElement>('.tp-input');
    if (input) input.value = v || '';
  }

  render() {
    const label = this.attr('label');
    const hint = this.attr('hint');
    const error = this.attr('error');
    const value = this.attr('value');
    const placeholder = this.label('placeholder', 'bwc.time.placeholder', 'HH:mm');
    const disabled = this.boolAttr('disabled');
    const bare = this.boolAttr('bare');
    const description = this.attr('description');

    return renderField({
      bare,
      uid: this.uid,
      label,
      hint,
      error,
      required: this.boolAttr('required'),
      description,
      control: `
        <div class="tp-wrap">
          <input class="tp-input ${error ? 'has-error' : ''}"
                 type="text" readonly
                 name="${this.attr('name')}"
                 value="${value ?? ''}"
                 placeholder="${placeholder}"
                 ${fieldAria({ uid: this.uid, error, required: this.boolAttr('required'), description, bare, label })}
                 ${disabled ? 'disabled' : ''} />
          ${value && !disabled ? '<button class="tp-clear" type="button">&times;</button>' : ''}
        </div>
        <div class="tp-panel ${this._open ? 'open' : ''}">
          ${this._renderPanel()}
        </div>`,
    });

  }

  private _renderPanel(): string {
    const step = this._step();
    return `
      <div class="tp-spinners">
        <div class="tp-spinner">
          <button class="tp-spin-btn" data-spin="hour-up">&#9650;</button>
          <input class="tp-num-input" data-time="hour" type="number" min="0" max="23" value="${pad(this._hour)}" />
          <button class="tp-spin-btn" data-spin="hour-down">&#9660;</button>
        </div>
        <span class="tp-sep">:</span>
        <div class="tp-spinner">
          <button class="tp-spin-btn" data-spin="minute-up">&#9650;</button>
          <input class="tp-num-input" data-time="minute" type="number" min="0" max="59" step="${step}" value="${pad(this._minute)}" />
          <button class="tp-spin-btn" data-spin="minute-down">&#9660;</button>
        </div>
      </div>
      <div class="tp-footer">
        <button data-action="now">${this._nowLabel()}</button>
        <button data-action="clear">${this._clearLabel()}</button>
      </div>
    `;
  }

  protected onUpdated() {
    // Before the early returns below: the value lives in the `value` attribute and every change
    // (panel click, clear button, `inputValue`) re-renders.
    this.syncFormState();

    const input = this.$<HTMLInputElement>('.tp-input');
    const panel = this.$<HTMLElement>('.tp-panel');
    if (!input || !panel) return;

    this.listen(input, 'click', () => {
      if (this.boolAttr('disabled')) return;
      if (this._open) this._close();
      else this._openPanel(input, panel);
    });

    const clearBtn = this.$('.tp-clear');
    if (clearBtn) {
      this.listen(clearBtn, 'click', (e: Event) => {
        e.stopPropagation();
        this._setValue('');
      });
    }

    this._wirePanel(panel);

    // Outside click
    if (this._outsideClickHandler) {
      document.removeEventListener('mousedown', this._outsideClickHandler);
    }
    this._outsideClickHandler = (e: Event) => {
      const path = e.composedPath();
      if (!path.includes(input) && !path.includes(panel)) {
        this._close();
      }
    };
    this.listen(document, 'mousedown', this._outsideClickHandler);

    // Keyboard
    this.listen(input, 'keydown', (e: Event) => {
      const ke = e as KeyboardEvent;
      if (ke.key === 'Escape') this._close();
      if (ke.key === 'Enter' || ke.key === ' ') {
        e.preventDefault();
        if (!this._open) this._openPanel(input, panel);
      }
    });
  }

  private _wirePanel(panel: HTMLElement) {
    const step = this._step();

    // Spin buttons
    this.listen(panel, 'click', (e: Event) => {
      const target = e.target as HTMLElement;
      const spin = target.dataset.spin;
      if (spin) {
        switch (spin) {
          case 'hour-up': this._hour = (this._hour + 1) % 24; break;
          case 'hour-down': this._hour = (this._hour + 23) % 24; break;
          case 'minute-up': this._minute = (this._minute + step) % 60; break;
          case 'minute-down': this._minute = (this._minute - step + 60) % 60; break;
        }
        this._emitValue();
        this._refreshPanel(panel);
        return;
      }

      const action = target.dataset.action;
      if (action === 'now') {
        const now = new Date();
        this._hour = now.getHours();
        this._minute = now.getMinutes();
        this._emitValue();
        this._close();
        return;
      }
      if (action === 'clear') {
        this._setValue('');
        return;
      }
    });

    // Direct number input
    const hourInput = panel.querySelector<HTMLInputElement>('[data-time="hour"]');
    const minuteInput = panel.querySelector<HTMLInputElement>('[data-time="minute"]');
    if (hourInput) this._listenInput(hourInput, 0, 23, (v) => { this._hour = v; this._emitValue(); });
    if (minuteInput) this._listenInput(minuteInput, 0, 59, (v) => { this._minute = v; this._emitValue(); });

    // Scroll on number inputs
    if (hourInput) this._listenWheel(hourInput, () => {
      this._hour = (this._hour + 1) % 24;
    }, () => {
      this._hour = (this._hour + 23) % 24;
    });
    if (minuteInput) this._listenWheel(minuteInput, () => {
      this._minute = (this._minute + step) % 60;
    }, () => {
      this._minute = (this._minute - step + 60) % 60;
    });
  }

  private _listenInput(el: HTMLInputElement, min: number, max: number, cb: (v: number) => void) {
    const handler = () => {
      let v = parseInt(el.value, 10);
      if (isNaN(v)) v = 0;
      if (v < min) v = min;
      if (v > max) v = max;
      el.value = pad(v);
      cb(v);
    };
    el.addEventListener('change', handler);
    el.addEventListener('blur', handler);
  }

  private _listenWheel(el: HTMLInputElement, onUp: () => void, onDown: () => void) {
    el.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY < 0) onUp();
      else onDown();
      this._emitValue();
      this._refreshPanel(el.closest('.tp-panel') as HTMLElement);
    }, { passive: false });
  }

  private _openPanel(input: HTMLElement, panel: HTMLElement) {
    const parsed = parseTime(this.attr('value') ?? '');
    if (parsed) {
      this._hour = parsed.hour;
      this._minute = parsed.minute;
    } else {
      const now = new Date();
      this._hour = now.getHours();
      this._minute = now.getMinutes();
    }
    this._open = true;
    panel.classList.add('open');
    this._refreshPanel(panel);

    // Position below input
    const rect = input.getBoundingClientRect();
    const gap = 4;
    panel.style.left = `${rect.left}px`;
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < 160 && rect.top > spaceBelow) {
      panel.style.top = '';
      panel.style.bottom = `${window.innerHeight - rect.top + gap}px`;
    } else {
      panel.style.bottom = '';
      panel.style.top = `${rect.bottom + gap}px`;
    }
  }

  private _close() {
    if (!this._open) return;
    this._open = false;
    this.$<HTMLElement>('.tp-panel')?.classList.remove('open');
  }

  private _emitValue() {
    const iso = `${pad(this._hour)}:${pad(this._minute)}`;
    this._setValue(iso);
  }

  private _setValue(v: string) {
    const input = this.$<HTMLInputElement>('.tp-input');
    if (input) input.value = v;

    const wrap = this.$<HTMLElement>('.tp-wrap');
    if (wrap) {
      const existing = wrap.querySelector('.tp-clear');
      if (v && !existing && !this.boolAttr('disabled')) {
        input?.insertAdjacentHTML('afterend', '<button class="tp-clear" type="button">&times;</button>');
        wrap.querySelector('.tp-clear')?.addEventListener('click', (e) => {
          e.stopPropagation();
          this._setValue('');
        });
      } else if (!v && existing) {
        existing.remove();
      }
    }

    if (v) this.setAttribute('value', v);
    else this.removeAttribute('value');

    if (!v) this._close();

    this.emit('change', { name: this.attr('name'), value: v });
  }

  private _refreshPanel(panel?: HTMLElement) {
    const el = panel ?? this.$<HTMLElement>('.tp-panel');
    if (!el) return;
    el.innerHTML = this._renderPanel();
    this._wirePanel(el);
  }

  /**
   * The inner `.tp-input` is a read-only *display* input holding a formatted string (`HH:mm`), not the
   * ISO value the control submits — mirroring its native validity would report on the wrong text. The
   * base's generic `required` check reads {@link formValue} instead.
   */
  protected validationSource(): undefined {
    return undefined;
  }
}

define('b-time', BTime);
