import { escapeHtml } from '../dom-utils';

/**
 * Shared ARIA and focus rules for the four picker controls (`b-date-picker`, `b-datetime-picker`,
 * `b-time`, `b-date-range-picker`, custom mode), whose trigger is a read-only text input that opens a
 * panel (TASK-496). Before, each trigger was announced as "edit, read-only" with no hint that a panel
 * existed. Opening left focus on the input. Every panel action rebuilt the panel with `innerHTML` and
 * destroyed the focused button, and a pick hid the panel with focus inside it. Either way focus fell to
 * `<body>` after one keystroke.
 *
 * One module rather than four copies: the four controls already duplicate their panel code, and these rules
 * are exactly the kind of thing that drifts when it is copied.
 */

/** The trigger's ARIA 1.2 combobox attributes. The panel id is `${uid}-panel`. */
export function triggerAria(uid: string, open: boolean): string {
  return `role="combobox" aria-haspopup="dialog" aria-expanded="${open}" aria-controls="${uid}-panel"`;
}

/** The panel's dialog attributes, including the id {@link triggerAria} points at. */
export function panelAria(uid: string, name: string): string {
  return `id="${uid}-panel" role="dialog" aria-label="${escapeHtml(name)}"`;
}

/** Sync `aria-expanded` on every trigger of this panel (a date range has two). */
export function setExpanded(root: ShadowRoot | null, uid: string, open: boolean): void {
  root?.querySelectorAll(`[aria-controls="${uid}-panel"]`).forEach(t => t.setAttribute('aria-expanded', String(open)));
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Move focus into an opened panel: the selected cell, else today, else the first enabled control. */
export function focusIntoPanel(panel: HTMLElement): void {
  // Calendar cells mark "disabled" with a class, not the attribute, so both are excluded.
  const target = panel.querySelector<HTMLElement>('.selected:not(.disabled):not([disabled])')
    ?? panel.querySelector<HTMLElement>('.today:not(.disabled):not([disabled])')
    ?? panel.querySelector<HTMLElement>(FOCUSABLE);
  target?.focus();
}

/** The `data-*` attribute that identifies a panel control across a rebuild, as a selector. */
function keyOf(el: Element | null): string | null {
  if (!(el instanceof HTMLElement)) return null;
  for (const attr of ['date', 'nav', 'month', 'time', 'spin', 'action', 'preset']) {
    const v = el.dataset[attr];
    if (v !== undefined) return `[data-${attr}="${CSS.escape(v)}"]`;
  }
  return null;
}

/**
 * Rebuild a panel without losing focus. The control that had focus is found again by its `data-*` key.
 * If it no longer exists (the view moved to another month), focus goes to the panel's default target, so
 * it stays inside the panel either way.
 */
export function refreshKeepingFocus(root: ShadowRoot | null, panel: HTMLElement, rebuild: () => void): void {
  const active = root?.activeElement ?? null;
  const hadFocus = !!active && panel.contains(active);
  const key = hadFocus ? keyOf(active) : null;
  rebuild();
  if (!hadFocus) return;
  // Enabled only: a two-month range renders a disabled "next" in the first month beside the live one.
  const again = key ? panel.querySelector<HTMLElement>(`${key}:not([disabled])`) : null;
  if (again) again.focus();
  else focusIntoPanel(panel);
}

/**
 * The × clear button beside a picker or combo. Without a name it was announced as "times" /
 * "multiplication sign". Every render site uses this, including the ones that insert it after a pick.
 */
export function clearButton(cls: string, label: string): string {
  return `<button class="${cls}" type="button" aria-label="${escapeHtml(label)}">&times;</button>`;
}

/** After a panel closes: if focus was inside it, hand it back to the trigger instead of losing it. */
export function returnFocus(root: ShadowRoot | null, panel: HTMLElement | null, trigger: HTMLElement | null): void {
  const active = root?.activeElement ?? null;
  if (panel && active && panel.contains(active)) trigger?.focus();
}
