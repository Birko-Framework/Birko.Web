/**
 * The pointer half of a reorderable list (mouse, pen, touch), shared by `b-sortable-list` and `b-tree-menu`
 * (TASK-789). It arms a press, starts the drag, moves the row under the pointer, scrolls at the edges and ends it;
 * the host decides where the row would land (`move`) and what a drop does (`end`). Keyboard reordering stays in
 * each host, as its moves differ.
 */

/** The grip drawn on a draggable row's handle. */
export const GRIP_ICON = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="6" cy="3.5" r="1.2"/><circle cx="10" cy="3.5" r="1.2"/><circle cx="6" cy="8" r="1.2"/><circle cx="10" cy="8" r="1.2"/><circle cx="6" cy="12.5" r="1.2"/><circle cx="10" cy="12.5" r="1.2"/></svg>';

/** A press on one of these inside a row is the row's own control, never the start of a drag. */
const INTERACTIVE = 'a[href], button, input, select, textarea, label, [contenteditable=""], [contenteditable="true"], [role="button"]';
/** On touch, a row (not its handle) drags after a still press this long, so a swipe still scrolls the page. */
const HOLD_MS = 350;
/** Distance from the scroller's edge at which a drag scrolls it. */
const EDGE_PX = 48;

export interface PointerDragState {
  /** The element that moves with the pointer. */
  el: HTMLElement;
  id: string;
  pointerId: number;
  x0: number; y0: number; x: number; y: number;
  armed: boolean;
  started: boolean;
  timer?: ReturnType<typeof setTimeout>;
  raf?: number;
  scroller?: Element;
  scroll0: number;
}

export interface PointerDragOptions {
  /** The component; a drag's closing click is swallowed on it, and the touch guard is set on it. */
  host: HTMLElement;
  /** From a press's composed path, the element to drag and its id; null when the press is not on a row. */
  row(path: EventTarget[]): { el: HTMLElement; id: string } | null;
  /** The class of the grip inside a row. */
  handleClass: string;
  /** Only the grip starts a drag. */
  handleOnly(): boolean;
  /** The host's own scroll box, used when it scrolls; otherwise the nearest scrolling ancestor, else the page. */
  ownScroller?(): Element | null;
  /** Called on a press that will drag, before anything moves (e.g. to drop a keyboard pick-up). */
  press?(): void;
  /** The drag has started (moved past 4 px). */
  start(state: PointerDragState): void;
  /** The pointer is at (state.x, state.y): show where the row would land. */
  move(state: PointerDragState): void;
  /** The drag ended; `cancelled` by Escape, a lost pointer or a swipe. Called only for a started drag. */
  end(state: PointerDragState, cancelled: boolean): void;
}

type Listen = <E extends Event>(target: EventTarget, type: string, fn: (e: E) => void, options?: AddEventListenerOptions) => void;

export class PointerDrag {
  private _state: PointerDragState | null = null;

  constructor(private readonly _opts: PointerDragOptions) {}

  /** The drag in progress, armed or started. */
  get state(): PointerDragState | null { return this._state; }

  /** Wire the press, move and end listeners on `container` and the guards around it, through the host's `listen`. */
  wire(container: Element, listen: Listen): void {
    listen<PointerEvent>(container, 'pointerdown', (e) => this._down(e));
    listen<PointerEvent>(container, 'pointermove', (e) => this._move(e));
    listen<PointerEvent>(container, 'pointerup', (e) => { if (e.pointerId === this._state?.pointerId) this.finish(false); });
    listen<PointerEvent>(container, 'pointercancel', (e) => { if (e.pointerId === this._state?.pointerId) this.finish(true); });
    // A touch hold would otherwise open the browser's context menu (Android) mid-drag.
    listen<MouseEvent>(container, 'contextmenu', (e) => { if (this._state) e.preventDefault(); });
    // A row armed for a touch drag must not scroll the page under the finger.
    listen<TouchEvent>(this._opts.host, 'touchmove', (e) => { if (this._state?.armed) e.preventDefault(); }, { passive: false });
    listen<KeyboardEvent>(document, 'keydown', (e) => { if (e.key === 'Escape' && this._state?.started) this.finish(true); });
  }

  private _down(e: PointerEvent): void {
    if (e.button !== 0 || this._state) return;
    const path = e.composedPath();
    const row = this._opts.row(path);
    if (!row) return;
    const inside = path.slice(0, path.indexOf(row.el)).filter((n): n is Element => n instanceof Element);
    const onHandle = inside.some((n) => n.classList.contains(this._opts.handleClass));
    if (!onHandle && (this._opts.handleOnly() || inside.some((n) => n.matches(INTERACTIVE)))) return;
    this._opts.press?.();
    const s: PointerDragState = {
      el: row.el, id: row.id, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY,
      armed: onHandle || e.pointerType !== 'touch', started: false, scroll0: 0,
    };
    this._state = s;
    if (s.armed) {
      e.preventDefault(); // no text selection, no native drag of an image in the row
      row.el.setPointerCapture(e.pointerId);
      return;
    }
    s.timer = setTimeout(() => {
      if (this._state !== s) return;
      s.armed = true;
      s.el.classList.add('pressing');
      try { s.el.setPointerCapture(s.pointerId); } catch { /* the pointer is gone */ }
      navigator.vibrate?.(10);
    }, HOLD_MS);
  }

  private _move(e: PointerEvent): void {
    const s = this._state;
    if (!s || e.pointerId !== s.pointerId) return;
    s.x = e.clientX;
    s.y = e.clientY;
    const moved = Math.hypot(s.x - s.x0, s.y - s.y0);
    if (!s.armed) {
      if (moved > 8) this.finish(true); // a swipe: the page scrolls
      return;
    }
    if (!s.started) {
      if (moved < 4) return;
      s.started = true;
      s.el.classList.remove('pressing');
      s.el.classList.add('dragging');
      s.scroller = this._scrollTarget();
      s.scroll0 = s.scroller.scrollTop;
      this._opts.start(s);
      s.raf = requestAnimationFrame(() => this._autoScroll());
    }
    this._follow();
  }

  private _follow(): void {
    const s = this._state;
    if (!s?.started) return;
    const scrolled = (s.scroller?.scrollTop ?? 0) - s.scroll0;
    s.el.style.transform = `translate(${s.x - s.x0}px, ${s.y - s.y0 + scrolled}px) scale(1.02)`;
    this._opts.move(s);
  }

  /** The host's own scroller when it scrolls, else the nearest scrolling ancestor, else the page. */
  private _scrollTarget(): Element {
    const own = this._opts.ownScroller?.();
    if (own && own.scrollHeight > own.clientHeight + 1) return own;
    let node: Node | null = this._opts.host;
    while (node) {
      node = node.parentNode instanceof ShadowRoot ? node.parentNode.host : node.parentNode;
      if (!(node instanceof Element)) break;
      const oy = getComputedStyle(node).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight + 1) return node;
    }
    return document.scrollingElement ?? document.documentElement;
  }

  private _autoScroll(): void {
    const s = this._state;
    if (!s?.started || !s.scroller) return;
    const sc = s.scroller;
    const page = sc === document.scrollingElement || sc === document.documentElement;
    const top = page ? 0 : sc.getBoundingClientRect().top;
    const bottom = page ? window.innerHeight : sc.getBoundingClientRect().bottom;
    let v = 0;
    if (s.y < top + EDGE_PX) v = -Math.ceil((top + EDGE_PX - s.y) / 4);
    else if (s.y > bottom - EDGE_PX) v = Math.ceil((s.y - (bottom - EDGE_PX)) / 4);
    if (v) {
      const before = sc.scrollTop;
      sc.scrollTop += Math.max(-24, Math.min(24, v));
      if (sc.scrollTop !== before) this._follow();
    }
    s.raf = requestAnimationFrame(() => this._autoScroll());
  }

  /** End the drag, armed or started. A started one reaches the host's `end`, and its closing click is swallowed. */
  finish(cancelled: boolean): void {
    const s = this._state;
    if (!s) return;
    this._state = null;
    clearTimeout(s.timer);
    if (s.raf) cancelAnimationFrame(s.raf);
    s.el.classList.remove('pressing', 'dragging');
    s.el.style.transform = '';
    if (!s.started) return;
    // The press that ended the drag is not also a click on the row's content.
    const host = this._opts.host;
    const swallow = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
    host.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => host.removeEventListener('click', swallow, { capture: true }), 0);
    this._opts.end(s, cancelled);
  }
}
