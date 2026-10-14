import { FormControlComponent, define } from 'birko-web-core';
import { escapeAttr } from '../dom-utils';
import { formFieldSheet, srOnlySheet } from '../shared-styles';
import { renderField, fieldAria } from './label-hint';

const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2.6l2.9 6.2 6.8.8-5 4.6 1.3 6.7L12 17.6l-6 3.3 1.3-6.7-5-4.6 6.8-.8z"/></svg>';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** The only elements an icon copy may contain, each with the only attributes it may keep: geometry, nothing else. */
const ICON_SHAPES: Record<string, readonly string[]> = {
  g: ['transform'],
  path: ['d', 'transform', 'fill-rule', 'clip-rule', 'pathLength'],
  circle: ['cx', 'cy', 'r', 'transform'],
  ellipse: ['cx', 'cy', 'rx', 'ry', 'transform'],
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry', 'transform'],
  line: ['x1', 'y1', 'x2', 'y2', 'transform'],
  polyline: ['points', 'transform'],
  polygon: ['points', 'transform', 'fill-rule'],
};
/** Containers whose own element is dropped but whose shapes are kept (a link around the drawing). */
const ICON_UNWRAP = new Set(['a', 'switch']);

/**
 * A consumer's `icon` slot SVG rebuilt for every star (TASK-592). It is an **allowlist**: a fresh SVG holding only the
 * shape elements of {@link ICON_SHAPES} with their geometry attributes, so the copy re-parsed into the shadow root has
 * nothing that can run, load, take focus or restyle the component: no scripts, handlers, links, animation, `<style>`,
 * images, `<use>`, masks, gradients, ids, classes, opacity or inline styles. The shapes carry no paint, so they take
 * the component's (`.star svg` and `.star.filled svg`), which is what keeps filled and empty distinguishable.
 */
function iconMarkup(source: SVGSVGElement): string {
  const copy = (from: Element, to: Element): void => {
    for (const child of from.children) {
      const name = child.localName;
      if (child.namespaceURI === SVG_NS && ICON_UNWRAP.has(name)) { copy(child, to); continue; }
      const allowed = child.namespaceURI === SVG_NS ? ICON_SHAPES[name] : undefined;
      if (!allowed) continue;
      const el = document.createElementNS(SVG_NS, name);
      for (const attr of allowed) {
        const value = child.getAttribute(attr);
        if (value !== null) el.setAttribute(attr, value);
      }
      copy(child, el);
      to.appendChild(el);
    }
  };
  const svg = document.createElementNS(SVG_NS, 'svg');
  // The star's size comes from --b-rating-star, so the icon's own width/height are not copied; keep its coordinates.
  const w = parseFloat(source.getAttribute('width') ?? '');
  const h = parseFloat(source.getAttribute('height') ?? '');
  const viewBox = source.getAttribute('viewBox') ?? (w > 0 && h > 0 ? `0 0 ${w} ${h}` : null);
  if (viewBox) svg.setAttribute('viewBox', viewBox);
  const ratio = source.getAttribute('preserveAspectRatio');
  if (ratio) svg.setAttribute('preserveAspectRatio', ratio);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  copy(source, svg);
  return svg.outerHTML;
}

/**
 * Star rating — a form-associated whole-star input (TASK-579).
 *
 * The stars are labels for visually hidden native radios, one per star, in reading order. The radios give one tab
 * stop, arrow keys that move and select, and the group's `required` validity; Home/End are added. `readonly` renders
 * no radios at all: an image whose name states the rating, so it is announced as a value and has no tab stop.
 *
 * `value` is `"1"`…`max`, or empty for no rating (nothing is submitted). As with a native input, the `value` attribute
 * is the default: it drives the control until a user pick or a `.value` set, after which attribute changes are ignored
 * until `form.reset()` hands control back to the attribute. Emits `change` `{ name, value }` on a user pick only.
 */
export class BRating extends FormControlComponent {
  static get observedAttributes() {
    return ['value', 'max', 'name', 'required', 'disabled', 'readonly', 'label', 'hint', 'description', 'error', 'bare'];
  }

  /** The user's pick (or a programmatic set); `null` until then, when the `value` attribute applies. */
  private _value: string | null = null;

  static get sharedStyles() {
    return [formFieldSheet, srOnlySheet];
  }

  static get styles() {
    return `
      :host { display: block; --b-rating-star: var(--b-space-xl, 1.5rem); }
      :host([size="sm"]) { --b-rating-star: var(--b-space-lg, 1rem); }
      :host([size="lg"]) { --b-rating-star: var(--b-space-2xl, 2rem); }
      .stars { display: inline-flex; align-items: center; gap: var(--b-space-2xs, 0.125rem); }
      .star { display: inline-flex; align-items: center; justify-content: center; cursor: pointer;
        border-radius: var(--b-radius-sm, 0.25rem); }
      /* The icon slot is a source to copy from, never rendered itself (nor in the accessibility tree). */
      slot[name="icon"] { display: none; }
      .star svg { width: var(--b-rating-star); height: var(--b-rating-star); display: block;
        fill: none; stroke: var(--b-text-secondary); stroke-width: 1.5; stroke-linejoin: round; }
      .star.filled svg { fill: var(--b-rating-color, var(--b-color-warning)); stroke: var(--b-rating-color, var(--b-color-warning)); }
      /* Hover previews the pick: the hovered star and every star before it. Only on the operable group: a read-only
         rating must not appear to change under the pointer. The reset clears the fill only, so an error outline stays. */
      .stars[role="radiogroup"]:not(.disabled):hover .star svg { fill: none; }
      .stars[role="radiogroup"]:not(.disabled) .star:hover svg,
      .stars[role="radiogroup"]:not(.disabled) .star:has(~ .star:hover) svg {
        fill: var(--b-rating-color, var(--b-color-warning)); stroke: var(--b-rating-color, var(--b-color-warning));
      }
      input:focus-visible + .star { box-shadow: var(--b-focus-ring, 0 0 0 3px rgba(37, 99, 235, 0.15)); }
      .stars.disabled .star { cursor: not-allowed; opacity: var(--b-disabled-opacity, 0.5); }
      .stars.has-error .star svg { stroke: var(--b-color-danger); }
      .stars.readonly .star { cursor: default; }
      /* The pickers' touch floor: each star is a 44 x 44 target on a coarse pointer. */
      @media (pointer: coarse) {
        .stars:not(.readonly) .star {
          min-width: max(var(--b-control-min-height-lg, 2.75rem), 44px);
          min-height: max(var(--b-control-min-height-lg, 2.75rem), 44px);
        }
      }
    `;
  }

  // ── value ──────────────────────────────────────────────────────────────────────────────────────────

  /** Highest selectable star: the `max` attribute as a whole number from 1 to 10, else 5. */
  get max(): number {
    const n = Number(this.attr('max'));
    return Number.isInteger(n) && n >= 1 && n <= 10 ? n : 5;
  }

  /** `"1"`…`max`, or `''` for no rating; anything else (a fraction, out of range) reads as no rating. */
  get value(): string { return this.normalise(this._value ?? this.attr('value')); }
  /** Sets the rating without a `change` event, as a native input does. */
  set value(v: string) {
    // Stored raw and normalised on read, so a value set before a larger `max` arrives is not lost.
    this._value = v ?? '';
    this.syncView();
    this.syncFormState();
  }

  private normalise(v: string): string {
    const n = Number(v.trim());
    return v.trim() !== '' && Number.isInteger(n) && n >= 1 && n <= this.max ? String(n) : '';
  }

  // ── render ─────────────────────────────────────────────────────────────────────────────────────────

  /** The `icon` slot's SVG as markup for each star, or the built-in star. */
  private icon(): string {
    const source = this.querySelector<SVGSVGElement>(':scope > svg[slot="icon"]');
    return source ? iconMarkup(source) : STAR;
  }

  render() {
    const icon = this.icon();
    const value = Number(this.value) || 0;
    const max = this.max;
    const label = this.attr('label');
    const error = this.attr('error');
    const description = this.attr('description');
    const required = this.boolAttr('required');
    const disabled = this.boolAttr('disabled');
    const readonly = this.boolAttr('readonly');
    const bare = this.boolAttr('bare');
    const stars = Array.from({ length: max }, (_, i) => i + 1);

    const control = readonly
      ? `<div class="stars readonly" role="img" aria-label="${escapeAttr(this.readonlyName(value, max))}">
          ${stars.map((i) => `<span class="star${i <= value ? ' filled' : ''}">${icon}</span>`).join('')}
        </div>`
      : `<div class="stars${disabled ? ' disabled' : ''}${error ? ' has-error' : ''}" role="radiogroup"
          ${fieldAria({ uid: this.uid, error, description, bare, label, required })}>
          ${stars.map((i) => `
            <input class="sr-only" type="radio" id="${this.uid}-r${i}" name="${this.uid}" value="${i}"
              aria-label="${escapeAttr(this.label('label-star', 'bwc.rating.star', '{value} of {max}', { value: i, max }))}"
              ${i === value ? 'checked' : ''} ${disabled ? 'disabled' : ''} ${required ? 'required' : ''} />
            <label for="${this.uid}-r${i}" class="star${i <= value ? ' filled' : ''}" aria-hidden="true">${icon}</label>`).join('')}
        </div>`;

    return renderField({ bare, uid: this.uid, label, hint: this.attr('hint'), description, error, required, control })
      + '<slot name="icon"></slot>';
  }

  protected onUpdated() {
    // A replaced or removed icon re-renders the stars; the morph keeps the radios, so the value and focus survive.
    const slot = this.$<HTMLSlotElement>('slot[name="icon"]');
    if (slot) this.listen(slot, 'slotchange', () => this.update());
    const radios = this.$$<HTMLInputElement>('input[type="radio"]');
    radios.forEach((radio) => {
      this.listen(radio, 'change', () => { if (radio.checked) this.pick(radio.value); });
      // Radios have no Home/End of their own.
      this.listen<KeyboardEvent>(radio, 'keydown', (e) => {
        if (e.key !== 'Home' && e.key !== 'End') return;
        e.preventDefault();
        const target = radios[e.key === 'Home' ? 0 : radios.length - 1];
        target.checked = true;
        target.focus();
        this.pick(target.value);
      });
    });
    this.syncView();
    this.syncFormState();
  }

  private pick(v: string): void {
    if (v === this.value) return;
    this._value = v;
    this.syncView();
    this.syncFormState();
    this.emit('change', { name: this.attr('name'), value: this.value });
  }

  /** Reflect the value onto the rendered stars and radios without re-rendering, so focus stays where it is. */
  private syncView(): void {
    const value = Number(this.value) || 0;
    this.$$<HTMLElement>('.star').forEach((star, i) => star.classList.toggle('filled', i + 1 <= value));
    this.$$<HTMLInputElement>('input[type="radio"]').forEach((radio) => { radio.checked = Number(radio.value) === value; });
    // A read-only rating is announced by its name, so a value set by script must reach the name, not only the stars.
    this.$<HTMLElement>('.stars.readonly')?.setAttribute('aria-label', this.readonlyName(value, this.max));
  }

  private readonlyName(value: number, max: number): string {
    return value
      ? this.label('label-readonly', 'bwc.rating.readonly', 'Rated {value} of {max}', { value, max })
      : this.label('label-none', 'bwc.rating.none', 'Not rated');
  }

  // ── form association ───────────────────────────────────────────────────────────────────────────────

  protected formValue(): string | null {
    return this.value || null;
  }

  protected formAnchor(): HTMLElement | undefined {
    return this.$<HTMLElement>('.stars') ?? undefined;
  }

  /** The radios' own `valueMissing` is the group's `required`; a read-only rating is barred from validation. */
  protected validationSource(): HTMLInputElement | undefined {
    return this.boolAttr('readonly') ? undefined : this.$<HTMLInputElement>('input[type="radio"]') ?? undefined;
  }

  protected get supportsRequiredValidation(): boolean {
    return !this.boolAttr('readonly');
  }

  /**
   * Like a native input's reset: the user's value is dropped and the `value` attribute applies again, including any
   * later change to it. (The base would assign the snapshot through the setter, leaving the control "dirty", so a
   * page that later updates the attribute would be ignored.)
   */
  protected restoreInitialState(_state: unknown): void {
    this._value = null;
    this.syncView();
    this.syncFormState();
  }
}

define('b-rating', BRating);
