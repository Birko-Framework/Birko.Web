import { BaseComponent, define } from 'birko-web-core';
import { escapeAttr } from '../dom-utils';
import { slideNavSheet, srOnlySheet } from '../shared-styles';
import { SlideTrack, prefersReducedMotion } from './slide-track';

/**
 * Carousel over **slotted, server-rendered** slides — every light-DOM child element is one slide.
 *
 * The slides stay in the light DOM and the component only enhances them, so without JS (or before the
 * element upgrades) every slide is ordinary page content: the first is visible and none is hidden behind a
 * script. Scrolling is a native `scroll-snap` container (see `SlideTrack`), so swipe and momentum are the
 * browser's; a mouse can drag.
 *
 * Slides visible at once come from the `--b-carousel-per-view` custom property (default 1), which the
 * `per-view` attribute sets for 1–6. A consumer's own stylesheet wins over both, so responsive breakpoints are
 * plain CSS: `b-carousel.products { --b-carousel-per-view: 2 } @media (min-width: 48rem) { … 4 }`.
 *
 * One page of slides (or fewer) renders no arrows, no dots and no autoplay. WAI-ARIA carousel pattern:
 * the host region is a `carousel`, each slide a `group` / `slide` named "n of m", off-screen slides are
 * `inert`, and an autoplay never starts under `prefers-reduced-motion`, pauses on hover, stops for good when
 * keyboard focus enters, and always has a visible stop / start control.
 */
export class BCarousel extends BaseComponent {
  static get observedAttributes() {
    return [
      'label', 'autoplay', 'loop', 'per-view',
      'label-previous', 'label-next', 'label-play', 'label-pause',
    ];
  }

  static get sharedStyles() {
    return [slideNavSheet, srOnlySheet];
  }

  static get styles() {
    const perView = [1, 2, 3, 4, 5, 6].map((n) => `:host([per-view="${n}"]) { --b-carousel-per-view: ${n}; }`).join('\n');
    return `
      :host {
        display: block;
        --b-carousel-per-view: 1;
        --b-carousel-gap: var(--b-space-md, 0.75rem);
      }
      ${perView}
      .carousel { position: relative; }
      .stage { position: relative; }
      .viewport { gap: var(--b-carousel-gap); }
      ::slotted(*) {
        box-sizing: border-box;
        flex: 0 0 calc((100% - (var(--b-carousel-per-view) - 1) * var(--b-carousel-gap)) / var(--b-carousel-per-view));
        min-width: 0;
        scroll-snap-align: start;
      }
      .rotation { position: absolute; z-index: 1; top: var(--b-space-sm, 0.5rem); inset-inline-end: var(--b-space-sm, 0.5rem); }
    `;
  }

  private _index = 0;
  private _track: SlideTrack | null = null;
  private _timer: ReturnType<typeof setTimeout> | null = null;
  /** Stopped by focus entering or by the stop button; only the start button undoes it. */
  private _stopped = false;
  private _hovered = false;
  private _focusWithin = false;
  private _resize: ResizeObserver | null = null;
  private _lastPerView = 0;
  /** Slides this component has put attributes on — a removed one is no longer reachable through the host. */
  private _decorated = new Set<HTMLElement>();

  // ── public API ─────────────────────────────────────────────────────────────────────────────────────

  /** The first visible slide. */
  get index(): number { return this._index; }

  /** Show slide `index` (clamped to the last reachable one). */
  goTo(index: number): void { this.show(index, true); }

  next(): void {
    const max = this.maxIndex();
    if (this._index < max) this.show(this._index + 1, true);
    else if (this.boolAttr('loop')) this.show(0, true);
  }

  prev(): void {
    if (this._index > 0) this.show(this._index - 1, true);
    else if (this.boolAttr('loop')) this.show(this.maxIndex(), true);
  }

  // ── render ─────────────────────────────────────────────────────────────────────────────────────────

  render() {
    const count = this.slides().length;
    const multi = this.maxIndex() > 0;
    const label = this.attr('label');
    const role = this.label('label-carousel', 'bwc.carousel.carousel', 'carousel');
    const rotation = this.autoplayAllowed()
      ? `<button type="button" class="round-btn rotation" aria-label="${escapeAttr(this.rotationLabel())}">${this.rotationIcon()}</button>`
      : '';
    const arrows = multi ? `
        <button type="button" class="round-btn arrow prev" aria-label="${escapeAttr(this.label('label-previous', 'bwc.carousel.previous', 'Previous slide'))}"><span aria-hidden="true">&#8249;</span></button>
        <button type="button" class="round-btn arrow next" aria-label="${escapeAttr(this.label('label-next', 'bwc.carousel.next', 'Next slide'))}"><span aria-hidden="true">&#8250;</span></button>` : '';
    const positions = this.maxIndex() + 1;
    const dots = multi
      ? `<div class="dots">${Array.from({ length: positions }, (_, i) => `<button type="button" class="dot" data-index="${i}"
            aria-label="${escapeAttr(this.label('label-go-to', 'bwc.carousel.goTo', 'Slide {index}', { index: i + 1 }))}"
            aria-current="${i === this._index}"><span class="pip" aria-hidden="true"></span></button>`).join('')}</div>`
      : '';
    return `
      <section class="carousel" aria-roledescription="${escapeAttr(role)}"${label ? ` aria-label="${escapeAttr(label)}"` : ''} data-count="${count}">
        ${rotation}
        <div class="stage">
          <div class="viewport"><slot></slot></div>
          ${arrows}
        </div>
        ${dots}
        <span class="sr-only" role="status" aria-live="polite"></span>
      </section>`;
  }

  protected onUpdated() {
    const viewport = this.$<HTMLElement>('.viewport');
    if (!viewport) return;

    this._track?.dispose();
    this._track = new SlideTrack({
      viewport,
      slides: () => this.slides(),
      perView: () => this.perView(),
      onSettle: (i) => { if (i !== this._index) this.setIndex(i, true); },
    });
    this._track.bind((t, ev, h, opts) => this.listen(t, ev, h, opts));

    const slot = this.$<HTMLSlotElement>('slot');
    if (slot) this.listen(slot, 'slotchange', () => this.onSlidesChanged());

    const prev = this.$('.prev');
    const next = this.$('.next');
    if (prev) this.listen(prev, 'click', () => { this.prev(); this.restartAutoplay(); });
    if (next) this.listen(next, 'click', () => { this.next(); this.restartAutoplay(); });
    for (const dot of this.$$<HTMLButtonElement>('.dot')) {
      this.listen(dot, 'click', () => { this.goTo(Number(dot.dataset.index)); this.restartAutoplay(); });
    }
    const rotation = this.$('.rotation');
    if (rotation) this.listen(rotation, 'click', () => {
      this._stopped = !this._stopped;
      this.syncRotation();
      this.syncAutoplay();
    });

    // Hover pauses for as long as it lasts; focus entering stops until the user presses start (APG).
    this.listen<PointerEvent>(this, 'pointerenter', (e) => { if (e.pointerType === 'mouse') { this._hovered = true; this.syncAutoplay(); } });
    this.listen<PointerEvent>(this, 'pointerleave', () => { this._hovered = false; this.syncAutoplay(); });
    this.listen(this, 'focusin', () => {
      if (!this._focusWithin) { this._focusWithin = true; this._stopped = true; this.syncRotation(); this.syncAutoplay(); }
    });
    this.listen(this, 'focusout', () => {
      setTimeout(() => { this._focusWithin = this.matches(':focus-within'); }, 0);
    });
    this.listen(document, 'visibilitychange', () => this.syncAutoplay());

    if (this._index > this.maxIndex()) this._index = this.maxIndex();
    this.syncSlides();
    this.syncControls();
    // A re-render (resize, slide added) can leave the scroll between slides; put it back without animation.
    if (this._track.nearestIndex() !== this._index) this._track.scrollTo(this._index, false);
    this.syncAutoplay();
  }

  protected onMount() {
    this._lastPerView = this.perView();
    this._resize = new ResizeObserver(() => {
      const pv = this.perView();
      if (pv !== this._lastPerView) { this._lastPerView = pv; this.update(); return; }
      this._track?.scrollTo(this._index, false);
    });
    this._resize.observe(this);
  }

  protected onUnmount() {
    this._track?.dispose();
    this._resize?.disconnect();
    this._resize = null;
    this.clearTimer();
  }

  // ── state ──────────────────────────────────────────────────────────────────────────────────────────

  private slides(): HTMLElement[] {
    return Array.from(this.children).filter((c): c is HTMLElement => c instanceof HTMLElement && c.slot === '');
  }

  private perView(): number {
    const raw = parseFloat(getComputedStyle(this).getPropertyValue('--b-carousel-per-view'));
    return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
  }

  private maxIndex(): number {
    return Math.max(0, this.slides().length - this.perView());
  }

  /** Navigate: update state at once (so quick presses accumulate), then scroll. */
  private show(index: number, user: boolean): void {
    const i = Math.max(0, Math.min(this.maxIndex(), index));
    if (i !== this._index) this.setIndex(i, user);
    this._track?.scrollTo(i);
  }

  private setIndex(i: number, user: boolean): void {
    this._index = i;
    this.syncSlides();
    this.syncControls();
    this.emit('slide-change', { index: i });
    if (user) {
      const status = this.$('[role="status"]');
      if (status) status.textContent = this.label('label-status', 'bwc.carousel.status', 'Slide {index} of {count}',
        { index: i + 1, count: this.slides().length });
    }
  }

  private onSlidesChanged(): void {
    // A slide that left must not keep the attributes this component put on it.
    for (const el of Array.from(this._decorated)) {
      if (el.parentElement !== this) this.undecorate(el);
    }
    this.update();
  }

  /**
   * Name each slide "n of m" and make the ones out of view `inert`, so Tab never lands in a slide nobody can
   * see. A consumer's own `role` / `aria-label` on a slide is left alone; ours are marked so they can be
   * updated and removed.
   */
  private syncSlides(): void {
    const slides = this.slides();
    const perView = this.perView();
    const multi = this.maxIndex() > 0;
    const roleSlide = this.label('label-slide', 'bwc.carousel.slide', 'slide');
    slides.forEach((s, i) => {
      if (!s.hasAttribute('data-b-slide')) {
        this._decorated.add(s);
        s.setAttribute('data-b-slide', '');
        if (!s.hasAttribute('role')) s.setAttribute('data-b-slide-role', '');
        if (!s.hasAttribute('aria-label') && !s.hasAttribute('aria-labelledby')) s.setAttribute('data-b-slide-label', '');
      }
      if (s.hasAttribute('data-b-slide-role')) s.setAttribute('role', 'group');
      s.setAttribute('aria-roledescription', roleSlide);
      if (s.hasAttribute('data-b-slide-label')) {
        s.setAttribute('aria-label', this.label('label-slide-name', 'bwc.carousel.slideLabel', '{index} of {count}', { index: i + 1, count: slides.length }));
      }
      s.inert = multi && (i < this._index || i >= this._index + perView);
    });
  }

  private undecorate(s: HTMLElement): void {
    if (s.hasAttribute('data-b-slide-role')) s.removeAttribute('role');
    if (s.hasAttribute('data-b-slide-label')) s.removeAttribute('aria-label');
    s.removeAttribute('aria-roledescription');
    s.removeAttribute('data-b-slide');
    s.removeAttribute('data-b-slide-role');
    s.removeAttribute('data-b-slide-label');
    s.inert = false;
    this._decorated.delete(s);
  }

  private syncControls(): void {
    const loop = this.boolAttr('loop');
    const max = this.maxIndex();
    const prev = this.$<HTMLButtonElement>('.prev');
    const next = this.$<HTMLButtonElement>('.next');
    if (prev) prev.disabled = !loop && this._index <= 0;
    if (next) next.disabled = !loop && this._index >= max;
    for (const dot of this.$$<HTMLButtonElement>('.dot')) {
      dot.setAttribute('aria-current', String(Number(dot.dataset.index) === this._index));
    }
  }

  // ── autoplay ───────────────────────────────────────────────────────────────────────────────────────

  /** Autoplay exists at all: asked for, more than one page, and the user has not asked for less motion. */
  private autoplayAllowed(): boolean {
    return this.hasAttribute('autoplay') && this.maxIndex() > 0 && !prefersReducedMotion();
  }

  private get playing(): boolean {
    return this.autoplayAllowed() && !this._stopped;
  }

  private interval(): number {
    const ms = parseInt(this.attr('autoplay'), 10);
    return Number.isFinite(ms) && ms > 0 ? Math.max(100, ms) : 5000;
  }

  private syncAutoplay(): void {
    const run = this.playing && !this._hovered && document.visibilityState !== 'hidden' && this.isConnected;
    if (!run) { this.clearTimer(); return; }
    if (this._timer) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      // Autoplay always wraps — it would otherwise stop at the end with nothing telling the user why.
      this.show(this._index >= this.maxIndex() ? 0 : this._index + 1, false);
      this.syncAutoplay();
    }, this.interval());
  }

  /** A manual move restarts the countdown, so the next automatic step is a full interval away. */
  private restartAutoplay(): void {
    this.clearTimer();
    this.syncAutoplay();
  }

  private clearTimer(): void {
    if (this._timer) clearTimeout(this._timer);
    this._timer = null;
  }

  private rotationLabel(): string {
    return this.playing
      ? this.label('label-pause', 'bwc.carousel.pause', 'Stop automatic slide show')
      : this.label('label-play', 'bwc.carousel.play', 'Start automatic slide show');
  }

  private rotationIcon(): string {
    return `<span aria-hidden="true">${this.playing ? '&#10074;&#10074;' : '&#9654;'}</span>`;
  }

  private syncRotation(): void {
    const btn = this.$('.rotation');
    if (!btn) return;
    btn.setAttribute('aria-label', this.rotationLabel());
    btn.innerHTML = this.rotationIcon();
  }
}

define('b-carousel', BCarousel);
