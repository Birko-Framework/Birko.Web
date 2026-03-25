import { BaseComponent, define } from 'birko-web-core';
import { formToggleSheet } from '../shared-styles';

export class BCheckbox extends BaseComponent {
  static get observedAttributes() {
    return ['checked', 'indeterminate', 'disabled', 'name', 'label'];
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
        width: 1.125rem;    /* 18px */
        height: 1.125rem;
        border-radius: var(--b-radius-sm, 0.25rem);
        border: var(--b-border-width, 1px) solid var(--b-border);
        background: var(--b-bg);
        cursor: pointer;
        flex-shrink: 0;
        margin: 0;
        transition: background var(--b-transition, 150ms ease), border-color var(--b-transition, 150ms ease);
      }
      input:checked, input:indeterminate {
        background: var(--b-color-primary);
        border-color: var(--b-color-primary);
      }
      input:focus-visible {
        outline: none;
        box-shadow: var(--b-focus-ring, 0 0 0 3px rgba(37, 99, 235, 0.15));
      }
      input:disabled {
        opacity: var(--b-disabled-opacity, 0.5);
        cursor: not-allowed;
      }
      /* Checkmark via ::after — polyline approximation with CSS borders */
      input:checked::after {
        content: '';
        position: absolute;
        left: 0.3125rem;   /* 5px — centered */
        top: 0.125rem;     /* 2px */
        width: 0.3125rem;  /* 5px */
        height: 0.5625rem; /* 9px */
        border: solid #fff;
        border-width: 0 2px 2px 0;
        transform: rotate(45deg);
      }
      /* Dash for indeterminate */
      input:indeterminate::after {
        content: '';
        position: absolute;
        left: 0.1875rem;   /* 3px */
        top: 50%;
        width: 0.6875rem;  /* 11px */
        height: 2px;
        background: #fff;
        transform: translateY(-50%);
      }
    `;
  }

  render() {
    const checked = this.boolAttr('checked');
    const disabled = this.boolAttr('disabled');
    const label = this.attr('label');

    return `
      <label class="toggle-wrapper ${disabled ? 'disabled' : ''}">
        <input type="checkbox"
               ${checked ? 'checked' : ''}
               ${disabled ? 'disabled' : ''}
               name="${this.attr('name')}"
               ${label ? `aria-label="${label}"` : ''} />
        ${label ? `<span class="toggle-label">${label}</span>` : ''}
      </label>
    `;
  }

  protected onMount() {
    this._syncIndeterminate();
  }

  protected onUpdated() {
    this._syncIndeterminate();

    this.$<HTMLInputElement>('input')?.addEventListener('change', (e) => {
      const input = e.target as HTMLInputElement;
      // Native click clears indeterminate automatically
      this.removeAttribute('indeterminate');
      if (input.checked) {
        this.setAttribute('checked', '');
      } else {
        this.removeAttribute('checked');
      }
      this.emit('change', { name: this.attr('name'), checked: input.checked });
    });
  }

  /** indeterminate is a JS property, not an HTML attribute — must sync manually */
  private _syncIndeterminate() {
    const input = this.$<HTMLInputElement>('input');
    if (input) {
      input.indeterminate = this.boolAttr('indeterminate');
    }
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

  get indeterminate(): boolean {
    return this.boolAttr('indeterminate');
  }

  set indeterminate(val: boolean) {
    if (val) {
      this.setAttribute('indeterminate', '');
    } else {
      this.removeAttribute('indeterminate');
    }
  }
}

define('b-checkbox', BCheckbox);
