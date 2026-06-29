// Playwright lane — the test suite (smoke sweep + CRUD). Import via 'birko-web-testing/playwright'.
//
// NOTE: the package never imports @playwright/test as a VALUE (only types, which are erased). The
// consumer owns the single @playwright/test instance and injects it via withBirkoFixtures / runSmoke
// — see fixtures.ts for why (single-instance test registry under a source-linked package).
export {
  withBirkoFixtures,
  type BirkoFixtures,
  type BirkoOptions,
  type BirkoTest,
  type PlaywrightBaseTest,
} from './fixtures.js';
export { runSmoke, type SmokeOptions } from './smoke.js';
export { runManifestSmoke, type ManifestSmokeOptions } from './manifest-smoke.js';
export { DataTablePO } from './page-objects/data-table.js';
export { FormPO } from './page-objects/form.js';
export { NavPO } from './page-objects/nav.js';
export { SelectPO } from './page-objects/select.js';
export { birkoPlaywrightPreset, type BirkoPlaywrightPresetOptions } from '../../playwright.preset.js';
// Driver-agnostic core re-exported for convenience.
export * from '../core/index.js';
