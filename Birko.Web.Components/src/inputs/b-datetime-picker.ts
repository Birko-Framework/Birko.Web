import { FormControlComponent, define, t } from 'birko-web-core';
import { formFieldSheet, formControlSheet } from '../shared-styles';
import { renderField, fieldAria } from './label-hint';

const DAYS_IN_WEEK = 7;

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function firstWeekday(year: number, month: number): number {
  return (new Date(year, month, 1).getDay() + 6) % 7;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function toISO(y: number, m: number, d: number): string {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

function parseDateTime(s: string): { year: number; month: number; day: number; hour: number; minute: number } | null {
  if (!s) return null;
  // If the string has timezone info (Z or ±offset), parse via Date to convert UTC → local
  if (/Z|[+-]\d{2}:\d{2}$/.test(s)) {
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate(), hour: d.getHours(), minute: d.getMinutes() };
  }
  // Plain strings without timezone: parse directly
  const [datePart, timePart] = s.split(/[T ]/);
  const dp = datePart?.split('-');
  if (!dp || dp.length !== 3) return null;
  const y = parseInt(dp[0], 10);
  const m = parseInt(dp[1], 10) - 1;
  const d = parseInt(dp[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  let hour = 0, minute = 0;
  if (timePart) {
    const tp = timePart.split(':');
    hour = parseInt(tp[0], 10) || 0;
    minute = parseInt(tp[1], 10) || 0;
  }
  return { year: y, month: m, day: d, hour, minute };
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_HEADERS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

let _globalLocale: { months?: string[]; days?: string[]; today?: string; clear?: string; now?: string } = {};

export class BDatetimePicker extends FormControlComponent {

  static setLocale(locale: { months?: string[]; days?: string[]; today?: string; clear?: string; now?: string }) {
    _globalLocale = locale;
  }

  static get observedAttributes() {
    return ['label', 'name', 'value', 'placeholder', 'error', 'disabled', 'required', 'hint',
            'min', 'max', 'bare', 'description', 'label-today', 'label-clear', 'label-months', 'label-days'];
  }

  static get sharedStyles() {
    return [formFieldSheet, formControlSheet];
  }

  static get styles() {
    return `
      :host { display: block; position: relative; }

      .dp-wrap { position: relative; }
      .dp-input {
        cursor: pointer;
        caret-color: transparent;
      }
      .dp-input:read-only { cursor: pointer; }
      .dp-clear {
        position: absolute;
        right: var(--b-space-sm, 0.5rem);
        top: 50%; transform: translateY(-50%);
        background: none; border: none; cursor: pointer;
        color: var(--b-text-muted); font-size: var(--b-text-base, 0.875rem);
        padding: 0; line-height: 1;
      }
      .dp-clear:hover { color: var(--b-text); }

      .dp-panel {
        display: none;
        position: fixed;
        z-index: 10;
        background: var(--b-bg-elevated);
        border: var(--b-border-width, 1px) solid var(--b-border);
        border-radius: var(--b-radius, 0.375rem);
        box-shadow: var(--b-shadow-md);
        padding: var(--b-space-md, 0.75rem);
        width: var(--b-date-picker-width, 17rem);
        user-select: none;
      }
      .dp-panel.open { display: block; }

      .dp-header {
        display: flex; align-items: center; justify-content: space-between;
        margin-bottom: var(--b-space-sm, 0.5rem);
      }
      .dp-header-label {
        font-size: var(--b-text-sm, 0.8125rem);
        font-weight: var(--b-font-weight-medium, 500);
        color: var(--b-text);
        cursor: pointer;
      }
      .dp-header-label:hover { color: var(--b-color-primary); }
      .dp-nav {
        background: none; border: none; cursor: pointer;
        color: var(--b-text-muted); font-size: var(--b-text-sm, 0.8125rem);
        padding: var(--b-space-2xs, 0.125rem) var(--b-space-xs, 0.25rem);
        border-radius: var(--b-radius, 0.375rem);
        line-height: 1;
      }
      .dp-nav:hover { background: var(--b-bg-tertiary); color: var(--b-text); }

      .dp-grid {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: var(--b-space-3xs, 0.0625rem);
        text-align: center;
      }

      .dp-day-header {
        font-size: var(--b-text-xs, 0.6875rem);
        color: var(--b-text-muted);
        font-weight: var(--b-font-weight-medium, 500);
        padding: var(--b-space-2xs, 0.125rem) 0;
      }

      .dp-day {
        font-size: var(--b-text-sm, 0.8125rem);
        padding: var(--b-space-2xs, 0.125rem);
        border-radius: var(--b-radius, 0.375rem);
        cursor: pointer;
        color: var(--b-text);
        border: none; background: none;
        line-height: 1.75;
      }
      .dp-day:hover { background: var(--b-bg-tertiary); }
      .dp-day.other { color: var(--b-text-muted); opacity: 0.5; }
      .dp-day.today {
        font-weight: var(--b-font-weight-bold, 700);
        color: var(--b-color-primary);
      }
      .dp-day.selected {
        background: var(--b-color-primary);
        color: var(--b-text-inverse);
      }
      .dp-day.selected:hover { background: var(--b-color-primary-hover, var(--b-color-primary)); }
      .dp-day.disabled { opacity: 0.3; cursor: not-allowed; pointer-events: none; }

      .dp-footer {
        display: flex; justify-content: space-between; align-items: center;
        margin-top: var(--b-space-sm, 0.5rem);
        padding-top: var(--b-space-sm, 0.5rem);
        border-top: var(--b-border-width, 1px) solid var(--b-border);
      }
      .dp-footer button {
        background: none; border: none; cursor: pointer;
        font-size: var(--b-text-xs, 0.6875rem);
        color: var(--b-color-primary);
        padding: var(--b-space-2xs, 0.125rem) var(--b-space-xs, 0.25rem);
        border-radius: var(--b-radius, 0.375rem);
      }
      .dp-footer button:hover { background: var(--b-bg-tertiary); }

      /* ── Time section ── */
      .dp-time {
        display: flex; align-items: center; justify-content: center;
        gap: var(--b-space-xs, 0.25rem);
        margin-top: var(--b-space-sm, 0.5rem);
        padding-top: var(--b-space-sm, 0.5rem);
        border-top: var(--b-border-width, 1px) solid var(--b-border);
      }
      .dp-time-input {
        width: var(--b-space-3xl, 3rem);
        text-align: center;
        padding: var(--b-space-2xs, 0.125rem) var(--b-space-xs, 0.25rem);
        border: var(--b-border-width, 1px) solid var(--b-border);
        border-radius: var(--b-radius, 0.375rem);
        font-size: var(--b-text-sm, 0.8125rem);
        color: var(--b-text);
        background: var(--b-bg);
      }
      .dp-time-input:focus {
        outline: none;
        border-color: var(--b-border-focus);
        box-shadow: var(--b-focus-ring);
      }
      .dp-time-sep {
        font-size: var(--b-text-base, 0.875rem);
        font-weight: var(--b-font-weight-bold, 700);
        color: var(--b-text-muted);
      }

      /* ── Month picker ── */
      .dp-months {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--b-space-xs, 0.25rem);
      }
      .dp-month {
        font-size: var(--b-text-sm, 0.8125rem);
        padding: var(--b-space-sm, 0.5rem) var(--b-space-xs, 0.25rem);
        border-radius: var(--b-radius, 0.375rem);
        cursor: pointer; border: none; background: none;
        color: var(--b-text);
      }
      .dp-month:hover { background: var(--b-bg-tertiary); }
      .dp-month.current { color: var(--b-color-primary); font-weight: var(--b-font-weight-medium, 500); }
    `;
  }

  private _open = false;
  private _viewYear = new Date().getFullYear();
  private _viewMonth = new Date().getMonth();
  private _hour = 0;
  private _minute = 0;
  private _selectedDate = '';
  private _monthPicker = false;
  private _outsideClickHandler: ((e: Event) => void) | null = null;

  private _months(): string[] {
    const custom = this.attr('label-months');
    if (custom) { try { return JSON.parse(custom); } catch { /* fallback */ } }
    return _globalLocale.months ?? MONTH_NAMES;
  }

  private _dayHeaders(): string[] {
    const custom = this.attr('label-days');
    if (custom) { try { return JSON.parse(custom); } catch { /* fallback */ } }
    return _globalLocale.days ?? DAY_HEADERS;
  }

  private _todayLabel(): string {
    const attr = this.getAttribute('label-today');
    if (attr !== null) return attr;
    return _globalLocale.today ?? t('bwc.datetime.today', undefined, 'Today');
  }

  private _clearLabel(): string {
    const attr = this.getAttribute('label-clear');
    if (attr !== null) return attr;
    return _globalLocale.clear ?? t('bwc.common.clear', undefined, 'Clear');
  }

  private _nowLabel(): string {
    return _globalLocale.now ?? t('bwc.datetime.now', undefined, 'Now');
  }

  get value(): string { return this.inputValue; }
  set value(v: string) { this.inputValue = v; }

  get inputValue(): string {
    return this.attr('value') ?? '';
  }

  set inputValue(v: string) {
    if (v) this.setAttribute('value', v);
    else this.removeAttribute('value');
    const input = this.$<HTMLInputElement>('.dp-input');
    if (input) input.value = this._formatDisplay(v);
  }

  render() {
    const label = this.attr('label');
    const error = this.attr('error');
    const value = this.attr('value');
    const placeholder = this.label('placeholder', 'bwc.datetime.placeholder', 'YYYY-MM-DD HH:mm');
    const disabled = this.boolAttr('disabled');
    const description = this.attr('description');
    const bare = this.boolAttr('bare');
    const required = this.boolAttr('required');

    return renderField({
      bare,
      uid: this.uid,
      label,
      hint: this.attr('hint'),
      description,
      error,
      required,
      // `.dp-panel` is the calendar popover, resolved by selector and positioned against `.dp-wrap` —
      // part of the control, so it survives bare mode.
      control: `
        <div class="dp-wrap">
          <input class="dp-input ${error ? 'has-error' : ''}"
                 type="text" readonly
                 name="${this.attr('name')}"
                 value="${this._formatDisplay(value ?? '')}"
                 placeholder="${placeholder}"
                 ${fieldAria({ uid: this.uid, error, description, required, bare, label })}
                 ${disabled ? 'disabled' : ''} />
          ${value && !disabled ? '<button class="dp-clear" type="button">&times;</button>' : ''}
        </div>
        <div class="dp-panel ${this._open ? 'open' : ''}">
          ${this._monthPicker ? this._renderMonthPicker() : this._renderCalendar()}
        </div>`,
    });
  }

  private _renderCalendar(): string {
    const months = this._months();
    const dayHeaders = this._dayHeaders();
    const y = this._viewYear;
    const m = this._viewMonth;
    const todayISO = toISO(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    const minDate = this.attr('min')?.split(/[T ]/)[0] ?? '';
    const maxDate = this.attr('max')?.split(/[T ]/)[0] ?? '';

    const totalDays = daysInMonth(y, m);
    const startDay = firstWeekday(y, m);

    const prevDays = daysInMonth(y, m === 0 ? 11 : m - 1);
    const cells: string[] = [];

    for (let i = startDay - 1; i >= 0; i--) {
      const d = prevDays - i;
      const pm = m === 0 ? 11 : m - 1;
      const py = m === 0 ? y - 1 : y;
      const iso = toISO(py, pm, d);
      const dis = this._isDisabled(iso, minDate, maxDate);
      cells.push(`<button class="dp-day other ${dis ? 'disabled' : ''}" data-date="${iso}">${d}</button>`);
    }

    for (let d = 1; d <= totalDays; d++) {
      const iso = toISO(y, m, d);
      const cls: string[] = ['dp-day'];
      if (iso === todayISO) cls.push('today');
      if (iso === this._selectedDate) cls.push('selected');
      if (this._isDisabled(iso, minDate, maxDate)) cls.push('disabled');
      cells.push(`<button class="${cls.join(' ')}" data-date="${iso}">${d}</button>`);
    }

    const remaining = DAYS_IN_WEEK - (cells.length % DAYS_IN_WEEK);
    if (remaining < DAYS_IN_WEEK) {
      for (let d = 1; d <= remaining; d++) {
        const nm = m === 11 ? 0 : m + 1;
        const ny = m === 11 ? y + 1 : y;
        const iso = toISO(ny, nm, d);
        const dis = this._isDisabled(iso, minDate, maxDate);
        cells.push(`<button class="dp-day other ${dis ? 'disabled' : ''}" data-date="${iso}">${d}</button>`);
      }
    }

    return `
      <div class="dp-header">
        <button class="dp-nav" data-nav="prev-month">&#9664;</button>
        <span class="dp-header-label" data-nav="month-picker">${months[m]} ${y}</span>
        <button class="dp-nav" data-nav="next-month">&#9654;</button>
      </div>
      <div class="dp-grid">
        ${dayHeaders.map(d => `<span class="dp-day-header">${d}</span>`).join('')}
        ${cells.join('')}
      </div>
      <div class="dp-time">
        <input class="dp-time-input" data-time="hour" type="number" min="0" max="23" value="${pad(this._hour)}" />
        <span class="dp-time-sep">:</span>
        <input class="dp-time-input" data-time="minute" type="number" min="0" max="59" step="5" value="${pad(this._minute)}" />
      </div>
      <div class="dp-footer">
        <button data-nav="now">${this._nowLabel()}</button>
        <button data-nav="clear">${this._clearLabel()}</button>
        ${this._selectedDate ? `<button data-nav="set" style="font-weight:var(--b-font-weight-medium,500)">OK</button>` : ''}
      </div>
    `;
  }

  private _renderMonthPicker(): string {
    const months = this._months();
    const now = new Date();
    const y = this._viewYear;

    return `
      <div class="dp-header">
        <button class="dp-nav" data-nav="prev-year">&#9664;</button>
        <span class="dp-header-label">${y}</span>
        <button class="dp-nav" data-nav="next-year">&#9654;</button>
      </div>
      <div class="dp-months">
        ${months.map((name, i) =>
          `<button class="dp-month ${y === now.getFullYear() && i === now.getMonth() ? 'current' : ''}" data-month="${i}">${name.slice(0, 3)}</button>`
        ).join('')}
      </div>
    `;
  }

  protected onUpdated() {
    // Before the early returns below: the value lives in the `value` attribute and every change
    // (panel click, clear button, `inputValue`) re-renders.
    this.syncFormState();

    const input = this.$<HTMLInputElement>('.dp-input');
    const panel = this.$<HTMLElement>('.dp-panel');
    if (!input || !panel) return;

    this.listen(input, 'click', () => {
      if (this.boolAttr('disabled')) return;
      if (this._open) this._close();
      else this._openPanel(input, panel);
    });

    const clearBtn = this.$('.dp-clear');
    if (clearBtn) {
      this.listen(clearBtn, 'click', (e: Event) => {
        e.stopPropagation();
        this._selectDateTime('');
      });
    }

    // Panel clicks (delegation)
    this.listen(panel, 'click', (e: Event) => {
      const target = e.target as HTMLElement;

      const date = target.dataset.date;
      if (date && !target.classList.contains('disabled')) {
        this._selectedDate = date;
        this._emitValue();
        this._refreshPanel();
        return;
      }

      const month = target.dataset.month;
      if (month !== undefined) {
        this._viewMonth = parseInt(month, 10);
        this._monthPicker = false;
        this._refreshPanel();
        return;
      }

      const nav = target.dataset.nav ?? target.closest<HTMLElement>('[data-nav]')?.dataset.nav;
      if (!nav) return;
      switch (nav) {
        case 'prev-month':
          if (this._viewMonth === 0) { this._viewMonth = 11; this._viewYear--; }
          else this._viewMonth--;
          break;
        case 'next-month':
          if (this._viewMonth === 11) { this._viewMonth = 0; this._viewYear++; }
          else this._viewMonth++;
          break;
        case 'prev-year': this._viewYear--; break;
        case 'next-year': this._viewYear++; break;
        case 'month-picker':
          this._monthPicker = !this._monthPicker;
          break;
        case 'now': {
          const now = new Date();
          this._selectedDate = toISO(now.getFullYear(), now.getMonth(), now.getDate());
          this._hour = now.getHours();
          this._minute = now.getMinutes();
          this._emitValue();
          this._close();
          return;
        }
        case 'set':
          if (this._selectedDate) {
            this._emitValue();
            this._close();
          }
          return;
        case 'clear':
          this._selectDateTime('');
          return;
      }
      this._refreshPanel();
    });

    // Time inputs
    const hourInput = panel.querySelector<HTMLInputElement>('[data-time="hour"]');
    const minuteInput = panel.querySelector<HTMLInputElement>('[data-time="minute"]');
    if (hourInput) {
      this._listenTimeInput(hourInput, 0, 23, (v) => { this._hour = v; this._emitValue(); });
    }
    if (minuteInput) {
      this._listenTimeInput(minuteInput, 0, 59, (v) => { this._minute = v; this._emitValue(); });
    }

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

  private _listenTimeInput(el: HTMLInputElement, min: number, max: number, cb: (v: number) => void) {
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

  private _openPanel(input: HTMLElement, panel: HTMLElement) {
    const parsed = parseDateTime(this.attr('value') ?? '');
    if (parsed) {
      this._viewYear = parsed.year;
      this._viewMonth = parsed.month;
      this._selectedDate = toISO(parsed.year, parsed.month, parsed.day);
      this._hour = parsed.hour;
      this._minute = parsed.minute;
    } else {
      const now = new Date();
      this._viewYear = now.getFullYear();
      this._viewMonth = now.getMonth();
      this._selectedDate = '';
      this._hour = now.getHours();
      this._minute = now.getMinutes();
    }
    this._monthPicker = false;
    this._open = true;
    panel.classList.add('open');
    this._refreshPanel();

    const rect = input.getBoundingClientRect();
    const gap = 4;
    panel.style.left = `${rect.left}px`;
    panel.style.width = '';
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < 360 && rect.top > spaceBelow) {
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
    this.$<HTMLElement>('.dp-panel')?.classList.remove('open');
  }

  private _emitValue() {
    if (!this._selectedDate) return;
    // _selectedDate is local "YYYY-MM-DD", _hour/_minute are local — convert to UTC ISO
    const [y, m, d] = this._selectedDate.split('-').map(Number);
    const dt = new Date(y, m - 1, d, this._hour, this._minute);
    const iso = dt.toISOString();
    this._selectDateTime(iso);
  }

  private _selectDateTime(iso: string) {
    const input = this.$<HTMLInputElement>('.dp-input');
    if (input) input.value = this._formatDisplay(iso);

    const wrap = this.$<HTMLElement>('.dp-wrap');
    if (wrap) {
      const existing = wrap.querySelector('.dp-clear');
      if (iso && !existing && !this.boolAttr('disabled')) {
        input?.insertAdjacentHTML('afterend', '<button class="dp-clear" type="button">&times;</button>');
        wrap.querySelector('.dp-clear')?.addEventListener('click', (e) => {
          e.stopPropagation();
          this._selectDateTime('');
        });
      } else if (!iso && existing) {
        existing.remove();
      }
    }

    if (iso) this.setAttribute('value', iso);
    else this.removeAttribute('value');

    if (!iso) {
      this._selectedDate = '';
      this._close();
    }

    this.emit('change', { name: this.attr('name'), value: iso });
  }

  private _refreshPanel() {
    const panel = this.$<HTMLElement>('.dp-panel');
    if (!panel) return;
    panel.innerHTML = this._monthPicker ? this._renderMonthPicker() : this._renderCalendar();

    // Re-bind time inputs after refresh
    const hourInput = panel.querySelector<HTMLInputElement>('[data-time="hour"]');
    const minuteInput = panel.querySelector<HTMLInputElement>('[data-time="minute"]');
    if (hourInput) {
      this._listenTimeInput(hourInput, 0, 23, (v) => { this._hour = v; this._emitValue(); });
    }
    if (minuteInput) {
      this._listenTimeInput(minuteInput, 0, 59, (v) => { this._minute = v; this._emitValue(); });
    }
  }

  private _isDisabled(iso: string, min: string, max: string): boolean {
    if (min && iso < min) return true;
    if (max && iso > max) return true;
    return false;
  }

  private _formatDisplay(iso: string): string {
    if (!iso) return '';
    const parsed = parseDateTime(iso);
    if (!parsed) return iso;
    return `${pad(parsed.day)}.${pad(parsed.month + 1)}.${parsed.year} ${pad(parsed.hour)}:${pad(parsed.minute)}`;
  }

  /**
   * The inner `.dp-input` is a read-only *display* input holding a formatted string (`YYYY-MM-DD HH:mm`), not the
   * ISO value the control submits — mirroring its native validity would report on the wrong text. The
   * base's generic `required` check reads {@link formValue} instead.
   */
  protected validationSource(): undefined {
    return undefined;
  }
}

define('b-datetime-picker', BDatetimePicker);
