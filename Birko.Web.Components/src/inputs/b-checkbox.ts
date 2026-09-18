import { FormControlComponent, define } from 'birko-web-core';
import { formToggleSheet } from '../shared-styles';

export class BCheckbox extends FormControlComponent {
  static get observedAttributes() {
    return ['checked', 'indeterminate', 'disabled', 'name', 'label', 'hint', 'value', 'required'];
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
        border: solid var(--b-text-inverse);
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
        height: var(--b-space-2xs, 0.125rem);
        background: var(--b-text-inverse);
        transform: translateY(-50%);
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
        <input type="checkbox"
               ${checked ? 'checked' : ''}
               ${disabled ? 'disabled' : ''}
               ${this.boolAttr('required') ? 'required' : ''}
               name="${this.attr('name')}"
               ${label ? `aria-label="${label}"` : ''} />
        ${label ? `<span class="toggle-label">${label}</span>` : ''}
        ${hint ? `<b-tooltip text="${hint}"><span class="hint-icon">?</span></b-tooltip>` : ''}
      </label>
    `;
  }

  protected onMount() {
    this._syncIndeterminate();
  }

  protected onUpdated() {
    this._syncIndeterminate();

    const input = this.$<HTMLInputElement>('input');
    if (!input) return;
    // Sync the input's `checked` property to the host attribute on every render —
    // a user click makes the property "dirty" and decoupled from the attribute,
    // so a later morph that removes the attribute leaves the property (and the
    // visual state) stuck on the user's last value.
    input.checked = this.boolAttr('checked');
    this.listen(input, 'change', (e: Event) => {
      const inp = e.target as HTMLInputElement;
      // Native click clears indeterminate automatically
      this.removeAttribute('indeterminate');
      if (inp.checked) {
        this.setAttribute('checked', '');
      } else {
        this.removeAttribute('checked');
      }
      this.emit('change', { name: this.attr('name'), checked: inp.checked });
      this.syncFormState();
    });

    this.syncFormState();
  }

  /**
   * Native checkbox submit semantics: the `value` attribute (defaulting to `on`) **only when checked**,
   * and no `FormData` entry at all when unchecked.
   *
   * Deliberately different from `value` / `inputValue`, which keep returning `'true'` / `'false'`. Nothing
   * in the framework or any consumer reads `.value` on a toggle — `b-form._getFieldValue` and every
   * consumer read `.checked` — so realigning it would be churn with no benefit, while submitting
   * `name=false` for an unchecked box would silently mis-bind on the server (an unchecked box must be
   * *absent*, which is how `bool` model binding detects false).
   */
  protected formValue(): string | null {
    if (!this.checked) return null;
    return this.getAttribute('value') ?? 'on';
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

  get value(): string { return this.inputValue; }
  set value(v: string) { this.inputValue = v; }

  /** Unified interface — returns 'true'/'false' string */
  get inputValue(): string { return String(this.checked); }
  set inputValue(v: string) { this.checked = v === 'true' || v === '1'; }

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

  /**
   * A reset restores **checkedness**, not `value` — the base default would feed the `value` attribute
   * through the `value` setter (which reads `'true'`/`'1'`) and so uncheck a `<b-checkbox value="yes" checked>`.
   */
  protected captureInitialState(): unknown {
    return this.hasAttribute('checked');
  }

  protected restoreInitialState(state: unknown): void {
    if (state) this.setAttribute('checked', '');
    else this.removeAttribute('checked');
    const input = this.$<HTMLInputElement>('input');
    if (input) input.checked = !!state;
  }
}

define('b-checkbox', BCheckbox);
