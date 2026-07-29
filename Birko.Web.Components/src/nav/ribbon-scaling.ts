import type { RibbonGroupSize } from './b-ribbon.js';

/**
 * Office-style progressive group scaling: choose a variant per group so the row fits the available
 * width, degrading the least important groups first.
 *
 * **This is a deliberate mirror of `RibbonScaling` in
 * `Birko.Xaml.Core/Ribbon/RibbonScaling.cs` — keep the two in step.** The rendering is necessarily
 * forked (CSS vs AXAML), but the *policy* must not be: which group gives way, how far, and when is the
 * part a user would notice differing between the desktop and web skins of the same ribbon. The
 * numeric table in the playground's `ribbon-scaling-smoke` mirrors the C# unit tests case for case, so
 * a change to one side that is not made to the other shows up as a failure rather than as drift.
 *
 * **Determinism is a requirement, not a side effect.** The result depends only on the arguments —
 * never on the currently-applied layout. Feeding the applied layout back in is what makes a scaling
 * ribbon oscillate at a boundary (shrink → now it fits → grow → now it doesn't → shrink), which reads
 * as flicker. The Avalonia side proved this the hard way: while its groups row still sat in a scroller,
 * the scroll chevrons' hysteresis fed back into the width being scaled against and the same window
 * width resolved differently depending on drag direction.
 */

/** Variants ordered roomiest-first — the order groups degrade through. Mirrors the C# enum's order. */
export const RIBBON_SIZE_LADDER: RibbonGroupSize[] = ['large', 'medium', 'small', 'popup'];

const rank = (size: RibbonGroupSize): number => RIBBON_SIZE_LADDER.indexOf(size);

/** What the degrade pass needs to know about one group. Mirrors C# `RibbonGroupMetrics`. */
export interface RibbonGroupMetrics {
  /** Rendered width at each variant. A variant absent from the map is treated as unmeasured. */
  widths: Partial<Record<RibbonGroupSize, number>>;
  /** Importance — a **lower** value degrades **first**. */
  scalingPriority?: number;
  /** The tightest variant this group may reach. */
  minSize?: RibbonGroupSize;
}

/**
 * Width at `size`, falling back to the nearest roomier measured variant. A caller that only measured
 * some variants therefore over-estimates rather than treating the group as free — a missing
 * measurement must never let the row "fit" by accident and clip commands.
 */
function widthOf(group: RibbonGroupMetrics, size: RibbonGroupSize): number {
  const exact = group.widths[size];
  if (exact != null) return exact;
  for (let i = rank(size) - 1; i >= 0; i--) {
    const fallback = group.widths[RIBBON_SIZE_LADDER[i]];
    if (fallback != null) return fallback;
  }
  return 0;
}

/**
 * The group that should give up room next: lowest `scalingPriority` among those not yet at their
 * floor, leftmost on a tie. Returns -1 when every group is at its floor.
 *
 * This is the whole point of the pass. Degrading uniformly is easier and worse — it turns the ribbon
 * into a row of anonymous icons instead of keeping the primary group legible.
 */
function nextToDegrade(groups: RibbonGroupMetrics[], chosen: RibbonGroupSize[]): number {
  let best = -1;
  for (let i = 0; i < groups.length; i++) {
    const floor = groups[i].minSize ?? 'popup';
    if (rank(chosen[i]) >= rank(floor)) continue;
    if (chosen[i] === 'popup') continue;
    if (best < 0 || (groups[i].scalingPriority ?? 0) < (groups[best].scalingPriority ?? 0)) best = i;
  }
  return best;
}

/**
 * Resolve a variant for every group.
 *
 * @param preferred The roomiest variant any group may start at — the ribbon's look at full width.
 *   Defaults to `medium`, matching what both skins shipped before this pass existed, so an existing
 *   consumer's ribbon does not change height. Pass `large` for the Office-like look.
 * @param gap Space between groups, counted between each adjacent pair.
 */
export function resolveRibbonSizes(
  groups: RibbonGroupMetrics[],
  available: number,
  preferred: RibbonGroupSize = 'medium',
  gap = 0,
): RibbonGroupSize[] {
  const chosen: RibbonGroupSize[] = [];
  if (!groups.length) return chosen;

  // Start at the preferred look, except where a floor forbids being that tight: minSize caps how far
  // DOWN a group may go, so a group whose floor is roomier than `preferred` starts at its floor. It
  // never makes a group roomier than `preferred` otherwise. (Getting this backwards was the first bug
  // on the C# side — eight tests caught it at once.)
  for (const group of groups) {
    const floor = group.minSize ?? 'popup';
    chosen.push(rank(preferred) < rank(floor) ? preferred : floor);
  }

  const gaps = gap * Math.max(0, groups.length - 1);
  const total = () => groups.reduce((sum, g, i) => sum + widthOf(g, chosen[i]), 0);

  // One step at a time, always taking from the least important group that can still give — so the row
  // gives up the least it can rather than dropping a group straight to its floor.
  let guard = 0;
  while (total() + gaps > available && guard++ < groups.length * RIBBON_SIZE_LADDER.length) {
    const victim = nextToDegrade(groups, chosen);
    if (victim < 0) break; // nothing left to give
    chosen[victim] = RIBBON_SIZE_LADDER[rank(chosen[victim]) + 1];
  }

  return chosen;
}
