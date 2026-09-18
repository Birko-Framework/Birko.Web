import type { Expect } from '@playwright/test'; // TYPE-ONLY — erased at runtime
import type { BirkoTest } from './fixtures.js';
import { attachCollector, type CollectorOptions, type PageEventsLike } from '../core/console-collect.js';
import { fetchModuleRoutes, type ManifestRoutesOptions } from '../core/manifest.js';
import type { AuthConfig, Credentials } from '../core/auth.js';

export interface ManifestSmokeOptions extends ManifestRoutesOptions, CollectorOptions {
  /** API + storage config for the login that fetches the manifest. */
  auth: AuthConfig;
  /** Dev credentials used to fetch the manifest (server-side; not the browser session). */
  creds: Credentials;
  /** Navigation wait condition. Default 'domcontentloaded' (NOT 'networkidle' — see runSmoke). */
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
  /** Settle time (ms) after navigation. Default 250. */
  settleMs?: number;
  /** Per-route time budget (ms) used to size the test timeout. Default 5000. */
  perRouteBudgetMs?: number;
}

/**
 * Self-maintaining smoke: fetch EVERY registered route from the app's module manifest
 * (`GET api/modules`) and sweep them in one test — each route as a `test.step`, using soft
 * assertions so one bad route doesn't abort the rest (the run reports them all at once).
 *
 * Per route: navigate, assert the render-signal selector is visible, assert zero console
 * errors / pageerrors / 4xx-5xx during that route's load (collector is reset per step).
 *
 * The route list is discovered at runtime, so it can't be one-test-per-route (Playwright needs
 * tests defined at collection time) — hence the single test + steps shape.
 *
 *   import { test, expect } from './fixtures.js';
 *   runManifestSmoke(test, expect, {
 *     auth: { apiBaseUrl: 'http://localhost:5000', storageKey: 'symbio_auth' },
 *     creds: { login: 'admin@symbio.local', password: 'Admin12345' },
 *     system: true,
 *   });
 */
export function runManifestSmoke(test: BirkoTest, expect: Expect, opts: ManifestSmokeOptions): void {
  test('manifest smoke: every registered route renders cleanly', async ({ page }) => {
    const routes = await fetchModuleRoutes(opts.auth, opts.creds, opts);
    expect(routes.length, 'module manifest returned no routes').toBeGreaterThan(0);

    // Size the timeout to the discovered route count (the preset's 30s would never fit a full sweep).
    test.setTimeout(Math.max(60_000, routes.length * (opts.perRouteBudgetMs ?? 5_000)));

    const guard = attachCollector(page as unknown as PageEventsLike, opts);
    const settleMs = opts.settleMs ?? 250;

    for (const route of routes) {
      await test.step(`${route.label}  [${route.path}]`, async () => {
        guard.reset(); // only count problems from THIS route's load
        await page.goto(route.path, { waitUntil: opts.waitUntil ?? 'domcontentloaded' });
        if (settleMs) await page.waitForTimeout(settleMs);

        if (route.expectSelector) {
          await expect.soft(
            page.locator(route.expectSelector).first(),
            `${route.label} (${route.path}) did not render "${route.expectSelector}"`,
          ).toBeVisible();
        }
        expect.soft(
          guard.clean(),
          `${route.label} (${route.path}) surfaced problems:\n${guard.describe()}`,
        ).toBe(true);
      });
    }
  });
}
