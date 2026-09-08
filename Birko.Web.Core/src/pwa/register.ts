export interface RegisterServiceWorkerOptions {
  /** Registration scope (defaults to the SW script's directory). */
  scope?: string;
  /**
   * How the browser may use its HTTP cache when checking for a new worker.
   *
   * **Defaults to `'none'`, deliberately, and changing it will break updates on WebKit.** The spec
   * default is `'imports'`, which is supposed to make the browser bypass the HTTP cache for the
   * top-level script — but that only holds where `updateViaCache` is honoured. A host that serves
   * the worker script with **no `Cache-Control`** (the ASP.NET `UseStaticFiles()` default, and the
   * usual static-host default) leaves the script *heuristically* cacheable, and Safari will then
   * satisfy the update check from its own HTTP cache, compare the stale bytes against themselves,
   * conclude nothing changed, and keep the old worker serving cache-first indefinitely.
   *
   * Measured on Reps (WorkoutTracker TASK-179, 2026-09-07): a deployed build reached an iPhone in a
   * **private** tab and after deleting the installed app — both of which start with an empty HTTP
   * cache — while an ordinary tab stayed stale across repeated reloads and the installed app across
   * repeated relaunches. The same build updated correctly in Chrome on Android over both localhost
   * and the same tunnel, because Chrome honours `updateViaCache`. `'none'` bypasses the HTTP cache
   * for the script **and** its imports, which is what makes the update check see the new bytes.
   *
   * Belt and braces rather than a substitute for headers: also send `Cache-Control: no-cache` on the
   * worker script. Either alone fixes it; both together mean neither a header regression nor an
   * engine's `updateViaCache` gap can silently freeze a deploy again.
   */
  updateViaCache?: ServiceWorkerUpdateViaCache;
}

/**
 * Registers a service worker, best-effort: resolves to the registration on success, or `null` when
 * service workers are unsupported / the context is insecure / registration fails (so callers never
 * have to guard). Pair with a SW emitted by `birko-web-core/pwa/build-sw.mjs`.
 */
export async function registerServiceWorker(
  url = '/sw.js',
  options: RegisterServiceWorkerOptions = {},
): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    // `updateViaCache: 'none'` is always sent (see the option's doc comment — it is what keeps WebKit
    // from answering the update check out of its own HTTP cache). An unknown value is ignored by older
    // engines rather than throwing, so this is safe to pass unconditionally.
    const init: RegistrationOptions = { updateViaCache: options.updateViaCache ?? 'none' };
    if (options.scope) init.scope = options.scope;
    return await navigator.serviceWorker.register(url, init);
  } catch {
    return null;
  }
}
