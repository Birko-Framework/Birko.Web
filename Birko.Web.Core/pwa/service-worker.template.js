/*
 * Birko.Web PWA service-worker template.
 *
 * Stamped at build time by `writeServiceWorker()` (pwa/build-sw.mjs): the cache prefix, a content
 * hash of the whole shell (so the cache name changes exactly when something it caches changes → the
 * browser sees a new worker and `activate` prunes old caches), and the precache list are injected
 * into the placeholders below.
 *
 * Behaviour: shell-first for navigations (cache-first, instant offline boot), cache-first for static
 * assets, and it deliberately NEVER touches `/api/*` — those fall through to the network so an
 * offline write queue (Birko `ActionQueue`) owns offline writes. Caching API responses here would
 * defeat that. Only GET, same-origin, non-API requests are handled.
 */

const CACHE_VERSION = '__BUILD_HASH__';
const CACHE_PREFIX = '__CACHE_PREFIX__-';
const CACHE = CACHE_PREFIX + CACHE_VERSION;
const PRECACHE = __PRECACHE__;

/*
 * BASE is the worker's own scope, which is the directory it was served from — '/' for an app at the
 * web root, '/My.App/' for one published to a project GitHub Page or any other subpath. Everything
 * below resolves against it rather than assuming the root.
 *
 * Deriving it at runtime rather than stamping it in at build time is deliberate: the same built
 * output then works wherever it is served, so a local `serve wwwroot/` and a subpath deploy cannot
 * disagree, and there is no config to get wrong.
 *
 *
 * ⚠ Two things make this work and EITHER ALONE IS SUFFICIENT, so neither mutates to a failure on its
 * own — a fact worth stating, because it means a future reader deleting "the redundant one" will see
 * every check still pass:
 *   1. the generator emits precache paths RELATIVE, and a relative URL in a worker already resolves
 *      against the worker's own location;
 *   2. `at()` strips a leading slash before resolving, so a list in the old absolute form lands in
 *      the right place too.
 * Measured: reverting (1) alone passes, reverting (2) alone passes, reverting BOTH fails with
 * `/`, `/index.html` and `/app.js` all 404 and the worker never registering. (2) is kept because a
 * hand-written or previously-generated absolute list must not silently break; (1) is kept because a
 * worker published at /My.App/ that reads `"/index.html"` tells the next person something false.
 *
 * The cost of the strip is that an asset genuinely outside the app's base cannot be precached, which
 * is already outside the documented contract — `shellAssets` are relative to the build's `outDir`.
 *
 * What it was like before either: the playground published to
 * https://birko-framework.github.io/Birko.Web.Playground/ asked for '/index.html' and '/app.js',
 * which 404 there — `addAll` rejects, the install step fails, and the app silently has no offline
 * shell while looking entirely healthy.
 */
const BASE = new URL('./', self.registration.scope).href;
const at = (path) => new URL(path.replace(/^\/+/, ''), BASE).href;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Fill the new cache from the NETWORK, never from the HTTP cache. A bare `addAll(PRECACHE)` issues
    // ordinary fetches, so on a host that sends no `Cache-Control` (see `registerServiceWorker`'s
    // `updateViaCache` note) a heuristically-fresh copy can satisfy them — and the freshly-created
    // cache is then filled with the PREVIOUS build's assets. That failure is invisible from outside:
    // a new cache name appears, `activate` prunes the old one, everything looks like it updated, and
    // the app still serves old code. Hardening rather than a known-live bug — Chrome was measured
    // filling correctly (WorkoutTracker TASK-035/179) — but it costs one request flag.
    await cache.addAll(PRECACHE.map((u) => new Request(at(u), { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Drop every previous cache for this app so a new deploy can't serve a stale shell.
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // mutations always hit the network (and the offline queue)

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // third-party: leave to the network
  if (url.href.startsWith(at('api/'))) return;     // API: never cache — the write queue owns offline

  if (request.mode === 'navigate') {
    event.respondWith(shellFirst(request));
    return;
  }
  event.respondWith(cacheFirst(request));
});

async function shellFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = (await cache.match(at('index.html'))) ?? (await cache.match(at('./')));
  if (cached) return cached;
  try {
    return await fetch(request);
  } catch {
    return Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') cache.put(request, response.clone());
    return response;
  } catch {
    return cached ?? Response.error();
  }
}
