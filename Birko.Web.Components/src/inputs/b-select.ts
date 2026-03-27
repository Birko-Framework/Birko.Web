import { BaseComponent, define } from 'birko-web-core';
import { formFieldSheet, formControlSheet, dropdownPanelSheet, comboControlSheet } from '../shared-styles';

interface Option {
  value: string;
  label: string;
}

export class BSelect extends BaseComponent {
  static get observedAttributes() {
    return ['label', 'name', 'value', 'placeholder', 'error', 'disabled', 'searchable'];
  }

  private _options: Option[] = [];
  private _filter = '';

  static get sharedStyles() {
    return [formFieldSheet, formControlSheet, dropdownPanelSheet, comboControlSheet];
  }

  static get styles() {
    return `
      :host { display: block; position: relative; }
      select { cursor: pointer; }

      /* ── Searchable mode (layout uses .combo-container from comboControlSheet) ── */
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
      .dropdown { width: 100%; max-height: 15rem; overflow-y: auto; }
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

  // ── Native <select> mode ──

  private _renderNative(): string {
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

  // ── Searchable combobox mode ──

  private _renderSearchable(): string {
    const label = this.attr('label');
    const error = this.attr('error');
    const value = this.attr('value');
    const placeholder = this.attr('placeholder', 'Select...');
    const disabled = this.boolAttr('disabled');
    const selectedLabel = this._options.find(o => o.value === value)?.label ?? '';
    const dropdownId = 'dd-' + (this.id || 'sel');

    const filtered = this._filter
      ? this._options.filter(o => o.label.toLowerCase().includes(this._filter.toLowerCase()))
      : this._options;

    return `
      <div class="field">
        ${label ? `<label>${label}</label>` : ''}
        <div class="combo combo-container ${error ? 'has-error' : ''} ${disabled ? 'disabled' : ''}">
          <input class="combo-input" type="text"
                 value="${this._filter || selectedLabel}"
                 placeholder="${value ? selectedLabel : placeholder}"
                 ${disabled ? 'disabled' : ''}
                 autocomplete="off" />
          ${value ? '<button class="combo-clear" type="button">&times;</button>' : ''}
          <span class="combo-arrow">&#9660;</span>
        </div>
        <div class="dropdown dropdown-panel" id="${dropdownId}" popover>
          ${filtered.length === 0
            ? '<div class="no-results">No matches</div>'
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

  private _wireNative() {
    this.$<HTMLSelectElement>('select')?.addEventListener('change', (e) => {
      const value = (e.target as HTMLSelectElement).value;
      this.setAttribute('value', value);
      this.emit('change', { name: this.attr('name'), value });
    });
  }

  private _wireSearchable() {
    const combo = this.$<HTMLElement>('.combo');
    const input = this.$<HTMLInputElement>('.combo-input');
    const dropdown = this.$<HTMLElement>('.dropdown');
    if (!combo || !input || !dropdown) return;

    // Open dropdown on input focus / combo click
    input.addEventListener('focus', () => dropdown.showPopover());
    combo.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).classList.contains('combo-clear')) return;
      input.focus();
    });

    // Filter as user types
    input.addEventListener('input', () => {
      this._filter = input.value;
      // Re-render dropdown options without full component update
      this._updateDropdownOptions(dropdown);
    });

    // Clear selection on backspace when input is empty and there's a value
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && this.attr('value')) {
        this._clearSelection(input);
      }
    });

    // Clear button
    this.$('.combo-clear')?.addEventListener('click', () => this._clearSelection(input));

    // Option click
    this._wireOptionClicks(dropdown, input);

    // Position dropdown on open
    dropdown.addEventListener('toggle', ((e: ToggleEvent) => {
      if (e.newState === 'open') {
        const rect = combo.getBoundingClientRect();
        const gap = 4;
        const spaceBelow = window.innerHeight - rect.bottom;
        if (spaceBelow < dropdown.offsetHeight && rect.top > spaceBelow) {
          dropdown.style.top = '';
          dropdown.style.bottom = `${window.innerHeight - rect.top + gap}px`;
        } else {
          dropdown.style.bottom = '';
          dropdown.style.top = `${rect.bottom + gap}px`;
        }
        dropdown.style.left = `${rect.left}px`;
        dropdown.style.width = `${rect.width}px`;
        // Clear filter on open to show all options
        this._filter = '';
        input.value = '';
        input.placeholder = this._options.find(o => o.value === this.attr('value'))?.label
          || this.attr('placeholder', 'Select...');
        this._updateDropdownOptions(dropdown);
      }
    }) as EventListener);

    // Close dropdown on outside click handled by popover API
  }

  private _updateDropdownOptions(dropdown: HTMLElement) {
    const value = this.attr('value');
    const filtered = this._filter
      ? this._options.filter(o => o.label.toLowerCase().includes(this._filter.toLowerCase()))
      : this._options;

    dropdown.innerHTML = filtered.length === 0
      ? '<div class="no-results">No matches</div>'
      : filtered.map(o => `
          <div class="option ${o.value === value ? 'selected' : ''}" data-value="${o.value}">
            ${o.label}
          </div>
        `).join('');

    this._wireOptionClicks(dropdown, this.$<HTMLInputElement>('.combo-input')!);
  }

  private _wireOptionClicks(dropdown: HTMLElement, input: HTMLInputElement) {
    dropdown.querySelectorAll<HTMLElement>('.option[data-value]').forEach(opt => {
      opt.addEventListener('click', () => {
        const val = opt.dataset.value!;
        this.setAttribute('value', val);
        this._filter = '';
        input.value = this._options.find(o => o.value === val)?.label ?? '';
        dropdown.hidePopover();
        this.emit('change', { name: this.attr('name'), value: val });
      });
    });
  }

  private _clearSelection(input: HTMLInputElement) {
    this.removeAttribute('value');
    this._filter = '';
    input.value = '';
    input.placeholder = this.attr('placeholder', 'Select...');
    this.emit('change', { name: this.attr('name'), value: '' });
  }
}

define('b-select', BSelect);
