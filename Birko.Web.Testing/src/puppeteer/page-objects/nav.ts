import type { Page } from 'puppeteer';
import { B, pierceDeep } from '../../core/selectors.js';

const pp = (p: { host: string; inner: string }): string => pierceDeep(p, 'puppeteer');

/** Puppeteer navigation helpers — direct goto plus the real nav chrome. */
export class NavPO {
  private readonly page: Page;
  constructor(page: Page) { this.page = page; }

  async goto(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: 'networkidle2' });
  }

  async viaSidebar(itemId: string): Promise<void> {
    const el = await this.page.$(pp(B.sidebarItem(itemId)));
    await el?.click();
  }

  async viaRibbonTab(tabId: string): Promise<void> {
    const el = await this.page.$(pp(B.ribbonTab(tabId)));
    await el?.click();
  }

  async viaRibbonItem(itemId: string): Promise<void> {
    const el = await this.page.$(pp(B.ribbonItem(itemId)));
    await el?.click();
  }
}
