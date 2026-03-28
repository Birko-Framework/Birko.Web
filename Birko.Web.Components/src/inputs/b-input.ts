import { BaseComponent, define } from 'birko-web-core';
import { formFieldSheet, formControlSheet } from '../shared-styles';

export class BInput extends BaseComponent {
  static get observedAttributes() {
    return ['label', 'type', 'placeholder', 'value', 'name', 'error', 'disabled', 'required'];
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

  render() {
    const label = this.attr('label');
    const error = this.attr('error');
    return `
      <div class="field">
        ${label ? `<label>${label}</label>` : ''}
        <input
          type="${this.attr('type', 'text')}"
          name="${this.attr('name')}"
          placeholder="${this.attr('placeholder')}"
          class="${error ? 'has-error' : ''}"
          ${this.boolAttr('disabled') ? 'disabled' : ''}
          ${this.boolAttr('required') ? 'required' : ''}
        />
        ${error ? `<span class="error">${error}</span>` : ''}
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
