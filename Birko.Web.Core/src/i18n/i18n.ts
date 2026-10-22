import { Signal, signal, type Unsubscribe } from '../state/signal.js';
import { interpolate } from './interpolate.js';

// ── Types ──────────────────────────────────────────────────────────────────

export type Messages = Record<string, unknown>;

export interface I18nOptions {
  /** Default locale to use on first load. */
  defaultLocale?: string;
  /** Fallback locale when a key is missing in the active locale (and no `fallbackChains` entry names its fallbacks). */
  fallbackLocale?: string;
  /**
   * Per active locale, the ordered locales to try when a key is missing: `{ cs: ['sk', 'en'] }` makes a Czech UI fall
   * back to Slovak, then English. A locale with no entry falls back to `fallbackLocale`, as before.
   */
  fallbackChains?: Record<string, string[]>;
  /** LocalStorage key to persist the chosen locale. Empty string disables persistence. */
  storageKey?: string;
  /** Build version string appended to locale fetch URLs for cache-busting. */
  version?: string;
}

// ── I18n ───────────────────────────────────────────────────────────────────

export class I18n {
  private _locale: Signal<string>;
  private _messages = new Map<string, Messages>();
  private _fallbackLocale: string;
  private _fallbackChains: Record<string, string[]>;
  private _storageKey: string;
  private _loadedModules = new Set<string>();
  /** `module|locale` pairs already merged, so a locale switch loads a module's chain bundles once each. */
  private _loadedModuleLocales = new Set<string>();
  private _basePath = '/locales';
  private _version: string;

  constructor(options: I18nOptions = {}) {
    const { defaultLocale = 'en', fallbackLocale = 'en', fallbackChains = {}, storageKey = '', version = '' } = options;
    this._fallbackLocale = fallbackLocale;
    this._fallbackChains = fallbackChains;
    this._storageKey = storageKey;
    this._version = version;
    // Restore the previously persisted locale so the user's language survives a reload. Guard the
    // localStorage read for SSR/quota parity with signal.ts's _restore.
    let initial = defaultLocale;
    if (storageKey) {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) initial = saved;
      } catch { /* SSR / storage unavailable — fall back to defaultLocale */ }
    }
    this._locale = signal(initial);
  }

  // ── Locale management ──

  get locale(): string { return this._locale.value; }

  /** Configure base path for locale JSON files (default: '/locales'). */
  setBasePath(path: string): void {
    this._basePath = path.replace(/\/$/, '');
  }

  async setLocale(locale: string): Promise<void> {
    const chain = this._chainFor(locale);
    // Load core translations: the locale's, then each of its fallbacks'
    await this._loadBundle(locale, `${this._basePath}/${locale}.json`);
    for (const fb of chain) await this._loadBundle(fb, `${this._basePath}/${fb}.json`);

    // Reload already-loaded module translations for the new locale; a fallback's only if not merged yet, so a
    // consumer without fallbackChains fetches exactly what it did before (its fallback came with loadModule).
    await Promise.all(
      [...this._loadedModules].flatMap(id => [
        this._loadModuleBundle(id, locale, true),
        ...chain.map(fb => this._loadModuleBundle(id, fb, false)),
      ])
    );

    this._locale.update(() => locale);

    if (this._storageKey) {
      localStorage.setItem(this._storageKey, locale);
    }

    document.documentElement.setAttribute('lang', locale);
  }

  /** Subscribe to locale changes (triggers component re-render). */
  onLocaleChange(fn: (locale: string) => void): Unsubscribe {
    return this._locale.onChange(fn);
  }

  // ── Translation ──

  t(key: string, params?: Record<string, string | number>): string {
    const locale = this._locale.value;

    // Try plural resolution first (when params has 'count')
    let value: string | null = null;
    if (params && typeof params === 'object' && 'count' in params) {
      for (const l of [locale, ...this._chainFor(locale)]) {
        value = this._resolvePlural(key, l, Number(params.count));
        if (value !== null) break;
      }
    }

    // Standard resolution: the locale, then its fallbacks in order; the first hit wins
    if (value === null) {
      for (const l of [locale, ...this._chainFor(locale)]) {
        value = this._resolve(key, l);
        if (value !== null) break;
      }
      value ??= key;
    }

    return interpolate(value, params);
  }

  // ── Module lazy loading ──

  async loadModule(moduleId: string): Promise<void> {
    if (this._loadedModules.has(moduleId)) return;
    this._loadedModules.add(moduleId);

    const locale = this._locale.value;
    await this._loadModuleBundle(moduleId, locale, true);
    for (const fb of this._chainFor(locale)) await this._loadModuleBundle(moduleId, fb, true);
  }

  // ── Manual message injection ──

  /** Merge messages into a locale bundle (useful for testing or embedded translations). */
  addMessages(locale: string, messages: Messages): void {
    const existing = this._messages.get(locale) ?? {};
    this._messages.set(locale, this._deepMerge(existing, messages));
  }

  // ── Internal ──

  /** The locales to try after `locale`, in order: its `fallbackChains` entry, else `[fallbackLocale]`; never itself. */
  private _chainFor(locale: string): string[] {
    const chain = this._fallbackChains[locale] ?? [this._fallbackLocale];
    return [...new Set(chain)].filter(l => l && l !== locale);
  }

  /** One module bundle; `always` re-fetches it (as a locale switch did), otherwise only when not merged yet. */
  private async _loadModuleBundle(moduleId: string, locale: string, always: boolean): Promise<void> {
    const key = `${moduleId}|${locale}`;
    if (!always && this._loadedModuleLocales.has(key)) return;
    this._loadedModuleLocales.add(key);
    await this._loadBundle(locale, `${this._basePath}/modules/${moduleId}/${locale}.json`);
  }

  private _resolve(key: string, locale: string): string | null {
    const bundle = this._messages.get(locale);
    if (!bundle) return null;

    const parts = key.split('.');
    let current: unknown = bundle;
    for (const part of parts) {
      if (current == null || typeof current !== 'object') return null;
      current = (current as Record<string, unknown>)[part];
    }
    return typeof current === 'string' ? current : null;
  }

  private _resolvePlural(key: string, locale: string, count: number): string | null {
    const bundle = this._messages.get(locale);
    if (!bundle) return null;

    const parts = key.split('.');
    let current: unknown = bundle;
    for (const part of parts) {
      if (current == null || typeof current !== 'object') return null;
      current = (current as Record<string, unknown>)[part];
    }

    if (current && typeof current === 'object' && !Array.isArray(current)) {
      const rules = new Intl.PluralRules(locale);
      const form = rules.select(count); // 'one', 'few', 'many', 'other'
      return (current as Record<string, string>)[form]
        ?? (current as Record<string, string>)['other']
        ?? null;
    }
    return null;
  }

  private async _loadBundle(locale: string, url: string): Promise<void> {
    try {
      const fetchUrl = this._version ? `${url}?v=${this._version}` : url;
      const resp = await fetch(fetchUrl);
      if (!resp.ok) return;
      const data = await resp.json();
      const existing = this._messages.get(locale) ?? {};
      this._messages.set(locale, this._deepMerge(existing, data));
    } catch {
      // Translation file may not exist for all locales — silent fail
    }
  }

  private _deepMerge(target: Messages, source: Messages): Messages {
    const result = { ...target };
    for (const [key, value] of Object.entries(source)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this._deepMerge(
          (result[key] as Messages) ?? {},
          value as Messages,
        );
      } else {
        result[key] = value;
      }
    }
    return result;
  }
}
