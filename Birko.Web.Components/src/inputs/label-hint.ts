/**
 * Render a label element with optional hint tooltip and required indicator.
 * Used by all form input components (b-input, b-select, b-textarea, etc.).
 *
 * When `hint` or `required` is provided, renders a label-row wrapper.
 * Required fields get a red asterisk (*) after the label text.
 */
export function renderLabel(label: string | null, hint: string | null, required = false): string {
  if (!label) return '';
  const req = required ? '<span class="required-mark">*</span>' : '';
  const hintEl = hint ? `<b-tooltip text="${hint}"><span class="hint-icon">?</span></b-tooltip>` : '';
  if (!req && !hintEl) return `<label>${label}</label>`;
  return `<div class="label-row"><label>${label}${req}</label>${hintEl}</div>`;
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
  /** Extra element ids to append to `aria-describedby` (e.g. a help-text id). */
  describedBy?: string[];
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
  const describedBy = [...(opts.describedBy ?? [])];
  if (opts.error) {
    parts.push('aria-invalid="true"');
    describedBy.push(`${opts.uid}-error`);
  }
  if (opts.required) parts.push('aria-required="true"');
  if (describedBy.length) parts.push(`aria-describedby="${describedBy.join(' ')}"`);
  return parts.join(' ');
}

/**
 * Render the field error message as a live region linked to its control via
 * {@link fieldAria}'s `aria-describedby`. `role="alert"` makes screen readers
 * announce the message as soon as it appears. Returns `''` when there is no error.
 *
 * Pass an already-escaped message if the source is untrusted (this helper does
 * not escape, matching the existing per-component behavior).
 */
export function renderError(uid: string, error: string | null | undefined): string {
  if (!error) return '';
  return `<span class="error" id="${uid}-error" role="alert">${error}</span>`;
}
