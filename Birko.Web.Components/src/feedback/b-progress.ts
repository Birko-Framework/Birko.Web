import { BaseComponent, define } from 'birko-web-core';
import { escapeHtml, escapeAttr } from '../dom-utils';

type ValueFormat = 'percent' | 'fraction' | 'value';
type ProgressType = 'linear' | 'circular';

export class BProgress extends BaseComponent {
  static get observedAttributes() {
    return [
      'value', 'max', 'label', 'show-value', 'value-format',
      'size', 'variant', 'striped', 'animated', 'indeterminate',
      'type', 'thickness',
    ];
  }

  static get styles() {
    return `
      :host { display: block; }
      .label-row {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--b-space-sm, 0.5rem);
        margin-bottom: var(--b-space-xs, 0.25rem);
        font-size: var(--b-text-sm, 0.8125rem);
      }
      .label { color: var(--b-text); }
      .value {
        color: var(--b-text-muted);
        font-variant-numeric: tabular-nums;
      }
      .track {
        position: relative;
        width: 100%;
        height: var(--b-progress-height, 0.5rem);
        background: var(--b-bg-tertiary);
        border-radius: var(--b-radius-full, 9999px);
        overflow: hidden;
      }
      :host([size="sm"]) .track { height: 0.25rem; }
      :host([size="lg"]) .track { height: 0.75rem; }
      :host([size="xl"]) .track { height: 1rem; }
      .fill {
        height: 100%;
        background: var(--b-color-primary);
        border-radius: inherit;
        transition: width var(--b-transition, 150ms ease);
      }
      :host([variant="success"]) .fill,
      :host([variant="success"]) .fill-indeterminate { background-color: var(--b-color-success); }
      :host([variant="warning"]) .fill,
      :host([variant="warning"]) .fill-indeterminate { background-color: var(--b-color-warning); }
      :host([variant="danger"]) .fill,
      :host([variant="danger"]) .fill-indeterminate { background-color: var(--b-color-danger); }
      :host([variant="info"]) .fill,
      :host([variant="info"]) .fill-indeterminate { background-color: var(--b-color-info); }
      :host([variant="secondary"]) .fill,
      :host([variant="secondary"]) .fill-indeterminate { background-color: var(--b-text-muted); }
      :host([variant="success"]) .ring-fill { stroke: var(--b-color-success); }
      :host([variant="warning"]) .ring-fill { stroke: var(--b-color-warning); }
      :host([variant="danger"]) .ring-fill { stroke: var(--b-color-danger); }
      :host([variant="info"]) .ring-fill { stroke: var(--b-color-info); }
      :host([variant="secondary"]) .ring-fill { stroke: var(--b-text-muted); }
      .fill.striped, .fill-indeterminate.striped {
        background-image: linear-gradient(
          45deg,
          rgba(255, 255, 255, 0.18) 25%,
          transparent 25%,
          transparent 50%,
          rgba(255, 255, 255, 0.18) 50%,
          rgba(255, 255, 255, 0.18) 75%,
          transparent 75%
        );
        background-size: 1rem 1rem;
      }
      .fill.animated { animation: b-progress-stripes var(--b-spinner-speed, 0.7s) linear infinite; }
      @keyframes b-progress-stripes {
        from { background-position: 0 0; }
        to { background-position: 1rem 0; }
      }
      .fill-indeterminate {
        position: absolute;
        top: 0;
        left: 0;
        height: 100%;
        width: 40%;
        background: var(--b-color-primary);
        border-radius: inherit;
        animation: b-progress-indeterminate var(--b-animation-progress, 1.4s) ease-in-out infinite;
      }
      @keyframes b-progress-indeterminate {
        0%   { left: -40%; }
        100% { left: 100%; }
      }
      /* circular */
      .ring-wrap {
        display: inline-flex;
        flex-direction: column;
        align-items: center;
        gap: var(--b-space-xs, 0.25rem);
      }
      .ring {
        position: relative;
        width: var(--b-progress-ring-size, 3rem);
        height: var(--b-progress-ring-size, 3rem);
      }
      :host([size="sm"]) .ring { width: 2rem; height: 2rem; }
      :host([size="lg"]) .ring { width: 4rem; height: 4rem; }
      :host([size="xl"]) .ring { width: 6rem; height: 6rem; }
      .ring svg { width: 100%; height: 100%; display: block; transform: rotate(-90deg); }
      .ring circle {
        fill: none;
        stroke-width: var(--b-progress-ring-thickness, 3.5);
        stroke-linecap: round;
      }
      .ring .ring-track { stroke: var(--b-bg-tertiary); }
      .ring .ring-fill {
        stroke: var(--b-color-primary);
        transition: stroke-dasharray var(--b-transition, 150ms ease);
      }
      .ring-value {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: var(--b-text-sm, 0.8125rem);
        font-variant-numeric: tabular-nums;
        color: var(--b-text);
      }
      .ring-label {
        font-size: var(--b-text-sm, 0.8125rem);
        color: var(--b-text);
      }
      .ring.indeterminate svg { animation: b-progress-ring-spin var(--b-animation-progress, 1.4s) linear infinite; }
      @keyframes b-progress-ring-spin {
        from { transform: rotate(0); }
        to   { transform: rotate(360deg); }
      }
      @media (prefers-reduced-motion: reduce) {
        .fill { transition: none; }
        .fill.animated, .fill-indeterminate { animation: none; }
        .ring-fill { transition: none; }
        .ring.indeterminate svg { animation: none; }
      }
    `;
  }

  private _renderedOnce = false;
  private _wasComplete = false;

  setValue(value: number, max?: number) {
    if (max !== undefined) this.setAttribute('max', String(max));
    this.setAttribute('value', String(value));
  }

  render() {
    const type = this.attr('type', 'linear') as ProgressType;
    return type === 'circular' ? this._renderCircular() : this._renderLinear();
  }

  private _renderCircular() {
    const { value, max, percent, indeterminate } = this._readState();
    const label = this.attr('label');
    const showValue = this.boolAttr('show-value');
    const ariaLabel = label ? ` aria-label="${escapeAttr(label)}"` : '';
    const ariaValueNow = indeterminate ? '' : ` aria-valuenow="${value}"`;
    // r=15.9155 → circumference ≈ 100, so dasharray reads directly as a percentage
    const dash = indeterminate ? '25 100' : `${percent} 100`;
    const ringStyle = this.hasAttribute('thickness')
      ? ` style="--b-progress-ring-thickness:${this.numAttr('thickness', 3.5)}"`
      : '';

    const valueEl = showValue && !indeterminate
      ? `<span class="ring-value">${escapeHtml(this._formatValue(value, max, percent))}</span>`
      : '';
    const labelEl = label ? `<span class="ring-label">${escapeHtml(label)}</span>` : '';

    return `
      <div class="ring-wrap" role="progressbar" aria-valuemin="0" aria-valuemax="${max}"${ariaValueNow}${ariaLabel}>
        <div class="ring${indeterminate ? ' indeterminate' : ''}"${ringStyle}>
          <svg viewBox="0 0 36 36" aria-hidden="true">
            <circle class="ring-track" cx="18" cy="18" r="15.9155"></circle>
            <circle class="ring-fill" cx="18" cy="18" r="15.9155" stroke-dasharray="${dash}"></circle>
          </svg>
          ${valueEl}
        </div>
        ${labelEl}
      </div>
    `;
  }

  private _renderLinear() {
    const { value, max, percent, indeterminate } = this._readState();
    const label = this.attr('label');
    const showValue = this.boolAttr('show-value');
    const striped = this.boolAttr('striped');
    const animated = this.boolAttr('animated');
    const modifiers = [striped ? 'striped' : '', animated ? 'animated' : ''].filter(Boolean).join(' ');

    const hasLabelRow = !!label || (showValue && !indeterminate);
    const labelRow = hasLabelRow
      ? `
        <div class="label-row">
          <span class="label">${label ? escapeHtml(label) : ''}</span>
          ${showValue && !indeterminate
            ? `<span class="value">${escapeHtml(this._formatValue(value, max, percent))}</span>`
            : ''}
        </div>
      `
      : '';

    const ariaLabel = label ? ` aria-label="${escapeAttr(label)}"` : '';
    const ariaValueNow = indeterminate ? '' : ` aria-valuenow="${value}"`;

    const inner = indeterminate
      ? `<div class="fill-indeterminate ${modifiers}"></div>`
      : `<div class="fill ${modifiers}" style="width:${percent}%"></div>`;

    return `
      ${labelRow}
      <div class="track" role="progressbar" aria-valuemin="0" aria-valuemax="${max}"${ariaValueNow}${ariaLabel}>
        ${inner}
      </div>
    `;
  }

  protected onUpdated() {
    const { value, max, percent, indeterminate } = this._readState();
    if (!this._renderedOnce) {
      this._renderedOnce = true;
      this._wasComplete = !indeterminate && value >= max;
      return;
    }
    if (indeterminate) {
      this._wasComplete = false;
      return;
    }
    this.emit('change', { value, max, percent });
    const isComplete = value >= max;
    if (isComplete && !this._wasComplete) {
      this.emit('complete', { value, max });
    }
    this._wasComplete = isComplete;
  }

  private _readState() {
    const indeterminate = this.boolAttr('indeterminate');
    const max = Math.max(1, this.numAttr('max', 100));
    const raw = Number(this.attr('value'));
    const value = Number.isFinite(raw) ? Math.max(0, Math.min(max, raw)) : 0;
    const percent = (value / max) * 100;
    return { value, max, percent, indeterminate };
  }

  private _formatValue(value: number, max: number, percent: number): string {
    const format = (this.attr('value-format', 'percent') as ValueFormat);
    if (format === 'fraction') return `${value} / ${max}`;
    if (format === 'value') return String(value);
    return `${Math.round(percent)}%`;
  }
}

define('b-progress', BProgress);
