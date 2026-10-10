import { BaseComponent, define } from 'birko-web-core';
import { announce, escapeAttr } from '../dom-utils';
import { closeButtonSheet, dialogBaseSheet, slideNavSheet, srOnlySheet } from '../shared-styles';
import { SlideTrack } from './slide-track';

/**
 * Product image gallery over **slotted, server-rendered `<img>` elements** — one main image at a time,
 * thumbnails (dots in a narrow container), arrows, swipe, and a zoom dialog.
 *
 * Each light-DOM child is one image: an `<img>` with `alt` (or an element wrapping one). Optional per-image
 * attributes: `data-thumb` (a small URL for the thumbnail strip) and `data-full` (a large URL for the zoom);
 * both fall back to the image's own `currentSrc` / `src`. Without JS the images are ordinary content and the
 * first (primary) one is visible.
 *
 * `index` / `show(i)` let a consumer switch the image from outside — a variant picker calls `show()` with the
 * variant's image; `image-change` reports every change. Scrolling is shared with `b-carousel` (`SlideTrack`).
 */
export class BGallery extends BaseComponent {
  static get observedAttributes() {
    return [
      'label', 'index',
      'label-previous', 'label-next', 'label-zoom', 'label-close', 'label-image',
    ];
  }

  static get sharedStyles() {
    return [slideNavSheet, dialogBaseSheet, closeButtonSheet, srOnlySheet];
  }

  static get styles() {
    return `
      /* width: 100% — the .gallery is a size container (for the thumbs-to-dots query), and a size container takes no
         width from its content: in a shrink-to-fit parent (a centred flex column — the Playground card, measured
         0px wide on the owner's walkthrough) the whole gallery collapsed. A consumer's own width still wins. */
      :host {
        display: block;
        width: 100%;
        min-width: 0;
        --b-gallery-aspect-ratio: 1;
        --b-gallery-thumb-size: 4rem;
      }
      .gallery { container-type: inline-size; }
      .stage { position: relative; }
      ::slotted(*) {
        box-sizing: border-box;
        flex: 0 0 100%;
        min-width: 0;
        scroll-snap-align: start;
        cursor: zoom-in;
      }
      ::slotted(img) {
        display: block;
        width: 100%;
        height: auto;
        aspect-ratio: var(--b-gallery-aspect-ratio);
        object-fit: contain;
      }
      .zoom-btn { position: absolute; z-index: 1; bottom: var(--b-space-sm, 0.5rem); inset-inline-end: var(--b-space-sm, 0.5rem); }
      .thumbs {
        display: flex;
        gap: var(--b-space-xs, 0.25rem);
        margin-top: var(--b-space-sm, 0.5rem);
        overflow-x: auto;
        scrollbar-width: thin;
      }
      .thumb {
        flex: none;
        box-sizing: border-box;
        width: var(--b-gallery-thumb-size);
        height: var(--b-gallery-thumb-size);
        padding: 0;
        border: var(--b-border-width, 1px) solid var(--b-border);
        border-radius: var(--b-radius, 0.375rem);
        background: var(--b-bg);
        overflow: hidden;
        cursor: pointer;
        opacity: 0.7;
      }
      .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .thumb[aria-current="true"] { opacity: 1; border-color: var(--b-color-primary); box-shadow: 0 0 0 1px var(--b-color-primary); }
      .thumb:focus-visible { outline: none; box-shadow: var(--b-focus-ring); opacity: 1; }
      .thumb .pip { display: none; }
      /* A phone-width container trades thumbnails for dots: the same buttons, drawn as dots. 24rem, not 30rem: in a
         container query rem is the ROOT size, so 30rem was 420px under a 14px root and a ~410px desktop product
         column got dots (owner's walkthrough). A phone column (~343px) is under 24rem at a 14px or 16px root. */
      @container (max-width: 24rem) {
        .thumbs { justify-content: center; gap: var(--b-space-2xs, 0.125rem); margin-top: var(--b-space-xs, 0.25rem); }
        .thumb {
          display: inline-flex; align-items: center; justify-content: center;
          width: auto; height: auto; min-width: max(1.5rem, 24px); min-height: max(1.5rem, 24px);
          border: none; border-radius: var(--b-radius-full, 9999px); background: none; opacity: 1;
        }
        .thumb[aria-current="true"] { box-shadow: none; }
        .thumb img { display: none; }
        .thumb .pip {
          display: block;
          width: var(--b-space-sm, 0.5rem);
          height: var(--b-space-sm, 0.5rem);
          border-radius: var(--b-radius-full, 9999px);
          background: var(--b-border);
        }
        .thumb[aria-current="true"] .pip { background: var(--b-color-primary); }
      }
      /* Responsive zoom (owner's choice, 2026-10-10): full-screen on a phone, where every pixel belongs to the
         image; from 48rem a framed panel with the dialog backdrop around it, which a click closes. */
      /* Pinned to the four edges, not sized in vw: 100vw is the screen's width, and a page that overflows sideways
         (measured: 433px of page on a 390px phone) is laid out wider than that, so a 100vw zoom sat centred with a
         strip of backdrop either side (owner's phone, 2026-10-10). inset: 0 covers whatever the viewport is. */
      .zoom {
        position: fixed;
        inset: 0;
        margin: 0;
        width: auto;
        height: auto;
        background: var(--b-bg);
      }
      @media (min-width: 48rem) {
        .zoom {
          /* still inset: 0 — with a fixed width and height, margin: auto centres it between the edges */
          margin: auto;
          width: min(90vw, 72rem);
          height: min(90dvh, 54rem);
          border-radius: var(--b-radius-lg, 0.5rem);
          box-shadow: var(--b-shadow-xl);
          overflow: hidden;
        }
      }
      .zoom-inner { position: relative; width: 100%; height: 100%; display: flex; flex-direction: column; }
      .zoom-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--b-space-sm, 0.5rem);
        padding: var(--b-space-sm, 0.5rem) var(--b-space-md, 0.75rem);
      }
      .zoom-count { color: var(--b-text-secondary); font-variant-numeric: tabular-nums; }
      .zoom-pane { position: relative; flex: 1; min-height: 0; overflow: auto; display: grid; place-items: center; }
      .zoom-img { max-width: 100%; max-height: 100%; object-fit: contain; cursor: zoom-in; }
      .zoom-pane.magnified { place-items: start; }
      .zoom-pane.magnified .zoom-img { max-width: none; max-height: none; width: 200%; cursor: zoom-out; }
      .zoom .arrow { top: 50%; }
    `;
  }

  private _index = 0;
  private _track: SlideTrack | null = null;
  private _resize: ResizeObserver | null = null;
  private _startApplied = false;

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (name === 'index' && this._startApplied) {
      const i = parseInt(newValue ?? '', 10);
      if (Number.isFinite(i)) this.goTo(i, false);
      return;
    }
    super.attributeChangedCallback(name, oldValue, newValue);
  }

  // ── public API ─────────────────────────────────────────────────────────────────────────────────────

  get index(): number { return this._index; }

  /** Show image `index` (clamped). For a variant switch: `gallery.show(images.indexOf(variantImage))`. */
  show(index: number): void { this.goTo(index, true); }

  /** Open the zoom dialog on the current image. */
  openZoom(): void {
    const dialog = this.$<HTMLDialogElement>('dialog.zoom');
    if (!dialog || !this.images().length) return;
    this.fillZoom();
    if (!dialog.open) dialog.showModal();
    this.emit('zoom-open', { index: this._index });
  }

  closeZoom(): void {
    const dialog = this.$<HTMLDialogElement>('dialog.zoom');
    if (dialog?.open) dialog.close();
  }

  // ── render ─────────────────────────────────────────────────────────────────────────────────────────

  render() {
    const slides = this.slides();
    const multi = slides.length > 1;
    const label = this.attr('label');
    const prevLabel = escapeAttr(this.label('label-previous', 'bwc.gallery.previous', 'Previous image'));
    const nextLabel = escapeAttr(this.label('label-next', 'bwc.gallery.next', 'Next image'));
    const arrows = (cls: string) => multi ? `
          <button type="button" class="round-btn arrow prev ${cls}" aria-label="${prevLabel}"><span aria-hidden="true">&#8249;</span></button>
          <button type="button" class="round-btn arrow next ${cls}" aria-label="${nextLabel}"><span aria-hidden="true">&#8250;</span></button>` : '';
    const thumbs = multi
      ? `<div class="thumbs" role="group" aria-label="${escapeAttr(this.label('label-images', 'bwc.gallery.images', 'Images'))}">${slides.map((s, i) => {
          const img = this.imgOf(s);
          const src = img?.dataset.thumb || img?.currentSrc || img?.getAttribute('src') || '';
          return `<button type="button" class="thumb" data-index="${i}" aria-label="${escapeAttr(this.imageName(i))}"
              aria-current="${i === this._index}">${src ? `<img src="${escapeAttr(src)}" alt="" loading="lazy" draggable="false">` : ''}<span class="pip" aria-hidden="true"></span></button>`;
        }).join('')}</div>`
      : '';
    const zoomLabel = escapeAttr(this.label('label-zoom', 'bwc.gallery.zoom', 'Enlarge image'));
    return `
      <section class="gallery"${label ? ` aria-label="${escapeAttr(label)}"` : ''}>
        <div class="stage">
          <div class="viewport"><slot></slot></div>
          ${arrows('main')}
          ${slides.length ? `<button type="button" class="round-btn zoom-btn" aria-label="${zoomLabel}" aria-haspopup="dialog"><span aria-hidden="true">&#x2922;</span></button>` : ''}
        </div>
        ${thumbs}
        <span class="sr-only" role="status" aria-live="polite"></span>
        <dialog class="zoom">
          <div class="zoom-inner">
            <div class="zoom-bar">
              <span class="zoom-count"></span>
              <button type="button" class="close-btn" aria-label="${escapeAttr(this.label('label-close', 'bwc.common.close', 'Close'))}">&times;</button>
            </div>
            <div class="zoom-pane"><img class="zoom-img" alt=""></div>
            ${arrows('in-zoom')}
          </div>
        </dialog>
      </section>`;
  }

  protected onUpdated() {
    const viewport = this.$<HTMLElement>('.viewport');
    if (!viewport) return;

    this._track?.dispose();
    this._track = new SlideTrack({
      viewport,
      slides: () => this.slides(),
      perView: () => 1,
      onSettle: (i) => { if (i !== this._index) this.setIndex(i, true); },
    });
    this._track.bind((t, ev, h, opts) => this.listen(t, ev, h, opts));

    const slot = this.$<HTMLSlotElement>('slot');
    if (slot) this.listen(slot, 'slotchange', () => this.update());
    // A click on the image itself opens the zoom; the click that ends a mouse drag never gets here.
    this.listen(viewport, 'click', (e) => { if (e.target !== viewport) this.openZoom(); });

    for (const btn of this.$$<HTMLButtonElement>('.prev')) this.listen(btn, 'click', () => this.goTo(this._index - 1, true));
    for (const btn of this.$$<HTMLButtonElement>('.next')) this.listen(btn, 'click', () => this.goTo(this._index + 1, true));
    for (const thumb of this.$$<HTMLButtonElement>('.thumb')) {
      this.listen(thumb, 'click', () => this.goTo(Number(thumb.dataset.index), true));
    }
    const zoomBtn = this.$('.zoom-btn');
    if (zoomBtn) this.listen(zoomBtn, 'click', () => this.openZoom());

    const dialog = this.$<HTMLDialogElement>('dialog.zoom');
    if (dialog) {
      const close = this.$('.close-btn');
      if (close) this.listen(close, 'click', () => dialog.close());
      // Escape is the native dialog's own cancel; whichever way it closes, focus goes back to the trigger.
      this.listen(dialog, 'close', () => {
        this.$('.zoom-pane')?.classList.remove('magnified');
        this.$<HTMLElement>('.zoom-btn')?.focus();
        this.emit('zoom-close', { index: this._index });
      });
      // A click on the backdrop (the dialog box itself, outside the content) closes too.
      this.listen<MouseEvent>(dialog, 'click', (e) => { if (e.target === dialog) dialog.close(); });
      const pane = this.$('.zoom-pane');
      const img = this.$<HTMLImageElement>('.zoom-img');
      if (pane && img) {
        this.listen<MouseEvent>(img, 'click', (e) => this.toggleMagnify(pane, img, e));
        // Opt-in: the zoom fills the screen, so there is no backdrop — `zoom-close-outside` makes the empty space
        // around the image close it, lightbox-style. Off by default, so a stray tap beside the image while panning
        // a magnified picture does not throw the user out (owner's choice, 2026-10-10).
        this.listen<MouseEvent>(pane, 'click', (e) => {
          if (e.target === pane && this.hasAttribute('zoom-close-outside')) dialog.close();
        });
      }
    }

    // The `index` attribute is the starting image; later changes go through attributeChangedCallback, so an
    // unrelated re-render never snaps the gallery back to it.
    if (!this._startApplied) {
      this._startApplied = true;
      const start = parseInt(this.attr('index'), 10);
      if (Number.isFinite(start)) this._index = start;
    }
    this._index = this.clamp(this._index);
    this.syncSlides();
    this.syncControls();
    if (this._track.nearestIndex() !== this._index) this._track.scrollTo(this._index, false);
  }

  protected onMount() {
    this._resize = new ResizeObserver(() => this._track?.scrollTo(this._index, false));
    this._resize.observe(this);
  }

  protected onUnmount() {
    this._track?.dispose();
    this._resize?.disconnect();
    this._resize = null;
  }

  // ── state ──────────────────────────────────────────────────────────────────────────────────────────

  private slides(): HTMLElement[] {
    return Array.from(this.children).filter((c): c is HTMLElement => c instanceof HTMLElement && c.slot === '');
  }

  private images(): HTMLImageElement[] {
    return this.slides().map((s) => this.imgOf(s)).filter((i): i is HTMLImageElement => !!i);
  }

  private imgOf(slide: HTMLElement): HTMLImageElement | null {
    return slide instanceof HTMLImageElement ? slide : slide.querySelector('img');
  }

  /** The image's alt, or "Image n" — a thumbnail button must have a name. */
  private imageName(i: number): string {
    const alt = this.imgOf(this.slides()[i])?.alt?.trim();
    return alt || this.label('label-image', 'bwc.gallery.image', 'Image {index}', { index: i + 1 });
  }

  private clamp(i: number): number {
    return Math.max(0, Math.min(this.slides().length - 1, i));
  }

  private goTo(index: number, user: boolean): void {
    const count = this.slides().length;
    if (!count) return;
    const i = this.clamp(index);
    if (i !== this._index) this.setIndex(i, user);
    this._track?.scrollTo(i);
  }

  private setIndex(i: number, user: boolean): void {
    this._index = i;
    this.syncSlides();
    this.syncControls();
    if (this.$<HTMLDialogElement>('dialog.zoom')?.open) this.fillZoom();
    this.emit('image-change', { index: i });
    if (user) {
      announce(this, this.label('label-status', 'bwc.gallery.status', 'Image {index} of {count}: {name}',
        { index: i + 1, count: this.slides().length, name: this.imageName(i) }), this.$('[role="status"]'));
    }
  }

  /** Images out of view are inert; the thumbnails name every image, so nothing is lost to a screen reader. */
  private syncSlides(): void {
    const slides = this.slides();
    slides.forEach((s, i) => { s.inert = slides.length > 1 && i !== this._index; });
  }

  private syncControls(): void {
    const max = this.slides().length - 1;
    for (const b of this.$$<HTMLButtonElement>('.prev')) b.disabled = this._index <= 0;
    for (const b of this.$$<HTMLButtonElement>('.next')) b.disabled = this._index >= max;
    for (const t of this.$$<HTMLButtonElement>('.thumb')) {
      const current = Number(t.dataset.index) === this._index;
      t.setAttribute('aria-current', String(current));
      if (current) this.revealThumb(t);
    }
  }

  /** Scroll the thumbnail strip — never the page, which is what `scrollIntoView` would also do. */
  private revealThumb(t: HTMLElement): void {
    const strip = t.parentElement;
    if (!strip || strip.scrollWidth <= strip.clientWidth) return;
    const s = strip.getBoundingClientRect();
    const r = t.getBoundingClientRect();
    if (r.left < s.left) strip.scrollLeft -= s.left - r.left;
    else if (r.right > s.right) strip.scrollLeft += r.right - s.right;
  }

  private fillZoom(): void {
    const img = this.imgOf(this.slides()[this._index]);
    const zoomImg = this.$<HTMLImageElement>('.zoom-img');
    if (!img || !zoomImg) return;
    const src = img.dataset.full || BGallery.largestSrcset(img.getAttribute('srcset')) || img.currentSrc || img.getAttribute('src') || '';
    if (zoomImg.getAttribute('src') !== src) zoomImg.src = src;
    zoomImg.alt = img.alt;
    this.$('dialog.zoom')?.setAttribute('aria-label', this.imageName(this._index));
    this.$('.zoom-pane')?.classList.remove('magnified');
    const count = this.$('.zoom-count');
    if (count) count.textContent = this.label('label-zoom-count', 'bwc.gallery.zoomCount', '{index} / {count}',
      { index: this._index + 1, count: this.slides().length });
  }

  /**
   * The largest candidate of a `srcset` (by its `w` or `x` descriptor), or `null`. `currentSrc` is no substitute:
   * it is the candidate the browser picked for the small main image, which is exactly what a zoom must not show.
   */
  private static largestSrcset(srcset: string | null): string | null {
    if (!srcset) return null;
    let best: string | null = null;
    let bestSize = -1;
    for (const part of srcset.split(',')) {
      const [url, descriptor = '1x'] = part.trim().split(/\s+/);
      if (!url) continue;
      const size = parseFloat(descriptor); // a srcset uses one kind of descriptor, w or x
      if (Number.isFinite(size) && size > bestSize) { best = url; bestSize = size; }
    }
    return best;
  }

  /** Click to magnify ×2 around the point clicked; click again to fit. Pinch is the browser's own. */
  private toggleMagnify(pane: HTMLElement, img: HTMLImageElement, e: MouseEvent): void {
    const r = img.getBoundingClientRect();
    const fx = r.width ? (e.clientX - r.left) / r.width : 0.5;
    const fy = r.height ? (e.clientY - r.top) / r.height : 0.5;
    const on = pane.classList.toggle('magnified');
    if (!on) return;
    pane.scrollLeft = img.offsetWidth * fx - pane.clientWidth / 2;
    pane.scrollTop = img.offsetHeight * fy - pane.clientHeight / 2;
  }
}

define('b-gallery', BGallery);
