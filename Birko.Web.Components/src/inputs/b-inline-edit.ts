import { BaseComponent, define } from 'birko-web-core';

export class BInlineEdit extends BaseComponent {
  static get observedAttributes() { return ['value', 'placeholder', 'type', 'label-save', 'label-cancel']; }

  private _editing = false;
  private _originalValue = '';

  static get styles() {
    return `
      :host { display: inline-block; }
      .display {
        cursor: pointer; padding: var(--b-space-xs) var(--b-space-sm);
        border-radius: var(--b-radius);
        border: var(--b-border-width, 1px) solid transparent;
        min-width: 60px; min-height: 28px;
        display: inline-flex; align-items: center;
        font-size: var(--b-text-base);
        color: var(--b-text); transition: all var(--b-transition);
      }
      .display:hover {
        border-color: var(--b-border); background: var(--b-bg-secondary);
      }
      .display .placeholder {
        color: var(--b-text-muted); font-style: italic;
      }
      .display .pencil {
        margin-left: var(--b-space-xs); color: var(--b-text-muted);
        font-size: var(--b-text-xs); opacity: 0;
        transition: opacity var(--b-transition);
      }
      .display:hover .pencil { opacity: 1; }
      .edit-wrap {
        display: inline-flex; align-items: center; gap: var(--b-space-xs);
      }
      input {
        padding: var(--b-space-xs) var(--b-space-sm);
        border: var(--b-border-width, 1px) solid var(--b-border-focus);
        border-radius: var(--b-radius); font-size: var(--b-text-base);
        background: var(--b-bg); color: var(--b-text);
        outline: none; box-shadow: var(--b-focus-ring);
        min-width: 120px;
      }
      .action-btn {
        background: none; border: none; cursor: pointer;
        padding: 2px var(--b-space-xs);
        border-radius: var(--b-radius-sm); font-size: var(--b-text-base);
        line-height: 1; color: var(--b-text-muted);
      }
      .action-btn:hover { background: var(--b-bg-tertiary); color: var(--b-text); }
      .action-btn.save { color: var(--b-color-success); }
      .action-btn.cancel { color: var(--b-color-danger); }
    `;
  }

  render() {
    const value = this.attr('value');
    const placeholder = this.attr('placeholder', 'Click to edit');
    const type = this.attr('type', 'text');

    if (this._editing) {
      return `
        <span class="edit-wrap">
          <input type="${type}" value="${value}" />
          <button class="action-btn save" aria-label="${this.attr('label-save', 'Save')}">&#10003;</button>
          <button class="action-btn cancel" aria-label="${this.attr('label-cancel', 'Cancel')}">&#10005;</button>
        </span>
      `;
    }

    return `
      <span class="display">
        ${value ? `<span>${value}</span>` : `<span class="placeholder">${placeholder}</span>`}
        <span class="pencil">&#9998;</span>
      </span>
    `;
  }

  protected onUpdated() {
    if (this._editing) {
      const input = this.$<HTMLInputElement>('input');
      if (input) {
        input.focus();
        input.select();
        this.listen(input, 'keydown', (e: Event) => {
          if ((e as KeyboardEvent).key === 'Enter') this._save();
          if ((e as KeyboardEvent).key === 'Escape') this._cancel();
        });
        this.listen(input, 'blur', (e: Event) => {
          const related = (e as FocusEvent).relatedTarget as HTMLElement | null;
          if (related?.classList.contains('action-btn')) return;
          this._save();
        });
      }
      const saveBtn = this.$('.action-btn.save');
      if (saveBtn) this.listen(saveBtn, 'click', () => this._save());
      const cancelBtn = this.$('.action-btn.cancel');
      if (cancelBtn) this.listen(cancelBtn, 'click', () => this._cancel());
    } else {
      const display = this.$('.display');
      if (display) this.listen(display, 'click', () => this._startEdit());
    }
  }

  private _startEdit() {
    this._originalValue = this.attr('value');
    this._editing = true;
    this.update();
  }

  private _save() {
    if (!this._editing) return;
    const input = this.$<HTMLInputElement>('input');
    const newValue = input?.value ?? '';
    this._editing = false;
    if (newValue !== this._originalValue) {
      this.setAttribute('value', newValue);
      this.emit('save', { value: newValue, previousValue: this._originalValue });
    } else {
      this.update();
    }
  }

  private _cancel() {
    this._editing = false;
    this.update();
  }
}

define('b-inline-edit', BInlineEdit);
