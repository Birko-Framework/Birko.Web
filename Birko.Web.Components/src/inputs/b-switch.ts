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
      input {
        appearance: none;
        position: relative;
        width: 2.25rem;    /* 36px */
        height: 1.25rem;   /* 20px */
        border-radius: var(--b-radius-full, 9999px);
        background: var(--b-bg-tertiary);
        border: none;
        cursor: pointer;
        flex-shrink: 0;
        transition: background var(--b-transition, 150ms ease);
        margin: 0;
      }
      input:checked {
        background: var(--b-color-primary);
      }
      input:focus-visible {
        outline: none;
        box-shadow: var(--b-focus-ring, 0 0 0 3px rgba(37, 99, 235, 0.15));
      }
      input:disabled {
        opacity: var(--b-disabled-opacity, 0.5);
        cursor: not-allowed;
      }
      /* Thumb via ::after pseudo-element */
      input::after {
        content: '';
        position: absolute;
        top: 0.125rem;     /* 2px inset */
        left: 0.125rem;
        width: 1rem;        /* 16px */
        height: 1rem;
        border-radius: var(--b-radius-full, 9999px);
        background: #fff;
        transition: transform var(--b-transition, 150ms ease);
      }
      input:checked::after {
        transform: translateX(1rem);
      }
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
}

define('b-switch', BSwitch);
