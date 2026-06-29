import type { Page } from '@playwright/test';
import { B, pierceDeep } from '../../core/selectors.js';

const pw = (p: { host: string; inner: string }): string => pierceDeep(p, 'playwright');

/**
 * Navigation helpers across the three Birko.Web entry points. Direct `goto` is the most reliable
 * for a smoke sweep; the in-app helpers exercise the real nav chrome (b-ribbon / b-sidebar /
 * command palette) when a test wants to verify navigation behavior itself.
 */
export class NavPO {
  private readonly page: Page;
  constructor(page: Page) { this.page = page; }

  /** Hard navigation to a route (history or hash path). */
  async goto(path: string): Promise<void> {
    await this.page.goto(path);
  }

  async viaSidebar(itemId: string): Promise<void> {
    await this.page.locator(pw(B.sidebarItem(itemId))).click();
  }

  async viaRibbonTab(tabId: string): Promise<void> {
    await this.page.locator(pw(B.ribbonTab(tabId))).click();
  }

  async viaRibbonItem(itemId: string): Promise<void> {
    await this.page.locator(pw(B.ribbonItem(itemId))).click();
  }

  /** Open the command palette (⌘/Ctrl+K), type a query, and select the first result. */
  async viaCommandPalette(query: string): Promise<void> {
    await this.page.keyboard.press('Control+k');
    const input = this.page.locator('b-command-palette input').first();
    await input.fill(query);
    await this.page.keyboard.press('Enter');
  }
}
