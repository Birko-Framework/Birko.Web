import { FormControlComponent, define } from 'birko-web-core';
import { formFieldSheet, formControlSheet } from '../shared-styles';
import { renderField, fieldAria } from './label-hint';

const DEFAULT_RGB = '#000000';

/**
 * Color picker — a hex color input pairing a native color swatch with a text
 * field. The swatch opens the OS color dialog; the text field accepts typed hex
 * (`#rgb`, `rgb`, `#rrggbb`, `rrggbb`). Both stay in sync and the canonical
 * value is normalized to lowercase `#rrggbb`.
 *
 * Opt-in alpha: add the `alpha` attribute to show an opacity slider. In alpha
 * mode the canonical value and the text field carry an 8-digit `#rrggbbaa`, and
 * the text field also accepts `#rgba` / `#rrggbbaa`. The native swatch is sRGB
 * only, so RGB comes from the swatch and the alpha byte from the slider.
 *
 * Compact: add the `swatch-only` attribute to drop the hex text field and show
 * just the clickable swatch (the swatch then carries `name` for form posts).
 * Useful for toolbars/headers where the hex box is noise.
 *
 * Add the `compact` attribute to lay the controls out on a single row instead of
 * stacked — the opacity slider (alpha mode) sits inline beside the swatch rather
 * than dropping below it, so the whole control fits a fixed-height toolbar/ribbon
 * without overflowing. Pairs naturally with `swatch-only alpha`.
 *
 * Mirrors the native element's two-event contract:
 *  - `input`  — live preview during a swatch drag, slider drag, or while a valid
 *               hex is typed. Ephemeral: the `value` attribute is NOT reflected
 *               (no re-render storm) — listen to this for follow-along previews.
 *  - `change` — a committed color. The `value` attribute is reflected and kept
 *               canonical. Bad hex typed into the text field snaps back on commit.
 * Both carry `{ name, value }` with `value` normalized to lowercase hex.
 */
export class BColorPicker extends FormControlComponent {
  static get observedAttributes() {
    return ['label', 'name', 'value', 'placeholder', 'alpha', 'swatch-only', 'compact', 'error', 'hint', 'required', 'disabled', 'bare', 'description'];
  }

  static get sharedStyles() {
    return [formFieldSheet, formControlSheet];
  }

  static get styles() {
    return `
      :host { display: block; }
      .color-control {
        display: flex;
        align-items: center;
        gap: var(--b-space-sm, 0.5rem);
      }
      /* Native color input reskinned as a flush swatch button. */
      .swatch {
        flex: 0 0 auto;
        width: var(--b-control-min-height, 2.375rem);
        height: var(--b-control-min-height, 2.375rem);
        min-height: 0;
        padding: 0;
        border: var(--b-border-width, 1px) solid var(--b-border);
        border-radius: var(--b-radius, 0.375rem);
        background: var(--b-bg);
        cursor: pointer;
      }
      .swatch::-webkit-color-swatch-wrapper { padding: 2px; }
      .swatch::-webkit-color-swatch {
        border: none;
        border-radius: calc(var(--b-radius, 0.375rem) - 2px);
      }
      .swatch::-moz-color-swatch {
        border: none;
        border-radius: calc(var(--b-radius, 0.375rem) - 2px);
      }
      .swatch:focus-visible {
        outline: none;
        border-color: var(--b-border-focus);
        box-shadow: var(--b-focus-ring);
      }
      .swatch:disabled {
        opacity: var(--b-disabled-opacity, 0.5);
        cursor: not-allowed;
      }
      .hex {
        flex: 1 1 auto;
        font-family: var(--b-font-mono, monospace);
        text-transform: uppercase;
      }
      :host([size="sm"]) .swatch {
        width: var(--b-control-min-height-sm, 1.75rem);
        height: var(--b-control-min-height-sm, 1.75rem);
      }
      :host([size="lg"]) .swatch {
        width: var(--b-control-min-height-lg, 2.75rem);
        height: var(--b-control-min-height-lg, 2.75rem);
      }

      /* ── Opacity slider (alpha mode) ── */
      .alpha-control {
        display: flex;
        align-items: center;
        gap: var(--b-space-sm, 0.5rem);
        margin-top: var(--b-space-sm, 0.5rem);
      }
      /* Track = current color faded over a checkerboard so opacity reads visually. */
      .alpha {
        flex: 1 1 auto;
        -webkit-appearance: none;
        appearance: none;
        height: 0.75rem;
        min-height: 0;
        padding: 0;
        margin: 0;
        width: 100%;
        border: var(--b-border-width, 1px) solid var(--b-border);
        border-radius: var(--b-radius, 0.375rem);
        cursor: pointer;
        outline: none;
        background:
          linear-gradient(to right, transparent, var(--b-cp-rgb, #000000)),
          repeating-conic-gradient(var(--b-bg-tertiary) 0 25%, var(--b-bg) 0 50%) 50% / 0.6rem 0.6rem;
      }
      .alpha::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 0.85rem;
        height: 0.85rem;
        border-radius: var(--b-radius-full, 9999px);
        background: var(--b-input-thumb-bg, #ffffff);
        border: 2px solid var(--b-color-primary);
        cursor: pointer;
      }
      .alpha::-moz-range-thumb {
        width: 0.85rem;
        height: 0.85rem;
        border-radius: var(--b-radius-full, 9999px);
        background: var(--b-input-thumb-bg, #ffffff);
        border: 2px solid var(--b-color-primary);
        cursor: pointer;
      }
      .alpha:focus-visible { box-shadow: var(--b-focus-ring); }
      .alpha:disabled { opacity: var(--b-disabled-opacity, 0.5); cursor: not-allowed; }
      .alpha-out {
        flex: 0 0 auto;
        min-width: 2.75rem;
        text-align: right;
        font-family: var(--b-font-mono, monospace);
        font-size: var(--b-text-sm, 0.8125rem);
        color: var(--b-text-secondary);
      }

      /* ── Compact: single row, so the alpha slider sits beside the swatch
         instead of dropping below it (fits fixed-height toolbars/ribbons). ── */
      :host([compact]) .field {
        flex-direction: row;
        align-items: center;
        gap: var(--b-space-sm, 0.5rem);
      }
      :host([compact]) .alpha-control {
        margin-top: 0;
        flex: 0 0 auto;
        width: 5rem;
      }
      :host([compact]) .alpha-out { display: none; }
    `;
  }

  private _value = '';

  private get _alpha(): boolean { return this.boolAttr('alpha'); }

  render() {
    const label = this.attr('label');
    const hint = this.attr('hint');
    const error = this.attr('error');
    const disabled = this.boolAttr('disabled');
    const swatchOnly = this.boolAttr('swatch-only');
    const { rgb, a } = this._currentParts();
    const value = this._format(rgb, a);
    const placeholder = this.label('placeholder', 'bwc.colorPicker.placeholder', this._alpha ? '#RRGGBBAA' : '#RRGGBB');
    const bare = this.boolAttr('bare');
    const description = this.attr('description');
    return renderField({
      bare,
      uid: this.uid,
      label,
      hint,
      error,
      required: this.boolAttr('required'),
      description,
      control: `
        <div class="color-control">
          <input class="swatch" type="color" value="${rgb}"
            ${swatchOnly ? `name="${this.attr('name')}"` : ''}
            ${disabled ? 'disabled' : ''}
            aria-label="${this.label('label-swatch', 'bwc.colorPicker.swatch', 'Pick a color')}"
            ${/* swatch-only mode omits the .hex box below, which is where the field's ARIA normally lives —
                  without this the control would have no error state, description or invalid flag at all.
                  No `label`: the swatch already has its own aria-label just above. */
              swatchOnly ? fieldAria({ uid: this.uid, error, description, bare }) : ''} />
          ${swatchOnly ? '' : `<input type="text" inputmode="text" spellcheck="false" autocomplete="off"
            class="hex ${error ? 'has-error' : ''}"
            name="${this.attr('name')}" value="${value}" placeholder="${placeholder}"
            ${disabled ? 'disabled' : ''} ${this.boolAttr('required') ? 'required' : ''}
            ${fieldAria({ uid: this.uid, error, description, bare, label })} />`}
        </div>
        ${this._alpha ? `
        <div class="alpha-control" style="--b-cp-rgb:${rgb}">
          <input class="alpha" type="range" min="0" max="255" step="1" value="${a}"
            ${disabled ? 'disabled' : ''}
            aria-label="${this.label('label-alpha', 'bwc.colorPicker.alpha', 'Opacity')}" />
          <output class="alpha-out">${this._pct(a)}%</output>
        </div>` : ''}`,
    });

  }

  // ── Hex parsing / formatting ──

  /** Parse any accepted hex shape. `a` is null when the input carried no alpha. */
  private _parse(raw: string): { rgb: string; a: number | null } | null {
    if (!raw) return null;
    let s = raw.trim().replace(/^#/, '').toLowerCase();
    if (/^[0-9a-f]{3}$/.test(s) || /^[0-9a-f]{4}$/.test(s)) {
      s = s.split('').map(c => c + c).join('');
    }
    if (/^[0-9a-f]{6}$/.test(s)) return { rgb: `#${s}`, a: null };
    if (/^[0-9a-f]{8}$/.test(s)) return { rgb: `#${s.slice(0, 6)}`, a: parseInt(s.slice(6, 8), 16) };
    return null;
  }

  private _hex2(n: number): string {
    return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  }

  private _pct(a: number): number {
    return Math.round((a / 255) * 100);
  }

  /** Compose the canonical string for the current mode (6- or 8-digit). */
  private _format(rgb: string, a: number): string {
    return this._alpha ? `${rgb}${this._hex2(a)}` : rgb;
  }

  /** Normalize any accepted input to the canonical string, or null if invalid. */
  private _normalize(raw: string): string | null {
    const p = this._parse(raw);
    return p ? this._format(p.rgb, p.a ?? 255) : null;
  }

  private _currentParts(): { rgb: string; a: number } {
    const p = this._parse(this._value || this.attr('value'));
    return p ? { rgb: p.rgb, a: p.a ?? 255 } : { rgb: DEFAULT_RGB, a: 255 };
  }

  private _current(): string {
    const { rgb, a } = this._currentParts();
    return this._format(rgb, a);
  }

  // ── DOM helpers ──

  /** Build the live color from the swatch RGB + slider alpha currently in the DOM. */
  private _compose(): string {
    const swatch = this.$<HTMLInputElement>('.swatch');
    const alpha = this.$<HTMLInputElement>('.alpha');
    const cur = this._currentParts();
    const rgb = swatch?.value || cur.rgb;
    const a = alpha ? Number(alpha.value) : cur.a;
    return this._format(rgb, a);
  }

  /** Repaint the slider track tint + percentage readout for a live preview. */
  private _paint(rgb: string, a: number) {
    this.$<HTMLElement>('.alpha-control')?.style.setProperty('--b-cp-rgb', rgb);
    const out = this.$<HTMLElement>('.alpha-out');
    if (out) out.textContent = `${this._pct(a)}%`;
  }

  /** Validate, store, reflect into the controls and emit — or revert on bad hex. */
  private _commit(raw: string) {
    const norm = this._normalize(raw);
    const hex = this.$<HTMLInputElement>('.hex');
    if (!norm) {
      if (hex) hex.value = this._current(); // bad hex — snap back to the live value
      return;
    }
    if (norm === this._current()) {
      if (hex) hex.value = norm;
      return;
    }
    this._value = norm;
    this.setAttribute('value', norm);
    this.emit('change', { name: this.attr('name'), value: norm });
  }

  protected onUpdated() {
    this.syncFormState();

    const swatch = this.$<HTMLInputElement>('.swatch');
    const hex = this.$<HTMLInputElement>('.hex');
    const alpha = this.$<HTMLInputElement>('.alpha');

    // The inner controls fire native, composed `input`/`change` events that would
    // otherwise bubble past the host and masquerade as this component's own
    // (detail-less) input/change. Stop them at the boundary; we re-emit our own
    // semantic events with a { name, value } detail instead.
    const contain = (e: Event) => e.stopPropagation();

    if (swatch) {
      // Drag preview: mirror into the hex text + slider tint, emit a live event.
      this.listen(swatch, 'input', e => {
        contain(e);
        const value = this._compose();
        if (hex) hex.value = value;
        this._paint(swatch.value, alpha ? Number(alpha.value) : 255);
        this.emit('input', { name: this.attr('name'), value });
      });
      this.listen(swatch, 'change', e => { contain(e); this._commit(this._compose()); });
    }

    if (hex) {
      // Live-preview a valid typed hex on the swatch + slider, without committing.
      this.listen(hex, 'input', e => {
        contain(e);
        const p = this._parse(hex.value);
        if (!p) return;
        if (swatch) swatch.value = p.rgb;
        const a = p.a ?? (alpha ? Number(alpha.value) : 255);
        if (alpha) alpha.value = String(a);
        this._paint(p.rgb, a);
        this.emit('input', { name: this.attr('name'), value: this._format(p.rgb, a) });
      });
      this.listen(hex, 'change', e => {
        contain(e);
        const p = this._parse(hex.value);
        if (!p) { hex.value = this._current(); return; }
        const a = p.a ?? (alpha ? Number(alpha.value) : 255);
        this._commit(this._format(p.rgb, a));
      });
    }

    if (alpha) {
      this.listen(alpha, 'input', e => {
        contain(e);
        const a = Number(alpha.value);
        const rgb = swatch?.value || this._currentParts().rgb;
        const value = this._format(rgb, a);
        if (hex) hex.value = value;
        this._paint(rgb, a);
        this.emit('input', { name: this.attr('name'), value });
      });
      this.listen(alpha, 'change', e => { contain(e); this._commit(this._compose()); });
    }
  }

  /**
   * Submits the **base hex** (`#rrggbb`) — the alpha byte is dropped even in `alpha` mode. `value` still
   * returns the full `#rrggbbaa` so nothing on the JS side changes; this only decides what a native form
   * post carries, and a bare 6-digit hex is what colour columns and CSS consumers expect. Read
   * `el.value` when the opacity matters.
   */
  protected formValue(): string | null {
    const { rgb } = this._currentParts();
    return rgb === '' ? null : rgb;
  }

  /** The `.swatch` is `<input type="color">` — never empty, never invalid, so its validity says nothing. */
  protected validationSource(): undefined {
    return undefined;
  }

  get value(): string { return this._current(); }
  set value(v: string) {
    const norm = this._normalize(v);
    if (norm) {
      this._value = norm;
      this.setAttribute('value', norm);
    } else {
      this._value = '';
      this.removeAttribute('value');
    }
  }
}

define('b-color-picker', BColorPicker);
