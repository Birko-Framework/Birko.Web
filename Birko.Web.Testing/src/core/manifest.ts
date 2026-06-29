// Discover routes from the app's own module manifest — the SAME data the UI uses to build its
// ribbon/router (Birko.Web.Shell buildModuleRoutes over GET api/modules). This makes the smoke
// layer self-maintaining: every registered+permitted page is swept automatically, with zero
// per-route authoring. Driver-agnostic (no playwright/puppeteer) — pure fetch + mapping.

import { loginViaApi, type AuthConfig, type Credentials, type FetchLike } from './auth.js';
import type { RouteEntry } from './routes.js';

/** A page entry inside a module manifest (mirrors Birko.Web.Shell ModuleOption). */
export interface ManifestOption {
  id: string;
  label: string;
  route: string;
  permission?: string;
  /** Action-only entries are ribbon buttons, not navigable pages — skipped by default. */
  actionOnly?: boolean;
}

/** A module manifest (mirrors Birko.Web.Shell ModuleManifest). */
export interface ManifestModule {
  id: string;
  label: string;
  options: ManifestOption[];
}

export interface ManifestRoutesOptions {
  /** GET the system-tenant manifest (`?system=true`) — what a superadmin sees. Default false. */
  system?: boolean;
  /** Manifest endpoint path. Default 'api/modules'. */
  modulesPath?: string;
  /** Build hash-routing paths (`/#${route}`). Default true (Symbio uses hash routing). */
  hashRouting?: boolean;
  /** Render-signal selector per route. Default 'h1' (list tables are often filter-gated). */
  expectSelector?: string;
  /** Include `actionOnly` options (ribbon actions, not pages). Default false. */
  includeActionOnly?: boolean;
  /** Skip specific module ids or `${moduleId}/${optionId}` routes. */
  exclude?: (entry: { moduleId: string; optionId: string; route: string }) => boolean;
  /** Reuse an existing JWT instead of logging in (skips the login round-trip). */
  token?: string;
}

/** Fetch the raw module manifest array from the API (logs in unless `opts.token` is given). */
export async function fetchModuleManifest(
  cfg: AuthConfig,
  creds: Credentials,
  opts: ManifestRoutesOptions = {},
  fetchImpl?: FetchLike,
): Promise<ManifestModule[]> {
  const doFetch = fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  if (!doFetch) throw new Error('[birko-web-testing] no fetch available — run on Node 18+ or pass a FetchLike.');

  const token = opts.token ?? (await loginViaApi(cfg, creds, fetchImpl)).token;
  const base = cfg.apiBaseUrl.replace(/\/+$/, '');
  const path = (opts.modulesPath ?? 'api/modules').replace(/^\/+/, '');
  const url = `${base}/${path}${opts.system ? '?system=true' : ''}`;

  const res = await doFetch(url, { method: 'GET', headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`[birko-web-testing] manifest fetch failed: HTTP ${res.status} at ${url}`);

  const body = await res.json();
  const modules = (body?.data ?? body) as ManifestModule[];
  if (!Array.isArray(modules)) throw new Error('[birko-web-testing] manifest response was not an array');
  return modules;
}

/** Flatten a manifest array into sweepable RouteEntry[]. */
export function manifestToRoutes(modules: ManifestModule[], opts: ManifestRoutesOptions = {}): RouteEntry[] {
  const hash = opts.hashRouting ?? true;
  const expectSelector = opts.expectSelector ?? 'h1';
  const routes: RouteEntry[] = [];
  for (const mod of modules) {
    for (const opt of mod.options ?? []) {
      if (!opt.route) continue;
      if (opt.actionOnly && !opts.includeActionOnly) continue;
      if (opts.exclude?.({ moduleId: mod.id, optionId: opt.id, route: opt.route })) continue;
      routes.push({
        path: hash ? `/#${opt.route}` : opt.route,
        label: `${mod.label} / ${opt.label}`,
        expectSelector,
      });
    }
  }
  return routes;
}

/** Fetch the manifest and map it to RouteEntry[] in one call. */
export async function fetchModuleRoutes(
  cfg: AuthConfig,
  creds: Credentials,
  opts: ManifestRoutesOptions = {},
  fetchImpl?: FetchLike,
): Promise<RouteEntry[]> {
  return manifestToRoutes(await fetchModuleManifest(cfg, creds, opts, fetchImpl), opts);
}
