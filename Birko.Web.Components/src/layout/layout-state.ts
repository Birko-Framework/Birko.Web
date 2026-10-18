import type { BTabs } from './b-tabs.js';
import type { BSplitPanel, SplitSizes } from './b-split-panel.js';

/** A saved workspace layout: tab orders and split sizes, by each element's `layout-key`. */
export interface LayoutState {
  tabs: Record<string, string[]>;
  splits: Record<string, SplitSizes>;
}

const keyOf = (el: Element) => el.getAttribute('layout-key') ?? '';

/**
 * Reads the tab order of every `<b-tabs layout-key="…">` and the sizes of every `<b-split-panel layout-key="…">`
 * under `root` (TASK-525). Save the result wherever the app likes (localStorage, the server) and hand it back to
 * {@link applyLayout}. `querySelectorAll` does not enter shadow roots: pass a component's `shadowRoot` to capture
 * what it renders.
 */
export function captureLayout(root: ParentNode = document): LayoutState {
  const state: LayoutState = { tabs: {}, splits: {} };
  for (const el of root.querySelectorAll<BTabs>('b-tabs[layout-key]')) {
    if (keyOf(el)) state.tabs[keyOf(el)] = el.order;
  }
  for (const el of root.querySelectorAll<BSplitPanel>('b-split-panel[layout-key]')) {
    if (keyOf(el)) state.splits[keyOf(el)] = el.sizes;
  }
  return state;
}

/**
 * Applies a {@link captureLayout} result under `root`. Keys with no matching element are skipped, and an element
 * without a saved entry is left alone, so a layout saved before the UI changed still applies to what remains. A
 * split size that is not a CSS length is skipped (the panel refuses it), not applied. Emits no events.
 */
export function applyLayout(state: Partial<LayoutState> | null | undefined, root: ParentNode = document): void {
  if (!state) return;
  for (const el of root.querySelectorAll<BTabs>('b-tabs[layout-key]')) {
    const order = state.tabs?.[keyOf(el)];
    if (Array.isArray(order)) el.order = order.filter((id): id is string => typeof id === 'string');
  }
  for (const el of root.querySelectorAll<BSplitPanel>('b-split-panel[layout-key]')) {
    const sizes = state.splits?.[keyOf(el)];
    if (!sizes) continue;
    try { el.sizes = sizes; } catch { /* not a CSS length: keep the panel's own sizes */ }
  }
}
