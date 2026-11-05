import { FormControlComponent, define, getI18n } from 'birko-web-core';
import { escapeAttr } from '../dom-utils';
import './b-select.js';
import './b-multi-select.js';
import type { BSelect } from './b-select.js';
import type { BMultiSelect } from './b-multi-select.js';
import {
  COUNTRY_CODES, countryLabel, countryName, getCountryGroup, isCountryCodeShape, normalizeCountryValue,
} from './countries.js';

/**
 * A country picker (TASK-817, for Symbio): one country, or several with `multiple`. The value is always ISO 3166-1
 * alpha-2 codes, upper case — `"SK"`, or `"CZ,SK"` for several — and the list shows "🇸🇰 Slovensko (SK)", named by
 * `Intl.DisplayNames` in the current i18n locale. Searching finds a name or a code, accents ignored.
 *
 * It renders a searchable `b-select` (one) or `b-multi-select` (several) and holds the value itself, so a locale
 * switch renames the list without touching the selection.
 *
 * - `countries="CZ,SK,AT"` offers only those; `preferred="CZ,SK"` puts those first.
 * - With `multiple`, `groups="eu"` (the default) shows group shortcuts; `groups=""` none. An app adds its own with
 *   `registerCountryGroup`.
 * - A stored value that is not a code (an old row holding "Slovakia") stays selected and is shown as itself, so
 *   saving the form does not lose it.
 *
 * Emits `change` with `{ name, value, values }`: the comma string and the list.
 */
export class BCountrySelect extends FormControlComponent {
  static get observedAttributes() {
    return ['label', 'name', 'value', 'multiple', 'placeholder', 'error', 'disabled', 'required', 'hint', 'description',
      'bare', 'no-clear', 'no-flags', 'countries', 'preferred', 'groups'];
  }

  private _selected: string[] = [];
  /** The `value` attribute last read, so a re-render does not undo a pick with a stale attribute. */
  private _valueAttr: string | null = null;
  /** What the inner control was last given: options and picks are pushed only when they change. */
  private _fedInner: Element | null = null;
  private _fedKey = '';

  static get styles() {
    return `:host { display: block; }`;
  }

  // ── Value ──

  get value(): string { return this.inputValue; }
  set value(v: string) { this.inputValue = v; }

  get inputValue(): string { return this.getSelected().join(','); }
  set inputValue(v: string) { this.setSelected(v ? v.split(',') : []); }

  /** The selected codes. One at most without `multiple`. */
  getSelected(): string[] {
    return [...this._selected];
  }

  /** Selects these codes (lower case is upper-cased); without `multiple` only the first is kept. */
  setSelected(values: readonly string[]) {
    const next = this._normalize(values);
    this._selected = next;
    this.update();
  }

  protected formValue(): string | FormData | null {
    if (this.boolAttr('multiple')) return this.multiFormValue(this._selected);
    return this._selected[0] ?? null;
  }

  protected captureInitialState(): unknown {
    return this.getSelected();
  }

  protected restoreInitialState(state: unknown): void {
    this.setSelected(Array.isArray(state) ? state as string[] : []);
  }

  protected validationSource(): undefined {
    return undefined;
  }

  protected formAnchor(): HTMLElement | undefined {
    return this.$<HTMLElement>('.country-control') ?? undefined;
  }

  // ── Rendering ──

  render() {
    const attrValue = this.getAttribute('value');
    if (attrValue !== this._valueAttr) {
      this._valueAttr = attrValue;
      this._selected = this._normalize(attrValue ? attrValue.split(',') : []);
    }
    const multiple = this.boolAttr('multiple');
    const pass = ['label', 'placeholder', 'error', 'hint', 'description']
      .map(a => this.hasAttribute(a) ? `${a}="${escapeAttr(this.getAttribute(a) ?? '')}"` : '')
      .concat(['disabled', 'required', 'bare'].map(a => this.boolAttr(a) ? a : ''))
      .filter(Boolean).join(' ');
    if (multiple) {
      return `<b-multi-select class="country-control" searchable ${pass}></b-multi-select>`;
    }
    const value = this._selected[0] ?? '';
    return `<b-select class="country-control" searchable ${this.boolAttr('no-clear') ? 'no-clear' : ''}`
      + `${value ? ` value="${escapeAttr(value)}"` : ''} ${pass}></b-select>`;
  }

  protected onUpdated() {
    const inner = this.$<HTMLElement>('.country-control');
    if (inner) {
      this._feed(inner);
      this.listen(inner, 'change', (e: Event) => {
        // The inner control's event would reach the page as this element's; it is replaced by one carrying codes.
        e.stopPropagation();
        const detail = (e as CustomEvent).detail ?? {};
        const values: string[] = this.boolAttr('multiple')
          ? (detail.values ?? (inner as unknown as BMultiSelect).getSelected())
          : (detail.value ? [detail.value] : []);
        this._selected = this._normalize(values);
        this.syncFormState();
        this.emit('change', { name: this.attr('name'), value: this.inputValue, values: this.getSelected() });
      });
    }
    this.syncFormState();
  }

  /** Pushes options (and, with `multiple`, the selection and group shortcuts) into the inner control. */
  private _feed(inner: HTMLElement) {
    const multiple = this.boolAttr('multiple');
    const locale = this._locale();
    const options = this._options(locale);
    const groups = multiple ? this._groups(options.map(o => o.value)) : [];
    const key = JSON.stringify([locale, options, groups]);
    if (this._fedInner !== inner || this._fedKey !== key) {
      this._fedInner = inner;
      this._fedKey = key;
      if (multiple) {
        const ms = inner as unknown as BMultiSelect;
        ms.setOptions(options);
        ms.setQuickPicks(groups);
      } else {
        (inner as unknown as BSelect).setOptions(options);
      }
    }
    if (multiple) {
      const ms = inner as unknown as BMultiSelect;
      if (ms.getSelected().join(',') !== this._selected.join(',')) ms.setSelected(this._selected);
    }
  }

  /** The list: the allowed codes by name, the preferred ones first, then any selected value the list lacks. */
  private _options(locale: string): { value: string; label: string }[] {
    const allowed = this._codesAttr('countries') ?? [...COUNTRY_CODES];
    const flag = !this.boolAttr('no-flags');
    const collator = new Intl.Collator(locale);
    const sorted = [...allowed].sort((a, b) => collator.compare(countryName(a, locale), countryName(b, locale)));
    const preferred = (this._codesAttr('preferred') ?? []).filter(c => allowed.includes(c));
    const ordered = [...preferred, ...sorted.filter(c => !preferred.includes(c))];
    const extra = this._selected.filter(v => !ordered.includes(v));
    return [...ordered, ...extra].map(value => ({ value, label: countryLabel(value, { locale, flag }) }));
  }

  private _groups(offered: string[]): { id: string; label: string; values: string[] }[] {
    const ids = this.hasAttribute('groups')
      ? (this.getAttribute('groups') ?? '').split(',').map(s => s.trim()).filter(Boolean)
      : ['eu'];
    return ids.flatMap(id => {
      const group = getCountryGroup(id);
      if (!group) return [];
      const values = group.codes.filter(c => offered.includes(c));
      return values.length ? [{ id, label: group.label(), values }] : [];
    });
  }

  /** A comma list of codes from an attribute, upper-cased; anything that is not two letters is dropped. */
  private _codesAttr(name: string): string[] | null {
    if (!this.hasAttribute(name)) return null;
    return (this.getAttribute(name) ?? '').split(',').map(s => s.trim().toUpperCase()).filter(isCountryCodeShape);
  }

  private _normalize(values: readonly string[]): string[] {
    const seen = new Set<string>();
    for (const v of values) {
      const n = normalizeCountryValue(String(v ?? ''));
      if (n) seen.add(n);
    }
    const list = [...seen];
    return this.boolAttr('multiple') ? list : list.slice(0, 1);
  }

  private _locale(): string {
    try { return getI18n().locale || 'en'; } catch { return 'en'; }
  }
}

define('b-country-select', BCountrySelect);
