import { BaseComponent, define } from 'birko-web-core';
import { escapeAttr } from '../dom-utils';
import { formFieldSheet, formControlSheet } from '../shared-styles';
import { renderLabel, renderError, fieldAria } from './label-hint';

export class BInput extends BaseComponent {
  static get observedAttributes() {
    return ['label', 'type', 'placeholder', 'value', 'name', 'error', 'disabled', 'required', 'hint'];
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
    const hint = this.attr('hint');
    const error = this.attr('error');
    const hasSuggestions = this._suggestions.length > 0;
    return `
      <div class="field">
        ${renderLabel(label, hint, this.boolAttr('required'))}
        <input
          type="${this.attr('type', 'text')}"
          name="${this.attr('name')}"
          placeholder="${this.attr('placeholder')}"
          class="${error ? 'has-error' : ''}"
          ${this.boolAttr('disabled') ? 'disabled' : ''}
          ${this.boolAttr('required') ? 'required' : ''}
          ${fieldAria({ uid: this.uid, error })}
          ${hasSuggestions ? `list="${this._datalistId}" autocomplete="off"` : ''}
        />
        ${hasSuggestions ? `<datalist id="${this._datalistId}">${
          this._suggestions.map(s => `<option value="${escapeAttr(s)}"></option>`).join('')
        }</datalist>` : ''}
        ${renderError(this.uid, error)}
      </div>
    `;
  }

  protected onUpdated() {
    const input = this.$<HTMLInputElement>('input');
    if (!input) return;

    // Restore value after re-render (attribute value or last typed value)
    input.value = this._value || this.attr('value');

    this.listen(input, 'input', (e: Event) => {
      this._value = (e.target as HTMLInputElement).value;
      this.emit('change', { name: this.attr('name'), value: this._value });
    });
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
  }
}

define('b-input', BInput);
