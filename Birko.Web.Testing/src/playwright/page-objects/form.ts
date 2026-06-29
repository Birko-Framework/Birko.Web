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
