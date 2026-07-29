import { BaseComponent, define } from 'birko-web-core';
import { formFieldSheet } from '../shared-styles';
import { renderField, fieldAria } from './label-hint';
import { rovingIndex } from '../dom-utils';

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
    return ['label', 'name', 'value', 'disabled', 'hint', 'error', 'required', 'description', 'bare'];
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
      /* Error state. The .options row has no border of its own, so the signal goes on the buttons —
         drawing a box around the group would invent chrome that appears nowhere else. */
      .options.has-error .opt-btn { border-color: var(--b-color-danger); }
      .opt-btn:hover:not(.active):not(:disabled) {
        border-color: var(--b-color-primary);
        color: var(--b-text);
      }
      .opt-btn.active {
        background: var(--b-color-primary);
        color: var(--b-text-inverse);
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

    // Single-choice control → radiogroup with roving tabindex (the selected option,
    // or the first when none, is the tab stop).
    const selectedIdx = this._options.findIndex(o => o.value === value);
    const focusIdx = selectedIdx >= 0 ? selectedIdx : 0;
    const buttons = this._options.map((o, i) => {
      const active = o.value === value ? 'active' : '';
      const icon = o.icon ? `${o.icon} ` : '';
      return `<button type="button" role="radio" class="opt-btn ${active}" data-value="${o.value}"
        aria-checked="${o.value === value}" tabindex="${!disabled && i === focusIdx ? '0' : '-1'}"
        ${disabled ? 'disabled' : ''}>${icon}${o.label}</button>`;
    }).join('');

    const error = this.attr('error');
    const required = this.boolAttr('required');
    const bare = this.boolAttr('bare');
    const description = this.attr('description');
    return renderField({
      bare,
      uid: this.uid,
      label,
      hint,
      error,
      required,
      description,
      // The radiogroup is the focusable widget, so the ARIA goes on it. `label` is not passed to
      // fieldAria: the group already sets its own aria-label just below, and a second one on the same
      // element would be a duplicate attribute.
      control: `
        <div class="options ${error ? 'has-error' : ''}" role="radiogroup"${label ? ` aria-label="${label}"` : ''}
             ${fieldAria({ uid: this.uid, error, required, description, bare })}>${buttons}</div>`,
    });
  }

  setOptions(options: Option[]) {
    this._options = options;
    this.update();
  }

  protected onUpdated() {
    const container = this.$<HTMLElement>('.options');
    if (!container) return;

    const select = (val: string) => {
      if (val === this.attr('value')) return;
      this.setAttribute('value', val);
      this.emit('change', { name: this.attr('name'), value: val });
    };

    this.listen(container, 'click', (e: Event) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('.opt-btn');
      if (!btn || btn.hasAttribute('disabled')) return;
      select(btn.dataset.value ?? '');
    });

    // Arrow/Home/End move + select (focus follows selection, per the radio-group pattern).
    const buttons = this.$$<HTMLElement>('.opt-btn');
    buttons.forEach((btn, i) => {
      this.listen<KeyboardEvent>(btn, 'keydown', (e) => {
        const next = rovingIndex(e, i, buttons.length);
        if (next === null) return;
        select(buttons[next].dataset.value ?? '');
        buttons[next].focus();
      });
    });
  }

  get value(): string {
    return this.attr('value');
  }

  set value(val: string) {
    this.setAttribute('value', val);
  }

  /** Unified interface — alias for value */
  get inputValue(): string { return this.value; }
  set inputValue(v: string) { this.value = v; }
}

define('b-option-group', BOptionGroup);
