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
  /**
   * Extra routes (and their subtrees) this surface owns **for active-state matching only**.
   *
   * Without this, a surface can only claim its own subtree, so a top-level route that conceptually belongs to it
   * falls through to the root catch-all — and the bottom nav confidently highlights the wrong destination. Reps hit
   * exactly that: its exercise library lives at `/library`, reached from the Plans surface, and every visit
   * highlighted *Today* (TASK-150). Moving the route under `/plans` would have fixed it and would have broken the
   * deep links people already have.
   *
   * Matching only: `route` stays the single place the nav item links to. Two fields that could each answer "where
   * does this surface go" would eventually disagree.
   */
  readonly alsoMatches?: readonly string[];
}

/**
 * Resolve a location hash to the active surface for highlighting: a non-root surface matches its
 * exact route, any nested path beneath it, or any of its {@link Surface.alsoMatches} routes on the
 * same exact-or-nested rule; the root (`"/"`) surface is the catch-all default.
 * Returns `undefined` only when `surfaces` is empty.
 *
 * **First match wins, in `surfaces` order**, so a route two surfaces both claim resolves to the earlier one.
 * Deterministic on purpose rather than an error: a duplicated claim is a nav-highlight mistake, and throwing would
 * take an app down over one.
 */
export function activeSurface(hash: string, surfaces: readonly Surface[]): Surface | undefined {
  if (!surfaces.length) return undefined;
  const path = hash.replace(/^#/, '') || '/';
  const owns = (route: string) => route !== '/' && (path === route || path.startsWith(route + '/'));
  return (
    surfaces.find((s) => owns(s.route) || (s.alsoMatches?.some(owns) ?? false)) ??
    surfaces.find((s) => s.route === '/') ??
    surfaces[0]
  );
}
