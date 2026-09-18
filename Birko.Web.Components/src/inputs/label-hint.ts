import { escapeHtml } from '../dom-utils';

/**
 * Render a label element with optional hint tooltip and required indicator.
 * Used by all form input components (b-input, b-select, b-textarea, etc.).
 *
 * When `hint` or `required` is provided, renders a label-row wrapper.
 * Required fields get a red asterisk (*) after the label text.
 *
 * `label` and `hint` are escaped so schema-supplied text with quotes or angle brackets
 * cannot break out of the attribute / inject markup into the shadow tree.
 */
export function renderLabel(label: string | null, hint: string | null, required = false): string {
  if (!label) return '';
  const safeLabel = escapeHtml(label);
  const req = required ? '<span class="required-mark">*</span>' : '';
  const hintEl = hint ? `<b-tooltip text="${escapeHtml(hint)}"><span class="hint-icon">?</span></b-tooltip>` : '';
  if (!req && !hintEl) return `<label>${safeLabel}</label>`;
  return `<div class="label-row"><label>${safeLabel}${req}</label>${hintEl}</div>`;
}

/** Options describing the validation/accessibility state of a form control. */
export interface FieldAriaOptions {
  /** Per-instance id prefix (use `this.uid`). The error span is `${uid}-error`. */
  uid: string;
  /** Current error message; presence flips `aria-invalid` and links the error span. */
  error?: string | null;
  /**
   * Set true to emit `aria-required="true"`. Pass this only for controls that are
   * NOT native form elements (e.g. div-based combos / tag inputs / multi-selects) —
   * native `<input required>` / `<select required>` already expose required state,
   * so adding aria-required there is redundant.
   */
  required?: boolean;
  /** Extra element ids to append to `aria-describedby`, beyond the error and description spans. */
  describedBy?: string[];
  /**
   * The `description` attribute — persistent help text rendered under the control by
   * {@link renderHelp}. Pass it here and the control's `aria-describedby` picks up `${uid}-help`, so a
   * screen reader announces it as the field's description. **This is the whole point of the attribute**:
   * a consumer rendering its own sibling element outside the component cannot be referenced by
   * `aria-describedby` at all, because the real control lives in shadow DOM.
   *
   * When an error is present too, **both** ids are described, error first — the urgent one leads.
   */
  description?: string | null;
  /**
   * Bare mode ({@link renderField}) — no `.field` chrome is rendered, which removes the `<label>` that
   * named the control, the error span, and the description span that `aria-describedby` points at. Set
   * this so the ARIA is rebuilt from attributes instead of silently degrading:
   * - `aria-describedby` is NOT emitted (it would be a dangling reference); the message is surfaced as
   *   `title` instead — hover text for sighted users, accessible description for AT;
   * - `title` carries the **error** when there is one, otherwise the **description**. Deliberately not
   *   both: `title` is a single string, and concatenating an urgent failure with standing help text
   *   muddles the more important of the two. The error wins.
   * - {@link FieldAriaOptions.label} becomes `aria-label`, so the control keeps an accessible name.
   */
  bare?: boolean;
  /** The `label` attribute. Emitted as `aria-label` in bare mode only (no visible label exists there). */
  label?: string | null;
}

/**
 * Build the ARIA attribute string for a form control: `aria-invalid`,
 * `aria-required`, and `aria-describedby` (pointing at the error span minted by
 * {@link renderError}). Spread the result into the control's opening tag.
 *
 * Returns `''` when there is nothing to announce, so it is safe to always interpolate.
 */
export function fieldAria(opts: FieldAriaOptions): string {
  const parts: string[] = [];
  // Error first: when a field has both a failure and standing help text, the failure is what the user
  // needs to hear first.
  const describedBy: string[] = [];
  if (opts.error) {
    parts.push('aria-invalid="true"');
    if (opts.bare) parts.push(`title="${escapeHtml(opts.error)}"`);
    else describedBy.push(`${opts.uid}-error`);
  }
  if (opts.description) {
    if (opts.bare) {
      // Bare renders no description row, so the id would dangle. `title` is the fallback — but only if
      // the error has not already claimed it (see FieldAriaOptions.bare).
      if (!opts.error) parts.push(`title="${escapeHtml(opts.description)}"`);
    } else {
      describedBy.push(`${opts.uid}-help`);
    }
  }
  describedBy.push(...(opts.describedBy ?? []));
  // A bare control has no rendered <label>, so without this it would be announced by its placeholder
  // (or by nothing at all) — a placeholder is not an accessible name.
  if (opts.bare && opts.label) parts.push(`aria-label="${escapeHtml(opts.label)}"`);
  if (opts.required) parts.push('aria-required="true"');
  if (describedBy.length) parts.push(`aria-describedby="${describedBy.join(' ')}"`);
  return parts.join(' ');
}

/** Options for {@link renderField}. */
export interface RenderFieldOptions {
  /**
   * Strip the `.field` wrapper, the label row and the error row, emitting `control` alone.
   * Read from the host's `bare` attribute (`this.boolAttr('bare')`).
   */
  bare: boolean;
  /** The control markup, including any siblings that must stay adjacent to it (datalist, popover, …). */
  control: string;
  /** Per-instance id prefix (use `this.uid`). */
  uid: string;
  label?: string | null;
  hint?: string | null;
  error?: string | null;
  required?: boolean;
  /**
   * Persistent help text rendered under the control (the `description` attribute). Pass the same value
   * to {@link fieldAria} so `aria-describedby` points at it.
   *
   * Distinct from `hint`, which is a tooltip behind a `?` icon: `hint` is a terse explainer read once
   * ("Same number = performed back-to-back"), `description` is a value or constraint the user needs on
   * screen while typing ("Goal 8000 steps", "Max 20 characters"). A field may carry both.
   */
  description?: string | null;
}

/**
 * Wrap a control in the stacked `.field` chrome — label row above, error message below — or emit it
 * alone when `bare`.
 *
 * Row order is label → control → description → error: the description is standing context that belongs
 * next to the control, and the error lands last where a newly-appearing message is most noticeable.
 * (`aria-describedby` uses the opposite priority — error first — because urgency beats reading order for
 * a screen reader. That divergence is deliberate; see {@link fieldAria}.)
 *
 * `bare` is for inline hosts (toolbars, table cells, floating action bars) where the stacked chrome
 * and the `.field` flex gap add unwanted vertical space. It removes only the *rendered rows*: the
 * `label` / `description` / `error` / `required` attributes are still honoured by the control itself —
 * the `has-error` border stays, and {@link fieldAria} rebuilds the accessible name and the error or
 * description from the attributes (pass `bare` there too). So a bare control still shows and announces
 * its state; it just has nowhere to print the text.
 *
 * Pairs with `size="sm"` for dense layouts.
 */
export function renderField(opts: RenderFieldOptions): string {
  if (opts.bare) return opts.control;
  return `
      <div class="field">
        ${renderLabel(opts.label ?? null, opts.hint ?? null, opts.required)}
        ${opts.control}
        ${renderHelp(opts.uid, opts.description)}
        ${renderError(opts.uid, opts.error)}
      </div>
    `;
}

/**
 * Render the field error message as a live region linked to its control via
 * {@link fieldAria}'s `aria-describedby`. `role="alert"` makes screen readers
 * announce the message as soon as it appears. Returns `''` when there is no error.
 *
 * **Escapes its input**, like {@link renderLabel} and {@link renderHelp}. It used to require the caller to
 * pre-escape, which was the odd one out of the four field rows and did not hold in practice: 13 of the 14
 * controls passed `this.attr('error')` straight through, and an attribute read back with `attr()` comes back
 * **already decoded** by the browser — so a consumer escaping at the call site (`b-form` does, via
 * `escapeAttr`) had its work undone here. `b-form.setFieldError()` takes an arbitrary string, which is where a
 * server-echoed validation message enters, so this was the same unescaped-interpolation class as the `b-select`
 * / `b-textarea` fixes. Callers must **not** pre-escape now, or the entities show through as text.
 */
export function renderError(uid: string, error: string | null | undefined): string {
  if (!error) return '';
  return `<span class="error" id="${uid}-error" role="alert">${escapeHtml(error)}</span>`;
}

/**
 * Render persistent help text under the control, with the id {@link fieldAria} points
 * `aria-describedby` at (`${uid}-help`). Returns `''` when there is no description.
 *
 * Deliberately **no** `role`/`aria-live`: unlike {@link renderError}, this text does not appear in
 * response to an action, so announcing it on render would interrupt for no reason. It is announced as
 * part of the field's description when the control takes focus.
 *
 * **This helper escapes its input** — unlike {@link renderError}, which requires callers to pre-escape.
 * The divergence is intentional: escape-by-default is the choice that cannot produce an injection, this
 * is new API with no back-compat obligation, and the caller-escapes convention is exactly what produced
 * three unescaped interpolations in `b-select` / `b-textarea` recently. `renderError`'s behaviour is
 * legacy; prefer this one's contract for anything new.
 */
export function renderHelp(uid: string, description: string | null | undefined): string {
  if (!description) return '';
  return `<span class="help" id="${uid}-help">${escapeHtml(description)}</span>`;
}
