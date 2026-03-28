import { BaseComponent, define } from 'birko-web-core';
import { formFieldSheet } from '../shared-styles';
import { renderLabel } from './label-hint';

interface Option {
  value: string;
  label: string;
  icon?: string;
}

/**
 * Segmented button group for selecting a single value from a small set of options.
 *
 * Usage:
 *   <b-option-group label="Theme" name="theme" value="light"></b-option-group>
 *
 *   group.setOptions([
 *     { value: 'light', label: 'Light', icon: '☀' },
 *     { value: 'dark',  label: 'Dark',  icon: '☾' },
 *   ]);
 *
 * Emits: 'change' with { name, value }
 */
export class BOptionGroup extends BaseComponent {
  static get observedAttributes() {
    return ['label', 'name', 'value', 'disabled', 'hint'];
  }

  private _options: Option[] = [];

  static get sharedStyles() {
    return [formFieldSheet];
  }

  static get styles() {
    return `
      :host { display: block; }
      .options {
        display: flex;
        gap: var(--b-space-xs, 0.25rem);
        flex-wrap: wrap;
      }
      .opt-btn {
        padding: var(--b-space-xs, 0.25rem) var(--b-space-md, 0.75rem);
        border: 1px solid var(--b-border);
        border-radius: var(--b-radius, 0.375rem);
        background: var(--b-bg);
        color: var(--b-text-secondary);
        font-size: var(--b-text-sm, 0.8125rem);
        cursor: pointer;
        transition: all var(--b-transition, 150ms ease);
        line-height: var(--b-line-height, 1.5);
        font-family: inherit;
        white-space: nowrap;
      }
      .opt-btn:hover:not(.active):not(:disabled) {
        border-color: var(--b-color-primary);
        color: var(--b-text);
      }
      .opt-btn.active {
        background: var(--b-color-primary);
        color: var(--b-color-on-primary, #fff);
        border-color: var(--b-color-primary);
      }
      .opt-btn:disabled {
        opacity: var(--b-disabled-opacity, 0.5);
        cursor: not-allowed;
      }
      .opt-btn:focus-visible {
        outline: none;
        box-shadow: var(--b-focus-ring, 0 0 0 3px rgba(37, 99, 235, 0.15));
      }
    `;
  }

  render() {
    const label = this.attr('label');
    const hint = this.attr('hint');
    const value = this.attr('value');
    const disabled = this.boolAttr('disabled');

    const buttons = this._options.map(o => {
      const active = o.value === value ? 'active' : '';
      const icon = o.icon ? `${o.icon} ` : '';
      return `<button type="button" class="opt-btn ${active}" data-value="${o.value}" ${disabled ? 'disabled' : ''}>${icon}${o.label}</button>`;
    }).join('');

    return `
      <div class="field">
        ${renderLabel(label, hint)}
        <div class="options">${buttons}</div>
      </div>
    `;
  }

  setOptions(options: Option[]) {
    this._options = options;
    this.update();
  }

  protected onUpdated() {
    const container = this.$<HTMLElement>('.options');
    if (container) {
      this.listen(container, 'click', (e: Event) => {
        const btn = (e.target as HTMLElement).closest<HTMLElement>('.opt-btn');
        if (!btn || btn.hasAttribute('disabled')) return;

        const val = btn.dataset.value ?? '';
        this.setAttribute('value', val);
        this.emit('change', { name: this.attr('name'), value: val });
      });
    }
  }

  get value(): string {
    return this.attr('value');
  }

  set value(val: string) {
    this.setAttribute('value', val);
  }
}

define('b-option-group', BOptionGroup);
