import type { ThemeOption } from './shell-types.js';

/**
 * Theme registry — the single source of truth for which themes the theme
 * switcher offers. A project registers ONLY the themes whose CSS it actually
 * links/bundles (each alternate theme is a separate file under
 * `birko-web-components/css/themes/`), so unused theme tokens never ship.
 *
 * `'light'` is the base `:root` theme shipped in `tokens.css` — it is always
 * present and cannot be removed. Everything else is opt-in.
 *
 * Bootstrap example:
 * ```ts
 * import { registerThemes, BUILTIN_THEMES } from 'birko-web-shell';
 * // ...and link css/themes/dark.css + css/themes/finstat.css in your HTML/bundle
 * registerThemes([BUILTIN_THEMES.dark, BUILTIN_THEMES.finstat]);
 * ```
 *
 * `BCoreAppShell.getAvailableThemes()` returns `getRegisteredThemes()` by
 * default, so the switcher reflects exactly what was registered (and auto-hides
 * when only `'light'` is present).
 */

/** Switcher metadata for the framework's built-in themes (CSS still opt-in). */
export const BUILTIN_THEMES = {
  light:   { id: 'light',   label: 'Light',   icon: '&#9728;' },  // ☀
  dark:    { id: 'dark',    label: 'Dark',    icon: '&#9790;' },  // ☾
  neon:    { id: 'neon',    label: 'Neon',    icon: '&#9889;' },  // ⚡
  finstat: { id: 'finstat', label: 'Finstat', icon: '&#9670;' },  // ◆
  inverse: { id: 'inverse', label: 'Inverse', icon: '&#9680;' },  // ◐ (partial — mainly for scoped/region accents, not the global switcher)
} satisfies Record<string, ThemeOption>;

const _registry = new Map<string, ThemeOption>([['light', BUILTIN_THEMES.light]]);

/** Register (or replace) a single theme in the switcher. */
export function registerTheme(theme: ThemeOption): void {
  _registry.set(theme.id, theme);
}

/** Register (or replace) several themes at once. */
export function registerThemes(themes: ThemeOption[]): void {
  for (const theme of themes) _registry.set(theme.id, theme);
}

/** Remove a theme from the switcher. `'light'` is the base theme and is kept. */
export function unregisterTheme(id: string): void {
  if (id !== 'light') _registry.delete(id);
}

/** All currently-registered themes, in registration order (`light` first). */
export function getRegisteredThemes(): ThemeOption[] {
  return [..._registry.values()];
}
