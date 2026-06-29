import type { Page } from 'puppeteer';
import { B, pierceDeep } from '../../core/selectors.js';

const pp = (p: { host: string; inner: string }): string => pierceDeep(p, 'puppeteer');

/**
 * Puppeteer flavor of the b-form page object. Sets values directly and dispatches input/change so
 * the b-* components react (typing char-by-char is brittle across rich inputs).
 */
export class FormPO {
  private readonly page: Page;
  private readonly formSelector: string;
  constructor(page: Page, formSelector = 'b-form') { this.page = page; this.formSelector = formSelector; }

  async fill(values: Record<string, string>): Promise<void> {
    for (const [name, value] of Object.entries(values)) {
      const sel = pp(B.formFieldInput(name));
      await this.page.waitForSelector(sel);
      await this.page.$eval(
        sel,
        (el, v) => {
          const input = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
          input.value = v as string;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        },
        value,
      );
    }
  }

  async submit(submitButtonSelector?: string): Promise<void> {
    if (submitButtonSelector) {
      const btn = await this.page.$(submitButtonSelector);
      await btn?.click();
      return;
    }
    const first = await this.page.$(pp({ host: this.formSelector, inner: '[name]' }));
    await first?.press('Enter');
  }
}
