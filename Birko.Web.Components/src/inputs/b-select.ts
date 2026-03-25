import { BaseComponent, define } from 'birko-web-core';
import { formFieldSheet, formControlSheet } from '../shared-styles';

export class BSelect extends BaseComponent {
  static get observedAttributes() {
    return ['label', 'name', 'value', 'placeholder', 'error', 'disabled'];
  }

  private _options: { value: string; label: string }[] = [];

  static get sharedStyles() {
    return [formFieldSheet, formControlSheet];
  }

  static get styles() {
    return `
      :host { display: block; }
      select { cursor: pointer; }
    `;
  }

  setOptions(options: { value: string; label: string }[]) {
    this._options = options;
    this.update();
  }

  render() {
    const label = this.attr('label');
    const error = this.attr('error');
    const value = this.attr('value');
    const placeholder = this.attr('placeholder');
    return `
      <div class="field">
        ${label ? `<label>${label}</label>` : ''}
        <select name="${this.attr('name')}" ${this.boolAttr('disabled') ? 'disabled' : ''}>
          ${placeholder ? `<option value="" disabled ${!value ? 'selected' : ''}>${placeholder}</option>` : ''}
          ${this._options.map(o => `<option value="${o.value}" ${o.value === value ? 'selected' : ''}>${o.label}</option>`).join('')}
        </select>
        ${error ? `<span class="error">${error}</span>` : ''}
      </div>
    `;
  }

  protected onUpdated() {
    this.$<HTMLSelectElement>('select')?.addEventListener('change', (e) => {
      const value = (e.target as HTMLSelectElement).value;
      this.emit('change', { name: this.attr('name'), value });
    });
  }
}

define('b-select', BSelect);
