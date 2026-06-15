import { BaseComponent, define } from 'birko-web-core';
import { rovingIndex } from '../dom-utils';

export interface SegmentedOption {
  value: string;
  label: string;
}

/**
 * Segmented control — pill-style single-pick group of buttons.
 *
 * Use for short, fixed enumerations (≤4 options) where a select dropdown feels heavy.
 * Emits `change` with `{ name, value }` on selection.
 */
export class BSegmented extends BaseComponent {
  static get observedAttributes() {
    return ['name', 'value', 'disabled', 'label'];
  }

  private _options: SegmentedOption[] = [];

  static get styles() {
    return `
      :host { display: inline-block; }
      .segmented {
        display: inline-flex;
        background: var(--b-bg-tertiary);
        border-radius: var(--b-radius, 0.375rem);
        padding: 2px;
        gap: 2px;
      }
      .segmented button {
        background: transparent;
        border: none;
        padding: var(--b-space-xs, 0.25rem) var(--b-space-md, 0.75rem);
        font-size: var(--b-text-sm, 0.8125rem);
        font-weight: var(--b-font-weight-medium, 500);
        color: var(--b-text-secondary);
        border-radius: calc(var(--b-radius, 0.375rem) - 2px);
        cursor: pointer;
        white-space: nowrap;
        transition: background var(--b-transition, 150ms ease), color var(--b-transition, 150ms ease);
      }
      .segmented button:hover:not(:disabled):not(.active) { color: var(--b-text); }
      .segmented button.active {
        background: var(--b-bg);
        color: var(--b-text);
        box-shadow: var(--b-shadow-sm, 0 1px 2px rgba(0,0,0,0.05));
      }
      .segmented button:focus-visible {
        outline: none;
        box-shadow: var(--b-focus-ring, 0 0 0 3px rgba(37, 99, 235, 0.15));
      }
      .segmented button:disabled {
        opacity: var(--b-disabled-opacity, 0.5);
        cursor: not-allowed;
      }
    `;
  }

  setOptions(options: SegmentedOption[]) {
    this._options = options;
    this.update();
  }

  render() {
    const value = this.attr('value');
    const disabled = this.boolAttr('disabled');
    // Single-choice control → radiogroup pattern (not tabs: there are no tabpanels).
    // Roving tabindex: the checked option is the tab stop, else the first option.
    const selectedIdx = this._options.findIndex(o => o.value === value);
    const focusIdx = selectedIdx >= 0 ? selectedIdx : 0;
    const buttons = this._options.map((o, i) => `
      <button type="button" role="radio" data-value="${o.value}"
              class="${o.value === value ? 'active' : ''}"
              ${disabled ? 'disabled' : ''}
              tabindex="${i === focusIdx ? '0' : '-1'}"
              aria-checked="${o.value === value}">${o.label}</button>
    `).join('');
    const groupLabel = this.attr('label') || this.attr('name');
    return `<div class="segmented" role="radiogroup"${groupLabel ? ` aria-label="${groupLabel}"` : ''}>${buttons}</div>`;
  }

  protected onUpdated() {
    const buttons = this.$$<HTMLButtonElement>('button');
    const select = (v: string) => {
      if (v === this.attr('value')) return;
      this.setAttribute('value', v);
      this.emit('change', { name: this.attr('name'), value: v });
    };
    buttons.forEach((btn, i) => {
      this.listen(btn, 'click', () => select(btn.dataset.value!));
      // Arrow keys move + select (focus follows selection, per the radio-group pattern).
      this.listen<KeyboardEvent>(btn, 'keydown', (e) => {
        const next = rovingIndex(e, i, buttons.length);
        if (next === null) return;
        select(buttons[next].dataset.value!);
        buttons[next].focus();
      });
    });
  }

  get value(): string { return this.attr('value'); }
  set value(v: string) {
    if (v) this.setAttribute('value', v);
    else this.removeAttribute('value');
  }
}

define('b-segmented', BSegmented);
