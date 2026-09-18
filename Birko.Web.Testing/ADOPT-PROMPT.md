# Adoption prompt — wire `birko-web-testing` into a consumer

Copy this prompt, fill the **`<<…>>`** blanks for the target consumer, and hand it to an agent
working in that consumer's repo. (It mirrors the Symbio reference at
`C:\Source\Birko\Consumers\Symbio\tests\ui-e2e\`.)

---

You are working in the **<<CONSUMER>>** repo (`<<CONSUMER_PATH>>`), whose frontend lives at
`<<FRONTEND_PATH>>` (UI dev server `<<UI_URL e.g. http://localhost:3000>>`, API
`<<API_URL e.g. http://localhost:5000>>`). Adopt the shared **`birko-web-testing`** package
(`C:\Source\Birko\Web\Birko.Web.Testing` — read its `README.md` + `ENV.md` first) to add a Playwright
E2E suite. Do **not** touch `.slnx`/`.sln` or create MSBuild projects; this is Node-only.

**Ground these against the real repo before writing anything (don't invent):**
- Auth: does this app use `birko-web-shell`'s `createAuthStore`? If so, find its `storageKey`
  (grep `createAuthStore(` in the frontend) and the login endpoint (grep `api/auth/login` or the
  app's login call). If it has **no** auth/login, skip auth.setup and run an unauthenticated smoke
  of public routes instead.
- Routes: list the real routes to sweep (hash vs history — check the router). Pick a fleshed-out
  area with a `b-data-table` page for the smoke + (optionally) one CRUD flow.
- Dev credentials for the setup login (if applicable): `<<USER>>` / `<<PASS>>`.
- **Target a disposable test environment, never dev/prod data** (see the README's *Test data
  isolation* section). The CRUD page objects really create/update/delete and even the smoke hits the
  API — point `<<UI_URL>>`/`<<API_URL>>` at a throwaway DB/tenant, keep committed defaults on
  `localhost`, use a dedicated test account, and make CRUD specs create→…→delete + clean up. No
  isolated env yet? Wire the read-only smoke only and say so.

**Create `<<CONSUMER_PATH>>/tests/ui-e2e/`:**
1. `package.json` — pinned devDeps `@playwright/test` + `puppeteer` (+ `@types/node`); scripts
   `test` / `install:browser` (`playwright install chromium`).
2. `tsconfig.json` — `paths` mapping `birko-web-testing` + `birko-web-testing/*` to
   `<<REL_PATH_TO>>/Web/Birko.Web.Testing/src/...`, **and** map `@playwright/test` + `puppeteer` to
   `./node_modules/...` (the source package resolves its deps relative to its own dir). Set `baseUrl: "."`.
3. `playwright.config.ts` — `export default defineConfig(birkoPlaywrightPreset({ baseURL: '<<UI_URL>>' }))`.
4. `auth.setup.ts` (only if the app has login) — `loginViaApi({ apiBaseUrl: '<<API_URL>>', storageKey:
   '<<STORAGE_KEY>>' }, { login, password })`, then `page.evaluate` the snapshot into localStorage and
   `context().storageState({ path })`.
5. `smoke.spec.ts` — `runSmoke(defineManifest('<<MODULE>>', [ …real routes… ]))`.
6. (optional) `<<module>>.spec.ts` — one CRUD flow via the shared `form` + `dataTable` page objects and
   the `BaseCrudPage` ids (`#btn-create`, `#modal`, `#form`, `#btn-save`).
7. `.gitignore` (`node_modules/ .auth/ test-results/ playwright-report/`) + a short `README.md`.

**Verify:** `npm install` (set `PUPPETEER_SKIP_DOWNLOAD=1` to reuse Playwright's Chromium), typecheck
with `tsc --noEmit`, then `npm run install:browser && npm test` against the running dev stack. Report
what passed, what you fixed, and any selector/auth assumption that was wrong (so the shared package
can be corrected for everyone). Keep the one-Chromium / no-global policy from `ENV.md`.

---

## Per-consumer fill-ins discovered so far
| Consumer | Frontend | Uses shell auth? | Notes |
|---|---|---|---|
| Symbio | `src/Frontend/Symbio.UI` | yes (`symbio_auth`) | **Done** — reference impl in `tests/ui-e2e/`. |
| DraCode | `DraCode.KoboldLair.Client` | yes (`koboldlair_auth`, custom claims `userName:'name'`) | **Done** — `tests/ui-e2e/` (unauthenticated smoke, `requireAuth:false`; REST login not in repo yet — README shows how to flip to authed). Served by `dotnet run` at :57088. |
| Presenter | `src/Presenter.Web` | unconfirmed | Verify auth presence; may be unauthenticated smoke. |
| WorkoutTracker | `Reps.Web` | unconfirmed (only i18n storage seen) | Likely unauthenticated smoke first. |
| gameshow-app | `Gameshow.Web` | unconfirmed (control surface) | Likely unauthenticated smoke first. |
| Birko.Web.Playground | (this repo) | no | Already has the ad-hoc `verify.mjs` Puppeteer smoke. |
