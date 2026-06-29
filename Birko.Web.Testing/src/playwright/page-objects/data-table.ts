import type { Page, Locator } from '@playwright/test';
import { B, pierceDeep } from '../../core/selectors.js';

const pw = (p: { host: string; inner: string }): string => pierceDeep(p, 'playwright');

/**
 * Page object for b-data-table. Playwright CSS pierces open shadow roots, so a single locator
 * reaches the inner b-table (b-data-table » b-table » <table>). Row actions live behind the ⋮
 * trigger, which on click appends a fresh top-level <b-dropdown-menu> to document.body.
 */
export class DataTablePO {
  private readonly page: Page;
  constructor(page: Page) { this.page = page; }

  /** All body rows currently rendered (current page only). */
  rows(): Locator {
    return this.page.locator(pw(B.tableRow));
  }

  rowCount(): Promise<number> {
    return this.rows().count();
  }

  row(rowId: string): Locator {
    return this.page.locator(pw(B.tableRowFor(rowId)));
  }

  /** Resolve the data-id (entity id) of the first row whose text contains `text`. */
  async rowIdContaining(text: string): Promise<string> {
    const row = this.page.locator(pw(B.tableRow)).filter({ hasText: text }).first();
    const id = await row.getAttribute('data-id');
    if (!id) throw new Error(`no b-data-table row containing "${text}"`);
    return id;
  }

  /** Open the ⋮ row-action menu for a row. */
  async openRowActions(rowId: string): Promise<void> {
    await this.page.locator(pw(B.rowActionTriggerFor(rowId))).first().click();
  }

  /** Open the row menu and pick an action by its id (emits row-action {action,id,row}). */
  async pickRowAction(rowId: string, actionId: string): Promise<void> {
    await this.openRowActions(rowId);
    await this.page.locator(pw(B.dropdownItemFor(actionId))).first().click();
  }

  async selectRow(rowId: string): Promise<void> {
    await this.page.locator(pw(B.rowSelectFor(rowId))).check();
  }

  async selectAll(): Promise<void> {
    await this.page.locator(pw(B.selectAll)).check();
  }

  /**
   * Type into a consumer-owned filter/search input (b-data-table filtering is external — the
   * page hosts its own filter row that calls setFilters). Pass the input selector for that page.
   */
  async search(filterInputSelector: string, query: string): Promise<void> {
    await this.page.locator(filterInputSelector).fill(query);
  }
}
