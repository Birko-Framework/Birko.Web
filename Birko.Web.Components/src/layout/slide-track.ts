/**
 * The scrolling half of a slide viewer, shared by `b-carousel` and `b-gallery`.
 *
 * The viewport is a native horizontal scroll container with `scroll-snap`, so touch swipe, trackpad and
 * momentum come from the browser rather than from a hand-rolled gesture engine. This adds the three things
 * the browser does not: which slide the scroll has **settled** on, scrolling **to** a slide without
 * scrolling the page, and dragging with a **mouse** (desktop has no native drag-to-scroll).
 */

type Listen = (target: EventTarget, event: string, handler: (e: Event) => void, options?: AddEventListenerOptions) => void;

export interface SlideTrackOptions {
  /** The scroll container. Its direct (or slotted) children are the slides. */
  viewport: HTMLElement;
  /** The slides, in order. */
  slides: () => HTMLElement[];
  /** Slides visible at once; the last reachable index is `count - perView`. */
  perView: () => number;
  /** Called when a scroll — swipe, drag or programmatic — comes to rest, with the slide it rests on. */
  onSettle: (index: number) => void;
}

/** A drag must travel this far before it counts as a swipe rather than a click. */
const DRAG_THRESHOLD_PX = 5;
/** A released drag this far from where it started moves one slide, even short of halfway. */
const FLICK_PX = 40;
/** Fallback settle delay for engines without `scrollend`. */
const SETTLE_MS = 150;

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export class SlideTrack {
  private _settleTimer: ReturnType<typeof setTimeout> | null = null;
  private _drag: { x: number; scroll: number; from: number; moved: boolean; id: number } | null = null;
  private _suppressClick = false;

  constructor(private readonly o: SlideTrackOptions) {}

  get count(): number { return this.o.slides().length; }

  get maxIndex(): number {
    return Math.max(0, this.count - Math.max(1, Math.floor(this.o.perView())));
  }

  /** The slide's scroll offset inside the viewport — measured, so gaps and per-view widths need no maths here. */
  private offsetOf(slide: HTMLElement): number {
    const vp = this.o.viewport;
    return slide.getBoundingClientRect().left - vp.getBoundingClientRect().left + vp.scrollLeft;
  }

  /** The reachable slide whose start is nearest the current scroll position. */
  nearestIndex(): number {
    const vp = this.o.viewport;
    const slides = this.o.slides();
    const max = this.maxIndex;
    // At the very end the last page may not align to a slide start (snap stops at the edge).
    if (vp.scrollLeft >= vp.scrollWidth - vp.clientWidth - 1 && vp.scrollWidth > vp.clientWidth) return max;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i <= max && i < slides.length; i++) {
      const d = Math.abs(this.offsetOf(slides[i]) - vp.scrollLeft);
      if (d < bestDist) { best = i; bestDist = d; }
    }
    return best;
  }

  /** Scroll the viewport (never the page) to slide `index`, clamped. Smooth unless reduced motion. */
  scrollTo(index: number, smooth = true): void {
    const slides = this.o.slides();
    const i = Math.max(0, Math.min(this.maxIndex, index));
    const slide = slides[i];
    if (!slide) return;
    const behavior: ScrollBehavior = smooth && !prefersReducedMotion() ? 'smooth' : 'auto';
    this.o.viewport.scrollTo({ left: this.offsetOf(slide), behavior });
    if (behavior === 'auto') this.scheduleSettle(0);
  }

  /** Wire scroll settling and mouse drag. Call after every render, with the component's `listen`. */
  bind(listen: Listen): void {
    const vp = this.o.viewport;
    listen(vp, 'scroll', () => { if (!this._drag) this.scheduleSettle(SETTLE_MS); }, { passive: true });
    listen(vp, 'scrollend', () => { if (!this._drag) this.scheduleSettle(0); });

    listen(vp, 'pointerdown', (e) => {
      const pe = e as PointerEvent;
      // Touch and pen scroll natively; only a mouse needs the drag.
      if (pe.pointerType !== 'mouse' || pe.button !== 0 || this.count < 2) return;
      this._drag = { x: pe.clientX, scroll: vp.scrollLeft, from: this.nearestIndex(), moved: false, id: pe.pointerId };
    });
    listen(vp, 'pointermove', (e) => {
      const pe = e as PointerEvent;
      const d = this._drag;
      if (!d || pe.pointerId !== d.id) return;
      const dx = pe.clientX - d.x;
      if (!d.moved && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      if (!d.moved) {
        d.moved = true;
        vp.classList.add('dragging');
        try { vp.setPointerCapture(d.id); } catch { /* a synthetic pointer has nothing to capture */ }
      }
      vp.scrollLeft = d.scroll - dx;
    });
    const end = (e: Event) => {
      const pe = e as PointerEvent;
      const d = this._drag;
      if (!d || pe.pointerId !== d.id) return;
      this._drag = null;
      if (!d.moved) return;
      vp.classList.remove('dragging');
      try { vp.releasePointerCapture(d.id); } catch { /* see above */ }
      // A drag ends in a click on whatever was under the pointer; a slide that is a link must not follow it.
      this._suppressClick = true;
      setTimeout(() => { this._suppressClick = false; }, 0);
      const dx = d.x - pe.clientX;
      const target = Math.abs(dx) >= FLICK_PX && this.nearestIndex() === d.from
        ? d.from + Math.sign(dx)
        : this.nearestIndex();
      this.scrollTo(target);
    };
    listen(vp, 'pointerup', end);
    listen(vp, 'pointercancel', end);
    listen(vp, 'click', (e) => {
      if (!this._suppressClick) return;
      e.preventDefault();
      e.stopPropagation();
    }, { capture: true });
    // Images and links are draggable by default, which would hijack the mouse drag.
    listen(vp, 'dragstart', (e) => e.preventDefault());
  }

  private scheduleSettle(ms: number): void {
    if (this._settleTimer) clearTimeout(this._settleTimer);
    this._settleTimer = setTimeout(() => {
      this._settleTimer = null;
      this.o.onSettle(this.nearestIndex());
    }, ms);
  }

  dispose(): void {
    if (this._settleTimer) clearTimeout(this._settleTimer);
    this._settleTimer = null;
  }
}
