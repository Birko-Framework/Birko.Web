import type { Page, Locator } from '@playwright/test';
import { B, pierceDeep, cssAttr } from '../../core/selectors.js';

const pw = (p: { host: string; inner: string }): string => pierceDeep(p, 'playwright');

/**
 * Page object for b-form. Each field renders as a b-* control carrying name=<field.name>, wrapped
 * in [data-field=<name>]; the editable element is the inner input/select/textarea. Playwright
 * pierces both the b-form shadow and the field component's shadow with one descendant locator.
 */
export class FormPO {
  private readonly page: Page;
  private readonly formSelector: string;
  constructor(page: Page, formSelector = 'b-form') { this.page = page; this.formSelector = formSelector; }

  field(name: string): Locator {
    return this.page.locator(pw(B.formFieldInput(name)));
  }

  /** Fill text inputs/textareas by field name. */
  async fill(values: Record<string, string>): Promise<void> {
    for (const [name, value] of Object.entries(values)) {
      await this.field(name).first().fill(value);
    }
  }

  /** Choose an <option> in a select-type field by value. */
  async select(name: string, value: string): Promise<void> {
    await this.field(name).first().selectOption(value);
  }

  /** Toggle a checkbox/switch-type field. */
  async setChecked(name: string, checked = true): Promise<void> {
    const input = this.field(name).first();
    // Idempotent: read the live checked state from the native <input> (works even when it is
    // visually hidden, as in b-switch). If it is already in the desired state, do nothing.
    // WAIT FOR THE CONTROL TO BE ENABLED FIRST.
    //
    // The label-click path below is the problem this guards: clicking a <label> whose input is
    // DISABLED is a no-op natively, and the label itself is always actionable — so Playwright's
    // actionability check passes, the click "succeeds", and the value silently does not change.
    // `fill()` and `selectOption()` do not have this hole because they act on the control directly
    // and wait for it to be enabled.
    //
    // This became reachable when `BaseCrudPage._openEdit` started disabling the form until its
    // pre-fill lands (Symbio TASK-368 — an edit modal must not accept input it is about to
    // discard). A spec that toggles a switch immediately after opening the edit modal now races
    // that window: measured on `fleet.more.spec.ts:579`, the toggle was dropped and the save wrote
    // the unchanged value, so the test failed on the badge that never flipped — with no indication
    // that the click had done nothing.
    await input.waitFor({ state: 'attached' }).catch(() => { /* caller's assertions will report */ });
    for (let waited = 0; waited < 10_000; waited += 50) {
      const disabled = await input.evaluate((el) => (el as HTMLInputElement).disabled).catch(() => false);
      if (!disabled) break;
      await this.page.waitForTimeout(50);
    }

    const current = await input.evaluate((el) => (el as HTMLInputElement).checked).catch(() => undefined);
    if (current === checked) return;
    // b-switch hides its native <input> (1px-clipped, non-actionable) and both b-switch and
    // b-checkbox flip via the wrapping <label class="toggle-wrapper">. Playwright's .check() on the
    // hidden switch input never satisfies actionability and blocks for the full timeout, so click
    // the label instead — it natively toggles the wrapped checkbox. Fall back to .check()/.uncheck()
    // for a bare input that has no toggle-wrapper label.
    const label = this.page.locator(pw({ host: 'b-form', inner: `[data-field="${cssAttr(name)}"] label.toggle-wrapper` })).first();
    if (await label.count()) {
      await label.click();
      return;
    }
    if (checked) await input.check(); else await input.uncheck();
  }

  /**
   * Submit the form. Prefer the consumer's submit button (forms in modals have their own button);
   * otherwise press Enter inside the form, which makes b-form emit its `submit` event.
   */
  async submit(submitButtonSelector?: string): Promise<void> {
    if (submitButtonSelector) {
      await this.page.locator(submitButtonSelector).click();
      return;
    }
    await this.page.locator(`${this.formSelector} [name]`).first().press('Enter');
  }

  /** Read the value a field component currently holds (its `.value` property). */
  fieldValue(name: string): Promise<string> {
    const sel = pierceDeep(B.formFieldControl(name), 'playwright');
    return this.page.locator(sel).first().evaluate((el) => String((el as unknown as { value?: unknown }).value ?? ''));
  }

  /** A field-wrapper locator (e.g. to assert an error class), escaped for safe attribute use. */
  fieldWrap(name: string): Locator {
    return this.page.locator(`${this.formSelector} [data-field="${cssAttr(name)}"]`);
  }
}
