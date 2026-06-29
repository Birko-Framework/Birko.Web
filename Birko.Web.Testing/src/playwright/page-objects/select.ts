import type { Page, Locator } from '@playwright/test';
import { B, pierceDeep, cssAttr } from '../../core/selectors.js';

const pw = (p: { host: string; inner: string }): string => pierceDeep(p, 'playwright');

/**
 * Page object for `b-select` (Birko.Web.Components/src/inputs/b-select.ts). It renders in TWO modes:
 *   • searchable (`searchable` attr): opens a `.combo`, options are `.option[data-value]` in a popover.
 *   • native (default): renders a real `<select>` with `<option>` children.
 * This PO handles BOTH, and never hangs on an empty select — `optionCount()` / `pickFirst()` fail
 * fast (or report 0) so a spec can `test.skip()` cleanly when seed data is absent.
 */
export class SelectPO {
  private readonly page: Page;
  constructor(page: Page) { this.page = page; }

  host(name: string): Locator {
    return this.page.locator(B.selectFor(name)).first();
  }

  /** The inner native <select>, if this b-select is in native mode. */
  private nativeSelect(name: string): Locator {
    return this.page.locator(`b-select[name="${cssAttr(name)}"] select`).first();
  }

  /** Real (non-placeholder) <option>s of a native b-select. */
  private nativeOptions(name: string): Locator {
    return this.nativeSelect(name).locator('option:not([disabled])').filter({ hasNotText: '' });
  }

  /** Searchable-mode option divs (.option[data-value]) in the dropdown popover. */
  options(name: string): Locator {
    return this.page.locator(pw(B.selectOptionForName(name)));
  }

  /** True when this b-select renders a native <select> (non-searchable mode). */
  async isNative(name: string): Promise<boolean> {
    return (await this.nativeSelect(name).count()) > 0;
  }

  /** Open a searchable dropdown (no-op for native). Bounded wait — never hangs on an empty list. */
  async open(name: string): Promise<void> {
    if (await this.isNative(name)) return;
    // Idempotent: if an option is already showing, the dropdown is open — clicking .combo again would
    // TOGGLE IT SHUT (so optionCount() followed by pickFirst() would fail). Only open if closed.
    if (await this.options(name).first().isVisible().catch(() => false)) return;
    // Bounded click — a missing/covered .combo must fail fast (2s), never hang the whole test timeout.
    await this.host(name).locator('.combo').first().click({ timeout: 2000 }).catch(() => { /* missing */ });
    // Wait briefly for an option OR a no-results marker; tolerate neither (empty list).
    await this.options(name).first().waitFor({ state: 'visible', timeout: 2000 }).catch(() => { /* empty */ });
  }

  /** Count of selectable options. Returns 0 (fast) when the select is empty — use this to skip. */
  async optionCount(name: string): Promise<number> {
    if (await this.isNative(name)) {
      return this.nativeSelect(name).locator('option[value]:not([value=""]):not([disabled])').count();
    }
    await this.open(name);
    return this.options(name).count();
  }

  /** Open and pick the first real option (works for native + searchable). Returns its value/id.
   *  Throws fast if there are no options — guard with `optionCount(name)` and skip when 0. */
  async pickFirst(name: string): Promise<string> {
    if (await this.isNative(name)) {
      const opt = this.nativeSelect(name).locator('option[value]:not([value=""]):not([disabled])').first();
      const value = await opt.getAttribute('value');
      if (!value) throw new Error(`b-select[name="${name}"] (native) has no selectable option`);
      await this.nativeSelect(name).selectOption(value);
      return value;
    }
    await this.open(name);
    if ((await this.options(name).count()) === 0) {
      throw new Error(`b-select[name="${name}"] (searchable) has no options to pick`);
    }
    const first = this.options(name).first();
    const value = await first.getAttribute('data-value');
    await first.click();
    if (!value) throw new Error(`b-select[name="${name}"] option had no data-value`);
    return value;
  }

  /** Pick by value (native) / data-value (searchable). */
  async pickValue(name: string, value: string): Promise<void> {
    if (await this.isNative(name)) { await this.nativeSelect(name).selectOption(value); return; }
    await this.open(name);
    await this.page.locator(pw(B.selectOptionForValue(name, value))).first().click();
  }

  /** Pick the first option whose visible label contains `text` (searchable only). */
  async pickByLabel(name: string, text: string): Promise<void> {
    await this.open(name);
    await this.options(name).filter({ hasText: text }).first().click();
  }

  /** Current committed value of the select (its `.value` property). */
  value(name: string): Promise<string> {
    return this.host(name).evaluate((el) => String((el as unknown as { value?: unknown }).value ?? ''));
  }
}
