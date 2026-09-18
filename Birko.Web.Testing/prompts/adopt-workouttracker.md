# Adopt prompt — WorkoutTracker (Reps.Web)

A filled-in instance of [`../ADOPT-PROMPT.md`](../ADOPT-PROMPT.md) for the WorkoutTracker consumer.
Hand the section below to an agent working in the WorkoutTracker repo.

---

You are working in the **WorkoutTracker** repo; its frontend is **`Reps.Web`**
(`C:\Source\Birko\Consumers\WorkoutTracker\Reps.Web`). Adopt the shared **`birko-web-testing`** package
(`C:\Source\Birko\Web\Birko.Web.Testing` — read its `README.md` + `ENV.md` first) to add a Playwright
smoke suite. Reps.Web is a **local-first PWA with NO authentication** (no `createAuthStore`, no login —
only an i18n `storageKey: 'reps-locale'`), so this is an **unauthenticated smoke** (`requireAuth: false`)
— no `auth.setup.ts`.

## Use the current API (copy the Symbio reference)
The maintained template is `C:\Source\Birko\Consumers\Symbio\tests\ui-e2e\`. Copy its file shapes and
strip the auth pieces. Key points of the current package API:
- The package **never imports `@playwright/test` as a value** — the consumer owns the single instance
  via a tiny local `fixtures.ts`:
  ```ts
  import { test as base, expect } from '@playwright/test';
  import { withBirkoFixtures } from 'birko-web-testing/playwright';
  export const test = withBirkoFixtures(base);
  export { expect };
  ```
- `runSmoke` takes them injected: `runSmoke(test, expect, manifest, opts?)`.
- The preset takes `desktopChrome` from your own driver:
  `birkoPlaywrightPreset({ baseURL, desktopChrome: devices['Desktop Chrome'], requireAuth: false })`.

## WorkoutTracker-specific fills
- **No auth** → `requireAuth: false`; do NOT create `auth.setup.ts`; specs need no login.
- **Routing**: hash router into `#router-outlet` (`src/app.ts`). Real routes: `#/session`, `#/settings`,
  `#/log/:id`, plus the bottom-nav **SURFACES** (`today`, `log`, … — read `SURFACES` in `src/app.ts`
  for their exact `route` paths; `today` and `log` are real pages, others are placeholders). Smoke the
  real surfaces + `#/session` + `#/settings`.
- **Dev server**: Reps.Web has **no `dev` script** — only `build` / `watch` (esbuild). Serve the build
  output yourself (e.g. `npm run watch` + a static file server over the output dir) and set `baseURL`
  to that origin (confirm the port; there's no committed default). Override via `REPS_BASE_URL`.
- **tsconfig path depth**: `tests/ui-e2e` is 5 levels under `Birko/`, so map
  `birko-web-testing` → `../../../../../Web/Birko.Web.Testing/src/index.ts` (+ `/*`), and map
  `@playwright/test` + `puppeteer` → `./node_modules/...` (the source package resolves its deps
  relative to its own dir). Set `baseUrl: "."`. Mirror Symbio's `package.json` (incl.
  `"birko-web-testing": "file:../../../../../Web/Birko.Web.Testing"`, `@playwright/test ^1.61.1`,
  `playwright ^1.61.1`, `@types/node`, `puppeteer`; no `type:module`). `tsc --noEmit` to confirm.

## Create `Reps.Web/tests/ui-e2e/`
1. `package.json` — pinned devDeps as above; scripts `test` / `install:browser`
   (`playwright install chromium`).
2. `tsconfig.json` — the paths above.
3. `fixtures.ts` — the `withBirkoFixtures(base)` snippet above.
4. `playwright.config.ts`:
   ```ts
   import { defineConfig, devices } from '@playwright/test';
   import { birkoPlaywrightPreset } from 'birko-web-testing/playwright';
   export default defineConfig(birkoPlaywrightPreset({
     baseURL: process.env.REPS_BASE_URL ?? '<<dev origin>>',
     desktopChrome: devices['Desktop Chrome'],
     requireAuth: false,
   }));
   ```
5. `smoke.spec.ts`:
   ```ts
   import { test, expect } from './fixtures.js';
   import { runSmoke, defineManifest } from 'birko-web-testing/playwright';
   runSmoke(test, expect, defineManifest('Reps', [
     { path: '/#/', label: 'Today' },           // Today maps to route '/' (NOT '/today') — see SURFACES
     { path: '/#/log', label: 'Log' },
     { path: '/#/session', label: 'Session' },
     { path: '/#/settings', label: 'Settings' },
   ]), { ignoreRequest: (r) => r.url.endsWith('/favicon.ico') });
   ```
   No `expectSelector` until you confirm a stable selector per surface (e.g. `reps-today` is the custom
   element for the Today page); add `expectSelector` / `mustSee` once known.
6. `.gitignore` (`node_modules/ .auth/ test-results/ playwright-report/`) + a short `README.md`.

## Verify & report
- `npm install` (set `PUPPETEER_SKIP_DOWNLOAD=1` to reuse Playwright's Chromium), then `tsc --noEmit`
  (typecheck), then `npm run install:browser && npm test` against the running dev build.
- Report what passed, any real app issue surfaced (console errors / failed requests), and any
  selector/route assumption that was wrong (so the shared package or this suite can be corrected).

## Hard constraints
- Do **NOT** touch `.slnx`/`.sln` or create MSBuild/.NET projects — `tests/ui-e2e` is Node-only.
- Keep the one-Chromium / no-global-install policy (package `ENV.md`); pin driver versions.
- Don't import anything from `birko-web-testing` into Reps.Web app `src/` — it's test-only and must
  never enter the esbuild bundle.
- **Run against a local / throwaway Reps.Api + its dev DB, never a shared or hosted instance** (see
  the package README's *Test data isolation* section). The smoke is read-only but still hits the API
  on mount; keep the committed `baseURL` on `localhost:5170` (override via `REPS_BASE_URL`). If you
  later add a `#/session` / CRUD spec, seed + tear down a throwaway session rather than mutating real
  workout history.
