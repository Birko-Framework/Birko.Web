// Driver-agnostic route manifest. A consumer describes the routes it wants swept;
// the Playwright `smoke` runner (or a Puppeteer script) visits each one and asserts
// it rendered without console errors / failed requests.
//
// NO playwright/puppeteer imports in this folder — everything here is pure data + helpers
// so it can be consumed by either driver (or unit-tested on its own).

/** One sweepable route. */
export interface RouteEntry {
  /** App path, e.g. '/communication' or '#/communication' (consumer decides hash vs history). */
  path: string;
  /** Human label for the test title / reporter. */
  label: string;
  /** A selector that must be visible once the route has rendered (e.g. 'b-data-table'). */
  expectSelector?: string;
  /** Text snippets that must appear somewhere on the page after load. */
  mustSee?: string[];
}

/** A named group of routes (e.g. one per module). */
export interface RouteManifest {
  /** Manifest name, shown in the reporter (e.g. 'Communication'). */
  name: string;
  routes: RouteEntry[];
}

/** Identity helper that gives editors autocomplete on a raw route list. */
export function defineRoutes(routes: RouteEntry[]): RouteEntry[] {
  return routes;
}

/** Build a named manifest a consumer can pass straight into `runSmoke`. */
export function defineManifest(name: string, routes: RouteEntry[]): RouteManifest {
  return { name, routes };
}

/** Flatten one-or-many manifests/lists into a single RouteEntry[]. */
export function collectRoutes(
  input: RouteEntry[] | RouteManifest | Array<RouteEntry[] | RouteManifest>,
): RouteEntry[] {
  const items = Array.isArray(input) ? input : [input];
  const out: RouteEntry[] = [];
  for (const item of items) {
    if (Array.isArray(item)) out.push(...item);
    else if ('routes' in item) out.push(...item.routes);
    else out.push(item);
  }
  return out;
}
