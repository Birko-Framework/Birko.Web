# Environment variables — birko-web-testing

These control the **one-shared-Chromium** policy and the consumer-resolution convention. Set them
per shell / CI job; none are baked into the package.

| Variable | Lane | Purpose | Example (Windows) |
|---|---|---|---|
| `BIRKO_SRC` | both | Locates the `Birko/Web` source bucket (same convention as `build.js`/`Directory.Build.props`). If unset, consumers walk up to find `Birko/Web`. | `C:\Source\Birko\Web` |
| `PLAYWRIGHT_BROWSERS_PATH` | Playwright | Fixed cache dir for the Playwright-managed browsers. Set the same value in CI so the install is cached and reused. | `C:\pw-browsers` |
| `PUPPETEER_SKIP_DOWNLOAD` | Puppeteer | `1` → Puppeteer does **not** download its own Chromium (it reuses Playwright's). Set before `npm install`. | `1` |
| `PUPPETEER_EXECUTABLE_PATH` | Puppeteer | Absolute path to the Chromium binary Puppeteer should launch (point at Playwright's). `launchSession()` reads this by default. | `C:\pw-browsers\chromium-xxxx\chrome-win\chrome.exe` |

## One-time machine setup

```bash
# 1. Install the single shared Chromium (Playwright owns it).
npx playwright install chromium

# 2. Tell Puppeteer not to download its own, and where Playwright's lives.
#    (find the path with: npx playwright install --dry-run chromium, or inspect PLAYWRIGHT_BROWSERS_PATH)
export PUPPETEER_SKIP_DOWNLOAD=1
export PUPPETEER_EXECUTABLE_PATH="<path-to-playwright-chromium>"
```

> Put `PUPPETEER_SKIP_DOWNLOAD=1` in a project `.npmrc` (`puppeteer_skip_download=true`) or the
> environment **before** `npm install`, so the install step itself skips the download.

## CI

```yaml
env:
  PLAYWRIGHT_BROWSERS_PATH: ${{ github.workspace }}/.pw-browsers
  PUPPETEER_SKIP_DOWNLOAD: "1"
steps:
  - run: npx playwright install --with-deps chromium
  - run: |
      echo "PUPPETEER_EXECUTABLE_PATH=$(node -e "console.log(require('@playwright/test').chromium.executablePath())")" >> $GITHUB_ENV
  - run: npx playwright test
```
