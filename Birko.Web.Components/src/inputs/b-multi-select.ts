import { BaseComponent, define } from 'birko-web-core';
import { formFieldSheet, dropdownPanelSheet, comboControlSheet } from '../shared-styles';

interface Option {
  value: string;
  label: string;
}

export class BMultiSelect extends BaseComponent {
  static get observedAttributes() {
    return ['label', 'name', 'placeholder', 'error', 'disabled', 'searchable'];
  }

  private _options: Option[] = [];
  private _selected = new Set<string>();
  private _filter = '';

  static get sharedStyles() {
    return [formFieldSheet, dropdownPanelSheet, comboControlSheet];
  }

  static get styles() {
    return `
      :host { display: block; position: relative; }
      /* Layout extension — base border/focus/error/disabled from comboControlSheet */
      .container {
        flex-wrap: wrap;
        gap: var(--b-space-xs, 0.25rem);
        padding: var(--b-space-xs, 0.25rem) var(--b-space-sm, 0.5rem);
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
      }
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
      .placeholder {
        color: var(--b-text-muted);
        font-size: var(--b-text-base, 0.875rem);
        padding: 0.125rem 0;
      }
      .dropdown { width: 100%; }
      .option {
        display: flex;
        align-items: center;
        gap: var(--b-space-sm, 0.5rem);
        padding: var(--b-space-sm, 0.5rem) var(--b-space-md, 0.75rem);
        cursor: pointer;
        font-size: var(--b-text-sm, 0.8125rem);
        color: var(--b-text);
        transition: background var(--b-transition, 150ms ease);
      }
      .option:hover { background: var(--b-bg-tertiary); }
      .option input {
        width: auto;
        margin: 0;
        cursor: pointer;
      }
      .search-input {
        border: none;
        outline: none;
        background: transparent;
        font-size: var(--b-text-sm, 0.8125rem);
        color: var(--b-text);
        min-width: 4rem;
        flex: 1;
        padding: 0.125rem 0;
      }
      .search-input::placeholder { color: var(--b-text-muted); }
      .search-wrap {
        padding: var(--b-space-xs, 0.25rem) var(--b-space-sm, 0.5rem);
        border-bottom: var(--b-border-width, 1px) solid var(--b-border);
        position: sticky;
        top: 0;
        background: var(--b-bg);
        z-index: 1;
      }
      .search-wrap input {
        width: 100%;
        border: none;
        outline: none;
        background: transparent;
        font-size: var(--b-text-sm, 0.8125rem);
        color: var(--b-text);
        padding: var(--b-space-xs, 0.25rem) 0;
      }
      .search-wrap input::placeholder { color: var(--b-text-muted); }
      .no-results {
        padding: var(--b-space-sm, 0.5rem) var(--b-space-md, 0.75rem);
        color: var(--b-text-muted);
        font-size: var(--b-text-sm, 0.8125rem);
      }
    `;
  }

  setOptions(options: Option[]) {
    this._options = options;
    this.update();
  }

  getSelected(): string[] {
    return [...this._selected];
  }

  setSelected(values: string[]) {
    this._selected = new Set(values);
    this.update();
  }

  render() {
    const label = this.attr('label');
    const error = this.attr('error');
    const placeholder = this.attr('placeholder', 'Select...');
    const disabled = this.boolAttr('disabled');
    const searchable = this.boolAttr('searchable');
    const dropdownId = 'dd-' + (this.id || 'ms');

    const chips = this._options
      .filter(o => this._selected.has(o.value))
      .map(o => `
        <span class="chip">
          ${o.label}
          <button class="chip-remove" data-value="${o.value}" type="button" aria-label="Remove ${o.label}">&times;</button>
        </span>
      `).join('');

    const filterLower = this._filter.toLowerCase();
    const filtered = searchable && this._filter
      ? this._options.filter(o => o.label.toLowerCase().includes(filterLower) || o.value.toLowerCase().includes(filterLower))
      : this._options;

    return `
      <div class="field">
        ${label ? `<label>${label}</label>` : ''}
        <div class="container combo-container ${error ? 'has-error' : ''} ${disabled ? 'disabled' : ''}"
             tabindex="${disabled ? '-1' : '0'}"
             aria-haspopup="listbox"
             aria-expanded="false">
          ${chips || `<span class="placeholder">${placeholder}</span>`}
        </div>
        <div class="dropdown dropdown-panel" id="${dropdownId}" popover role="listbox">
          ${searchable ? `<div class="search-wrap"><input type="text" class="dd-search" placeholder="Search..." value="${this._filter}" /></div>` : ''}
          ${filtered.length > 0 ? filtered.map(o => `
            <label class="option">
              <input type="checkbox"
                     value="${o.value}"
                     ${this._selected.has(o.value) ? 'checked' : ''} />
              ${o.label}
            </label>
          `).join('') : `<div class="no-results">No matches</div>`}
        </div>
        ${error ? `<span class="error">${error}</span>` : ''}
      </div>
    `;
  }

  protected onUpdated() {
    const container = this.$<HTMLElement>('.container');
    const dropdown = this.$<HTMLElement>('.dropdown');
    if (!container || !dropdown) return;

    // Toggle dropdown on container click
    container.addEventListener('click', (e) => {
      // Don't open if clicking chip remove button
      if ((e.target as HTMLElement).classList.contains('chip-remove')) return;
      dropdown.togglePopover();
    });

    // Chip remove buttons
    this.$$<HTMLElement>('.chip-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._selected.delete(btn.dataset.value!);
        this._emitAndUpdate();
      });
    });

    // Search input — only patch dropdown options, no full re-render
    const searchInput = this.$<HTMLInputElement>('.dd-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        this._filter = searchInput.value;
        this._updateDropdownOptions(dropdown);
      });
      searchInput.addEventListener('click', (e) => e.stopPropagation());
    }

    // Checkbox changes — patch dropdown + chips, no full re-render
    this._wireOptionCheckboxes(dropdown);

    // Sync aria-expanded with popover state + position
    dropdown.addEventListener('toggle', ((e: ToggleEvent) => {
      container.setAttribute('aria-expanded', e.newState === 'open' ? 'true' : 'false');
      if (e.newState === 'open') {
        const rect = container.getBoundingClientRect();
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
      }
      if (e.newState === 'closed' && this._filter) {
        this._filter = '';
        this._updateDropdownOptions(dropdown);
      }
    }) as EventListener);
  }

  /** Patch only the options inside the dropdown — no full re-render. */
  private _updateDropdownOptions(dropdown: HTMLElement) {
    const searchWrap = dropdown.querySelector('.search-wrap');
    const filterLower = this._filter.toLowerCase();
    const filtered = this._filter
      ? this._options.filter(o => o.label.toLowerCase().includes(filterLower) || o.value.toLowerCase().includes(filterLower))
      : this._options;

    // Remove all children except search wrap
    const children = Array.from(dropdown.children);
    for (const child of children) {
      if (child !== searchWrap) child.remove();
    }

    if (filtered.length === 0) {
      dropdown.insertAdjacentHTML('beforeend', '<div class="no-results">No matches</div>');
    } else {
      dropdown.insertAdjacentHTML('beforeend', filtered.map(o => `
        <label class="option">
          <input type="checkbox" value="${o.value}" ${this._selected.has(o.value) ? 'checked' : ''} />
          ${o.label}
        </label>
      `).join(''));
    }

    this._wireOptionCheckboxes(dropdown);
  }

  /** Wire checkbox change handlers inside the dropdown. */
  private _wireOptionCheckboxes(dropdown: HTMLElement) {
    dropdown.querySelectorAll<HTMLInputElement>('.option input').forEach(input => {
      input.addEventListener('change', () => {
        if (input.checked) {
          this._selected.add(input.value);
        } else {
          this._selected.delete(input.value);
        }
        this.emit('change', { name: this.attr('name'), values: this.getSelected() });
        this._updateChips();
        this._updateDropdownOptions(dropdown);
      });
    });
  }

  /** Patch only the chips area — no full re-render. */
  private _updateChips() {
    const container = this.$<HTMLElement>('.container');
    if (!container) return;
    const placeholder = this.attr('placeholder', 'Select...');

    const chips = this._options
      .filter(o => this._selected.has(o.value))
      .map(o => `
        <span class="chip">
          ${o.label}
          <button class="chip-remove" data-value="${o.value}" type="button" aria-label="Remove ${o.label}">&times;</button>
        </span>
      `).join('');

    container.innerHTML = chips || `<span class="placeholder">${placeholder}</span>`;

    // Re-wire chip remove buttons
    container.querySelectorAll<HTMLElement>('.chip-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._selected.delete(btn.dataset.value!);
        this.emit('change', { name: this.attr('name'), values: this.getSelected() });
        this._updateChips();
        const dropdown = this.$<HTMLElement>('.dropdown');
        if (dropdown) this._updateDropdownOptions(dropdown);
      });
    });
  }
}

define('b-multi-select', BMultiSelect);
