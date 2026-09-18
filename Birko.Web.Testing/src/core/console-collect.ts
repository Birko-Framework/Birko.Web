// Driver-agnostic console + failed-request collector. Both Playwright's and Puppeteer's Page
// expose a compatible `.on('console'|'pageerror'|'response', …)` surface where console messages
// have `.type()`/`.text()` and responses have `.status()`/`.url()`, so a single `attachCollector`
// works for both drivers — keeping the assertion API identical across lanes.

export interface ConsoleLike { type(): string; text(): string }
export interface ResponseLike { status(): number; url(): string }

/** The slice of a Page (Playwright or Puppeteer) this collector needs. */
export interface PageEventsLike {
  on(event: 'console', handler: (msg: ConsoleLike) => void): unknown;
  on(event: 'pageerror', handler: (err: Error) => void): unknown;
  on(event: 'response', handler: (res: ResponseLike) => void): unknown;
}

export interface FailedRequest { url: string; status: number }

export interface Collected {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: FailedRequest[];
}

export interface CollectorHandle {
  consoleErrors(): string[];
  pageErrors(): string[];
  failedRequests(): FailedRequest[];
  all(): Collected;
  /** True when nothing bad was seen. */
  clean(): boolean;
  /** Human-readable dump for assertion messages. */
  describe(): string;
  reset(): void;
}

export interface CollectorOptions {
  /** Predicate to ignore known-noisy console errors (e.g. third-party widgets). */
  ignoreConsole?: (text: string) => boolean;
  /** Predicate to ignore known-noisy failed requests (e.g. optional /favicon.ico). */
  ignoreRequest?: (req: FailedRequest) => boolean;
}

const isErrorType = (t: string): boolean => t === 'error';

/** Attach collectors to a Page-like and return a handle to read/assert/reset. */
export function attachCollector(page: PageEventsLike, opts: CollectorOptions = {}): CollectorHandle {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: FailedRequest[] = [];

  page.on('console', (msg) => {
    if (!isErrorType(msg.type())) return;
    const text = msg.text();
    if (opts.ignoreConsole?.(text)) return;
    consoleErrors.push(text);
  });

  page.on('pageerror', (err) => {
    pageErrors.push(err?.message ?? String(err));
  });

  page.on('response', (res) => {
    const status = res.status();
    if (status < 400) return;
    const req: FailedRequest = { url: res.url(), status };
    if (opts.ignoreRequest?.(req)) return;
    failedRequests.push(req);
  });

  const handle: CollectorHandle = {
    consoleErrors: () => [...consoleErrors],
    pageErrors: () => [...pageErrors],
    failedRequests: () => [...failedRequests],
    all: () => ({
      consoleErrors: [...consoleErrors],
      pageErrors: [...pageErrors],
      failedRequests: [...failedRequests],
    }),
    clean: () => consoleErrors.length === 0 && pageErrors.length === 0 && failedRequests.length === 0,
    describe: () => {
      const lines: string[] = [];
      if (consoleErrors.length) lines.push(`console errors (${consoleErrors.length}):\n  - ${consoleErrors.join('\n  - ')}`);
      if (pageErrors.length) lines.push(`page errors (${pageErrors.length}):\n  - ${pageErrors.join('\n  - ')}`);
      if (failedRequests.length) lines.push(`failed requests (${failedRequests.length}):\n  - ${failedRequests.map((r) => `${r.status} ${r.url}`).join('\n  - ')}`);
      return lines.length ? lines.join('\n') : '(clean)';
    },
    reset: () => {
      consoleErrors.length = 0;
      pageErrors.length = 0;
      failedRequests.length = 0;
    },
  };
  return handle;
}
