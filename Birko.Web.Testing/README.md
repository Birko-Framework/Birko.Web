# birko-web-testing

Shared browser-automation toolkit for **Birko.Web consumer apps** (Symbio, Playground, Presenter,
WorkoutTracker, …). Source-only, like the other `Birko/Web/*` packages — **never built, never
published**. Consumers reference it by a TypeScript `paths` entry resolved via the `BIRKO_SRC`
convention; it is consumed by the **Node test runner, not esbuild**, so it needs **no** `build.js`
alias.

## Two lanes, one core

| Lane | Import | Purpose |
|---|---|---|
| **Playwright** | `birko-web-testing/playwright` | **The test suite** — smoke sweep + CRUD flows via `@playwright/test`. |
| **Puppeteer** | `birko-web-testing/puppeteer` | **Utility scripts** — PDF/screenshot generation, perf traces, one-off scrapes. Plain Node scripts, *not* a second test suite. |
| **Core** | `birko-web-testing/core` | Driver-agnostic `RouteEntry` manifests, `b-*` selectors, API login/auth-snapshot, console/request collectors. No driver imports. |

The whole Birko.Web UI is **Web Components with Shadow DOM**. Playwright CSS pierces open shadow
roots automatically; Puppeteer uses the `>>>` deep combinator. `core/selectors.ts` holds the
selector strings as `{ host, inner }` pieces and each adapter applies its own piercing — so the
page objects read identically across lanes.

## What's grounded in the real components

Selectors and auth are read from the live source, not invented:

- **`b-data-table`** — ⋮ row action `.row-action-trigger[data-id]` (inside the nested `b-table`
  shadow); on click it appends a top-level `b-dropdown-menu` whose items are
  `.item[data-id]` (`role="menuitem"`); selecting emits `row-action {action,id,row}`.
- **`b-dropdown-menu`** — the one popover primitive (native Popover API).
- **`b-form`** — fields render as `b-*` controls with `name=<field>`, wrapped in `[data-field=<field>]`;
  the editable element is the inner `input/select/textarea`; submitting emits `submit`.
- **`b-select` (searchable)** — opens its `.combo`, renders options as `.option[data-value]` in a
  `.dropdown` popover (NOT native `<option>`/`[role=option]`). The `SelectPO` fixture drives it
  (`select.pickFirst('buildingId')`).
- **`b-confirm-dialog`** — confirm/cancel are `.btn-confirm` / `.btn-cancel` (locale-proof; default
  text "Confirm"/"Cancel").
- **`b-sidebar`** `a.nav-item[data-id]`, **`b-ribbon`** `button.ribbon-tab[data-tab]` / `[data-item]`.
- **BaseCrudPage / BaseSplitPage** — `#btn-create` (disabled until any required filter is set),
  `#modal`, `#btn-save`, `#confirm`. **Split (master-detail) pages have no ⋮ row actions** — delete
  is row-click → `#detail-card` → `#btn-detail-delete` → `#confirm`.
- **Auth** — `localStorage[storageKey]` holds a JSON snapshot (token + claims), exactly as
  `birko-web-shell`'s `auth-store` writes it. `core/auth.ts` logs in over `POST api/auth/login`
  `{ login, password }` and reproduces that snapshot.

### Two gotchas to assert around

- **Required-filter gating:** list pages (e.g. Communication) render a `b-empty` "select a
  configuration" card until a filter is chosen — `b-data-table` only mounts after. Smoke on the `h1`;
  pick a filter value before asserting the table.
- **`#modal` is not unique** once Playwright pierces shadow roots — shell components (the offline
  sync-conflict modal) reuse `id="modal"`. To assert "the CRUD modal is open", target the open native
  `dialog[open]` (`B.openDialog`), not `#modal`.

## Runtime model (READ THIS — it is not "just tsconfig paths")

The other `Birko/Web/*` packages are consumed by **esbuild**, which bundles them at build time. This
toolkit is consumed by the **Node test runner at runtime**, which changes everything:

- **tsconfig `paths` only fix typechecking.** Node's ESM resolver ignores them. So the consumer must
  also install the package as a real dependency (a `file:` symlink) — otherwise `import
  'birko-web-testing/playwright'` is unresolvable at runtime.
- **The package never imports `@playwright/test` as a *value*** (only types, which are erased). A
  source-linked package resolves bare deps from *its own* location, so a value import would either
  fail to resolve or load a **second** `@playwright/test` instance — which breaks Playwright's
  single-instance test registry. Instead the consumer owns the one `@playwright/test` and **injects**
  it via `withBirkoFixtures(base)` and `runSmoke(test, expect, …)`.

### Environment requirements (hard-won — ignore at your peril)

| Requirement | Why |
|---|---|
| **Node: even-numbered LTS only (20 / 22 / 24).** Never odd (21 / 23). | Odd releases ship experimental ESM/type-stripping that Playwright doesn't target — the config fails to load (`defineConfig` named-export errors, param-property strip errors). |
| **Consumer test package.json must NOT set `"type": "module"`.** | With `type:module`, Node loads the `.ts` config as pure ESM and named imports from the CommonJS `@playwright/test` fail. Without it, Playwright's own transform loads `.ts` (CJS interop works). |
| **One shared Chromium** (see policy below). | Avoids two multi-hundred-MB downloads. |

## Adopting it in a new consumer

1. **tsconfig path** (typecheck only; resolved via `BIRKO_SRC`, mirror your `birko-web-*` entries):

   ```jsonc
   "baseUrl": ".",
   "paths": {
     "birko-web-testing": ["../../../../Web/Birko.Web.Testing/src/index.ts"],
     "birko-web-testing/*": ["../../../../Web/Birko.Web.Testing/src/*/index.ts"],
     // birko-web-testing is path-mapped source — its adapter files resolve these relative to THEIR
     // location, not your node_modules. Map them to yours so the package typechecks:
     "@playwright/test": ["./node_modules/@playwright/test"],
     "puppeteer": ["./node_modules/puppeteer"]
   }
   ```

2. **package.json** — NO `"type": "module"`; pin the drivers (never global); add the `file:` link so
   the package resolves at runtime:

   ```jsonc
   "devDependencies": {
     "@playwright/test": "^1.61.1",
     "puppeteer": "23.x",
     "birko-web-testing": "file:../../../../Web/Birko.Web.Testing"
   }
   ```

3. **fixtures.ts** — own the single `@playwright/test`; inject it into the toolkit:

   ```ts
   import { test as base, expect } from '@playwright/test';
   import { withBirkoFixtures } from 'birko-web-testing/playwright';
   export const test = withBirkoFixtures(base);   // adds page/form/dataTable/nav/select/consoleGuard
   export { expect };
   ```

4. **playwright.config.ts** — spread the preset; pass `devices` from your own `@playwright/test`:

   ```ts
   import { defineConfig, devices } from '@playwright/test';
   import { birkoPlaywrightPreset } from 'birko-web-testing/playwright';
   export default defineConfig(birkoPlaywrightPreset({
     baseURL: 'http://localhost:3000',
     storageState: '.auth/state.json',
     desktopChrome: devices['Desktop Chrome'],
   }));
   ```

   **No API login wired yet?** Pass `requireAuth: false` — drops the auth.setup project so the suite
   runs unauthenticated (public-route smoke).

5. **auth.setup.ts** — log in once via the API, seed localStorage, persist storage state. Pass your
   app's `claimMappings` if it overrides them in `createAuthStore`:

   ```ts
   import { test as setup, expect } from '@playwright/test';
   import { loginViaApi } from 'birko-web-testing/core';
   setup('authenticate', async ({ page }) => {
     const auth = await loginViaApi(
       { apiBaseUrl: 'http://localhost:5000', storageKey: 'symbio_auth' },
       { login: 'admin@symbio.local', password: 'Admin12345' },   // Node fetch (no CORS server-side)
     );
     await page.goto('/');
     await page.evaluate(([k, v]) => localStorage.setItem(k, v), [auth.storageKey, auth.storageValue]);
     await page.context().storageState({ path: '.auth/state.json' });
   });
   ```

6. **A route manifest + the smoke runner** (inject `test`/`expect` from your local `fixtures.ts`):

   ```ts
   import { test, expect } from './fixtures.js';
   import { runSmoke, defineManifest } from 'birko-web-testing/playwright';
   runSmoke(test, expect, defineManifest('Communication', [
     // expectSelector: 'h1' — list pages gate their b-data-table behind a required filter, so the
     // heading is the reliable "rendered" signal. runSmoke waits on 'domcontentloaded', NOT
     // 'networkidle' (Birko apps hold a persistent WS/SSE connection → networkidle never fires).
     { path: '/#/communication/dashboard', label: 'Dashboard', expectSelector: 'h1', mustSee: ['Inquiries'] },
   ]));
   ```

See `Birko.Consumers/Symbio/tests/ui-e2e/` for the full working reference (auth setup + two smoke
manifests + a create→delete CRUD flow).

## Test data isolation — never sweep dev or production data

The **Playwright lane drives a live app against a real API and database.** The CRUD page objects
genuinely `create` / `update` / `delete` records, and even a "read-only" smoke logs in and fires the
mount-time requests of every route it sweeps. Point the suite at a **disposable test environment**,
never a shared dev stack and (ever) never production:

- **Use a throwaway database / tenant.** Run the app against an isolated DB you can reset between runs
  — a docker-compose test stack, an ephemeral SQLite / `Birko.Data.InMemory` store, or a dedicated
  test tenant. Seed only the fixtures the suite needs (e.g. Symbio's "one Building").
- **Pick origin + credentials by env, with a non-prod default.** The `*_BASE_URL` / `*_API_URL` /
  `*_USER` / `*_PASS` vars already gate every consumer's config — keep the committed defaults on
  `localhost`, and guard CI so it can never resolve a production host.
- **CRUD specs must clean up after themselves** (create → assert → delete in the same test) so a
  re-run starts from the same state; don't depend on a previous run's leftovers.
- **`loginViaApi` writes real auth tokens** — use a dedicated test account, not a real user's
  credentials.

If an isolated environment isn't available yet, run the **read-only smoke only** (skip the CRUD specs)
and say so. A render-only sweep is far lower-risk, but it still authenticates and hits the API, so even
that wants a non-prod target.

## Browser / install policy — ONE shared Chromium

To avoid two multi-hundred-MB Chromium downloads per machine:

- **Playwright owns the browser.** Run **once per machine**: `npx playwright install chromium`.
- **Puppeteer reuses it** — set `PUPPETEER_SKIP_DOWNLOAD=1` (no second download) and point Puppeteer
  at Playwright's binary via `PUPPETEER_EXECUTABLE_PATH` (or `launchSession({ executablePath })`).
- **Never install `@playwright/test` or `puppeteer` globally** — keep them version-pinned per consumer.
- **CI** — set `PLAYWRIGHT_BROWSERS_PATH` to a fixed cache dir and point `PUPPETEER_EXECUTABLE_PATH`
  at the Chromium inside it.

Full env-var reference: [`ENV.md`](./ENV.md).
