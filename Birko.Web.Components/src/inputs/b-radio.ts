import { BaseComponent, define } from 'birko-web-core';
import { formToggleSheet } from '../shared-styles';

export class BRadio extends BaseComponent {
  static get observedAttributes() {
    return ['checked', 'disabled', 'name', 'value', 'label'];
  }

  private _groupListener: ((e: Event) => void) | null = null;

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
        border-radius: var(--b-radius-full, 9999px);
        border: var(--b-border-width, 1px) solid var(--b-border);
        background: var(--b-bg);
        cursor: pointer;
        flex-shrink: 0;
        margin: 0;
        transition: border-color var(--b-transition, 150ms ease);
      }
      input:checked {
        border-color: var(--b-color-primary);
      }
      /* Inner filled circle */
      input:checked::after {
        content: '';
        position: absolute;
        top: 50%;
        left: 50%;
        width: 0.625rem;   /* 10px */
        height: 0.625rem;
        border-radius: var(--b-radius-full, 9999px);
        background: var(--b-color-primary);
        transform: translate(-50%, -50%);
      }
      input:focus-visible {
        outline: none;
        box-shadow: var(--b-focus-ring, 0 0 0 3px rgba(37, 99, 235, 0.15));
      }
      input:disabled {
        opacity: var(--b-disabled-opacity, 0.5);
        cursor: not-allowed;
      }
    `;
  }

  render() {
    const checked = this.boolAttr('checked');
    const disabled = this.boolAttr('disabled');
    const label = this.attr('label');

    return `
      <label class="toggle-wrapper ${disabled ? 'disabled' : ''}">
        <input type="radio"
               ${checked ? 'checked' : ''}
               ${disabled ? 'disabled' : ''}
               name="${this.attr('name')}"
               value="${this.attr('value')}"
               ${label ? `aria-label="${label}"` : ''} />
        ${label ? `<span class="toggle-label">${label}</span>` : ''}
      </label>
    `;
  }

  protected onMount() {
    // Listen for sibling radio selections to uncheck this one (Shadow DOM breaks native grouping)
    this._groupListener = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.name === this.attr('name') && detail?.value !== this.attr('value')) {
        this.removeAttribute('checked');
        const input = this.$<HTMLInputElement>('input');
        if (input) input.checked = false;
      }
    };
    this.parentElement?.addEventListener('b-radio-change', this._groupListener);
  }

  protected onUnmount() {
    if (this._groupListener) {
      this.parentElement?.removeEventListener('b-radio-change', this._groupListener);
    }
  }

  protected onUpdated() {
    const input = this.$<HTMLInputElement>('input');
    if (input) this.listen(input, 'change', (e: Event) => {
      const inp = e.target as HTMLInputElement;
      if (inp.checked) {
        this.setAttribute('checked', '');
        // Notify siblings via a group event on the parent
        this.parentElement?.dispatchEvent(new CustomEvent('b-radio-change', {
          detail: { name: this.attr('name'), value: this.attr('value') },
          bubbles: false,
        }));
        this.emit('change', { name: this.attr('name'), value: this.attr('value') });
      }
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

define('b-radio', BRadio);
