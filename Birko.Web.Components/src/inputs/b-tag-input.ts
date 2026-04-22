import { BaseComponent, define } from 'birko-web-core';
import { formFieldSheet, formControlSheet } from '../shared-styles';
import { renderLabel } from './label-hint';

export class BTagInput extends BaseComponent {
  static get observedAttributes() {
    return ['label', 'name', 'value', 'placeholder', 'separators', 'max-count',
            'allow-duplicates', 'error', 'disabled', 'required', 'hint'];
  }

  static get sharedStyles() {
    return [formFieldSheet, formControlSheet];
  }

  static get styles() {
    return `
      :host { display: block; }
      .container {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--b-space-xs, 0.25rem);
        padding: var(--b-space-xs, 0.25rem) var(--b-space-sm, 0.5rem);
        background: var(--b-bg);
        border: var(--b-border-width, 1px) solid var(--b-border);
        border-radius: var(--b-radius, 0.375rem);
        min-height: 2rem;
        cursor: text;
      }
      .container:focus-within {
        border-color: var(--b-color-primary);
        box-shadow: var(--b-focus-ring);
      }
      .container.has-error { border-color: var(--b-color-danger); }
      .container.disabled {
        background: var(--b-bg-tertiary);
        cursor: not-allowed;
        opacity: 0.7;
      }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: var(--b-space-xs, 0.25rem);
        padding: 0.0625rem var(--b-space-sm, 0.5rem);
        border-radius: var(--b-radius-full, 9999px);
        background: var(--b-bg-tertiary);
        font-size: var(--b-text-sm, 0.8125rem);
        color: var(--b-text);
        white-space: nowrap;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .chip-text { overflow: hidden; text-overflow: ellipsis; }
      .chip-remove {
        background: none;
        border: none;
        cursor: pointer;
        padding: 0;
        color: var(--b-text-muted);
        font-size: var(--b-text-sm, 0.8125rem);
        line-height: 1;
      }
      .chip-remove:hover { color: var(--b-text); }
      .chip-remove:focus-visible { box-shadow: var(--b-focus-ring); outline: none; border-radius: var(--b-radius-sm, 0.25rem); }
      input {
        flex: 1;
        min-width: 6rem;
        border: none;
        outline: none;
        background: transparent;
        font: inherit;
        font-size: var(--b-text-base, 0.875rem);
        color: var(--b-text);
        padding: 0.125rem 0;
      }
      input::placeholder { color: var(--b-text-muted); }
      input:disabled { cursor: not-allowed; }
    `;
  }

  private _tags: string[] = [];
  private _buffer = '';
  private _valueInitialized = false;

  render() {
    const label = this.attr('label');
    const hint = this.attr('hint');
    const error = this.attr('error');
    const disabled = this.boolAttr('disabled');
    const placeholder = this._tags.length === 0 ? this.attr('placeholder') : '';

    const chips = this._tags.map((t, i) => `
      <span class="chip">
        <span class="chip-text">${this._escapeHtml(t)}</span>
        <button class="chip-remove" data-index="${i}" type="button" aria-label="Remove ${this._escapeAttr(t)}" ${disabled ? 'disabled' : ''}>&times;</button>
      </span>
    `).join('');

    return `
      <div class="field">
        ${renderLabel(label, hint, this.boolAttr('required'))}
        <div class="container ${error ? 'has-error' : ''} ${disabled ? 'disabled' : ''}">
          ${chips}
          <input type="text"
                 placeholder="${this._escapeAttr(placeholder)}"
                 ${disabled ? 'disabled' : ''}
                 value="${this._escapeAttr(this._buffer)}" />
        </div>
        ${error ? `<span class="error">${error}</span>` : ''}
      </div>
    `;
  }

  protected onMount() {
    this._loadFromAttr();
  }

  protected onUpdated() {
    if (!this._valueInitialized) this._loadFromAttr();

    const container = this.$<HTMLElement>('.container');
    const input = this.$<HTMLInputElement>('input');
    if (!container || !input) return;

    // Keep cursor position when re-rendered
    input.value = this._buffer;

    this.listen(container, 'mousedown', (e) => {
      if ((e.target as HTMLElement).closest('.chip-remove')) return;
      if ((e.target as HTMLElement).tagName !== 'INPUT') {
        e.preventDefault();
        input.focus();
      }
    });

    this.listen(input, 'input', () => {
      this._buffer = input.value;
      this._processBuffer(false);
    });

    this.listen(input, 'keydown', (e: Event) => {
      const ke = e as KeyboardEvent;
      if (ke.key === 'Enter') {
        ke.preventDefault();
        this._commitBuffer();
      } else if (ke.key === 'Backspace' && this._buffer === '' && this._tags.length > 0) {
        ke.preventDefault();
        this._removeTagAt(this._tags.length - 1);
      } else if (ke.key === 'Tab' && this._buffer.trim() !== '') {
        ke.preventDefault();
        this._commitBuffer();
      }
    });

    this.listen(input, 'blur', () => {
      if (this._buffer.trim() !== '') this._commitBuffer();
    });

    this.listen(input, 'paste', (e: Event) => {
      const pe = e as ClipboardEvent;
      const text = pe.clipboardData?.getData('text') ?? '';
      if (!text) return;
      if (this._splitPattern().test(text)) {
        pe.preventDefault();
        const parts = text.split(this._splitPattern()).map(p => p.trim()).filter(Boolean);
        for (const p of parts) this._addTag(p);
        this._emitChange();
        this.update();
      }
    });

    this.$$<HTMLButtonElement>('.chip-remove').forEach(btn => {
      this.listen(btn, 'click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const idx = Number(btn.dataset.index);
        if (!Number.isNaN(idx)) this._removeTagAt(idx);
      });
    });
  }

  getTags(): string[] {
    return [...this._tags];
  }

  setTags(tags: string[]) {
    this._tags = [];
    for (const t of tags) this._addTag(t);
    this._buffer = '';
    this._valueInitialized = true;
    this.update();
  }

  clear() {
    this._tags = [];
    this._buffer = '';
    this._emitChange();
    this.update();
  }

  get value(): string { return this.inputValue; }
  set value(v: string) { this.inputValue = v; }

  get inputValue(): string { return this._tags.join(','); }
  set inputValue(v: string) {
    this.setTags(v ? v.split(',').map(s => s.trim()).filter(Boolean) : []);
  }

  private _loadFromAttr() {
    const attrVal = this.getAttribute('value');
    if (attrVal !== null) {
      this._tags = [];
      for (const t of attrVal.split(this._splitPattern()).map(s => s.trim()).filter(Boolean)) {
        this._addTag(t);
      }
    }
    this._valueInitialized = true;
  }

  /** Process buffer as user types — if a separator was entered, commit the tag(s) up to it. */
  private _processBuffer(force: boolean) {
    if (!this._buffer) return;
    const pattern = this._splitPattern();
    if (!pattern.test(this._buffer) && !force) return;
    const parts = this._buffer.split(pattern);
    const tail = parts.pop() ?? '';
    let changed = false;
    for (const p of parts) {
      const tag = p.trim();
      if (tag && this._addTag(tag)) changed = true;
    }
    this._buffer = tail;
    if (changed) {
      this._emitChange();
      this.update();
    } else {
      const input = this.$<HTMLInputElement>('input');
      if (input) input.value = this._buffer;
    }
  }

  private _commitBuffer() {
    const tag = this._buffer.trim();
    this._buffer = '';
    if (!tag) {
      const input = this.$<HTMLInputElement>('input');
      if (input) input.value = '';
      return;
    }
    if (this._addTag(tag)) {
      this._emitChange();
    }
    this.update();
  }

  private _addTag(tag: string): boolean {
    if (!tag) return false;
    const max = this.numAttr('max-count', 0);
    if (max > 0 && this._tags.length >= max) {
      this.emit('reject', { tag, reason: 'max-count' });
      return false;
    }
    if (!this.boolAttr('allow-duplicates') && this._tags.includes(tag)) {
      this.emit('reject', { tag, reason: 'duplicate' });
      return false;
    }
    this._tags.push(tag);
    this.emit('add', { tag, tags: [...this._tags] });
    return true;
  }

  private _removeTagAt(index: number) {
    if (index < 0 || index >= this._tags.length) return;
    const [removed] = this._tags.splice(index, 1);
    this.emit('remove', { tag: removed, tags: [...this._tags] });
    this._emitChange();
    this.update();
  }

  private _emitChange() {
    this.emit('change', { name: this.attr('name'), tags: [...this._tags], value: this.inputValue });
  }

  private _splitPattern(): RegExp {
    const raw = this.getAttribute('separators');
    if (!raw) return /[,\n\t]/;
    const chars = raw.split('').map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('');
    return new RegExp(`[${chars}]`);
  }

  private _escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private _escapeAttr(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }
}

define('b-tag-input', BTagInput);
