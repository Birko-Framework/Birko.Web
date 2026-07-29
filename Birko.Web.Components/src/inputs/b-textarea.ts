import { FormControlComponent, define, escapeHtml } from 'birko-web-core';
import { formFieldSheet, formControlSheet } from '../shared-styles';
import { renderField, fieldAria } from './label-hint';

export class BTextarea extends FormControlComponent {
  static get observedAttributes() {
    return ['label', 'name', 'value', 'placeholder', 'error', 'disabled', 'rows', 'hint', 'description', 'bare'];
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
    const error = this.attr('error');
    const description = this.attr('description');
    const bare = this.boolAttr('bare');
    const required = this.boolAttr('required');
    return renderField({
      bare,
      uid: this.uid,
      label,
      hint: this.attr('hint'),
      description,
      error,
      required,
      control: `
        <textarea
          name="${this.attr('name')}"
          placeholder="${this.attr('placeholder')}"
          rows="${this.numAttr('rows', 4)}"
          class="${error ? 'has-error' : ''}"
          ${this.boolAttr('disabled') ? 'disabled' : ''}
          ${required ? 'required' : ''}
          ${fieldAria({ uid: this.uid, error, description, bare, label })}
        >${escapeHtml(this.attr('value'))}</textarea>`,
    });
  }

  protected onUpdated() {
    const textarea = this.$<HTMLTextAreaElement>('textarea');
    if (textarea) this.listen(textarea, 'input', (e: Event) => {
      const value = (e.target as HTMLTextAreaElement).value;
      this.emit('change', { name: this.attr('name'), value });
      this.syncFormState();
    });
    this.syncFormState();
  }

  get value(): string { return this.inputValue; }
  set value(v: string) { this.inputValue = v; }

  get inputValue(): string {
    return this.$<HTMLTextAreaElement>('textarea')?.value ?? '';
  }

  set inputValue(v: string) {
    const textarea = this.$<HTMLTextAreaElement>('textarea');
    if (textarea) textarea.value = v;
    this.syncFormState();
  }
}

define('b-textarea', BTextarea);
