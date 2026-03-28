import { BaseComponent, define } from 'birko-web-core';
import { formFieldSheet, formControlSheet, comboControlSheet } from '../shared-styles';
import { renderLabel } from './label-hint';

interface Option {
  value: string;
  label: string;
}

export class BSelect extends BaseComponent {
  static get observedAttributes() {
    return ['label', 'name', 'value', 'placeholder', 'error', 'disabled', 'searchable', 'label-no-matches', 'hint'];
  }

  private _options: Option[] = [];
  private _filter = '';
  private _open = false;
  private _skipNextUpdate = false;
  private _outsideClickHandler: ((e: Event) => void) | null = null;

  static get sharedStyles() {
    return [formFieldSheet, formControlSheet, comboControlSheet];
  }

  static get styles() {
    return `
      :host { display: block; position: relative; }
      select { cursor: pointer; }

      /* ── Searchable mode ── */
      .combo { padding: 0; }
      .combo-input {
        flex: 1; border: none; outline: none; background: transparent;
        padding: var(--b-space-xs, 0.25rem) var(--b-space-sm, 0.5rem);
        font-size: var(--b-text-base, 0.875rem); color: var(--b-text);
        min-width: 0;
      }
      .combo-input::placeholder { color: var(--b-text-muted); }
      .combo-arrow {
        padding: 0 var(--b-space-sm, 0.5rem);
        color: var(--b-text-muted); font-size: 0.625rem;
        flex-shrink: 0; pointer-events: none;
      }
      .combo-clear {
        background: none; border: none; cursor: pointer;
        color: var(--b-text-muted); font-size: var(--b-text-sm, 0.8125rem);
        padding: 0 var(--b-space-xs, 0.25rem); line-height: 1;
      }
      .combo-clear:hover { color: var(--b-text); }

      .dropdown {
        display: none;
        position: fixed;
        z-index: 10;
        padding: var(--b-space-xs, 0.25rem) 0;
        background: var(--b-bg-elevated);
        border: var(--b-border-width, 1px) solid var(--b-border);
        border-radius: var(--b-radius, 0.375rem);
        box-shadow: var(--b-shadow-md);
        max-height: 12.5rem;
        overflow-y: auto;
      }
      .dropdown.open { display: block; }

      .option {
        padding: var(--b-space-sm, 0.5rem) var(--b-space-md, 0.75rem);
        cursor: pointer; font-size: var(--b-text-sm, 0.8125rem); color: var(--b-text);
        transition: background var(--b-transition, 150ms ease);
      }
      .option:hover, .option.active { background: var(--b-bg-tertiary); }
      .option.selected { color: var(--b-color-primary); font-weight: var(--b-font-weight-medium, 500); }
      .no-results {
        padding: var(--b-space-md, 0.75rem);
        text-align: center; color: var(--b-text-muted); font-size: var(--b-text-sm, 0.8125rem);
      }
    `;
  }

  setOptions(options: Option[]) {
    this._options = options;
    this.update();
  }

  get inputValue(): string {
    if (this.boolAttr('searchable')) {
      return this.attr('value') ?? '';
    }
    return this.$<HTMLSelectElement>('select')?.value ?? this.attr('value') ?? '';
  }

  render() {
    if (this.boolAttr('searchable')) return this._renderSearchable();
    return this._renderNative();
  }

  private _renderNative(): string {
    const label = this.attr('label');
    const hint = this.attr('hint');
    const error = this.attr('error');
    const value = this.attr('value');
    const placeholder = this.attr('placeholder');
    return `
      <div class="field">
        ${renderLabel(label, hint, this.boolAttr('required'))}
        <select name="${this.attr('name')}" ${this.boolAttr('disabled') ? 'disabled' : ''}>
          ${placeholder ? `<option value="" disabled ${!value ? 'selected' : ''}>${placeholder}</option>` : ''}
          ${this._options.map(o => `<option value="${o.value}" ${o.value === value ? 'selected' : ''}>${o.label}</option>`).join('')}
        </select>
        ${error ? `<span class="error">${error}</span>` : ''}
      </div>
    `;
  }

  private _renderSearchable(): string {
    const label = this.attr('label');
    const hint = this.attr('hint');
    const error = this.attr('error');
    const value = this.attr('value');
    const placeholder = this.attr('placeholder', 'Select...');
    const disabled = this.boolAttr('disabled');
    const selectedLabel = this._options.find(o => o.value === value)?.label ?? '';

    const filtered = this._filter
      ? this._options.filter(o => o.label.toLowerCase().includes(this._filter.toLowerCase()))
      : this._options;

    return `
      <div class="field">
        ${renderLabel(label, hint, this.boolAttr('required'))}
        <div class="combo combo-container ${error ? 'has-error' : ''} ${disabled ? 'disabled' : ''}">
          <input class="combo-input" type="text"
                 value="${this._filter || selectedLabel}"
                 placeholder="${value ? selectedLabel : placeholder}"
                 ${disabled ? 'disabled' : ''}
                 autocomplete="off" />
          ${value ? '<button class="combo-clear" type="button">&times;</button>' : ''}
          <span class="combo-arrow">&#9660;</span>
        </div>
        <div class="dropdown ${this._open ? 'open' : ''}">
          ${filtered.length === 0
            ? `<div class="no-results">${this.attr('label-no-matches', 'No matches')}</div>`
            : filtered.map(o => `
                <div class="option ${o.value === value ? 'selected' : ''}" data-value="${o.value}">
                  ${o.label}
                </div>
              `).join('')}
        </div>
        ${error ? `<span class="error">${error}</span>` : ''}
      </div>
    `;
  }

  protected onUpdated() {
    if (this.boolAttr('searchable')) {
      this._wireSearchable();
    } else {
      this._wireNative();
    }
  }

  protected update(): void {
    if (this._skipNextUpdate) return;
    super.update();
  }

  private _wireNative() {
    const select = this.$<HTMLSelectElement>('select');
    if (select) {
      this.listen(select, 'change', (e: Event) => {
        const value = (e.target as HTMLSelectElement).value;
        this.setAttribute('value', value);
        this.emit('change', { name: this.attr('name'), value });
      });
    }
  }

  private _wireSearchable() {
    const combo = this.$<HTMLElement>('.combo');
    const input = this.$<HTMLInputElement>('.combo-input');
    const dropdown = this.$<HTMLElement>('.dropdown');
    if (!combo || !input || !dropdown) return;

    // Toggle dropdown on combo click
    this.listen(combo, 'click', (e: Event) => {
      if ((e.target as HTMLElement).classList.contains('combo-clear')) return;
      if (this._open) {
        this._closeDropdown();
      } else {
        this._openDropdown(input, dropdown);
      }
    });

    // Outside click → close
    if (this._outsideClickHandler) {
      document.removeEventListener('mousedown', this._outsideClickHandler);
    }
    this._outsideClickHandler = (e: Event) => {
      const path = e.composedPath();
      if (!path.includes(combo) && !path.includes(dropdown)) {
        this._closeDropdown();
      }
    };
    this.listen(document, 'mousedown', this._outsideClickHandler);

    // Keyboard
    this.listen(input, 'keydown', (e: Event) => {
      const ke = e as KeyboardEvent;
      if (ke.key === 'Escape') { this._closeDropdown(); input.blur(); }
      if (ke.key === 'Backspace' && !input.value && this.attr('value')) {
        this._selectValue('');
      }
    });

    // Filter as user types
    this.listen(input, 'input', () => {
      this._filter = input.value;
      this._refreshOptions();
    });

    // Clear button
    const clearBtn = this.$('.combo-clear');
    if (clearBtn) {
      this.listen(clearBtn, 'click', () => this._selectValue(''));
    }

    // Wire option clicks on current options
    this._wireOptionClicks(dropdown);
  }

  private _openDropdown(input: HTMLInputElement, dropdown: HTMLElement) {
    this._open = true;
    this._filter = '';
    input.value = '';
    input.placeholder = this._options.find(o => o.value === this.attr('value'))?.label
      || this.attr('placeholder', 'Select...');
    dropdown.classList.add('open');
    this._refreshOptions();
    input.focus();

    // Position fixed dropdown below the combo
    const combo = this.$<HTMLElement>('.combo');
    if (combo) {
      const rect = combo.getBoundingClientRect();
      const gap = 4;
      dropdown.style.left = `${rect.left}px`;
      dropdown.style.width = `${rect.width}px`;
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < 200 && rect.top > spaceBelow) {
        dropdown.style.top = '';
        dropdown.style.bottom = `${window.innerHeight - rect.top + gap}px`;
      } else {
        dropdown.style.bottom = '';
        dropdown.style.top = `${rect.bottom + gap}px`;
      }
    }
  }

  private _closeDropdown() {
    if (!this._open) return;
    this._open = false;
    const dropdown = this.$<HTMLElement>('.dropdown');
    dropdown?.classList.remove('open');
    // Restore input display
    const input = this.$<HTMLInputElement>('.combo-input');
    if (input) {
      const selectedLabel = this._options.find(o => o.value === this.attr('value'))?.label ?? '';
      this._filter = '';
      input.value = selectedLabel;
      input.placeholder = selectedLabel || this.attr('placeholder', 'Select...');
    }
  }

  private _selectValue(val: string) {
    this._filter = '';
    this._open = false;

    // Patch display directly
    const input = this.$<HTMLInputElement>('.combo-input');
    const dropdown = this.$<HTMLElement>('.dropdown');
    const label = this._options.find(o => o.value === val)?.label ?? '';

    if (input) {
      input.value = label;
      input.placeholder = label || this.attr('placeholder', 'Select...');
    }
    if (dropdown) dropdown.classList.remove('open');

    // Update clear button
    const combo = this.$<HTMLElement>('.combo');
    if (combo) {
      const clearBtn = combo.querySelector('.combo-clear');
      if (val && !clearBtn) {
        const arrow = combo.querySelector('.combo-arrow');
        if (arrow) {
          arrow.insertAdjacentHTML('beforebegin', '<button class="combo-clear" type="button">&times;</button>');
          combo.querySelector('.combo-clear')?.addEventListener('click', () => this._selectValue(''));
        }
      } else if (!val && clearBtn) {
        clearBtn.remove();
      }
    }

    // Set attribute without full re-render
    this._skipNextUpdate = true;
    if (val) this.setAttribute('value', val);
    else this.removeAttribute('value');
    this._skipNextUpdate = false;

    this.emit('change', { name: this.attr('name'), value: val });
  }

  /** Refresh dropdown options in-place without full re-render. */
  private _refreshOptions() {
    const dropdown = this.$<HTMLElement>('.dropdown');
    if (!dropdown) return;

    const value = this.attr('value');
    const filtered = this._filter
      ? this._options.filter(o => o.label.toLowerCase().includes(this._filter.toLowerCase()))
      : this._options;

    dropdown.innerHTML = filtered.length === 0
      ? `<div class="no-results">${this.attr('label-no-matches', 'No matches')}</div>`
      : filtered.map(o => `
          <div class="option ${o.value === value ? 'selected' : ''}" data-value="${o.value}">
            ${o.label}
          </div>
        `).join('');

    this._wireOptionClicks(dropdown);
  }

  private _wireOptionClicks(dropdown: HTMLElement) {
    dropdown.querySelectorAll<HTMLElement>('.option[data-value]').forEach(opt => {
      this.listen(opt, 'click', (e: Event) => {
        e.stopPropagation();
        this._selectValue(opt.dataset.value!);
      });
    });
  }
}

define('b-select', BSelect);
