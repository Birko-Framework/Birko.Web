import { FormControlComponent, define, parseDecimal } from 'birko-web-core';
import { escapeAttr } from '../dom-utils';
import { formFieldSheet, formControlSheet, iconButtonSheet } from '../shared-styles';
import { renderField, fieldAria } from './label-hint';

export class BInput extends FormControlComponent {
  static get observedAttributes() {
    return [
      'label', 'type', 'placeholder', 'value', 'name', 'error', 'disabled', 'required', 'hint', 'description', 'bare',
      'clearable', 'label-clear',
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
    return [formFieldSheet, formControlSheet, iconButtonSheet];
  }

  static get styles() {
    return `
      :host { display: block; }
      .control-wrap { position: relative; }
      /* Adornments sit ON TOP of the input, inside its box. The input's inline padding is widened to the
         measured adornment width by syncAdornments() as an inline style, which outranks every size variant
         in formControlSheet: those set the padding SHORTHAND, so a per-element padding-left in a sheet loses
         at size="sm" and the text runs under the adornment (the trap b-search-input documents).
         The span is click-through so a click on its empty area still reaches the input; slotted content and
         the clear button take the pointer back. */
      .adorn {
        position: absolute;
        inset-block: 0;
        display: flex;
        align-items: center;
        gap: var(--b-space-xs, 0.25rem);
        color: var(--b-text-muted);
        pointer-events: none;
      }
      .adorn.prefix { inset-inline-start: var(--b-space-sm, 0.5rem); }
      .adorn.suffix { inset-inline-end: var(--b-space-xs, 0.25rem); }
      ::slotted(*), .clear { pointer-events: auto; }
      .clear { border-radius: var(--b-radius, 0.375rem); }
      .clear:focus-visible { box-shadow: var(--b-focus-ring); outline: none; }
      /* Hidden by visibility, not display: the x keeps its width while the value is empty, so the input's
         padding and the outer box never change as it appears and disappears. visibility also takes it out
         of the tab order and the accessibility tree. */
      .clear.is-empty { visibility: hidden; }
    `;
  }

  /**
   * The live value, or `null` for "never set" — the distinction matters, and `''` cannot carry it.
   *
   * `onUpdated` restores the inner input from this after every re-render. While the empty string doubled
   * as "unset", clearing a field that had a `value` attribute (a schema-declared default, an entity being
   * edited) sprang the OLD text back into the box on the next re-render — and re-renders come from
   * ordinary things: `b-form` dropping the `error` attribute, a locale switch, a parent morph. The field
   * then read as filled, `required` did not fire, and the form saved the value the user had just deleted.
   */
  private _value: string | null = null;
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
    // After any slotted suffix content, at the far inline end. Not rendered at all while disabled.
    const clearButton = this.boolAttr('clearable') && !this.boolAttr('disabled')
      ? `<button type="button" class="clear icon-btn${this.inputValue === '' ? ' is-empty' : ''}"
           aria-label="${escapeAttr(this.label('label-clear', 'bwc.input.clear', 'Clear'))}">&times;</button>`
      : '';
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
        <div class="control-wrap">
        <span class="adorn prefix"><slot name="prefix"></slot></span>
        <input
          type="${innerType}"${decimalInputMode}
          name="${this.attr('name')}"
          placeholder="${escapeAttr(this.attr('placeholder'))}"
          class="${error ? 'has-error' : ''}"
          ${this.boolAttr('disabled') ? 'disabled' : ''}
          ${required ? 'required' : ''}
          ${passthrough}
          ${fieldAria({ uid: this.uid, error, description, bare, label })}
          ${hasSuggestions ? `list="${this._datalistId}" autocomplete="off"` : ''}
        />
        <span class="adorn suffix"><slot name="suffix"></slot>${clearButton}</span>
        </div>
        ${hasSuggestions ? `<datalist id="${this._datalistId}">${
          this._suggestions.map(s => `<option value="${escapeAttr(s)}"></option>`).join('')
        }</datalist>` : ''}`,
    });
  }

  protected onUpdated() {
    const input = this.$<HTMLInputElement>('input');
    if (!input) return;

    // Restore value after re-render: the last typed/assigned value if there has been one at all,
    // otherwise the attribute. `??`, not `||` — see the _value docs.
    input.value = this._value ?? this.attr('value');

    this.listen(input, 'input', (e: Event) => {
      this._value = (e.target as HTMLInputElement).value;
      this.emit('change', { name: this.attr('name'), value: this._value });
      this.syncFormState();
      this.syncClear();
    });

    const clear = this.$<HTMLButtonElement>('.clear');
    if (clear) this.listen(clear, 'click', () => {
      input.value = '';
      // The same path a keystroke takes: the native event leaves the shadow root (composed), and the
      // listener above records the value, emits `change` and syncs the form value.
      input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      input.focus();
    });

    for (const slot of this.$$<HTMLSlotElement>('slot')) this.listen(slot, 'slotchange', () => this.watchAdornments());
    this.watchAdornments();
    this.applyAdornmentPadding();
    this.syncClear();

    // Re-sync after every render, not just on input: the value may have been restored above, and the
    // `error` / `required` / `min` / `step` attributes that drive validity can change between renders.
    this.syncFormState();
  }

  protected onUnmount() {
    this._adornObserver?.disconnect();
    this._adornObserver = null;
  }

  // ── adornments ─────────────────────────────────────────────────────────────────────────────────────

  private _adornObserver: ResizeObserver | null = null;
  /** Last measured adornment widths, so a re-render re-applies the padding without reading layout. */
  private _adornWidth = { prefix: 0, suffix: 0 };

  /**
   * Observe the adornments only while there is one. Widths come from the `ResizeObserver` — its first
   * notification arrives on observe, and later ones when a slotted element or an icon font changes size —
   * and never from a layout read during render. That matters at scale: a synchronous measurement in
   * `onUpdated` forces a layout per instance, and the grid benchmark's thousands of `bare` cells, none of
   * them adorned, locked the page up. A plain b-input therefore observes nothing and measures nothing.
   */
  private watchAdornments(): void {
    const filled = (name: string) => (this.$<HTMLSlotElement>(`slot[name="${name}"]`)?.assignedNodes().length ?? 0) > 0;
    const adorned = filled('prefix') || filled('suffix') || !!this.$('.clear');
    if (!adorned) {
      this._adornObserver?.disconnect();
      this._adornObserver = null;
      this._adornWidth = { prefix: 0, suffix: 0 };
      this.applyAdornmentPadding();
      return;
    }
    this._adornObserver ??= new ResizeObserver((entries) => {
      for (const e of entries) {
        // A span a full re-render replaced reports 0 once it is detached; it must not reset the live one.
        if (!e.target.isConnected) { this._adornObserver?.unobserve(e.target); continue; }
        const side = (e.target as HTMLElement).classList.contains('prefix') ? 'prefix' : 'suffix';
        this._adornWidth[side] = e.borderBoxSize?.[0]?.inlineSize ?? e.contentRect.width;
      }
      this.applyAdornmentPadding();
    });
    // A render can replace the spans; observing one already observed is a no-op.
    for (const adorn of this.$$<HTMLElement>('.adorn')) this._adornObserver.observe(adorn);
  }

  /**
   * Widen the input's inline padding to clear the adornment on each side, or drop back to the size
   * variant's padding when a side is empty. Inline style on purpose — see the `.adorn` styles.
   */
  private applyAdornmentPadding(): void {
    const input = this.$<HTMLInputElement>('input');
    if (!input) return;
    const pad = (width: number, prop: 'padding-inline-start' | 'padding-inline-end') => {
      if (width > 0) input.style.setProperty(prop, `calc(${width}px + var(--b-space-sm, 0.5rem) + var(--b-space-xs, 0.25rem))`);
      else input.style.removeProperty(prop);
    };
    pad(this._adornWidth.prefix, 'padding-inline-start');
    pad(this._adornWidth.suffix, 'padding-inline-end');
  }

  /** Show the clear button only while there is something to clear. */
  private syncClear(): void {
    this.$('.clear')?.classList.toggle('is-empty', this.inputValue === '');
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

  /**
   * The decimal-mode constraint messages, resolved the same way every other user-facing string in the
   * library is: per-instance `label-*` attribute > global i18n (`common.*`) > the English fallback.
   *
   * These became user-visible when `b-form.validate()` started consulting the control's verdict, so a
   * hardcoded English string here sits in a form whose rule messages are translated — one field reporting
   * `Enter a number.` next to `Sadzba je povinná`. They share `b-form`'s **unprefixed `common.*`**
   * namespace rather than the components' `bwc.*` one, because they are validation messages that appear
   * side by side with `common.required` and friends; see CLAUDE.md § i18n for the rule.
   *
   * Still `protected` — a subclass overriding one of these wins outright, as before.
   */
  protected rangeUnderflowMessage(min: number): string {
    return this.label('label-range-underflow', 'common.rangeUnderflow', 'Value must be {min} or more.', { min });
  }
  protected rangeOverflowMessage(max: number): string {
    return this.label('label-range-overflow', 'common.rangeOverflow', 'Value must be {max} or less.', { max });
  }
  protected stepMismatchMessage(step: number): string {
    return this.label('label-step-mismatch', 'common.stepMismatch', 'Value must be a multiple of {step}.', { step });
  }
  protected badDecimalMessage(): string {
    return this.label('label-bad-decimal', 'common.badDecimal', 'Enter a number.');
  }

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
    return this.$<HTMLInputElement>('input')?.value ?? this._value ?? this.attr('value');
  }

  set inputValue(v: string) {
    this._value = v;
    const input = this.$<HTMLInputElement>('input');
    if (input) input.value = v;
    this.syncFormState();
    this.syncClear();
  }
}

define('b-input', BInput);
