import { BaseComponent, define } from 'birko-web-core';
import { formToggleSheet } from '../shared-styles';

export class BSwitch extends BaseComponent {
  static get observedAttributes() {
    return ['checked', 'disabled', 'name', 'label', 'hint'];
  }

  static get sharedStyles() {
    return [formToggleSheet];
  }

  static get styles() {
    return `
      :host { display: inline-block; }
      /* Visually hide the native checkbox but keep it accessible and clickable via label */
      input {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
      .track {
        position: relative;
        display: inline-block;
        width: 2.25rem;    /* 36px */
        height: 1.25rem;   /* 20px */
        border-radius: var(--b-radius-full, 9999px);
        background: var(--b-bg-tertiary);
        cursor: pointer;
        flex-shrink: 0;
        transition: background var(--b-transition, 150ms ease);
      }
      .thumb {
        position: absolute;
        top: 0.125rem;     /* 2px inset */
        left: 0.125rem;
        width: 1rem;        /* 16px */
        height: 1rem;
        border-radius: var(--b-radius-full, 9999px);
        background: var(--b-input-thumb-bg, #ffffff);
        box-shadow: var(--b-shadow-sm, 0 1px 2px rgba(0,0,0,0.1));
        transition: transform var(--b-transition, 150ms ease);
        pointer-events: none;
      }
      input:checked ~ .track { background: var(--b-color-primary); }
      input:checked ~ .track .thumb { transform: translateX(1rem); }
      input:focus-visible ~ .track {
        box-shadow: var(--b-focus-ring, 0 0 0 3px rgba(37, 99, 235, 0.15));
      }
      .toggle-wrapper.disabled .track { opacity: var(--b-disabled-opacity, 0.5); cursor: not-allowed; }
    `;
  }

  render() {
    const checked = this.boolAttr('checked');
    const disabled = this.boolAttr('disabled');
    const label = this.attr('label');
    const hint = this.attr('hint');

    return `
      <label class="toggle-wrapper ${disabled ? 'disabled' : ''}">
        <input type="checkbox" role="switch"
               ${checked ? 'checked' : ''}
               ${disabled ? 'disabled' : ''}
               name="${this.attr('name')}"
               ${label ? `aria-label="${label}"` : ''} />
        <span class="track"><span class="thumb"></span></span>
        ${label ? `<span class="toggle-label">${label}</span>` : ''}
        ${hint ? `<b-tooltip text="${hint}"><span class="hint-icon">?</span></b-tooltip>` : ''}
      </label>
    `;
  }

  protected onUpdated() {
    const input = this.$<HTMLInputElement>('input');
    if (input) this.listen(input, 'change', (e: Event) => {
      const inp = e.target as HTMLInputElement;
      if (inp.checked) {
        this.setAttribute('checked', '');
      } else {
        this.removeAttribute('checked');
      }
      this.emit('change', { name: this.attr('name'), checked: inp.checked });
    });
  }

  get checked(): boolean {
    return this.boolAttr('checked');
  }

  set checked(val: boolean) {
    if (val) {
      this.setAttribute('checked', '');
    } else {
      this.removeAttribute('checked');
    }
  }

  get value(): string { return this.inputValue; }
  set value(v: string) { this.inputValue = v; }

  /** Unified interface — returns 'true'/'false' string */
  get inputValue(): string { return String(this.checked); }
  set inputValue(v: string) { this.checked = v === 'true' || v === '1'; }
}

define('b-switch', BSwitch);
