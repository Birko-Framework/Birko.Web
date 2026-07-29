import { FormControlComponent, define } from 'birko-web-core';
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
    const passthrough = BInput.PASSTHROUGH
      .filter(a => this.hasAttribute(a))
      .map(a => `${a}="${escapeAttr(this.attr(a))}"`)
      .join(' ');
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
          type="${this.attr('type', 'text')}"
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
