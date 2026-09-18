import { FormControlComponent, define } from 'birko-web-core';
import { formToggleSheet } from '../shared-styles';

export class BRadio extends FormControlComponent {
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
        // This path does NOT re-render, so onUpdated's sync never runs — without this the deselected
        // member keeps its old `setFormValue`, and the group submits TWO entries under one name.
        this.syncFormState();
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
    if (!input) return;
    // Keep the input's `checked` property in lock-step with the host attribute —
    // once a user clicks, the property becomes "dirty" and a later attribute
    // morph (e.g. b-form.setValues to a different value) won't update the visual.
    input.checked = this.boolAttr('checked');
    this.listen(input, 'change', (e: Event) => {
      const inp = e.target as HTMLInputElement;
      if (inp.checked) {
        this.setAttribute('checked', '');
        // Notify siblings via a group event on the parent
        this.parentElement?.dispatchEvent(new CustomEvent('b-radio-change', {
          detail: { name: this.attr('name'), value: this.attr('value') },
          bubbles: false,
        }));
        this.emit('change', { name: this.attr('name'), value: this.attr('value') });
        this.syncFormState();
      }
    });

    this.syncFormState();
  }

  /**
   * Native radio submit semantics: the `value` attribute **only when checked**, nothing when not. Group
   * members share a `name`, and since only the checked one returns a value, the form receives exactly one
   * entry per group — no coordinator needed for submission (the existing `b-radio-change` sibling
   * bookkeeping remains what enforces mutual exclusion, because Shadow DOM breaks native radio grouping).
   */
  protected formValue(): string | null {
    if (!this.checked) return null;
    return this.getAttribute('value') ?? 'on';
  }

  /**
   * `required` on a radio is a property of the **group** — satisfied by any one member being checked —
   * and cannot be evaluated per element: every unchecked member would report `valueMissing` and the form
   * would surface one bubble per radio for a single logical field. `required` is therefore **not
   * supported** on `b-radio`; validate the group in the page (or via `b-form`, which already does).
   *
   * Not forwarded to the inner `<input>` either, for the same reason.
   */
  protected get supportsRequiredValidation(): boolean {
    return false;
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

  /** Unified interface — returns the value attr when checked, empty when not */
  get inputValue(): string { return this.checked ? (this.attr('value') ?? 'true') : ''; }
  set inputValue(v: string) { this.checked = !!v; }

  /**
   * A reset restores **checkedness**, not `value` — the base default would feed the `value` attribute
   * through the `value` setter (which reads `'true'`/`'1'`) and so uncheck a `<b-radio value="yes" checked>`.
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

define('b-radio', BRadio);
