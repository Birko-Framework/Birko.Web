import type { Expect } from '@playwright/test'; // TYPE-ONLY — erased at runtime
import type { BirkoTest } from './fixtures.js';
import { attachCollector, type CollectorOptions, type PageEventsLike } from '../core/console-collect.js';
import { collectRoutes, type RouteEntry, type RouteManifest } from '../core/routes.js';

export interface SmokeOptions extends CollectorOptions {
  /**
   * Navigation wait condition. Default 'domcontentloaded'.
   * NOT 'networkidle': Birko.Web apps hold a persistent WebSocket/SSE realtime connection (and may
   * poll), so the network never goes idle and 'networkidle' would always time out. We rely on the
   * web-first `expectSelector`/`mustSee` assertions (which auto-wait) to confirm the page rendered.
   */
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
  /** Settle time (ms) after navigation before asserting, for async component upgrade. Default 250. */
  settleMs?: number;
}

/**
 * Generic route-sweep runner: one test per RouteEntry that
 *   1. attaches the console/request collector (before navigating),
 *   2. navigates to the route,
 *   3. asserts `expectSelector` is visible and every `mustSee` text appears,
 *   4. asserts zero console errors, zero pageerrors, and no 4xx/5xx responses.
 *
 * `test` and `expect` are injected by the consumer (its single @playwright/test instance) — see
 * withBirkoFixtures for why the package never imports the driver as a value.
 *
 * Call inside a spec file:
 *   import { test, expect } from './fixtures.js';
 *   runSmoke(test, expect, myManifest);
 */
export function runSmoke(
  test: BirkoTest,
  expect: Expect,
  input: RouteEntry[] | RouteManifest | Array<RouteEntry[] | RouteManifest>,
  opts: SmokeOptions = {},
): void {
  const routes = collectRoutes(input);
  const settleMs = opts.settleMs ?? 250;

  for (const route of routes) {
    test(`smoke: ${route.label}  [${route.path}]`, async ({ page }) => {
      const guard = attachCollector(page as unknown as PageEventsLike, opts);

      await page.goto(route.path, { waitUntil: opts.waitUntil ?? 'domcontentloaded' });
      if (settleMs) await page.waitForTimeout(settleMs);

      if (route.expectSelector) {
        await expect(page.locator(route.expectSelector).first()).toBeVisible();
      }
      for (const text of route.mustSee ?? []) {
        await expect(page.getByText(text, { exact: false }).first()).toBeVisible();
      }

      expect(
        guard.clean(),
        `Route "${route.label}" (${route.path}) surfaced problems:\n${guard.describe()}`,
      ).toBe(true);
    });
  }
}
