import type { Page } from 'puppeteer';
import { B, pierceDeep } from '../../core/selectors.js';

const pp = (p: { host: string; inner: string }): string => pierceDeep(p, 'puppeteer');

/**
 * Puppeteer flavor of the b-data-table page object. Uses the `>>>` deep combinator to pierce the
 * nested shadow trees (b-data-table » b-table). The row-action menu is appended to document.body.
 */
export class DataTablePO {
  private readonly page: Page;
  constructor(page: Page) { this.page = page; }

  async rowCount(): Promise<number> {
    return (await this.page.$$(pp(B.tableRow))).length;
  }

  async openRowActions(rowId: string): Promise<void> {
    const sel = pp(B.rowActionTriggerFor(rowId));
    await this.page.waitForSelector(sel);
    const el = await this.page.$(sel);
    if (!el) throw new Error(`row-action trigger not found for row ${rowId}`);
    await el.click();
  }

  async pickRowAction(rowId: string, actionId: string): Promise<void> {
    await this.openRowActions(rowId);
    const sel = pp(B.dropdownItemFor(actionId));
    await this.page.waitForSelector(sel);
    const item = await this.page.$(sel);
    if (!item) throw new Error(`row action "${actionId}" not found`);
    await item.click();
  }

  async selectRow(rowId: string): Promise<void> {
    const sel = pp(B.rowSelectFor(rowId));
    const el = await this.page.$(sel);
    await el?.click();
  }
}
