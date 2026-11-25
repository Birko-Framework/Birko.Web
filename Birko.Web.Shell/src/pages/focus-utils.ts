/** The focused element, looking through open shadow roots. */
export function deepActiveElement(): Element | null {
  let el: Element | null = document.activeElement;
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
  return el;
}

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Focus the first focusable control inside `root`, in document order, looking into open shadow roots (a `b-button`
 * host does not take focus itself; its inner `<button>` does). Skips disabled and hidden controls. Returns whether
 * something took focus (TASK-992).
 */
export function focusFirstIn(root: ParentNode): boolean {
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
    if (el.closest('[hidden]') || (el as HTMLButtonElement).disabled) continue;
    if (el.matches(FOCUSABLE) && el.getClientRects().length > 0) {
      el.focus();
      if (deepActiveElement() === el) return true;
    }
    if (el.shadowRoot && focusFirstIn(el.shadowRoot)) return true;
  }
  return false;
}
