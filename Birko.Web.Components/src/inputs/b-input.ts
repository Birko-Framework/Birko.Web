import { FormControlComponent, define, parseDecimal } from 'birko-web-core';
import { escapeAttr } from '../dom-utils';
import { formFieldSheet, formControlSheet } from '../shared-styles';
import { renderField, fieldAria } from './label-hint';

export class BInput extends FormControlComponent {
  static get observedAttributes() {
    return [
      'label', 'type', 'placeholder', 'value', 'name', 'error', 'disabled', 'required', 'hint', 'description', 'bare',
      // Passed straight through to the inner <input> — see PASSTHROUGH.
      'min', 'max', 'step', 'inputmode', 'autocomplete',
    ];
  }

  /**
   * Attributes forwarded verbatim to the inner `<input>`, omitted when unset.
   *
   * These are not styling or labelling concerns the component can own — they change what the *browser* does,
   * and a wrapper that swallows them makes the control unusable for numeric entry:
   *
   * - `min` / `max` / `step` drive **native constraint validation**. Without `min="0"` the browser accepts a
   *   negative weight; without `step="0.1"` it rejects `81.4` in a `type="number"` field, because `step`
   *   defaults to 1.
   * - `inputmode` decides **which on-screen keyboard a phone opens** (`numeric` / `decimal`). On a mobile-first
   *   app that is a primary UX property, not a detail.
   * - `autocomplete` is the only way to turn browser autofill off for a field that shouldn't have it.
   */
  private static readonly PASSTHROUGH = ['min', 'max', 'step', 'inputmode', 'autocomplete'] as const;

  /**
   * `min` / `max` / `step` are **not** forwarded for `type="decimal"`: the inner control is `type="text"`
   * there, where the browser ignores them entirely. Leaving them in the DOM would advertise a constraint
   * nothing enforces. The component enforces them itself instead — see {@link syncFormState}.
   */
  private static readonly DECIMAL_SUPPRESSED = ['min', 'max', 'step'] as const;

  /** Whether this input is in the component-level `decimal` mode (not an HTML input type). */
  private get isDecimal(): boolean {
    return this.attr('type', 'text') === 'decimal';
  }

  static get sharedStyles() {
    return [formFieldSheet, formControlSheet];
  }

  static get styles() {
    return `
      :host { display: block; }
    `;
  }

  private _value = '';
  private _suggestions: string[] = [];
  private _datalistId = `b-input-dl-${Math.random().toString(36).slice(2, 10)}`;

  /**
   * Offer autocomplete suggestions via a co-located `<datalist>`. The user can
   * still type any value — suggestions are advisory, not enforced. Pass `[]` to
   * remove the datalist.
   */
  setSuggestions(values: string[]) {
    this._suggestions = values;
    this.update();
  }

  render() {
    const label = this.attr('label');
    const error = this.attr('error');
    const description = this.attr('description');
    const bare = this.boolAttr('bare');
    const required = this.boolAttr('required');
    const hasSuggestions = this._suggestions.length > 0;
    const decimal = this.isDecimal;
    const passthrough = BInput.PASSTHROUGH
      .filter(a => this.hasAttribute(a))
      .filter(a => !(decimal && (BInput.DECIMAL_SUPPRESSED as readonly string[]).includes(a)))
      .map(a => `${a}="${escapeAttr(this.attr(a))}"`)
      .join(' ');
    // decimal → a TEXT input with the numeric keypad. `type="number"` cannot be used: its "valid
    // floating-point number" grammar accepts only `.`, so a comma-locale keypad (Slovak, Czech, German,
    // French…) cannot type a separator at all — WebKit silently drops the character and `81,8` becomes
    // `818`. That shipped as a hundredfold-wrong body weight in Reps (TASK-104). `inputmode="decimal"`
    // keeps the numeric keypad; an explicit `inputmode` still wins, since a consumer may want `numeric`.
    const innerType = decimal ? 'text' : this.attr('type', 'text');
    const decimalInputMode = decimal && !this.hasAttribute('inputmode') ? ' inputmode="decimal"' : '';
    return renderField({
      bare,
      uid: this.uid,
      label,
      hint: this.attr('hint'),
      description,
      error,
      required,
      // The <datalist> is part of the control, not the chrome — it must stay with the <input> in
      // bare mode too, or `list=` dangles and suggestions silently stop working.
      control: `
        <input
          type="${innerType}"${decimalInputMode}
          name="${this.attr('name')}"
          placeholder="${this.attr('placeholder')}"
          class="${error ? 'has-error' : ''}"
          ${this.boolAttr('disabled') ? 'disabled' : ''}
          ${required ? 'required' : ''}
          ${passthrough}
          ${fieldAria({ uid: this.uid, error, description, bare, label })}
          ${hasSuggestions ? `list="${this._datalistId}" autocomplete="off"` : ''}
        />
        ${hasSuggestions ? `<datalist id="${this._datalistId}">${
          this._suggestions.map(s => `<option value="${escapeAttr(s)}"></option>`).join('')
        }</datalist>` : ''}`,
    });
  }

  protected onUpdated() {
    const input = this.$<HTMLInputElement>('input');
    if (!input) return;

    // Restore value after re-render (attribute value or last typed value)
    input.value = this._value || this.attr('value');

    this.listen(input, 'input', (e: Event) => {
      this._value = (e.target as HTMLInputElement).value;
      this.emit('change', { name: this.attr('name'), value: this._value });
      this.syncFormState();
    });

    // Re-sync after every render, not just on input: the value may have been restored above, and the
    // `error` / `required` / `min` / `step` attributes that drive validity can change between renders.
    this.syncFormState();
  }

  // ── decimal mode ───────────────────────────────────────────────────────────────────────────────────

  /**
   * The field's value as a number, accepting **either** `,` or `.` as the separator, or `null` when it is
   * blank or unusable.
   *
   * Deliberately stricter than `parseFloat`, which accepts a prefix and discards the rest — `parseFloat('81,8')`
   * returns `81`, a plausible-looking wrong number. Trailing junk (`12abc`), two separators (`1.2.3`) and a
   * lone separator all yield `null` here.
   *
   * Available on any `b-input`; it is only *meaningful* for `type="decimal"` (and `type="number"`, where the
   * browser has already restricted what can be typed).
   */
  get numericValue(): number | null {
    return parseDecimal(this.inputValue);
  }

  /** Overridable for localisation, matching `requiredMessage()`'s style in the base class. */
  protected rangeUnderflowMessage(min: number): string { return `Value must be ${min} or more.`; }
  protected rangeOverflowMessage(max: number): string { return `Value must be ${max} or less.`; }
  protected stepMismatchMessage(step: number): string { return `Value must be a multiple of ${step}.`; }
  protected badDecimalMessage(): string { return 'Enter a number.'; }

  /**
   * Layer the numeric constraints on top of the base sync.
   *
   * `type="decimal"` renders a `type="text"` inner control, and the base class mirrors that control's
   * validity verbatim — a text input has no numeric constraints, so it reports **valid** for anything. That
   * is worse than having no validation: the control is form-associated (`FormControlComponent`), so it would
   * actively tell the form that an out-of-range value is fine. Hence the component owns `min`/`max`/`step`
   * here rather than documenting them as the consumer's problem.
   *
   * Precedence matches the base: an explicit `error` attribute is the app's verdict and wins over ours.
   */
  protected syncFormState(): void {
    super.syncFormState();
    if (!this.isDecimal || this.getAttribute('error')) return;

    const raw = this.inputValue.trim();
    const anchor = this.formAnchor();
    if (raw === '') return; // blank is `required`'s business, which the base already handled

    const n = parseDecimal(raw);
    if (n === null) {
      this.internals.setValidity({ badInput: true }, this.badDecimalMessage(), anchor);
      return;
    }
    const min = parseDecimal(this.attr('min'));
    const max = parseDecimal(this.attr('max'));
    const step = parseDecimal(this.attr('step'));

    if (min !== null && n < min) {
      this.internals.setValidity({ rangeUnderflow: true }, this.rangeUnderflowMessage(min), anchor);
      return;
    }
    if (max !== null && n > max) {
      this.internals.setValidity({ rangeOverflow: true }, this.rangeOverflowMessage(max), anchor);
      return;
    }
    // No `step` attribute means NO step constraint — the common case, and the one a free-typed decimal
    // wants. A `step` here is a genuine constraint, not a stepper's increment: `step="0.5"` really does
    // make `81.8` invalid. A consumer whose ± buttons move by 0.5 but who still accepts arbitrary typed
    // values must therefore keep that increment locally and leave `step` unset.
    if (step !== null && step > 0 && !BInput.isStepAligned(n, min ?? 0, step)) {
      this.internals.setValidity({ stepMismatch: true }, this.stepMismatchMessage(step), anchor);
    }
  }

  /**
   * Step check done in a scaled integer domain rather than with `%`. Floating point makes the direct test
   * unreliable for exactly the values decimals are used for: `(0.3 - 0) % 0.1` is `0.09999999999999998`,
   * so a legitimate 0.3 against `step="0.1"` would be reported as a mismatch.
   */
  private static isStepAligned(value: number, base: number, step: number): boolean {
    const decimals = (n: number) => (String(n).split('.')[1] ?? '').length;
    const scale = 10 ** Math.min(10, Math.max(decimals(value), decimals(base), decimals(step)));
    const offset = Math.round(value * scale) - Math.round(base * scale);
    return offset % Math.round(step * scale) === 0;
  }

  get value(): string { return this.inputValue; }
  set value(v: string) { this.inputValue = v; }

  get inputValue(): string {
    return this.$<HTMLInputElement>('input')?.value ?? this._value;
  }

  set inputValue(v: string) {
    this._value = v;
    const input = this.$<HTMLInputElement>('input');
    if (input) input.value = v;
    this.syncFormState();
  }
}

define('b-input', BInput);
