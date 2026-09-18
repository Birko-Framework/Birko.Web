// Shared Playwright config preset for Birko.Web consumers. A consumer spreads this into its
// own playwright.config.ts and only supplies baseURL + (optionally) where to keep storage state.
//
// It sets up the canonical project chain:
//   setup (auth.setup.ts → writes storageState)  →  chromium (reuses that storageState)
// plus trace on first retry, screenshots on failure, and CI-aware reporters/retries.
import type { PlaywrightTestConfig } from '@playwright/test'; // TYPE-ONLY — erased at runtime

export interface BirkoPlaywrightPresetOptions {
  /** App origin under test, e.g. 'http://localhost:3000'. */
  baseURL: string;
  /**
   * The device descriptor for the chromium project, e.g. `devices['Desktop Chrome']`. The consumer
   * passes it from its own @playwright/test so the package never imports the driver as a value.
   * Optional — omit for Playwright's bare defaults.
   */
  desktopChrome?: PlaywrightTestConfig['use'];
  /** Where the auth.setup project writes the authenticated storage state. Default '.auth/state.json'. */
  storageState?: string;
  /** Matches the auth setup spec. Default /.*auth\.setup\.ts/. */
  setupMatch?: string | RegExp;
  /** Test directory (defaults to Playwright's own default). */
  testDir?: string;
  /** Extra `use` overrides merged last. */
  use?: PlaywrightTestConfig['use'];
  /** Extra projects appended after the default chromium project. */
  extraProjects?: NonNullable<PlaywrightTestConfig['projects']>;
  /**
   * Whether to run the auth.setup project + reuse its storageState. Default `true`.
   * Set `false` for apps with no API login flow (or where it isn't wired yet) — the chromium
   * project then runs unauthenticated (good for public-route smoke tests).
   */
  requireAuth?: boolean;
}

export function birkoPlaywrightPreset(opts: BirkoPlaywrightPresetOptions): PlaywrightTestConfig {
  const storageState = opts.storageState ?? '.auth/state.json';
  const isCI = !!process.env.CI;
  const requireAuth = opts.requireAuth ?? true;

  const device = opts.desktopChrome ?? {};
  const chromium: NonNullable<PlaywrightTestConfig['projects']>[number] = requireAuth
    ? { name: 'chromium', use: { ...device, storageState }, dependencies: ['setup'] }
    : { name: 'chromium', use: { ...device } };

  return {
    testDir: opts.testDir,
    timeout: 30_000,
    expect: { timeout: 5_000 },
    fullyParallel: true,
    forbidOnly: isCI,
    retries: isCI ? 2 : 0,
    reporter: isCI
      ? [['github'], ['html', { open: 'never' }]]
      : [['list'], ['html', { open: 'never' }]],
    use: {
      baseURL: opts.baseURL,
      trace: 'on-first-retry',
      screenshot: 'only-on-failure',
      ...opts.use,
    },
    projects: [
      // 1) (auth only) Authenticate once; persist localStorage (the app's JWT) into storageState.
      ...(requireAuth ? [{ name: 'setup', testMatch: opts.setupMatch ?? /.*auth\.setup\.ts/ }] : []),
      // 2) Real tests — reuse the authenticated state, or run fresh when requireAuth is false.
      chromium,
      ...(opts.extraProjects ?? []),
    ],
  };
}
