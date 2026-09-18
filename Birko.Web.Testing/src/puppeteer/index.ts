// Puppeteer lane — utility scripts (PDF/screenshot generation, perf traces, one-off scrapes).
// NOT a second test suite. Import via 'birko-web-testing/puppeteer'.
export { launchSession, applyAuth, type SessionOptions, type BirkoSession } from './session.js';
export { DataTablePO } from './page-objects/data-table.js';
export { FormPO } from './page-objects/form.js';
export { NavPO } from './page-objects/nav.js';
// Driver-agnostic core re-exported for convenience.
export * from '../core/index.js';
