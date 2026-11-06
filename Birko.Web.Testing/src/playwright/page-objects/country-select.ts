import type { Page, Locator } from '@playwright/test';
import { cssAttr } from '../../core/selectors.js';

/**
 * Page object for `b-country-select` (Birko.Web.Components/src/inputs/b-country-select.ts, TASK-817).
 *
 * WHY `FormPO.fill()` CANNOT SET IT (TASK-818): the picker renders a searchable `b-select` (one country) or
 * `b-multi-select` (`multiple`) inside its own shadow, and the first inner `input` is that control's SEARCH box. Typing
 * a code there filters the list and chooses nothing, so the form saves no country (measured in Symbio TASK-1068: the
 * dialog never closed). And `SelectPO` cannot reach it either — the inner control is `.country-control`, with no `name`.
 *
 * So a pick goes through the UI the way a person does it: open, search by code, click the option. A code the picker does
 * not offer (e.g. an ISO user-assigned `XB`) FAILS LOUDLY with that reason instead of timing out on a missing option.
 */
export class CountrySelectPO {
  private readonly page: Page;
  constructor(page: Page) { this.page = page; }

  /** The picker: a b-form field path (its `[data-field]`), or a locator of the `b-country-select` itself. */
  host(field: string | Locator): Locator {
    return typeof field === 'string'
      ? this.page.locator(`b-form [data-field="${cssAttr(field)}"] b-country-select`).first()
      : field;
  }

  /** The picker's committed value: a comma list of upper-case ISO alpha-2 codes ('' when none). */
  value(field: string | Locator): Promise<string> {
    return this.host(field).evaluate((el) => String((el as unknown as { value?: unknown }).value ?? ''));
  }

  /**
   * Choose these countries through the UI. One code for a single picker; several only with `multiple` (each is added to
   * what is already selected). Resolves once the picker's value holds every code; throws otherwise.
   */
  async pick(field: string | Locator, ...codes: string[]): Promise<void> {
    if (codes.length === 0) throw new Error('CountrySelectPO.pick: no country code given');
    const host = this.host(field);
    await host.waitFor({ state: 'attached', timeout: 10_000 });
    const multiple = await host.evaluate((el) => el.hasAttribute('multiple'));
    if (!multiple && codes.length > 1) throw new Error(`CountrySelectPO.pick: ${codes.length} codes for a single picker`);

    for (const raw of codes) {
      const code = raw.toUpperCase();
      if (multiple) await this._pickMultiple(host, code);
      else await this._pickSingle(host, code);
    }
    if (multiple) await this._close(host);

    // The value is the proof, not the click: wait for the picker to commit every code.
    const want = codes.map((c) => c.toUpperCase());
    let got = '';
    for (let waited = 0; waited <= 5_000; waited += 100) {
      got = await this.value(host);
      const have = got.split(',').filter(Boolean);
      if (want.every((c) => have.includes(c))) return;
      await this.page.waitForTimeout(100);
    }
    throw new Error(`CountrySelectPO.pick: the picker holds "${got}", not ${want.join(', ')}`);
  }

  private async _pickSingle(host: Locator, code: string): Promise<void> {
    const control = host.locator('.country-control').first();
    await control.locator('.combo').first().click();
    await control.locator('.combo-input').first().fill(code);
    const option = control.locator(`.option[data-value="${cssAttr(code)}"]`).first();
    await this._expectOffered(option, code);
    await option.click();
  }

  private async _pickMultiple(host: Locator, code: string): Promise<void> {
    const control = host.locator('.country-control').first();
    const search = control.locator('.dd-search').first();
    if (!(await search.isVisible().catch(() => false))) {
      await control.locator('.container').first().click();
    }
    await search.fill(code);
    const box = control.locator(`label.option input[type="checkbox"][value="${cssAttr(code)}"]`).first();
    await this._expectOffered(box, code);
    // Click the box itself: a `has:` filter is resolved RELATIVE to each label, so passing `box` (a chain from the page)
    // there matches nothing and the click waits out its timeout (measured, TASK-818).
    if (!(await box.isChecked())) await box.click();
  }

  /**
   * Close the multiple picker's dropdown: left open, its popover covers what sits under it, the Save button a spec clicks
   * next (measured, TASK-818). Escape on the picker's box closes the list and, since TASK-819, stops there, so a b-modal
   * around the form stays open (before it, the dialog took the same key and closed, measured in Symbio). The closed
   * state is checked, not assumed.
   */
  private async _close(host: Locator): Promise<void> {
    const container = host.locator('.country-control').first().locator('.container').first();
    if ((await container.getAttribute('aria-expanded')) !== 'true') return;
    await container.press('Escape');
    for (let waited = 0; waited <= 2_000; waited += 50) {
      if ((await container.getAttribute('aria-expanded')) !== 'true') return;
      await this.page.waitForTimeout(50);
    }
    throw new Error("CountrySelectPO.pick: the picker's dropdown did not close");
  }

  private async _expectOffered(option: Locator, code: string): Promise<void> {
    try {
      await option.waitFor({ state: 'visible', timeout: 3_000 });
    } catch {
      throw new Error(`CountrySelectPO.pick: the picker does not offer "${code}" (not in its countries list, or not an ISO code)`);
    }
  }
}
