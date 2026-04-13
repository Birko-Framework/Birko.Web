import { BaseComponent, define } from 'birko-web-core';
import { formFieldSheet, formControlSheet } from '../shared-styles';
import { renderLabel } from './label-hint';

export class BRange extends BaseComponent {
  static get observedAttributes() {
    return ['label', 'hint', 'error', 'disabled', 'required', 'name',
            'min', 'max', 'step', 'mode', 'display', 'value-type', 'value'];
  }

  static get sharedStyles() {
    return [formFieldSheet, formControlSheet];
  }

  static get styles() {
    return `
      :host { display: block; }

      .range-wrap {
        display: flex;
        flex-direction: column;
        gap: var(--b-space-sm, 0.5rem);
      }

      /* ── Slider track & thumb ── */

      .range-slider {
        position: relative;
        height: 1.5rem;
        display: flex;
        align-items: center;
      }

      .range-track {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        left: 0;
        right: 0;
        height: 0.25rem;
        border-radius: var(--b-radius-full, 9999px);
        background: var(--b-border);
      }

      .range-track-fill {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        height: 0.25rem;
        border-radius: var(--b-radius-full, 9999px);
        background: var(--b-color-primary);
        pointer-events: none;
      }

      input[type="range"] {
        -webkit-appearance: none;
        appearance: none;
        background: transparent;
        border: none;
        padding: 0;
        margin: 0;
        width: 100%;
        height: 1.5rem;
        cursor: pointer;
        outline: none;
        box-shadow: none;
        position: relative;
        z-index: 2;
      }
      input[type="range"]:focus { box-shadow: none; }

      input[type="range"]::-webkit-slider-runnable-track {
        height: 0.25rem;
        border-radius: var(--b-radius-full, 9999px);
        background: transparent;
      }
      input[type="range"]::-moz-range-track {
        height: 0.25rem;
        border-radius: var(--b-radius-full, 9999px);
        background: transparent;
        border: none;
      }

      input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 1rem;
        height: 1rem;
        border-radius: var(--b-radius-full, 9999px);
        background: #fff;
        border: 2px solid var(--b-color-primary);
        margin-top: -0.375rem;
        cursor: pointer;
        transition: box-shadow var(--b-transition, 150ms ease);
      }
      input[type="range"]::-moz-range-thumb {
        width: 1rem;
        height: 1rem;
        border-radius: var(--b-radius-full, 9999px);
        background: #fff;
        border: 2px solid var(--b-color-primary);
        cursor: pointer;
        transition: box-shadow var(--b-transition, 150ms ease);
      }

      input[type="range"]:focus-visible::-webkit-slider-thumb {
        box-shadow: var(--b-focus-ring, 0 0 0 3px rgba(37, 99, 235, 0.15));
      }
      input[type="range"]:focus-visible::-moz-range-thumb {
        box-shadow: var(--b-focus-ring, 0 0 0 3px rgba(37, 99, 235, 0.15));
      }

      input[type="range"]:disabled {
        opacity: var(--b-disabled-opacity, 0.5);
        cursor: not-allowed;
      }
      input[type="range"]:disabled::-webkit-slider-thumb { cursor: not-allowed; }
      input[type="range"]:disabled::-moz-range-thumb { cursor: not-allowed; }

      /* ── Dual slider (range mode) ── */

      .range-slider--dual input[type="range"] {
        position: absolute;
        top: 0;
        left: 0;
        pointer-events: none;
      }
      .range-slider--dual input[type="range"]::-webkit-slider-thumb {
        pointer-events: auto;
      }
      .range-slider--dual input[type="range"]::-moz-range-thumb {
        pointer-events: auto;
      }

      /* ── Number inputs ── */

      .range-inputs {
        display: flex;
        align-items: center;
        gap: var(--b-space-xs, 0.25rem);
      }

      .range-input {
        max-width: 5rem;
        text-align: center;
      }

      .range-sep {
        color: var(--b-text-muted);
        font-size: var(--b-text-sm, 0.8125rem);
        flex-shrink: 0;
      }

      .range-unit {
        color: var(--b-text-secondary);
        font-size: var(--b-text-sm, 0.8125rem);
        flex-shrink: 0;
      }

      /* ── Error state ── */

      :host([error]) input[type="range"]::-webkit-slider-thumb {
        border-color: var(--b-color-danger);
      }
      :host([error]) input[type="range"]::-moz-range-thumb {
        border-color: var(--b-color-danger);
      }
      :host([error]) .range-track-fill {
        background: var(--b-color-danger);
      }
      :host([error]) .range-input {
        border-color: var(--b-color-danger);
      }
    `;
  }

  private _from = 0;
  private _to = 100;
  private _lastThumb: 'from' | 'to' = 'to';

  // ── Helpers ──

  private get _min(): number { return Number(this.attr('min', '0')); }
  private get _max(): number { return Number(this.attr('max', '100')); }
  private get _step(): number { return Number(this.attr('step', '1')); }
  private get _mode(): string { return this.attr('mode', 'single')!; }
  private get _display(): string { return this.attr('display', 'both')!; }
  private get _valueType(): string { return this.attr('value-type', 'number')!; }
  private get _isRange(): boolean { return this._mode === 'range'; }
  private get _showSlider(): boolean { return this._display !== 'input'; }
  private get _showInput(): boolean { return this._display !== 'slider'; }

  private _clamp(val: number): number {
    let v = Math.min(Math.max(val, this._min), this._max);
    if (this._valueType === 'int') v = Math.round(v);
    return v;
  }

  private _pct(val: number): number {
    const range = this._max - this._min;
    return range === 0 ? 0 : ((val - this._min) / range) * 100;
  }

  private _parseInitialValue() {
    const raw = this.attr('value');
    if (!raw) {
      this._from = this._min;
      this._to = this._max;
      return;
    }
    if (this._isRange) {
      try {
        const obj = JSON.parse(raw);
        this._from = this._clamp(Number(obj.from));
        this._to = this._clamp(Number(obj.to));
      } catch {
        this._from = this._min;
        this._to = this._max;
      }
    } else {
      this._from = this._clamp(Number(raw) || this._min);
    }
  }

  // ── Public API ──

  get value(): string { return this.inputValue; }
  set value(v: string) { this.inputValue = v; }

  get inputValue(): string {
    if (this._isRange) {
      return JSON.stringify({ from: this._from, to: this._to });
    }
    return String(this._from);
  }

  set inputValue(v: string) {
    if (this._isRange) {
      try {
        const obj = JSON.parse(v);
        this._from = this._clamp(Number(obj.from));
        this._to = this._clamp(Number(obj.to));
      } catch { /* ignore */ }
    } else {
      this._from = this._clamp(Number(v) || 0);
    }
    this._syncDOM();
  }

  // ── Render ──

  render() {
    this._parseInitialValue();

    const label = this.attr('label');
    const hint = this.attr('hint');
    const error = this.attr('error');
    const disabled = this.boolAttr('disabled') ? 'disabled' : '';
    const min = this._min;
    const max = this._max;
    const step = this._step;
    const isPercent = this._valueType === 'percent';

    let sliderHtml = '';
    if (this._showSlider) {
      if (this._isRange) {
        const fromPct = this._pct(this._from);
        const toPct = this._pct(this._to);
        sliderHtml = `
          <div class="range-slider range-slider--dual">
            <div class="range-track"></div>
            <div class="range-track-fill" style="left:${fromPct}%;width:${toPct - fromPct}%"></div>
            <input type="range" class="slider-from" min="${min}" max="${max}" step="${step}"
                   value="${this._from}" ${disabled} aria-label="From" />
            <input type="range" class="slider-to" min="${min}" max="${max}" step="${step}"
                   value="${this._to}" ${disabled} aria-label="To"
                   style="z-index:3" />
          </div>`;
      } else {
        const fromPct = this._pct(this._from);
        sliderHtml = `
          <div class="range-slider">
            <div class="range-track"></div>
            <div class="range-track-fill" style="left:0;width:${fromPct}%"></div>
            <input type="range" class="slider-single" min="${min}" max="${max}" step="${step}"
                   value="${this._from}" ${disabled} />
          </div>`;
      }
    }

    let inputHtml = '';
    if (this._showInput) {
      if (this._isRange) {
        inputHtml = `
          <div class="range-inputs">
            <input type="number" class="range-input input-from" min="${min}" max="${max}" step="${step}"
                   value="${this._from}" ${disabled} aria-label="From" />
            <span class="range-sep" aria-hidden="true">&ndash;</span>
            <input type="number" class="range-input input-to" min="${min}" max="${max}" step="${step}"
                   value="${this._to}" ${disabled} aria-label="To" />
            ${isPercent ? '<span class="range-unit" aria-hidden="true">%</span>' : ''}
          </div>`;
      } else {
        inputHtml = `
          <div class="range-inputs">
            <input type="number" class="range-input input-single" min="${min}" max="${max}" step="${step}"
                   value="${this._from}" ${disabled} />
            ${isPercent ? '<span class="range-unit" aria-hidden="true">%</span>' : ''}
          </div>`;
      }
    }

    return `
      <div class="field">
        ${renderLabel(label, hint, this.boolAttr('required'))}
        <div class="range-wrap">
          ${sliderHtml}
          ${inputHtml}
        </div>
        ${error ? `<span class="error">${error}</span>` : ''}
      </div>
    `;
  }

  // ── Events ──

  protected onUpdated() {
    if (this._isRange) {
      this._wireRange();
    } else {
      this._wireSingle();
    }
  }

  private _wireSingle() {
    const slider = this.$<HTMLInputElement>('.slider-single');
    const input = this.$<HTMLInputElement>('.input-single');

    if (slider) {
      this.listen(slider, 'input', () => {
        this._from = this._clamp(Number(slider.value));
        if (input) input.value = String(this._from);
        this._updateFill();
        this._emitChange();
      });
    }

    if (input) {
      this.listen(input, 'change', () => {
        this._from = this._clamp(Number(input.value));
        input.value = String(this._from);
        if (slider) slider.value = String(this._from);
        this._updateFill();
        this._emitChange();
      });
    }
  }

  private _wireRange() {
    const sliderFrom = this.$<HTMLInputElement>('.slider-from');
    const sliderTo = this.$<HTMLInputElement>('.slider-to');
    const inputFrom = this.$<HTMLInputElement>('.input-from');
    const inputTo = this.$<HTMLInputElement>('.input-to');

    if (sliderFrom) {
      this.listen(sliderFrom, 'input', () => {
        this._from = this._clamp(Math.min(Number(sliderFrom.value), this._to));
        sliderFrom.value = String(this._from);
        if (inputFrom) inputFrom.value = String(this._from);
        this._lastThumb = 'from';
        this._updateFill();
        this._emitChange();
      });
    }

    if (sliderTo) {
      this.listen(sliderTo, 'input', () => {
        this._to = this._clamp(Math.max(Number(sliderTo.value), this._from));
        sliderTo.value = String(this._to);
        if (inputTo) inputTo.value = String(this._to);
        this._lastThumb = 'to';
        this._updateFill();
        this._emitChange();
      });
    }

    if (inputFrom) {
      this.listen(inputFrom, 'change', () => {
        this._from = this._clamp(Math.min(Number(inputFrom.value), this._to));
        inputFrom.value = String(this._from);
        if (sliderFrom) sliderFrom.value = String(this._from);
        this._updateFill();
        this._emitChange();
      });
    }

    if (inputTo) {
      this.listen(inputTo, 'change', () => {
        this._to = this._clamp(Math.max(Number(inputTo.value), this._from));
        inputTo.value = String(this._to);
        if (sliderTo) sliderTo.value = String(this._to);
        this._updateFill();
        this._emitChange();
      });
    }
  }

  private _updateFill() {
    const fill = this.$<HTMLElement>('.range-track-fill');
    if (!fill) return;

    if (this._isRange) {
      const fromPct = this._pct(this._from);
      const toPct = this._pct(this._to);
      fill.style.left = `${fromPct}%`;
      fill.style.width = `${toPct - fromPct}%`;
    } else {
      fill.style.left = '0';
      fill.style.width = `${this._pct(this._from)}%`;
    }
  }

  private _emitChange() {
    if (this._isRange) {
      this.emit('change', { name: this.attr('name'), value: { from: this._from, to: this._to } });
    } else {
      this.emit('change', { name: this.attr('name'), value: this._from });
    }
  }

  private _syncDOM() {
    if (this._isRange) {
      const sf = this.$<HTMLInputElement>('.slider-from');
      const st = this.$<HTMLInputElement>('.slider-to');
      const inf = this.$<HTMLInputElement>('.input-from');
      const int_ = this.$<HTMLInputElement>('.input-to');
      if (sf) sf.value = String(this._from);
      if (st) st.value = String(this._to);
      if (inf) inf.value = String(this._from);
      if (int_) int_.value = String(this._to);
    } else {
      const s = this.$<HTMLInputElement>('.slider-single');
      const i = this.$<HTMLInputElement>('.input-single');
      if (s) s.value = String(this._from);
      if (i) i.value = String(this._from);
    }
    this._updateFill();
  }
}

define('b-range', BRange);
