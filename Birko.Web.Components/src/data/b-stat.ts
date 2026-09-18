import { BaseComponent, define } from 'birko-web-core';

/**
 * `b-stat` — a single KPI / metric tile for dashboards and summary headers.
 *
 * Shows a small caption, a large value, and an optional change "delta" chip
 * whose colour communicates whether the movement is good or bad.
 *
 * ## Attributes
 * - `label`     — caption shown above the value (small, uppercased).
 * - `value`     — the metric itself. May also be provided via the default slot
 *                 for rich content (e.g. a value with a unit `<b-badge>`).
 * - `delta`     — change text shown in the trend chip, e.g. `+12.5%` or `−3`.
 * - `trend`     — `up` | `down` | `flat`. Drives the arrow glyph and, when
 *                 `sentiment="auto"`, the chip colour.
 * - `sentiment` — `auto` (default) | `positive` | `negative` | `neutral`.
 *                 Decouples colour from direction so "down is good" metrics
 *                 (cost, churn, defects) can show a green downward delta:
 *                 `<b-stat trend="down" sentiment="positive">`.
 * - `size`      — `sm` | `lg` to scale the value text.
 *
 * ## Examples
 * ```html
 * <b-stat label="Revenue" value="€48,210" delta="+12.5%" trend="up"></b-stat>
 * <b-stat label="Churn" value="2.1%" delta="−0.4pp" trend="down" sentiment="positive"></b-stat>
 * <b-stat label="Open tickets" value="37" delta="0" trend="flat"></b-stat>
 * ```
 */
export class BStat extends BaseComponent {
  static get observedAttributes() {
    return ['label', 'value', 'delta', 'trend', 'sentiment', 'size'];
  }

  static get styles() {
    return `
      :host { display: block; }
      .stat { display: flex; flex-direction: column; gap: var(--b-space-2xs, 0.125rem); min-width: 0; }
      .label {
        font-size: var(--b-text-xs, 0.6875rem); font-weight: var(--b-font-weight-medium, 500);
        color: var(--b-text-secondary); text-transform: uppercase;
        letter-spacing: var(--b-letter-spacing-caps, 0.03125rem);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .value-row { display: flex; align-items: baseline; gap: var(--b-space-sm, 0.5rem); flex-wrap: wrap; }
      .value {
        font-size: var(--b-text-2xl, 1.5rem); font-weight: var(--b-font-weight-semibold, 600);
        color: var(--b-text); line-height: var(--b-line-height-tight, 1.4);
      }
      :host([size="sm"]) .value { font-size: var(--b-text-lg, 1rem); }
      :host([size="lg"]) .value { font-size: var(--b-text-3xl, 1.875rem); }
      .delta {
        display: inline-flex; align-items: center; gap: var(--b-space-2xs, 0.125rem);
        font-size: var(--b-text-xs, 0.6875rem); font-weight: var(--b-font-weight-medium, 500);
        padding: var(--b-space-2xs, 0.125rem) var(--b-space-xs, 0.25rem);
        border-radius: var(--b-radius-full, 9999px); white-space: nowrap;
        transition: background var(--b-transition, 150ms ease);
      }
      .delta .arrow { font-size: 0.85em; line-height: 1; }
      .positive { background: var(--b-color-success-light); color: var(--b-color-success); }
      .negative { background: var(--b-color-danger-light); color: var(--b-color-danger); }
      .neutral  { background: var(--b-bg-tertiary); color: var(--b-text-secondary); }
    `;
  }

  /** Resolve the chip colour class from sentiment (auto → derived from trend). */
  private resolveSentiment(): 'positive' | 'negative' | 'neutral' {
    const sentiment = this.attr('sentiment', 'auto');
    if (sentiment === 'positive' || sentiment === 'negative' || sentiment === 'neutral') {
      return sentiment;
    }
    // auto
    const trend = this.attr('trend', 'flat');
    if (trend === 'up') return 'positive';
    if (trend === 'down') return 'negative';
    return 'neutral';
  }

  render() {
    const labelText = this.getAttribute('label') ?? '';
    const value = this.getAttribute('value');
    const delta = this.getAttribute('delta');
    const trend = this.attr('trend', 'flat');

    const arrow = trend === 'up' ? '▲' : trend === 'down' ? '▼' : '–';
    const trendWord = this.label(
      'trend-label',
      `bwc.stat.${trend}`,
      trend === 'up' ? 'increased' : trend === 'down' ? 'decreased' : 'unchanged',
    );

    const labelHtml = labelText ? `<span class="label">${labelText}</span>` : '';
    // value attr takes precedence; otherwise fall back to slotted content
    const valueHtml = value !== null ? value : '<slot></slot>';
    const deltaHtml = delta !== null
      ? `<span class="delta ${this.resolveSentiment()}" aria-label="${trendWord}: ${delta}">
           <span class="arrow" aria-hidden="true">${arrow}</span>${delta}
         </span>`
      : '';

    return `
      <div class="stat">
        ${labelHtml}
        <div class="value-row">
          <span class="value">${valueHtml}</span>
          ${deltaHtml}
        </div>
      </div>
    `;
  }
}

define('b-stat', BStat);
