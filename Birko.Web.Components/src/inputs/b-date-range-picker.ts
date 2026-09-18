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

function parseDate(s: string): { year: number; month: number; day: number } | null {
  if (!s) return null;
  const parts = s.split('-');
  if (parts.length !== 3) return null;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  return { year: y, month: m, day: d };
}

function addMonths(y: number, m: number, delta: number): { year: number; month: number } {
  const total = y * 12 + m + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

function daysBetween(start: string, end: string): number {
  const a = parseDate(start);
  const b = parseDate(end);
  if (!a || !b) return 0;
  const da = Date.UTC(a.year, a.month, a.day);
  const db = Date.UTC(b.year, b.month, b.day);
  return Math.round((db - da) / 86400000);
}

function formatDisplay(iso: string): string {
  if (!iso) return '';
  const p = parseDate(iso);
  if (!p) return iso;
  return `${pad(p.day)}.${pad(p.month + 1)}.${p.year}`;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_HEADERS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export interface RangeValue { start: string; end: string; }
export interface RangePreset { label: string; start: string; end: string; }

let _globalLocale: {
  months?: string[]; days?: string[];
  today?: string; clear?: string; apply?: string; cancel?: string; presets?: string;
} = {};

export class BDateRangePicker extends FormControlComponent {

  static setLocale(locale: {
    months?: string[]; days?: string[];
    today?: string; clear?: string; apply?: string; cancel?: string; presets?: string;
  }) {
    _globalLocale = locale;
  }

  static get observedAttributes() {
    return ['label', 'name', 'value', 'placeholder-start', 'placeholder-end',
            'error', 'disabled', 'required', 'hint',
            'min', 'max', 'min-days', 'max-days',
            'months-visible', 'separator', 'native', 'confirm', 'presets',
            'label-today', 'label-clear', 'label-apply', 'label-cancel', 'bare', 'description',
            'label-months', 'label-days', 'label-presets'];
  }

  static get sharedStyles() {
    return [formFieldSheet, formControlSheet];
  }

  static get styles() {
    return `
      :host { display: block; position: relative; }

      .drp-wrap { position: relative; display: flex; align-items: center; gap: var(--b-space-xs, 0.25rem); }
      .drp-input {
        cursor: pointer;
        caret-color: transparent;
        flex: 1 1 0;
        min-width: 0;
      }
      .drp-input:read-only { cursor: pointer; }
      .drp-sep {
        color: var(--b-text-muted);
        font-size: var(--b-text-sm, 0.8125rem);
        user-select: none;
      }
      .drp-clear {
        position: absolute;
        right: var(--b-space-sm, 0.5rem);
        top: 50%; transform: translateY(-50%);
        background: none; border: none; cursor: pointer;
        color: var(--b-text-muted); font-size: var(--b-text-base, 0.875rem);
        padding: 0; line-height: 1;
      }
      .drp-clear:hover { color: var(--b-text); }

      .drp-panel {
        display: none;
        position: fixed;
        z-index: 10;
        background: var(--b-bg-elevated);
        border: var(--b-border-width, 1px) solid var(--b-border);
        border-radius: var(--b-radius, 0.375rem);
        box-shadow: var(--b-shadow-md);
        padding: var(--b-space-md, 0.75rem);
        user-select: none;
      }
      .drp-panel.open { display: block; }

      .drp-months {
        display: grid;
        gap: var(--b-space-md, 0.75rem);
      }
      .drp-panel[data-months="1"] .drp-months { grid-template-columns: 1fr; }
      .drp-panel[data-months="2"] .drp-months { grid-template-columns: var(--b-date-picker-width, 17rem) var(--b-date-picker-width, 17rem); }

      .drp-month-header {
        display: flex; align-items: center; justify-content: space-between;
        margin-bottom: var(--b-space-sm, 0.5rem);
      }
      .drp-month-label {
        font-size: var(--b-text-sm, 0.8125rem);
        font-weight: var(--b-font-weight-medium, 500);
        color: var(--b-text);
      }
      .drp-nav {
        background: none; border: none; cursor: pointer;
        color: var(--b-text-muted); font-size: var(--b-text-sm, 0.8125rem);
        padding: var(--b-space-2xs, 0.125rem) var(--b-space-xs, 0.25rem);
        border-radius: var(--b-radius, 0.375rem);
        line-height: 1;
      }
      .drp-nav:hover { background: var(--b-bg-tertiary); color: var(--b-text); }
      .drp-nav:disabled { opacity: 0; pointer-events: none; }

      .drp-grid {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 0;
        text-align: center;
      }

      .drp-day-header {
        font-size: var(--b-text-xs, 0.6875rem);
        color: var(--b-text-muted);
        font-weight: var(--b-font-weight-medium, 500);
        padding: var(--b-space-2xs, 0.125rem) 0;
      }

      .drp-day {
        position: relative;
        font-size: var(--b-text-sm, 0.8125rem);
        padding: var(--b-space-2xs, 0.125rem);
        cursor: pointer;
        color: var(--b-text);
        border: none; background: none;
        line-height: 1.75;
        z-index: 0;
      }
      .drp-day:hover { color: var(--b-color-primary); }
      .drp-day.other { color: var(--b-text-muted); opacity: 0.5; }
      .drp-day.today { font-weight: var(--b-font-weight-bold, 700); }
      .drp-day.disabled { opacity: 0.3; cursor: not-allowed; pointer-events: none; }

      /* Range painting — JS sets data-range on cells, CSS paints. */
      .drp-day[data-range="in"]::before,
      .drp-day[data-range="hover-in"]::before {
        content: '';
        position: absolute;
        inset: var(--b-space-2xs, 0.125rem) 0;
        background: var(--b-bg-tertiary);
        z-index: -1;
      }
      .drp-day[data-range="hover-in"]::before { opacity: 0.5; }
      .drp-day[data-range="start"]::before,
      .drp-day[data-range="end"]::before,
      .drp-day[data-range="hover-end"]::before {
        content: '';
        position: absolute;
        inset: var(--b-space-2xs, 0.125rem) 0;
        background: var(--b-color-primary);
        border-radius: var(--b-radius, 0.375rem);
        z-index: -1;
      }
      .drp-day[data-range="hover-end"]::before {
        background: transparent;
        border: 1px dashed var(--b-color-primary);
      }
      .drp-day[data-range="start"],
      .drp-day[data-range="end"] { color: var(--b-text-inverse); }
      .drp-day[data-range="start"]:hover,
      .drp-day[data-range="end"]:hover { color: var(--b-text-inverse); }

      /* When start has trailing in-range neighbor, square the right edge; same for end with leading neighbor. */
      .drp-day[data-range="start"][data-range-pair="true"]::before {
        border-top-right-radius: 0;
        border-bottom-right-radius: 0;
      }
      .drp-day[data-range="end"][data-range-pair="true"]::before {
        border-top-left-radius: 0;
        border-bottom-left-radius: 0;
      }

      /* Footer (presets / apply) */
      .drp-footer {
        display: flex; flex-wrap: wrap; gap: var(--b-space-xs, 0.25rem);
        align-items: center; justify-content: space-between;
        margin-top: var(--b-space-sm, 0.5rem);
        padding-top: var(--b-space-sm, 0.5rem);
        border-top: var(--b-border-width, 1px) solid var(--b-border);
      }
      .drp-presets {
        display: flex; flex-wrap: wrap; gap: var(--b-space-2xs, 0.125rem);
      }
      .drp-preset {
        background: none; border: none; cursor: pointer;
        font-size: var(--b-text-xs, 0.6875rem);
        color: var(--b-color-primary);
        padding: var(--b-space-2xs, 0.125rem) var(--b-space-xs, 0.25rem);
        border-radius: var(--b-radius, 0.375rem);
      }
      .drp-preset:hover { background: var(--b-bg-tertiary); }
      .drp-actions {
        display: flex; gap: var(--b-space-xs, 0.25rem);
        margin-left: auto;
      }
      .drp-actions button {
        background: none; border: none; cursor: pointer;
        font-size: var(--b-text-xs, 0.6875rem);
        color: var(--b-color-primary);
        padding: var(--b-space-2xs, 0.125rem) var(--b-space-sm, 0.5rem);
        border-radius: var(--b-radius, 0.375rem);
      }
      .drp-actions button:hover { background: var(--b-bg-tertiary); }
      .drp-actions button.primary {
        background: var(--b-color-primary);
        color: var(--b-text-inverse);
      }
      .drp-actions button.primary:hover { background: var(--b-color-primary-hover, var(--b-color-primary)); }
      .drp-actions button:disabled { opacity: 0.5; cursor: not-allowed; }
    `;
  }

  private _open = false;
  private _viewYear = new Date().getFullYear();
  private _viewMonth = new Date().getMonth();
  private _anchor: string | null = null;   // first click during a pick
  private _hover: string | null = null;    // hover target during pick
  private _pendingStart: string | null = null;  // for confirm mode
  private _pendingEnd: string | null = null;
  private _outsideClickHandler: ((e: Event) => void) | null = null;

  private _months(): string[] {
    const custom = this.attr('label-months');
    if (custom) {
      try { return JSON.parse(custom); } catch { /* fallback */ }
    }
    return _globalLocale.months ?? MONTH_NAMES;
  }

  private _dayHeaders(): string[] {
    const custom = this.attr('label-days');
    if (custom) {
      try { return JSON.parse(custom); } catch { /* fallback */ }
    }
    return _globalLocale.days ?? DAY_HEADERS;
  }

  private _label(attrName: string, localeKey: keyof typeof _globalLocale, i18nKey: string, fallback: string): string {
    const a = this.getAttribute(attrName);
    if (a !== null) return a;
    return (_globalLocale[localeKey] as string | undefined) ?? t(i18nKey, undefined, fallback);
  }

  private _monthsVisible(): 1 | 2 {
    return this.attr('months-visible') === '1' ? 1 : 2;
  }

  private _isConfirm(): boolean {
    return this.boolAttr('confirm');
  }

  private _minDays(): number {
    const v = parseInt(this.attr('min-days') ?? '0', 10);
    return isNaN(v) ? 0 : v;
  }

  private _maxDays(): number {
    const v = parseInt(this.attr('max-days') ?? '', 10);
    return isNaN(v) ? Number.POSITIVE_INFINITY : v;
  }

  private _readPresets(): RangePreset[] {
    const raw = this.attr('presets');
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as RangePreset[];
    } catch { /* ignore */ }
    return [];
  }

  /** Resolve preset tokens (today, -7d, month-start, year-start, quarter-start) to ISO date strings. */
  private _resolveToken(token: string): string {
    if (!token) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(token)) return token;
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
    if (token === 'today') return toISO(y, m, d);
    if (token === 'yesterday') {
      const dt = new Date(y, m, d - 1);
      return toISO(dt.getFullYear(), dt.getMonth(), dt.getDate());
    }
    if (token === 'month-start') return toISO(y, m, 1);
    if (token === 'month-end') return toISO(y, m, daysInMonth(y, m));
    if (token === 'year-start') return toISO(y, 0, 1);
    if (token === 'year-end') return toISO(y, 11, 31);
    if (token === 'quarter-start') {
      const qm = Math.floor(m / 3) * 3;
      return toISO(y, qm, 1);
    }
    const rel = token.match(/^([+-]?\d+)([dwmy])$/);
    if (rel) {
      const n = parseInt(rel[1], 10);
      const unit = rel[2];
      const dt = new Date(y, m, d);
      if (unit === 'd') dt.setDate(d + n);
      else if (unit === 'w') dt.setDate(d + n * 7);
      else if (unit === 'm') dt.setMonth(m + n);
      else if (unit === 'y') dt.setFullYear(y + n);
      return toISO(dt.getFullYear(), dt.getMonth(), dt.getDate());
    }
    return token;
  }

  // ── Value contract ──

  get value(): string { return this.inputValue; }
  set value(v: string) { this.inputValue = v; }

  /** Canonical string: ISO interval `"start/end"`, or `""` if either endpoint is missing. */
  get inputValue(): string {
    const r = this._currentRange();
    if (!r || !r.start || !r.end) return '';
    return `${r.start}/${r.end}`;
  }

  set inputValue(v: string | RangeValue | null | undefined) {
    if (v == null || v === '') {
      this.removeAttribute('value');
      this._syncInputs();
      return;
    }
    if (typeof v === 'object') {
      const start = v.start ?? '';
      const end = v.end ?? '';
      if (start && end) this.setAttribute('value', `${start}/${end}`);
      else this.removeAttribute('value');
      this._syncInputs();
      return;
    }
    this.setAttribute('value', v);
    this._syncInputs();
  }

  /**
   * Submits `${name}-start` / `${name}-end` as two ISO dates. Same reasoning as `b-range`'s range mode:
   * one control, two values, no native equivalent — so two ordinary fields rather than making the server
   * split the `"start/end"` interval string that `value` returns for back-compat.
   */
  protected formValue(): FormData | null {
    const r = this._currentRange();
    return this.suffixedFormValue([['start', r?.start ?? ''], ['end', r?.end ?? '']]);
  }

  /** The `.drp-input-*` boxes hold formatted display text, not the ISO values. */
  protected validationSource(): undefined {
    return undefined;
  }

  protected formAnchor(): HTMLElement | undefined {
    return this.$<HTMLElement>('.drp-input-start') ?? this.$<HTMLElement>('input') ?? undefined;
  }

  getRange(): RangeValue | null {
    return this._currentRange();
  }

  setRange(range: { start: string; end: string } | null): void {
    if (!range || !range.start || !range.end) {
      this._commit('', '');
      return;
    }
    this._commit(range.start, range.end);
  }

  setPresets(presets: RangePreset[]): void {
    this.setAttribute('presets', JSON.stringify(presets));
  }

  clear(): void {
    this._commit('', '');
  }

  private _currentRange(): RangeValue | null {
    const raw = this.attr('value');
    if (!raw) return null;
    const idx = raw.indexOf('/');
    if (idx < 0) return null;
    const start = raw.slice(0, idx);
    const end = raw.slice(idx + 1);
    if (!parseDate(start) || !parseDate(end)) return null;
    return { start, end };
  }

  // ── Rendering ──

  render() {
    if (this.boolAttr('native')) return this._renderNative();
    return this._renderCustom();
  }

  private _renderNative(): string {
    const label = this.attr('label');
    const hint = this.attr('hint');
    const error = this.attr('error');
    const disabled = this.boolAttr('disabled');
    const range = this._currentRange();
    const name = this.attr('name') ?? '';
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
        <div class="drp-wrap">
          <input type="date"
                 class="drp-native-start ${error ? 'has-error' : ''}"
                 name="${name}-start"
                 value="${range?.start ?? ''}"
                 aria-label="${this.label('label-start', 'bwc.daterange.placeholderStart', 'Start date')}"
                 ${this.attr('min') ? `min="${this.attr('min')}"` : ''}
                 ${this.attr('max') ? `max="${this.attr('max')}"` : ''}
                 ${this.boolAttr('required') ? 'required' : ''}
                 ${fieldAria({ uid: this.uid, error, description, bare, label })}
                 ${disabled ? 'disabled' : ''} />
          <span class="drp-sep" aria-hidden="true">${this.attr('separator') ?? '→'}</span>
          <input type="date"
                 class="drp-native-end ${error ? 'has-error' : ''}"
                 name="${name}-end"
                 value="${range?.end ?? ''}"
                 aria-label="${this.label('label-end', 'bwc.daterange.placeholderEnd', 'End date')}"
                 ${this.attr('min') ? `min="${this.attr('min')}"` : ''}
                 ${this.attr('max') ? `max="${this.attr('max')}"` : ''}
                 ${this.boolAttr('required') ? 'required' : ''}
                 ${fieldAria({ uid: this.uid, error, description, bare, label })}
                 ${disabled ? 'disabled' : ''} />
        </div>`,
    });

  }

  private _renderCustom(): string {
    const label = this.attr('label');
    const hint = this.attr('hint');
    const error = this.attr('error');
    const range = this._currentRange();
    const phStart = this.label('placeholder-start', 'bwc.daterange.placeholderStart', 'Start date');
    const phEnd = this.label('placeholder-end', 'bwc.daterange.placeholderEnd', 'End date');
    const sep = this.attr('separator') ?? '→';
    const disabled = this.boolAttr('disabled');
    const months = this._monthsVisible();
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
        <div class="drp-wrap">
          <input class="drp-input drp-input-start ${error ? 'has-error' : ''}"
                 type="text" readonly
                 value="${formatDisplay(range?.start ?? '')}"
                 placeholder="${phStart}"
                 aria-label="${phStart}"
                 ${/* No label passed: each endpoint already carries its own aria-label above, and a
                       second one would be a DUPLICATE attribute (the first wins). The endpoint's own
                       Start date / End date is the more useful name anyway. */
                   fieldAria({ uid: this.uid, error, required: this.boolAttr('required'), description, bare })}
                 ${disabled ? 'disabled' : ''} />
          <span class="drp-sep" aria-hidden="true">${sep}</span>
          <input class="drp-input drp-input-end ${error ? 'has-error' : ''}"
                 type="text" readonly
                 value="${formatDisplay(range?.end ?? '')}"
                 placeholder="${phEnd}"
                 aria-label="${phEnd}"
                 ${/* No label passed: each endpoint already carries its own aria-label above, and a
                       second one would be a DUPLICATE attribute (the first wins). The endpoint's own
                       Start date / End date is the more useful name anyway. */
                   fieldAria({ uid: this.uid, error, required: this.boolAttr('required'), description, bare })}
                 ${disabled ? 'disabled' : ''} />
          ${range && !disabled ? '<button class="drp-clear" type="button" aria-label="Clear">&times;</button>' : ''}
        </div>
        <div class="drp-panel ${this._open ? 'open' : ''}" data-months="${months}">
          ${this._renderPanelBody()}
        </div>`,
    });

  }

  private _renderPanelBody(): string {
    const monthsVis = this._monthsVisible();
    const monthsHtml: string[] = [];
    for (let i = 0; i < monthsVis; i++) {
      const { year, month } = addMonths(this._viewYear, this._viewMonth, i);
      monthsHtml.push(this._renderMonth(year, month, i, monthsVis));
    }

    const presets = this._readPresets();
    const confirm = this._isConfirm();
    const showFooter = presets.length > 0 || confirm;

    const todayLabel = this._label('label-today', 'today', 'bwc.datetime.today', 'Today');
    const clearLabel = this._label('label-clear', 'clear', 'bwc.common.clear', 'Clear');
    const applyLabel = this._label('label-apply', 'apply', 'bwc.daterange.apply', 'Apply');
    const cancelLabel = this._label('label-cancel', 'cancel', 'bwc.common.cancel', 'Cancel');

    let footer = '';
    if (showFooter) {
      const presetButtons = presets.map((p, i) => {
        const label = t(p.label, undefined, p.label);
        return `<button class="drp-preset" type="button" data-preset="${i}">${label}</button>`;
      }).join('');

      const actions = confirm
        ? `<div class="drp-actions">
             <button type="button" data-nav="cancel">${cancelLabel}</button>
             <button type="button" class="primary" data-nav="apply" ${this._canApply() ? '' : 'disabled'}>${applyLabel}</button>
           </div>`
        : `<div class="drp-actions">
             <button type="button" data-nav="today">${todayLabel}</button>
             <button type="button" data-nav="clear">${clearLabel}</button>
           </div>`;

      footer = `<div class="drp-footer"><div class="drp-presets">${presetButtons}</div>${actions}</div>`;
    }

    return `
      <div class="drp-months">${monthsHtml.join('')}</div>
      ${footer}
    `;
  }

  private _renderMonth(y: number, m: number, idx: number, total: number): string {
    const months = this._months();
    const dayHeaders = this._dayHeaders();
    const todayISO = toISO(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    const minDate = this.attr('min') ?? '';
    const maxDate = this.attr('max') ?? '';

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
      cells.push(`<button class="drp-day other ${dis ? 'disabled' : ''}" data-date="${iso}" type="button">${d}</button>`);
    }

    for (let d = 1; d <= totalDays; d++) {
      const iso = toISO(y, m, d);
      const cls: string[] = ['drp-day'];
      if (iso === todayISO) cls.push('today');
      if (this._isDisabled(iso, minDate, maxDate)) cls.push('disabled');
      cells.push(`<button class="${cls.join(' ')}" data-date="${iso}" type="button">${d}</button>`);
    }

    const remaining = DAYS_IN_WEEK - (cells.length % DAYS_IN_WEEK);
    if (remaining < DAYS_IN_WEEK) {
      for (let d = 1; d <= remaining; d++) {
        const nm = m === 11 ? 0 : m + 1;
        const ny = m === 11 ? y + 1 : y;
        const iso = toISO(ny, nm, d);
        const dis = this._isDisabled(iso, minDate, maxDate);
        cells.push(`<button class="drp-day other ${dis ? 'disabled' : ''}" data-date="${iso}" type="button">${d}</button>`);
      }
    }

    const isFirst = idx === 0;
    const isLast = idx === total - 1;
    return `
      <section class="drp-month" aria-label="${months[m]} ${y}">
        <header class="drp-month-header">
          <button class="drp-nav" type="button" data-nav="prev-month" ${isFirst ? '' : 'disabled'} aria-label="Previous month">&#9664;</button>
          <span class="drp-month-label">${months[m]} ${y}</span>
          <button class="drp-nav" type="button" data-nav="next-month" ${isLast ? '' : 'disabled'} aria-label="Next month">&#9654;</button>
        </header>
        <div class="drp-grid">
          ${dayHeaders.map(d => `<span class="drp-day-header">${d}</span>`).join('')}
          ${cells.join('')}
        </div>
      </section>
    `;
  }

  private _isDisabled(iso: string, min: string, max: string): boolean {
    if (min && iso < min) return true;
    if (max && iso > max) return true;
    return false;
  }

  private _canApply(): boolean {
    return !!(this._pendingStart && this._pendingEnd);
  }

  // ── Wiring ──

  protected onUpdated() {
    // Before the native/custom split and its early returns: presets, panel clicks and `inputValue` all
    // re-render without necessarily emitting.
    this.syncFormState();

    if (this.boolAttr('native')) {
      this._wireNative();
      return;
    }

    const startInput = this.$<HTMLInputElement>('.drp-input-start');
    const endInput = this.$<HTMLInputElement>('.drp-input-end');
    const panel = this.$<HTMLElement>('.drp-panel');
    if (!startInput || !endInput || !panel) return;

    const openOn = (focusEnd: boolean) => {
      if (this.boolAttr('disabled')) return;
      if (this._open) this._close();
      else this._openPanel(focusEnd ? endInput : startInput, panel);
    };

    this.listen(startInput, 'click', () => openOn(false));
    this.listen(endInput, 'click', () => openOn(true));

    const clearBtn = this.$('.drp-clear');
    if (clearBtn) {
      this.listen(clearBtn, 'click', (e: Event) => {
        e.stopPropagation();
        this._commit('', '');
      });
    }

    this.listen(panel, 'click', (e: Event) => this._onPanelClick(e));
    this.listen(panel, 'mouseover', (e: Event) => this._onPanelHover(e));
    this.listen(panel, 'mouseleave', () => {
      this._hover = null;
      this._paintRange();
    });

    if (this._outsideClickHandler) {
      document.removeEventListener('mousedown', this._outsideClickHandler);
    }
    this._outsideClickHandler = (e: Event) => {
      const path = e.composedPath();
      if (!path.includes(startInput) && !path.includes(endInput) && !path.includes(panel)) {
        this._close();
      }
    };
    this.listen(document, 'mousedown', this._outsideClickHandler);

    this.listen(startInput, 'keydown', (e: Event) => this._onInputKeydown(e, false));
    this.listen(endInput, 'keydown', (e: Event) => this._onInputKeydown(e, true));
  }

  private _onInputKeydown(e: Event, isEnd: boolean) {
    const ke = e as KeyboardEvent;
    if (ke.key === 'Escape') {
      if (this._isConfirm()) this._cancelPending();
      this._close();
    }
    if (ke.key === 'Enter' || ke.key === ' ') {
      e.preventDefault();
      if (!this._open) {
        const input = this.$<HTMLInputElement>(isEnd ? '.drp-input-end' : '.drp-input-start');
        const panel = this.$<HTMLElement>('.drp-panel');
        if (input && panel) this._openPanel(input, panel);
      }
    }
  }

  private _onPanelClick(e: Event) {
    const target = e.target as HTMLElement;

    const date = target.dataset.date;
    if (date && !target.classList.contains('disabled')) {
      this._pickDate(date);
      return;
    }

    const presetIdx = target.dataset.preset;
    if (presetIdx !== undefined) {
      const presets = this._readPresets();
      const p = presets[parseInt(presetIdx, 10)];
      if (p) {
        const start = this._resolveToken(p.start);
        const end = this._resolveToken(p.end);
        if (this._isConfirm()) {
          this._pendingStart = start;
          this._pendingEnd = end;
          this._anchor = null;
          this._paintRange();
          this._refreshFooter();
        } else {
          this._commit(start, end);
        }
      }
      return;
    }

    const nav = target.dataset.nav ?? target.closest<HTMLElement>('[data-nav]')?.dataset.nav;
    if (!nav) return;
    switch (nav) {
      case 'prev-month': this._shiftView(-1); break;
      case 'next-month': this._shiftView(1); break;
      case 'today': {
        const now = new Date();
        const iso = toISO(now.getFullYear(), now.getMonth(), now.getDate());
        this._commit(iso, iso);
        break;
      }
      case 'clear':
        this._commit('', '');
        break;
      case 'apply':
        if (this._pendingStart && this._pendingEnd) {
          this._commit(this._pendingStart, this._pendingEnd);
        }
        break;
      case 'cancel':
        this._cancelPending();
        this._close();
        break;
    }
  }

  private _onPanelHover(e: Event) {
    const target = e.target as HTMLElement;
    const date = target.dataset?.date;
    if (!date || target.classList.contains('disabled')) {
      if (this._hover !== null) {
        this._hover = null;
        this._paintRange();
      }
      return;
    }
    if (this._anchor && date !== this._hover) {
      this._hover = date;
      this._paintRange();
      this.emit('range-preview', this._previewBounds());
    }
  }

  private _shiftView(delta: number) {
    const { year, month } = addMonths(this._viewYear, this._viewMonth, delta);
    this._viewYear = year;
    this._viewMonth = month;
    this._refreshPanel();
  }

  private _pickDate(iso: string) {
    if (!this._anchor) {
      // First click — set anchor, clear any existing range (in non-confirm) or pending (in confirm)
      this._anchor = iso;
      this._hover = iso;
      if (this._isConfirm()) {
        this._pendingStart = iso;
        this._pendingEnd = null;
      } else {
        // Visually clear existing complete range while picking
        this._paintRange();
      }
      this._paintRange();
      this._refreshFooter();
      return;
    }

    // Second click — finalize endpoints
    let start = this._anchor;
    let end = iso;
    if (end < start) { const tmp = start; start = end; end = tmp; }

    // Constraints
    const span = daysBetween(start, end);
    const minD = this._minDays();
    const maxD = this._maxDays();
    if (span < minD) {
      // Extend end to meet min
      const a = parseDate(start)!;
      const dt = new Date(a.year, a.month, a.day + minD);
      end = toISO(dt.getFullYear(), dt.getMonth(), dt.getDate());
    } else if (span > maxD) {
      const a = parseDate(start)!;
      const dt = new Date(a.year, a.month, a.day + maxD);
      end = toISO(dt.getFullYear(), dt.getMonth(), dt.getDate());
    }

    if (this._isConfirm()) {
      this._pendingStart = start;
      this._pendingEnd = end;
      this._anchor = null;
      this._hover = null;
      this._paintRange();
      this._refreshFooter();
      return;
    }

    this._commit(start, end);
  }

  private _previewBounds(): { start: string; end: string } {
    if (!this._anchor) return { start: '', end: '' };
    const a = this._anchor;
    const b = this._hover ?? a;
    return a <= b ? { start: a, end: b } : { start: b, end: a };
  }

  private _cancelPending() {
    this._anchor = null;
    this._hover = null;
    this._pendingStart = null;
    this._pendingEnd = null;
  }

  private _commit(start: string, end: string) {
    this._anchor = null;
    this._hover = null;
    this._pendingStart = null;
    this._pendingEnd = null;

    if (!start || !end) {
      this.removeAttribute('value');
    } else {
      this.setAttribute('value', `${start}/${end}`);
    }
    this._syncInputs();
    this._close();
    this.emit('change', {
      name: this.attr('name'),
      value: start && end ? { start, end } : null,
    });
  }

  private _syncInputs() {
    const range = this._currentRange();
    const startInput = this.$<HTMLInputElement>('.drp-input-start');
    const endInput = this.$<HTMLInputElement>('.drp-input-end');
    if (startInput) startInput.value = formatDisplay(range?.start ?? '');
    if (endInput) endInput.value = formatDisplay(range?.end ?? '');

    const wrap = this.$<HTMLElement>('.drp-wrap');
    if (wrap) {
      const existing = wrap.querySelector('.drp-clear');
      if (range && !existing && !this.boolAttr('disabled')) {
        endInput?.insertAdjacentHTML('afterend', '<button class="drp-clear" type="button" aria-label="Clear">&times;</button>');
        wrap.querySelector('.drp-clear')?.addEventListener('click', (e) => {
          e.stopPropagation();
          this._commit('', '');
        });
      } else if (!range && existing) {
        existing.remove();
      }
    }
  }

  private _openPanel(input: HTMLElement, panel: HTMLElement) {
    // Initialize view to range start or today
    const range = this._currentRange();
    if (range) {
      const p = parseDate(range.start);
      if (p) { this._viewYear = p.year; this._viewMonth = p.month; }
      if (this._isConfirm()) {
        this._pendingStart = range.start;
        this._pendingEnd = range.end;
      }
    } else {
      const now = new Date();
      this._viewYear = now.getFullYear();
      this._viewMonth = now.getMonth();
    }
    this._anchor = null;
    this._hover = null;
    this._open = true;
    panel.classList.add('open');
    this._refreshPanel();

    // Position
    const rect = input.getBoundingClientRect();
    const wrap = this.$<HTMLElement>('.drp-wrap');
    const anchorRect = wrap?.getBoundingClientRect() ?? rect;
    const gap = 4;
    panel.style.left = `${anchorRect.left}px`;
    const spaceBelow = window.innerHeight - anchorRect.bottom;
    if (spaceBelow < 360 && anchorRect.top > spaceBelow) {
      panel.style.top = '';
      panel.style.bottom = `${window.innerHeight - anchorRect.top + gap}px`;
    } else {
      panel.style.bottom = '';
      panel.style.top = `${anchorRect.bottom + gap}px`;
    }
  }

  private _close() {
    if (!this._open) return;
    this._open = false;
    this._anchor = null;
    this._hover = null;
    this.$<HTMLElement>('.drp-panel')?.classList.remove('open');
  }

  private _refreshPanel() {
    const panel = this.$<HTMLElement>('.drp-panel');
    if (!panel) return;
    panel.innerHTML = this._renderPanelBody();
    this._paintRange();
  }

  private _refreshFooter() {
    // Re-render the whole panel body — footer's apply-button enabled state depends on _pending*
    this._refreshPanel();
  }

  /**
   * Paint range state onto day cells by setting `data-range` attribute.
   * No innerHTML rewrite — smooth across hover updates.
   */
  private _paintRange(): void {
    const panel = this.$<HTMLElement>('.drp-panel');
    if (!panel) return;

    let start = '', end = '';
    const inPick = this._anchor !== null;

    if (this._isConfirm() && this._pendingStart && this._pendingEnd && !inPick) {
      start = this._pendingStart;
      end = this._pendingEnd;
    } else if (inPick) {
      const b = this._previewBounds();
      start = b.start; end = b.end;
    } else {
      const r = this._currentRange();
      if (r) { start = r.start; end = r.end; }
    }

    const previewMode = inPick;
    const cells = panel.querySelectorAll<HTMLElement>('.drp-day[data-date]');
    cells.forEach(cell => {
      const d = cell.dataset.date!;
      cell.removeAttribute('data-range');
      cell.removeAttribute('data-range-pair');
      if (!start) return;
      if (d === start && d === end) {
        cell.setAttribute('data-range', previewMode ? 'hover-end' : 'start');
        return;
      }
      if (d === start) {
        cell.setAttribute('data-range', 'start');
        if (end > start) cell.setAttribute('data-range-pair', 'true');
        return;
      }
      if (d === end) {
        cell.setAttribute('data-range', previewMode ? 'hover-end' : 'end');
        cell.setAttribute('data-range-pair', 'true');
        return;
      }
      if (start && end && d > start && d < end) {
        cell.setAttribute('data-range', previewMode ? 'hover-in' : 'in');
      }
    });
  }

  // ── Native ──

  private _wireNative() {
    const startEl = this.$<HTMLInputElement>('.drp-native-start');
    const endEl = this.$<HTMLInputElement>('.drp-native-end');
    if (!startEl || !endEl) return;
    const range = this._currentRange();
    startEl.value = range?.start ?? '';
    endEl.value = range?.end ?? '';

    const sync = () => {
      let s = startEl.value, e = endEl.value;
      if (s && e && e < s) { const t = s; s = e; e = t; }
      if (s && e) {
        this.setAttribute('value', `${s}/${e}`);
        this.emit('change', { name: this.attr('name'), value: { start: s, end: e } });
      } else {
        this.removeAttribute('value');
        this.emit('change', { name: this.attr('name'), value: null });
      }
    };
    this.listen(startEl, 'change', sync);
    this.listen(endEl, 'change', sync);
  }
}

define('b-date-range-picker', BDateRangePicker);
