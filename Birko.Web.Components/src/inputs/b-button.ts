import { FormControlComponent, define } from 'birko-web-core';
import { spinSheet } from '../shared-styles';
import { escapeAttr } from '../dom-utils';

/**
 * A button that participates in a native `<form>`.
 *
 * ## Why this extends {@link FormControlComponent}
 *
 * The inner `<button>` lives in the shadow root, and **an element in a shadow root has no form owner** — so
 * it can neither submit nor reset a light-DOM form, and its implicit `type="submit"` means nothing there. A
 * `<form>` wired the ordinary way (`<button type="submit">` + a `submit` listener) therefore did nothing at
 * all when its button became a `b-button`, and did so *quietly*: Enter in a text field still submits, because
 * that is the form's own behaviour, so only the pointer path failed — the only path on a phone.
 *
 * The fix is the one the catalogue already settled on for the 15 value-bearing controls: form association via
 * `ElementInternals`. `this.form` then resolves the real form owner across the shadow boundary, and
 * {@link _activate} performs the action the `type` asks for.
 *
 * ## `type` defaults to `button`, NOT to `submit`
 *
 * This deviates from native `<button>` deliberately, and the reason is evidence rather than taste. `b-button`
 * has never submitted anything, so consumers wrote click handlers instead — and at least one shipped consumer
 * (Presenter's landing page) has several `b-button`s inside a `<form>` that *also* listens for `submit` and
 * does something different with it. A native-faithful `submit` default would make one tap run both the click
 * handler and the form's submit path. `type="submit"` is therefore opt-in, and the opt-in is one attribute.
 *
 * A `b-button` contributes **no** `FormData` entry. Native `name`/`value` submitter semantics are not
 * reproducible here: `form.requestSubmit(submitter)` only accepts a native submit button belonging to the
 * form, so there is no way to be the submitter — see {@link formValue}.
 */
export class BButton extends FormControlComponent {
  static get observedAttributes() {
    return ['variant', 'size', 'disabled', 'loading', 'aria-label', 'aria-current', 'title'];
  }

  static get sharedStyles() {
    return [spinSheet];
  }

  static get styles() {
    return `
      :host { display: inline-block; }
      :host([hidden]) { display: none; }
      /* Block pointer events on the host too — otherwise clicks on host bounds
         or listeners attached to the host fire even though the inner <button>
         is disabled. */
      :host([disabled]), :host([loading]) { pointer-events: none; }
      button {
        display: inline-flex; align-items: center; justify-content: center; gap: var(--b-space-sm);
        width: 100%; box-sizing: border-box;
        /*
         * Padding is a token per axis, defaulting to what each size has always rendered.
         *
         * The vertical one exists because NO size reached a mobile tap target: the default is 8px, sm drops
         * to 4px and lg only widens (it keeps 8px vertical), so a ~44px button was unaskable-for. A consumer
         * could not fix that from outside either — overriding --b-space-sm on the host also hijacks this
         * rule's own gap, and re-pointing a global token to reshape one component is the anti-pattern the
         * catalogue exists to remove.
         *
         * Deliberately NOT a pointer: coarse media query in here: that would re-render every existing
         * consumer without opt-in (a desktop back-office on a touch-capable laptop reports coarse), and it
         * makes a component's size depend on the input device rather than on its design. The knob belongs to
         * the framework, the policy to the app — a phone-first consumer writes the media query itself:
         *   @media (pointer: coarse) { b-button { --b-button-padding-y: var(--b-space-md); } }
         */
        padding: var(--b-button-padding-y, var(--b-space-sm)) var(--b-button-padding-x, var(--b-space-lg));
        border: var(--b-border-width, 1px) solid transparent;
        border-radius: var(--b-radius);
        font-size: var(--b-text-sm); font-weight: var(--b-font-weight-medium);
        cursor: pointer; transition: all var(--b-transition);
        line-height: var(--b-line-height-tight, 1.4); white-space: nowrap;
      }
      button:disabled, button.loading { opacity: var(--b-disabled-opacity); cursor: not-allowed; pointer-events: none; }
      /* Variants */
      .primary { background: var(--b-color-primary); color: var(--b-text-inverse); }
      .primary:hover { background: var(--b-color-primary-hover); }
      .secondary { background: var(--b-bg-tertiary); color: var(--b-text); border-color: var(--b-border); }
      .secondary:hover { background: var(--b-border); }
      .danger { background: var(--b-color-danger); color: var(--b-text-inverse); }
      .danger:hover { background: var(--b-color-danger-hover); }
      .ghost { background: transparent; color: var(--b-text-secondary); }
      .ghost:hover { background: var(--b-bg-tertiary); }
      /* Sizes — match :host([size]) pattern used by other components. Each keeps its own default and still
         yields to the padding tokens, so a consumer can raise the tap target across every size with one rule
         instead of adding an attribute at every call site. */
      :host([size="sm"]) button { padding: var(--b-button-padding-y, var(--b-space-xs)) var(--b-button-padding-x, var(--b-space-sm)); font-size: var(--b-text-xs); }
      :host([size="lg"]) button { padding: var(--b-button-padding-y, var(--b-space-sm)) var(--b-button-padding-x, var(--b-space-xl)); font-size: var(--b-text-base); }
      .spinner {
        width: var(--b-icon-sm, 0.875rem); height: var(--b-icon-sm, 0.875rem);
        border: 2px solid currentColor; border-top-color: transparent;
        border-radius: 50%; animation: spin var(--b-spinner-speed, 0.7s) linear infinite;
      }
    `;
  }

  render() {
    const variant = this.attr('variant', 'primary');
    const loading = this.boolAttr('loading');
    const disabled = this.boolAttr('disabled') || loading;
    // Forward naming attributes to the real focusable <button> in the shadow root —
    // set on the host they would never reach the control AT actually sees.
    const ariaLabel = this.getAttribute('aria-label');
    const ariaCurrent = this.getAttribute('aria-current');
    const title = this.getAttribute('title');
    const fwd = [
      ariaLabel !== null ? `aria-label="${escapeAttr(ariaLabel)}"` : '',
      ariaCurrent !== null ? `aria-current="${escapeAttr(ariaCurrent)}"` : '',
      title !== null ? `title="${escapeAttr(title)}"` : '',
    ].filter(Boolean).join(' ');
    // The inner button is always `type="button"`: it has no form owner in here, so its implicit `submit`
    // could never do anything, and stating it keeps the submit path visibly owned by _activate().
    return `
      <button type="button" class="${variant}${loading ? ' loading' : ''}" ${disabled ? 'disabled' : ''} ${loading ? 'aria-busy="true"' : ''} ${fwd}>
        ${loading ? '<span class="spinner" aria-hidden="true"></span>' : ''}
        <slot></slot>
      </button>
    `;
  }

  // ── Form participation ──

  /**
   * A button submits nothing. Native `<button name value>` contributes an entry only when it is *the
   * submitter*, and that cannot be reproduced across a shadow boundary — `form.requestSubmit(submitter)`
   * accepts only a native submit button that is a control of the form. Contributing unconditionally would be
   * worse than contributing nothing: the value would be sent even when a different button submitted.
   */
  protected formValue(): string | File | FormData | null {
    return null;
  }

  /** Anchor any validation bubble on the real control rather than the host's corner. */
  protected formAnchor(): HTMLElement | undefined {
    return this.$('button') ?? undefined;
  }

  /** Present to satisfy {@link FormControlComponent}; a button's value is inert — see {@link formValue}. */
  get value(): string { return this.getAttribute('value') ?? ''; }
  set value(v: string) {
    if (v) this.setAttribute('value', v);
    else this.removeAttribute('value');
  }

  /**
   * Perform the `type`'s action against the owning form. `button` (the default) does nothing — the consumer's
   * own click handler is the whole behaviour, which is what every `b-button` written so far assumes.
   */
  private _activate(): void {
    const type = this.attr('type', 'button');
    if (type !== 'submit' && type !== 'reset') return;
    // `pointer-events: none` already blocks the pointer path, but a programmatic .click() or an Enter press
    // routed to the host would otherwise still fire.
    if (this.disabled || this.boolAttr('loading')) return;
    const form = this.form;
    if (!form) return;
    if (type === 'reset') { form.reset(); return; }
    // requestSubmit(), not submit(): it runs interactive constraint validation and fires a cancellable
    // `submit` event, which is exactly what a real submit button does. submit() would skip both.
    form.requestSubmit();
  }

  protected onUpdated() {
    // Bound here rather than in onMount, and re-bound on every render on purpose: BaseComponent aborts and
    // replaces its listener AbortController in _afterRender(), so anything registered during onMount is
    // detached by the first re-render. Re-registering per render is the intended contract — the previous
    // registration is already gone, so this cannot stack up.
    //
    // Bound to the HOST, not the inner button: a click on the inner control is retargeted to the host on its
    // way out, so one listener covers both it and a programmatic host .click().
    this.listen<MouseEvent>(this, 'click', () => this._activate());

    // Re-slot light DOM children
    const slot = this.$('slot');
    if (slot) {
      const btn = this.$('button');
      if (btn && !btn.querySelector('slot')) {
        btn.appendChild(slot);
      }
    }
  }
}

define('b-button', BButton);
