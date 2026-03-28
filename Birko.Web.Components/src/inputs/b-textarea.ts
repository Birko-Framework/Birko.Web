import { BaseComponent, define } from 'birko-web-core';
import { formFieldSheet, formControlSheet } from '../shared-styles';
import { renderLabel } from './label-hint';

export class BTextarea extends BaseComponent {
  static get observedAttributes() {
    return ['label', 'name', 'value', 'placeholder', 'error', 'disabled', 'rows', 'hint'];
  }

  static get sharedStyles() {
    return [formFieldSheet, formControlSheet];
  }

  static get styles() {
    return `
      :host { display: block; }
      textarea { resize: vertical; }
    `;
  }

  render() {
    const label = this.attr('label');
    const hint = this.attr('hint');
    const error = this.attr('error');
    return `
      <div class="field">
        ${renderLabel(label, hint, this.boolAttr('required'))}
        <textarea
          name="${this.attr('name')}"
          placeholder="${this.attr('placeholder')}"
          rows="${this.numAttr('rows', 4)}"
          class="${error ? 'has-error' : ''}"
          ${this.boolAttr('disabled') ? 'disabled' : ''}
        >${this.attr('value')}</textarea>
        ${error ? `<span class="error">${error}</span>` : ''}
      </div>
    `;
  }

  protected onUpdated() {
    const textarea = this.$<HTMLTextAreaElement>('textarea');
    if (textarea) this.listen(textarea, 'input', (e: Event) => {
      const value = (e.target as HTMLTextAreaElement).value;
      this.emit('change', { name: this.attr('name'), value });
    });
  }

  get inputValue(): string {
    return this.$<HTMLTextAreaElement>('textarea')?.value ?? '';
  }

  set inputValue(v: string) {
    const textarea = this.$<HTMLTextAreaElement>('textarea');
    if (textarea) textarea.value = v;
  }
}

define('b-textarea', BTextarea);
