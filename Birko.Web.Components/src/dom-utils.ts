/**
 * Small shared DOM/markup helpers used across components.
 *
 * Previously every component carried its own private `_escapeHtml` / `_escapeAttr`
 * and hand-rolled the same keyboard patterns — these are the single source of truth.
 */

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};

/**
 * Escape a string for safe interpolation into HTML text content.
 * Escapes `& < > "` — a superset safe for both element text and double-quoted
 * attribute values, so it doubles as the attribute escaper (see {@link escapeAttr}).
 */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, c => HTML_ESCAPES[c]);
}

/** Escape a string for a double-quoted HTML attribute value. Alias of {@link escapeHtml}. */
export const escapeAttr = escapeHtml;

/** True for the keys that should activate a custom button-like control: Enter or Space. */
export function isActivationKey(e: KeyboardEvent): boolean {
  return e.key === 'Enter' || e.key === ' ';
}

/**
 * Roving-tabindex navigation for a single-axis widget group (radiogroup, toolbar,
 * tablist). Given the current index and a keydown event, returns the index to move
 * to — ArrowRight/Down → next, ArrowLeft/Up → previous (both wrap), Home → first,
 * End → last — or `null` when the key isn't a navigation key. Calls
 * `preventDefault()` whenever it returns an index, so the caller only has to focus
 * (and, for a radio group, select) the returned item.
 */
export function rovingIndex(e: KeyboardEvent, current: number, count: number): number | null {
  if (count === 0) return null;
  let next: number;
  switch (e.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      next = (current + 1) % count;
      break;
    case 'ArrowLeft':
    case 'ArrowUp':
      next = (current - 1 + count) % count;
      break;
    case 'Home':
      next = 0;
      break;
    case 'End':
      next = count - 1;
      break;
    default:
      return null;
  }
  e.preventDefault();
  return next;
}
