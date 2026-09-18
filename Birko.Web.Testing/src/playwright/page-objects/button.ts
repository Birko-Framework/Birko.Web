import type { Page, Locator } from '@playwright/test';

/**
 * `b-button`'s real control, for asserting enabled/disabled state.
 *
 * ── Why this exists ────────────────────────────────────────────────────────────────────────────────
 * Playwright's `isDisabled()` / `toBeDisabled()` / `toBeEnabled()` implement the **HTML** notion of
 * disabled: native form controls (`button`, `input`, `select`, …) and elements inside a disabled
 * `<fieldset>`. A custom element is none of those, so `<b-button disabled>` reads as **enabled** —
 * always, in every engine. Measured against three synthetic buttons in chromium and webkit alike:
 *
 *   ```
 *                host.isDisabled  inner.isDisabled  host attr
 *   disabled     false            true              ""
 *   loading      false            true              null
 *   (neither)    false            false             null
 *   ```
 *
 * So a consumer spec cannot assert that a control is dead, and a whole class of defect — a button
 * that should be live and is not — is invisible to the suite. That is not hypothetical: it is how a
 * P0 that destroyed a logged workout coexisted with a green 210-spec suite in Reps (TASK-164).
 *
 * ── Why the INNER button and not the host's attribute ──────────────────────────────────────────────
 * `b-button` renders a real `<button disabled>` inside its shadow root, and Playwright's css engine
 * pierces open shadow roots — so the correct semantics are already there, one level down. Asserting
 * against it beats reading `[disabled]` off the host on two counts:
 *
 *   * `b-button` disables on `disabled` **or** `loading` (see its `render()`), and `loading` leaves
 *     the host's `disabled` attribute `null`. An attribute read reports a loading button as live.
 *   * It tests what the component actually rendered, so a `b-button` that stopped forwarding
 *     `disabled` would be caught. An attribute read only ever re-reads what the spec itself set,
 *     which is a check that cannot fail.
 *
 * ── Why a Locator and not a boolean ────────────────────────────────────────────────────────────────
 * Returning a locator lets specs use Playwright's own auto-retrying matchers:
 *
 *   ```ts
 *   await expect(bButtonControl(page, '#save')).toBeDisabled();
 *   await expect(bButtonControl(page, '#save')).toBeEnabled();
 *   ```
 *
 * A `Promise<boolean>` helper would snapshot one instant and force every caller to build their own
 * polling around it — reintroducing exactly the settle problem that makes assertions vacuous.
 *
 * ── What this does NOT do ──────────────────────────────────────────────────────────────────────────
 * It does not make clicking a disabled `b-button` fail *fast*. `:host([disabled])` sets
 * `pointer-events: none`, so a click is not silently swallowed — Playwright's actionability check
 * retries until it times out. That is correct but opaque: the failure names a timeout rather than a
 * dead control. Assert with this helper first and the timeout never happens.
 *
 * ── Deliberately NOT `.first()` ────────────────────────────────────────────────────────────────────
 * If `selector` matches two `b-button`s — or one grows a second inner control — this locator matches
 * more than one element and Playwright's strict mode raises. That is the point. A silent `.first()`
 * would hand back whichever came first in DOM order, so a *disabled* second control would read
 * enabled and the assertion would be vacuous: the exact failure this helper exists to remove, smuggled
 * back in by its own implementation. Scope the selector, or pass a narrower `scope`.
 *
 * @param scope Page, or any Locator to search within (a dialog, a card, a section).
 * @param selector Selector for the `b-button` **host** — typically `#some-id`.
 */
export function bButtonControl(scope: Page | Locator, selector: string): Locator {
  return scope.locator(selector).locator('button');
}
