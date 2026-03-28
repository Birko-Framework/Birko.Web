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
