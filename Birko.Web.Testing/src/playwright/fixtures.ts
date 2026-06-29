import type {
  TestType,
  PlaywrightTestArgs,
  PlaywrightTestOptions,
  PlaywrightWorkerArgs,
  PlaywrightWorkerOptions,
} from '@playwright/test'; // TYPE-ONLY — erased at runtime; the package never loads @playwright/test
import { attachCollector, type CollectorHandle, type CollectorOptions, type PageEventsLike } from '../core/console-collect.js';
import { DataTablePO } from './page-objects/data-table.js';
import { FormPO } from './page-objects/form.js';
import { NavPO } from './page-objects/nav.js';
import { SelectPO } from './page-objects/select.js';

export interface BirkoFixtures {
  /** Console-error / pageerror / 4xx-5xx collector, attached before the test body runs. */
  consoleGuard: CollectorHandle;
  dataTable: DataTablePO;
  form: FormPO;
  nav: NavPO;
  /** Searchable b-select helper (required filters, searchable form fields). */
  select: SelectPO;
}

export interface BirkoOptions {
  /** Per-project knobs to ignore known-noisy console/request entries. */
  collectorOptions: CollectorOptions;
}

/** The base Playwright `test` a consumer passes in (its own single @playwright/test instance). */
export type PlaywrightBaseTest = TestType<
  PlaywrightTestArgs & PlaywrightTestOptions,
  PlaywrightWorkerArgs & PlaywrightWorkerOptions
>;

/**
 * Extend a consumer-provided Playwright `test` with the Birko fixtures.
 *
 * The package must NOT import `@playwright/test` as a *value* — under a source-linked package
 * (resolved from a sibling tree) that would either fail to resolve or create a SECOND
 * @playwright/test instance, which breaks Playwright's single-instance test registry. So the
 * consumer owns the one true `test` (from its own @playwright/test) and injects it here.
 *
 * Consumer usage (a tiny local fixtures.ts):
 *   import { test as base, expect } from '@playwright/test';
 *   import { withBirkoFixtures } from 'birko-web-testing/playwright';
 *   export const test = withBirkoFixtures(base);
 *   export { expect };
 */
export function withBirkoFixtures(base: PlaywrightBaseTest) {
  return base.extend<BirkoFixtures & BirkoOptions>({
    collectorOptions: [{}, { option: true }],

    consoleGuard: async ({ page, collectorOptions }, use) => {
      const handle = attachCollector(page as unknown as PageEventsLike, collectorOptions);
      await use(handle);
    },

    dataTable: async ({ page }, use) => { await use(new DataTablePO(page)); },
    form: async ({ page }, use) => { await use(new FormPO(page)); },
    nav: async ({ page }, use) => { await use(new NavPO(page)); },
    select: async ({ page }, use) => { await use(new SelectPO(page)); },
  });
}

/** The Birko-extended `test` type (what `withBirkoFixtures` returns). */
export type BirkoTest = ReturnType<typeof withBirkoFixtures>;
