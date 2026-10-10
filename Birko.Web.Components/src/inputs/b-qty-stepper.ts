import { FormControlComponent, define, getI18n, parseDecimal } from 'birko-web-core';
import { escapeAttr, escapeHtml } from '../dom-utils';
import { formFieldSheet, formControlSheet, srOnlySheet } from '../shared-styles';
import { renderField, fieldAria } from './label-hint';

/**
 * A value on the stepper's grid, held as an integer in a scaled domain so no step ever drifts: with
 * `step="0.1"` three increments are exactly `0.3`, never `0.30000000000000004`. `scale` is the power of ten
 * that makes `min`, `step` and the value all integers.
 */
interface Grid {
  scale: number;
  /** Fraction digits the grid needs — `log10(scale)`. */
  digits: number;
  /** `min` in scaled units. */
  min: number;
  /** `step` in scaled units, always > 0. */
  step: number;
  /** The highest number of steps above `min` that stays within `max`, or `null` when there is no max. */
  maxSteps: number | null;
}

/**
 * Quantity stepper — − / + buttons around a typed field, for a quantity with a decimal step, a minimum, an
 * optional maximum and a unit label (fabric in 0.5 m steps, pieces by 1).
 *
 * Form-associated (`FormControlComponent`): submits `value` under `name`, takes part in `required`,
 * `form.reset()` and `<fieldset disabled>`. Emits `change` with `{ name, value }` once per **committed**
 * value — a button press, an arrow key, or typed text on blur / Enter — never per keystroke.
 *
 * Values are canonical strings with a `.` separator (`"1.5"`), whatever the locale shows (`1,5`).
 *
 * **What the user does is snapped; what the app sets is not.** Typed text is clamped to `[min, max]` and
 * rounded to the nearest step on the grid anchored at `min` (ties go up), visibly. A `value` assigned by
 * the app (attribute or property) is kept verbatim and, when off the grid or out of range, reported through
 * validity (`stepMismatch` / `rangeUnderflow` / `rangeOverflow`) — silently changing a quantity the server
 * sent would show the user a number nobody stored.
 */
export class BQtyStepper extends FormControlComponent {
  static get observedAttributes() {
    return [
      'label', 'name', 'value', 'min', 'max', 'step', 'unit', 'placeholder',
      'error', 'disabled', 'required', 'hint', 'description', 'bare',
      'label-decrement', 'label-increment',
    ];
  }

  static get sharedStyles() {
    return [formFieldSheet, formControlSheet, srOnlySheet];
  }

  static get styles() {
    return `
      :host { display: block; }
      .stepper {
        display: inline-flex;
        align-items: center;
        gap: var(--b-space-xs, 0.25rem);
        max-width: 100%;
      }
      /* No font-size here: formControlSheet owns it, including the iOS 16px floor under a coarse pointer. */
      input {
        width: calc(var(--b-control-min-height, 2.375rem) * 2);
        text-align: center;
        font-variant-numeric: tabular-nums;
      }
      .step {
        box-sizing: border-box;
        flex: none;
        min-width: var(--b-control-min-height, 2.375rem);
        min-height: var(--b-control-min-height, 2.375rem);
        padding: 0;
        border: var(--b-border-width, 1px) solid var(--b-border);
        border-radius: var(--b-radius, 0.375rem);
        background: var(--b-bg);
        color: var(--b-text);
        font-family: inherit;
        font-size: var(--b-icon-base, 1rem);
        line-height: 1;
        cursor: pointer;
        transition: background var(--b-transition, 150ms ease);
      }
      .step:hover:not(:disabled):not([aria-disabled="true"]) { background: var(--b-bg-tertiary); }
      .step:focus-visible { outline: none; box-shadow: var(--b-focus-ring); }
      .step:disabled, .step[aria-disabled="true"] { opacity: var(--b-disabled-opacity, 0.5); cursor: not-allowed; }
      .unit { color: var(--b-text-secondary); white-space: nowrap; }
      :host([size="sm"]) .step {
        min-width: var(--b-control-min-height-sm, 1.75rem);
        min-height: var(--b-control-min-height-sm, 1.75rem);
      }
      :host([size="sm"]) .unit { font-size: var(--b-text-sm, 0.8125rem); }
      :host([size="lg"]) .step {
        min-width: var(--b-control-min-height-lg, 2.75rem);
        min-height: var(--b-control-min-height-lg, 2.75rem);
      }
      /* Touch floor on the buttons, both axes: a stepper is tapped on a phone more than anywhere else. */
      @media (pointer: coarse) {
        .step {
          min-width: max(var(--b-control-min-height-lg, 2.75rem), 44px);
          min-height: max(var(--b-control-min-height-lg, 2.75rem), 44px);
        }
      }
    `;
  }

  /** The live value (canonical, `''` for empty), or `null` for "never set" — then the attribute rules. */
  private _value: string | null = null;
  /** Text typed since the last commit, so a re-render mid-typing does not throw it away. */
  private _draft: string | null = null;

  render() {
    const label = this.attr('label');
    const error = this.attr('error');
    const description = this.attr('description');
    const bare = this.boolAttr('bare');
    const required = this.boolAttr('required');
    const disabled = this.boolAttr('disabled');
    const unit = this.attr('unit');
    // Named after the field when it has a label: a cart renders one stepper per line, and a screen reader's
    // list of buttons reading "Increase, Increase, Increase" says nothing about which line each one is.
    const dec = escapeAttr(label
      ? this.label('label-decrement', 'bwc.qtyStepper.decrementNamed', 'Decrease {label}', { label })
      : this.label('label-decrement', 'bwc.qtyStepper.decrement', 'Decrease'));
    const inc = escapeAttr(label
      ? this.label('label-increment', 'bwc.qtyStepper.incrementNamed', 'Increase {label}', { label })
      : this.label('label-increment', 'bwc.qtyStepper.increment', 'Increase'));
    // A plain text field, not role="spinbutton": Chrome drops aria-valuetext on a text input (measured), so the
    // unit was never read, and Narrator could not reach a skipped-by-Tab button. So the field is an ordinary edit
    // field with the unit as its description, and − / + are ordinary buttons in the Tab order (owner's Narrator
    // test, 2026-10-10). The arrow keys still step the field as a convenience.
    const unitId = `${this.uid}-unit`;
    return renderField({
      bare,
      uid: this.uid,
      label,
      hint: this.attr('hint'),
      description,
      error,
      required,
      control: `
        <div class="stepper">
          <button type="button" class="step dec" aria-label="${dec}" ${disabled ? 'disabled' : ''}><span aria-hidden="true">&minus;</span></button>
          <input type="text" inputmode="decimal" autocomplete="off"
            name="${escapeAttr(this.attr('name'))}"
            placeholder="${escapeAttr(this.attr('placeholder'))}"
            class="${error ? 'has-error' : ''}"
            ${disabled ? 'disabled' : ''}
            ${required ? 'required' : ''}
            ${fieldAria({ uid: this.uid, error, description, bare, label, describedBy: unit ? [unitId] : [] })} />
          <button type="button" class="step inc" aria-label="${inc}" ${disabled ? 'disabled' : ''}><span aria-hidden="true">+</span></button>
          ${unit ? `<span class="unit" id="${unitId}">${escapeHtml(unit)}</span>` : ''}
          <span class="sr-only" role="status" aria-live="polite"></span>
        </div>`,
    });
  }

  protected onUpdated() {
    const input = this.$<HTMLInputElement>('input');
    if (!input) return;

    this.listen(input, 'input', () => { this._draft = input.value; });
    this.listen(input, 'blur', () => this.commitDraft());
    this.listen<KeyboardEvent>(input, 'keydown', (e) => this.onKey(e));

    const dec = this.$<HTMLButtonElement>('.dec');
    const inc = this.$<HTMLButtonElement>('.inc');
    if (dec) this.listen(dec, 'click', () => this.stepFromButton(-1));
    if (inc) this.listen(inc, 'click', () => this.stepFromButton(1));

    this.syncView();
    this.syncFormState();
  }

  // ── value ──────────────────────────────────────────────────────────────────────────────────────────

  get value(): string { return this._value ?? this.attr('value').trim(); }
  /** Kept verbatim — see the class docs. No `change` event, as with a native input. */
  set value(v: string) {
    this._value = (v ?? '').trim();
    this._draft = null;
    this.syncView();
    this.syncFormState();
  }

  /** The value as a number, or `null` when empty or unparseable. */
  get numericValue(): number | null {
    return parseDecimal(this.value);
  }

  /** Step by `count` steps (negative steps down), as a button press would — clamped, and emits `change`. */
  stepBy(count: number): void {
    const g = this.grid();
    const current = this.scaled(this.value, g);
    let steps: number;
    if (current === null) {
      steps = 0;
    } else {
      const offset = (current - g.min) / g.step;
      // Off the grid, the first step lands on the adjacent grid point, as a native input's stepUp() does.
      steps = Number.isInteger(offset) ? offset + count : (count > 0 ? Math.floor(offset) + count : Math.ceil(offset) + count);
    }
    this.commit(BQtyStepper.toCanonical(g.min + this.clampSteps(steps, g) * g.step, g));
  }

  // ── behaviour ──────────────────────────────────────────────────────────────────────────────────────

  private onKey(e: KeyboardEvent): void {
    if (this.boolAttr('disabled')) return;
    const g = this.grid();
    switch (e.key) {
      case 'ArrowUp': this.commitDraft(); this.stepBy(1); break;
      case 'ArrowDown': this.commitDraft(); this.stepBy(-1); break;
      case 'PageUp': this.commitDraft(); this.stepBy(10); break;
      case 'PageDown': this.commitDraft(); this.stepBy(-10); break;
      case 'Home': this.commit(BQtyStepper.toCanonical(g.min, g)); break;
      case 'End':
        if (g.maxSteps === null) return; // no maximum: End moves the caret, as in any text field
        this.commit(BQtyStepper.toCanonical(g.min + g.maxSteps * g.step, g));
        break;
      case 'Enter': this.commitDraft(); return; // no preventDefault: an enclosing form still sees Enter
      default: return;
    }
    e.preventDefault();
    this.announce();
  }

  private stepFromButton(direction: 1 | -1): void {
    if (this.boolAttr('disabled')) return;
    if (this.$(direction > 0 ? '.inc' : '.dec')?.getAttribute('aria-disabled') === 'true') return;
    this.commitDraft();
    this.stepBy(direction);
    this.announce();
  }

  /**
   * Say the new value, with its unit, through the live region. A button press keeps focus on the button (moving
   * it to the field would open a phone's keyboard), and a plain text field does not announce a value changed
   * under the caret — so both paths announce explicitly. The region sits INSIDE the stepper row: as a sibling after
   * the row it was a line of its own, and Narrator sometimes read "2 m, new line" (owner's test, 2026-10-10).
   */
  private announce(): void {
    const status = this.$('[role="status"]');
    if (status) status.textContent = this.valueText();
  }

  /** Commit what was typed: blank empties the field, unreadable text reverts, a number is snapped. */
  private commitDraft(): void {
    if (this._draft === null) return;
    const raw = this._draft.trim();
    this._draft = null;
    if (raw === '') { this.commit(''); return; }
    const n = parseDecimal(raw);
    if (n === null) { this.syncView(); return; }
    const g = this.grid();
    const scaled = Math.round(n * g.scale);
    // Nearest step, ties up — in integers: floor((offset + step/2) / step).
    const steps = Math.floor((2 * (scaled - g.min) + g.step) / (2 * g.step));
    this.commit(BQtyStepper.toCanonical(g.min + this.clampSteps(steps, g) * g.step, g));
  }

  /** Set a value the user produced: update the view and the form, and emit `change` if it moved. */
  private commit(next: string): void {
    const changed = next !== this.value;
    this._value = next;
    this.syncView();
    this.syncFormState();
    if (changed) this.emit('change', { name: this.attr('name'), value: next });
  }

  /** Bring the field, the ARIA state and the buttons in line with the value — no re-render. */
  private syncView(): void {
    const input = this.$<HTMLInputElement>('input');
    if (!input) return;
    const g = this.grid();
    const value = this.value;
    if (this._draft === null) input.value = this.display(value, g);
    const scaled = this.scaled(value, g);
    // At a limit the button is aria-disabled, not disabled: a disabled button leaves the Tab order and a screen
    // reader's reading order, and the one being pressed would drop focus to the page the moment it hit the limit.
    // `disabled` proper is kept for the whole control being disabled.
    const disabled = this.boolAttr('disabled');
    const atMin = scaled !== null && scaled <= g.min;
    const atMax = scaled !== null && g.maxSteps !== null && scaled >= g.min + g.maxSteps * g.step;
    const dec = this.$<HTMLButtonElement>('.dec');
    const inc = this.$<HTMLButtonElement>('.inc');
    for (const [btn, limit] of [[dec, atMin], [inc, atMax]] as const) {
      if (!btn) continue;
      btn.disabled = disabled;
      if (limit && !disabled) btn.setAttribute('aria-disabled', 'true');
      else btn.removeAttribute('aria-disabled');
    }
  }

  // ── validity ───────────────────────────────────────────────────────────────────────────────────────

  /** The field shows a formatted number, not the value, so its native validity is about nothing. */
  protected validationSource(): undefined { return undefined; }

  /**
   * Required comes from the base. On top of it, a value the app assigned off the grid or out of range is
   * reported — the user's own input never is, because it is snapped on commit. `error` still wins.
   */
  protected syncFormState(): void {
    super.syncFormState();
    if (this.getAttribute('error')) return;
    const value = this.value;
    if (value === '') return;
    const anchor = this.formAnchor();
    const n = parseDecimal(value);
    if (n === null) {
      this.internals.setValidity({ badInput: true }, this.label('label-bad-decimal', 'common.badDecimal', 'Enter a number.'), anchor);
      return;
    }
    const g = this.grid();
    const scaled = Math.round(n * g.scale);
    const min = g.min / g.scale;
    if (scaled < g.min) {
      this.internals.setValidity({ rangeUnderflow: true },
        this.label('label-range-underflow', 'common.rangeUnderflow', 'Value must be {min} or more.', { min }), anchor);
      return;
    }
    const max = parseDecimal(this.attr('max'));
    if (max !== null && n > max) {
      this.internals.setValidity({ rangeOverflow: true },
        this.label('label-range-overflow', 'common.rangeOverflow', 'Value must be {max} or less.', { max }), anchor);
      return;
    }
    // The grid scale covers the value's own digits too, so an exact comparison here is exact.
    if (Math.abs(n * g.scale - scaled) > 1e-6 || (scaled - g.min) % g.step !== 0) {
      const step = g.step / g.scale;
      this.internals.setValidity({ stepMismatch: true },
        this.label('label-step-mismatch', 'common.stepMismatch', 'Value must be a multiple of {step}.', { step }), anchor);
    }
  }

  // ── grid arithmetic ────────────────────────────────────────────────────────────────────────────────

  /**
   * The grid from `min` (default 0), `step` (default 1; a non-positive step falls back to 1) and `max`
   * (default none). The scale also covers the current value's digits, so an off-grid value converts to
   * scaled units without rounding and is reported, not hidden.
   */
  private grid(): Grid {
    const minN = parseDecimal(this.attr('min')) ?? 0;
    const stepRaw = parseDecimal(this.attr('step'));
    const stepN = stepRaw !== null && stepRaw > 0 ? stepRaw : 1;
    const maxN = parseDecimal(this.attr('max'));
    const valueN = parseDecimal(this._value ?? this.attr('value'));
    const digits = Math.min(10, Math.max(
      BQtyStepper.fractionDigits(minN), BQtyStepper.fractionDigits(stepN),
      valueN === null ? 0 : BQtyStepper.fractionDigits(valueN)));
    const scale = 10 ** digits;
    const min = Math.round(minN * scale);
    const step = Math.max(1, Math.round(stepN * scale));
    const maxSteps = maxN === null ? null : Math.max(0, Math.floor((Math.round(maxN * scale) - min) / step));
    return { scale, digits, min, step, maxSteps };
  }

  private clampSteps(steps: number, g: Grid): number {
    const low = Math.max(0, steps);
    return g.maxSteps === null ? low : Math.min(g.maxSteps, low);
  }

  private scaled(value: string, g: Grid): number | null {
    const n = parseDecimal(value);
    return n === null ? null : Math.round(n * g.scale);
  }

  private static fractionDigits(n: number): number {
    const s = String(Math.abs(n));
    const exp = s.match(/e-(\d+)$/);
    if (exp) return Number(exp[1]) + ((s.split('e')[0].split('.')[1] ?? '').length);
    return (s.split('.')[1] ?? '').length;
  }

  /** A scaled integer back to a canonical string, by integer division — no float in the digits. */
  private static toCanonical(scaled: number, g: Grid): string {
    const sign = scaled < 0 ? '-' : '';
    const abs = Math.abs(scaled);
    const whole = Math.floor(abs / g.scale);
    if (g.digits === 0) return `${sign}${whole}`;
    const frac = String(abs - whole * g.scale).padStart(g.digits, '0').replace(/0+$/, '');
    return frac ? `${sign}${whole}.${frac}` : `${sign}${whole}`;
  }

  /**
   * The value in the current locale (`1,5` in Czech), without grouping: `parseDecimal` refuses group
   * separators, so a grouped display could not be typed back.
   */
  private display(value: string, g: Grid): string {
    const n = parseDecimal(value);
    if (n === null) return value;
    try {
      return new Intl.NumberFormat(getI18n().locale || undefined, { useGrouping: false, maximumFractionDigits: Math.max(g.digits, BQtyStepper.fractionDigits(n)) }).format(n);
    } catch {
      return value;
    }
  }

  private valueText(): string {
    const shown = this.display(this.value, this.grid());
    const unit = this.attr('unit');
    return unit ? `${shown} ${unit}` : shown;
  }
}

define('b-qty-stepper', BQtyStepper);
