import puppeteer, { type Browser, type Page } from 'puppeteer';
import { loginViaApi, type AuthConfig, type Credentials } from '../core/auth.js';

type PuppeteerLaunchOptions = NonNullable<Parameters<typeof puppeteer.launch>[0]>;

export interface SessionOptions {
  /** App origin, e.g. 'http://localhost:3000'. */
  baseURL: string;
  headless?: boolean;
  /**
   * Path to a Chromium binary. Defaults to PUPPETEER_EXECUTABLE_PATH so a single Playwright-managed
   * Chromium is reused (no second download). See README → one-Chromium policy.
   */
  executablePath?: string;
  /** Extra puppeteer.launch options merged last. */
  launch?: Partial<PuppeteerLaunchOptions>;
}

export interface BirkoSession {
  browser: Browser;
  page: Page;
  close(): Promise<void>;
}

/** Launch a Puppeteer session, reusing the shared Chromium when PUPPETEER_EXECUTABLE_PATH is set. */
export async function launchSession(opts: SessionOptions): Promise<BirkoSession> {
  const executablePath = opts.executablePath ?? process.env.PUPPETEER_EXECUTABLE_PATH ?? undefined;
  const browser = await puppeteer.launch({
    headless: opts.headless ?? true,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    ...opts.launch,
  });
  const page = await browser.newPage();
  return {
    browser,
    page,
    async close() { await browser.close(); },
  };
}

/**
 * Seed an authenticated session: log in over the API (Node fetch), then write the exact auth
 * snapshot to localStorage (per-origin) so the next navigation loads logged-in. Mirrors the
 * storage shape produced by birko-web-shell's auth-store.
 */
export async function applyAuth(
  page: Page,
  origin: string,
  cfg: AuthConfig,
  creds: Credentials,
): Promise<void> {
  const result = await loginViaApi(cfg, creds);
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    (key: string, value: string) => localStorage.setItem(key, value),
    result.storageKey,
    result.storageValue,
  );
}
