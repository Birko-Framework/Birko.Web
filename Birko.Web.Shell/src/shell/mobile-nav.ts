// Declarative nav-model for a mobile bottom-nav shell (BMobileAppShell). A `Surface` is one
// primary destination; the shell renders one bottom-nav item per surface and highlights the one
// matching the current hash.

export interface Surface {
  /** Stable id, used for active-state matching + the nav item's data attribute. */
  readonly id: string;
  /** Hash route without the leading `#` (e.g. `"/"`, `"/log"`). */
  readonly route: string;
  /** Optional bottom-nav glyph / emoji. */
  readonly icon?: string;
  /** Display label (used as-is, or as the fallback when `titleKey` doesn't resolve). */
  readonly label: string;
  /** Optional i18n key; when set the shell renders the translated label, falling back to `label`. */
  readonly titleKey?: string;
}

/**
 * Resolve a location hash to the active surface for highlighting: a non-root surface matches its
 * exact route or any nested path beneath it; the root (`"/"`) surface is the catch-all default.
 * Returns `undefined` only when `surfaces` is empty.
 */
export function activeSurface(hash: string, surfaces: readonly Surface[]): Surface | undefined {
  if (!surfaces.length) return undefined;
  const path = hash.replace(/^#/, '') || '/';
  return (
    surfaces.find((s) => s.route !== '/' && (path === s.route || path.startsWith(s.route + '/'))) ??
    surfaces.find((s) => s.route === '/') ??
    surfaces[0]
  );
}
