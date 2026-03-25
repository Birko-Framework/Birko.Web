import { BaseComponent, define } from 'birko-web-core';
import { formFieldSheet, dropdownPanelSheet } from '../shared-styles';

interface Option {
  value: string;
  label: string;
}

export class BMultiSelect extends BaseComponent {
  static get observedAttributes() {
    return ['label', 'name', 'placeholder', 'error', 'disabled'];
  }

  private _options: Option[] = [];
  private _selected = new Set<string>();

  static get sharedStyles() {
    return [formFieldSheet, dropdownPanelSheet];
  }

  static get styles() {
    return `
      :host { display: block; position: relative; }
      .container {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--b-space-xs, 0.25rem);
        padding: var(--b-space-xs, 0.25rem) var(--b-space-sm, 0.5rem);
        border: var(--b-border-width, 1px) solid var(--b-border);
        border-radius: var(--b-radius, 0.375rem);
        background: var(--b-bg);
        min-height: 2.25rem;
        cursor: pointer;
        transition: border-color var(--b-transition, 150ms ease), box-shadow var(--b-transition, 150ms ease);
      }
      .container:focus-within {
        border-color: var(--b-border-focus);
        box-shadow: var(--b-focus-ring);
      }
      .container.has-error {
        border-color: var(--b-color-danger);
      }
      .container.has-error:focus-within {
        box-shadow: var(--b-focus-ring-danger);
      }
      .container.disabled {
        opacity: var(--b-disabled-opacity, 0.5);
        cursor: not-allowed;
        pointer-events: none;
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
      .dropdown { left: 0; right: 0; }
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
    const dropdownId = 'dd-' + (this.id || 'ms');

    const chips = this._options
      .filter(o => this._selected.has(o.value))
      .map(o => `
        <span class="chip">
          ${o.label}
          <button class="chip-remove" data-value="${o.value}" type="button" aria-label="Remove ${o.label}">&times;</button>
        </span>
      `).join('');

    return `
      <div class="field">
        ${label ? `<label>${label}</label>` : ''}
        <div class="container ${error ? 'has-error' : ''} ${disabled ? 'disabled' : ''}"
             tabindex="${disabled ? '-1' : '0'}"
             aria-haspopup="listbox"
             aria-expanded="false">
          ${chips || `<span class="placeholder">${placeholder}</span>`}
        </div>
        <div class="dropdown dropdown-panel" id="${dropdownId}" popover role="listbox">
          ${this._options.map(o => `
            <label class="option">
              <input type="checkbox"
                     value="${o.value}"
                     ${this._selected.has(o.value) ? 'checked' : ''} />
              ${o.label}
            </label>
          `).join('')}
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

    // Checkbox changes in dropdown
    this.$$<HTMLInputElement>('.option input').forEach(input => {
      input.addEventListener('change', () => {
        if (input.checked) {
          this._selected.add(input.value);
        } else {
          this._selected.delete(input.value);
        }
        this._emitAndUpdate();
      });
    });

    // Sync aria-expanded with popover state
    dropdown.addEventListener('toggle', ((e: ToggleEvent) => {
      container.setAttribute('aria-expanded', e.newState === 'open' ? 'true' : 'false');
    }) as EventListener);
  }

  private _emitAndUpdate() {
    this.emit('change', { name: this.attr('name'), values: this.getSelected() });
    this.update();
  }
}

define('b-multi-select', BMultiSelect);
