// birko-web-testing — shared browser-automation toolkit for Birko.Web consumer apps.
//
// Lanes:
//   • Playwright (`birko-web-testing/playwright`) = the test suite (smoke sweep + CRUD).
//   • Puppeteer (`birko-web-testing/puppeteer`)   = utility scripts (PDF/screenshot/perf/scrape).
//   • Core      (`birko-web-testing/core`)        = driver-agnostic routes/selectors/auth/collectors.
//
// The root entry re-exports only the driver-agnostic core so importing the package never pulls in
// a browser driver. Import a lane explicitly to get its adapter.
export * from './core/index.js';
