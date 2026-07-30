import { BaseComponent, define } from 'birko-web-core';
import { escapeHtml, escapeAttr } from '../dom-utils';

// ── Types ──

export interface DataPoint {
  x?: string | number;
  y: number;
  label?: string;
  /**
   * Colour for **this point only**, overriding the series colour. Honoured in `bar` mode.
   *
   * For the case where a bar's meaning depends on its own value rather than on which series it belongs to —
   * "days I hit my step goal read differently from days I missed", a bar above a budget line turning red. The
   * alternative, one series per state, is not equivalent: `_renderBar` lays series out **side by side** within
   * each category, so two states would render as pairs of half-width bars instead of one bar per category.
   */
  color?: string;
}

export interface ChartSeries {
  id: string;
  label: string;
  data: DataPoint[];
  color?: string;
}

export interface ChartData {
  labels?: string[];
  series: ChartSeries[];
}

export interface ThresholdLine {
  value: number;
  label?: string;
  color?: string;       // defaults to --b-color-danger
  dash?: number[];      // stroke-dasharray, default [6,4]
}

export interface RealTimeOptions {
  windowMs?: number;          // rolling time window in ms (default: 300000 = 5 min)
  maxPoints?: number;         // max points per series before decimation (default: 300)
  refreshMs?: number;         // rAF throttle interval in ms (default: 100 = 10fps)
  showLatestValue?: boolean;  // overlay current value per series (default: true)
  timeFormat?: 'HH:mm' | 'HH:mm:ss' | 'mm:ss';  // X axis time labels (default: 'HH:mm:ss')
}

export interface ChartOptions {
  xAxis?: { label?: string; gridLines?: boolean };
  yAxis?: {
    label?: string;
    min?: number;
    max?: number;
    gridLines?: boolean;
    /**
     * Target number of y-axis **labels** (gridlines), both ends included — so `ticks: 3` asks for something
     * like `0 / 50 / 100`. Treated as a target, not a promise: the value snaps to whatever round step comes
     * closest (see {@link niceScale}), so the real count can land one either side.
     *
     * Omit it and the count is derived from the plot height instead — a 300px chart keeps the 6 labels
     * b-chart has always drawn, a 90px card drops to 2. Set it when the height-derived count is wrong for
     * your data rather than for your box.
     */
    ticks?: number;
    /**
     * Round the tick values to friendly numbers (default `true`), extending an **auto-derived** bound outwards
     * to sit on one. Set `false` for the pre-nice-scale behaviour: the band split into equal fractions and the
     * fractions printed as they fall (`0, 2271, 4543, 6814, …`).
     *
     * A bound you pass explicitly via {@link ChartOptions.yAxis.min}/`max` is never extended, whatever this
     * says — see {@link BChart._yScale}.
     */
    nice?: boolean;
  };
  tooltip?: boolean;
  stacked?: boolean;
  /**
   * Print the last value of each series in bold beside its final point (default `true`).
   *
   * A live-telemetry affordance — "what is it reading right now" — that a static chart usually does not want,
   * because the surface around it already says so in its caption. Until this option existed the only way to
   * suppress it was `realTime: { showLatestValue: false }`, which meant opting into a completely different
   * (canvas, windowed) mode to turn off a label. That spelling still works and still wins over the default;
   * this one wins over both.
   */
  showLatestValue?: boolean;
  /**
   * Bar mode only: draw a category's series **superimposed** at full category width instead of side by side.
   *
   * For the target-vs-actual shape — a faint "planned" bar with the "done" bar in front of it, where the two
   * series measure the *same* quantity and the part of the target still showing IS the shortfall. The default
   * side-by-side layout can't say that: it halves both bars and leaves the reader comparing two heights
   * instead of seeing one overrun the other. Not the same as {@link ChartOptions.stacked}, which would sum
   * them.
   *
   * Series paint in array order, so list the background (target) series **first**. Give it a translucent or
   * muted colour — an opaque background series hides the one in front when the front series is shorter.
   */
  overlay?: boolean;
  thresholds?: ThresholdLine[];
  realTime?: RealTimeOptions;
}

type ChartType = 'bar' | 'line' | 'gauge' | 'area' | 'pie' | 'donut';

// ── Palette ──

const PALETTE = [
  'var(--b-color-primary)',
  'var(--b-color-success)',
  'var(--b-color-warning)',
  'var(--b-color-danger)',
  'var(--b-color-info)',
  'var(--b-color-secondary)',
];

// ── Y axis scale ──

/** A resolved y axis: the band actually drawn, the tick values on it, and how to print them. */
export interface AxisScale {
  /** Lower bound of the band. Equals the requested min unless it was auto-derived and got rounded outwards. */
  min: number;
  /** Upper bound of the band. */
  max: number;
  /** Tick values, ascending, all inside `[min, max]`. */
  ticks: number[];
  /** Decimal places every tick on this axis should print with — derived from the step, so the axis is uniform. */
  decimals: number;
}

/**
 * Step sizes a reader adds up without thinking. Heckbert's 1 / 2 / 5 ladder plus **2.5**, which is what keeps
 * a band like 0–11 357 off a 2 000 step it does not quite fit and onto 2 500 instead of jumping to 5 000.
 */
const NICE_STEPS = [1, 2, 2.5, 5, 10];

const EPS = 1e-9;

/** Collapse a float that is an integer to within rounding error onto that integer, so `floor`/`ceil` agree. */
function snap(v: number): number {
  const r = Math.round(v);
  return Math.abs(v - r) < EPS * Math.max(1, Math.abs(v)) ? r : v;
}

/**
 * Target number of y-axis **intervals** for a plot this tall, in px (labels are intervals + 1).
 *
 * Roughly one gridline per 50px. At the default 300px chart — 260px of plot once the axis margins are taken —
 * that is the 5 intervals b-chart has always drawn, so a full-size chart's axis density is unchanged. A 90px
 * card falls to a single interval: two labels, which is what the hand-rolled mini-charts b-chart replaces drew.
 * Capped at 5 for the same reason — a taller chart must not suddenly grow a denser axis than it had.
 */
export function tickIntervalsForHeight(plotHeight: number): number {
  if (!Number.isFinite(plotHeight) || plotHeight <= 0) return 5;
  return Math.max(1, Math.min(5, Math.round(plotHeight / 50)));
}

/** Decimal places needed to print multiples of `step` exactly — 2500 → 0, 2.5 → 1, 0.2 → 1. */
function tickDecimals(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0;
  for (let d = 0; d <= 6; d++) {
    const scaled = step * Math.pow(10, d);
    if (Math.abs(scaled - Math.round(scaled)) < EPS * Math.max(1, Math.abs(scaled))) return d;
  }
  return 6;
}

/** Print one tick at the axis-wide precision. Normalises `-0`, which `toFixed` and `String` both keep. */
export function formatTick(value: number, decimals: number): string {
  const s = decimals > 0 ? value.toFixed(decimals) : String(Math.round(value));
  return s === '-0' || /^-0\.0*$/.test(s) ? s.slice(1) : s;
}

/** The pre-nice-scale axis: the band split into equal fractions and printed as they fall. */
function equalScale(min: number, max: number, intervals: number): AxisScale {
  const lo = Number.isFinite(min) ? min : 0;
  const hi = Number.isFinite(max) && max > lo ? max : lo + 1;
  const step = (hi - lo) / intervals;
  const ticks: number[] = [];
  for (let i = 0; i <= intervals; i++) ticks.push(lo + i * step);
  return { min: lo, max: hi, ticks, decimals: step % 1 ? 1 : 0 };
}

/**
 * Density the **band** is rounded at, whatever the chart's height.
 *
 * Deliberately not the height-derived count: tie the band to the label count and a short chart pays for its
 * sparse axis in plot area. An 11 357 peak asked for one interval rounds up to 20 000 — the bars stop at 57% of
 * a plot that is otherwise empty. Fixing this at the full-size density keeps the band tight (0–12 000) and keeps
 * the same data on the same band at every height, so a 90px and a 300px copy of a chart stay comparable. Only
 * the labels thin out.
 */
const BAND_REFERENCE_INTERVALS = 5;

/** Number of multiples of `step` inside `[lo, hi]`. */
function countTicks(lo: number, hi: number, step: number): number {
  return Math.floor(snap(hi / step)) - Math.ceil(snap(lo / step)) + 1;
}

/**
 * Smallest step from the ladder whose label count fits.
 *
 * Smallest-that-fits, not nearest-to-target: on an 11 357 peak asked for two intervals, "nearest" picks a 10 000
 * step — exactly two intervals, and three quarters of the plot empty above the data. The count is therefore a
 * target, not a promise; expect it to land within one of what was asked. Falls back to the closest rung tried
 * when nothing fits, preferring a crowded axis to a one-label one.
 *
 * The slack is one label on a small target and two on a larger one. Proportion is the point: one extra label on
 * a 300px axis is a gridline, on a 90px axis it is half the axis again.
 */
function ladderStep(min: number, max: number, target: number, count: (step: number) => number): number {
  // target intervals -> target+1 labels, plus the slack.
  const maxLabels = target + (target >= 3 ? 2 : 1);
  let best = 1;
  let bestScore = Infinity;
  // Start two decades below the step the target implies and walk up; the ladder is dense enough that the first
  // acceptable rung is always within a few.
  const startExp = Math.floor(Math.log10((max - min) / target)) - 2;
  for (let e = startExp; e <= startExp + 6; e++) {
    const pow = Math.pow(10, e);
    for (const m of NICE_STEPS) {
      const step = m * pow;
      const len = count(step);
      if (len >= 2 && len <= maxLabels) return step;
      const score = len < 2 ? maxLabels - len + 100 : len - maxLabels;
      if (score < bestScore) { bestScore = score; best = step; }
    }
  }
  return best;
}

/**
 * Fit a **nice scale** to `[min, max]`: round the band onto a step from the 1 / 2 / 2.5 / 5 ladder, then place
 * ticks on round values inside it. A steps chart peaking at 11 357 stops labelling itself
 * `0, 2271, 4543, 6814, 9086, 11357` and reads `0, 2000, 4000, …, 12000`.
 *
 * `extendMin` / `extendMax` say whether that bound may move outwards. Pass `false` for a bound the caller chose:
 * rounding a deliberately tight band outwards throws away the thing it was tight for — a 79.9→81.6 kg weight
 * trend redrawn on a 78–82 axis shows half the movement. With the bound pinned the band is left alone and the
 * ticks simply land on round values inside it (`80`, `81`).
 *
 * The band and the tick spacing are chosen **separately** — see {@link BAND_REFERENCE_INTERVALS}.
 */
export function niceScale(
  min: number,
  max: number,
  targetIntervals: number,
  opts: { extendMin?: boolean; extendMax?: boolean } = {},
): AxisScale {
  const extendMin = opts.extendMin !== false;
  const extendMax = opts.extendMax !== false;
  const target = Math.max(1, Math.round(targetIntervals));

  // A degenerate band has no nice form. Hand back an equal split of whatever we were given, so the caller draws
  // *an* axis rather than NaN geometry.
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return equalScale(min, max, target);

  // ── The band ──
  let lo = min;
  let hi = max;
  if (extendMin || extendMax) {
    const roundTo = (step: number) => ({
      lo: extendMin ? Math.floor(snap(min / step)) * step : min,
      hi: extendMax ? Math.ceil(snap(max / step)) * step : max,
    });
    const bandStep = ladderStep(min, max, BAND_REFERENCE_INTERVALS, (step) => {
      const b = roundTo(step);
      return countTicks(b.lo, b.hi, step);
    });
    ({ lo, hi } = roundTo(bandStep));
  }

  // ── The ticks on it ──
  const step = ladderStep(lo, hi, target, (s) => countTicks(lo, hi, s));
  const first = Math.ceil(snap(lo / step)) * step;
  const ticks: number[] = [];
  for (let i = 0; ticks.length <= 64; i++) {
    const v = first + i * step;
    if (v > hi + step * EPS) break;
    ticks.push(v === 0 ? 0 : v); // -0 would survive into the label
  }
  return { min: lo, max: hi, ticks, decimals: tickDecimals(step) };
}

// ── Component ──

export class BChart extends BaseComponent {
  static get observedAttributes() {
    return ['type', 'height', 'legend', 'animate', 'renderer'];
  }

  private _data: ChartData = { series: [] };
  private _options: ChartOptions = {};

  // Canvas real-time state
  private _canvas: HTMLCanvasElement | null = null;
  private _animFrameId = 0;
  private _dirty = false;
  private _lastFrameTime = 0;
  private _resizeObserver: ResizeObserver | null = null;
  private _resolvedColors: string[] = [];

  // SVG responsive sizing — measured from container on first render
  private _svgWidth = 500;
  private _svgHeight = 300;
  private _svgSized = false;

  static get styles() {
    return `
      :host { display: block; }
      .chart-container { position: relative; width: 100%; }
      svg { width: 100%; height: 100%; overflow: visible; }
      .legend {
        display: flex; flex-wrap: wrap; gap: var(--b-space-sm, 0.5rem);
        padding-top: var(--b-space-sm, 0.5rem);
        font-size: var(--b-text-xs, 0.6875rem);
        color: var(--b-text-secondary);
      }
      .legend-item { display: flex; align-items: center; gap: var(--b-space-xs, 0.25rem); }
      .legend-dot {
        width: 0.5rem; height: 0.5rem;
        border-radius: var(--b-radius-full, 9999px);
      }
      .bar-rect { transition: opacity var(--b-transition, 150ms ease); }
      .bar-rect:hover { opacity: 0.8; cursor: pointer; }
      .line-path { fill: none; stroke-width: 2; }
      .area-path { opacity: 0.2; }
      /* Always visible, unlike .data-point: it is the only mark a single-reading series has. */
      .lone-point { opacity: 1; }
      .data-point { opacity: 0; transition: opacity var(--b-transition, 150ms ease); }
      svg:hover .data-point { opacity: 1; }
      .data-point:hover { r: 5; cursor: pointer; }
      .axis-label {
        font-size: var(--b-text-2xs, 0.625rem);
        fill: var(--b-text-muted);
      }
      .grid-line { stroke: var(--b-border); stroke-width: 1; stroke-dasharray: 4 4; }
      .threshold-line { stroke-width: 1.5; }
      /*
       * A threshold label sits inside the plot — there is no gutter wide enough to hold arbitrary label text
       * without stealing width from the data — so bars and lines run underneath it, and a bar that reaches the
       * threshold used to swallow its own label. paint-order:stroke lays a background-coloured halo behind the
       * glyphs, which keeps the text readable without the opaque plate that would hide the data instead.
       */
      .threshold-label {
        font-size: var(--b-text-2xs, 0.625rem);
        paint-order: stroke;
        stroke: var(--b-bg, #fff);
        stroke-width: 3px;
        stroke-linejoin: round;
      }
      .latest-dot { transition: none; }
      .latest-value { font-size: var(--b-text-2xs, 0.625rem); font-weight: var(--b-font-weight-bold, 700); }
      .gauge-bg { fill: none; stroke: var(--b-bg-tertiary); }
      .gauge-fill { fill: none; transition: stroke-dashoffset var(--b-animation-speed, 0.6s) ease; }
      .gauge-value {
        font-size: var(--b-text-2xl, 1.5rem);
        font-weight: var(--b-font-weight-bold, 700);
        fill: var(--b-text);
        text-anchor: middle;
        dominant-baseline: central;
      }
      .gauge-label {
        font-size: var(--b-text-xs, 0.6875rem);
        fill: var(--b-text-muted);
        text-anchor: middle;
      }
      .slice { transition: opacity var(--b-transition, 150ms ease); cursor: pointer; }
      .slice:hover { opacity: 0.8; }
      canvas { width: 100%; }
      @keyframes grow-up { from { transform: scaleY(0); } to { transform: scaleY(1); } }
      @keyframes draw-line { from { stroke-dashoffset: var(--line-length); } to { stroke-dashoffset: 0; } }
    `;
  }

  setData(data: ChartData) {
    this._data = data;
    this.update();
  }

  setOptions(options: ChartOptions) {
    this._options = options;
    this.update();
  }

  appendPoint(seriesId: string, point: DataPoint) {
    const series = this._data.series.find(s => s.id === seriesId);
    if (!series) return;

    // Default x to timestamp if not provided
    if (point.x === undefined) point.x = Date.now();

    series.data.push(point);

    const rt = this._options.realTime;
    const maxPoints = rt?.maxPoints ?? 300;
    const windowMs = rt?.windowMs;

    // Trim by time window
    if (windowMs && typeof point.x === 'number') {
      const cutoff = (point.x as number) - windowMs;
      series.data = series.data.filter(d => (d.x as number) >= cutoff);
    }

    // Trim by max points
    if (series.data.length > maxPoints) {
      series.data = series.data.slice(-maxPoints);
    }

    if (this.attr('renderer') === 'canvas') {
      this._dirty = true;
      this._scheduleFrame();
    } else {
      // SVG mode: update gauge directly, others re-render
      if (this.attr('type') === 'gauge') {
        this._updateGaugeSvg(point.y);
      } else {
        this.update();
      }
    }
  }

  /** Update gauge SVG in-place without full re-render */
  private _updateGaugeSvg(value: number) {
    const min = this._options.yAxis?.min ?? 0;
    const max = this._options.yAxis?.max ?? 100;
    const pct = Math.min(1, Math.max(0, (value - min) / (max - min || 1)));

    const r = 80;
    const circumference = 2 * Math.PI * r;
    const arcLength = circumference * 0.75;
    const dashoffset = arcLength * (1 - pct);

    let color: string;
    if (pct <= 0.6) color = 'var(--b-color-success)';
    else if (pct <= 0.8) color = 'var(--b-color-warning)';
    else color = 'var(--b-color-danger)';

    const fill = this.$<HTMLElement>('.gauge-fill');
    const valueText = this.$<HTMLElement>('.gauge-value');
    if (fill) {
      fill.setAttribute('stroke', color);
      fill.setAttribute('stroke-dashoffset', String(dashoffset));
    }
    if (valueText) valueText.textContent = String(value);
  }

  render() {
    const height = this.lengthAttr('height', '300px');
    const type = this.attr('type', 'bar') as ChartType;
    const showLegend = this.attr('legend') !== 'false';
    const renderer = this.attr('renderer', 'svg');

    if (renderer === 'canvas') {
      return `
        <div class="chart-container" style="height:${escapeAttr(height)}">
          <canvas></canvas>
        </div>
        ${showLegend ? this._renderLegend() : ''}
      `;
    }

    let svg = '';
    switch (type) {
      case 'bar': svg = this._renderBar(); break;
      case 'line': svg = this._renderLine(); break;
      case 'area': svg = this._renderArea(); break;
      case 'gauge': svg = this._renderGauge(); break;
      case 'pie': svg = this._renderPie(false); break;
      case 'donut': svg = this._renderPie(true); break;
      default: svg = this._renderBar();
    }

    const needsLegend = showLegend && type !== 'gauge';

    return `
      <div class="chart-container" style="height:${escapeAttr(height)}">
        ${svg}
      </div>
      ${needsLegend ? this._renderLegend() : ''}
    `;
  }

  protected onUpdated() {
    // Measure container and adapt SVG viewBox to actual dimensions
    if (!this._svgSized) {
      const container = this.$<HTMLElement>('.chart-container');
      if (container && container.clientWidth > 0) {
        const newW = container.clientWidth;
        const newH = container.clientHeight || parseInt(this.attr('height', '300px')) || 300;
        if (newW !== this._svgWidth || newH !== this._svgHeight) {
          this._svgWidth = newW;
          this._svgHeight = newH;
          this._svgSized = true;
          this.update(); // re-render with correct viewBox
          return;
        }
        this._svgSized = true;
      }
    }

    // Wire click events on SVG elements
    this.$$<HTMLElement>('[data-series][data-index]').forEach(el => {
      el.addEventListener('click', () => {
        const sId = el.dataset.series!;
        const idx = Number(el.dataset.index);
        const series = this._data.series.find(s => s.id === sId);
        if (series) {
          this.emit('point-click', { seriesId: sId, index: idx, point: series.data[idx] });
        }
      });
    });

    // Resize observer — re-measure and re-render on container size change
    const container = this.$<HTMLElement>('.chart-container');
    if (container && !this._resizeObserver) {
      this._resizeObserver = new ResizeObserver(() => {
        const w = container.clientWidth;
        const h = container.clientHeight || parseInt(this.attr('height', '300px')) || 300;
        if (w > 0 && (w !== this._svgWidth || h !== this._svgHeight)) {
          this._svgWidth = w;
          this._svgHeight = h;
          this._svgSized = true;
          // Soft-update to avoid aborting listeners during resize
          this.softUpdate();
        }
      });
      this._resizeObserver.observe(container);
    }

    // Canvas mode
    if (this.attr('renderer') === 'canvas') {
      this._canvas = this.$<HTMLCanvasElement>('canvas');
      if (this._canvas) {
        this._sizeCanvas();
        this._resolveColors();
        this._renderCanvas();
      }
    }
  }

  protected onUnmount() {
    if (this._animFrameId) cancelAnimationFrame(this._animFrameId);
    this._resizeObserver?.disconnect();
  }

  private _sizeCanvas() {
    if (!this._canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = this._canvas.parentElement!.getBoundingClientRect();
    this._canvas.width = rect.width * dpr;
    this._canvas.height = rect.height * dpr;
    this._canvas.style.width = `${rect.width}px`;
    this._canvas.style.height = `${rect.height}px`;
    const ctx = this._canvas.getContext('2d');
    ctx?.scale(dpr, dpr);
  }

  private _resolveColors() {
    const style = getComputedStyle(this);
    this._resolvedColors = PALETTE.map(c => {
      const token = c.replace('var(', '').replace(')', '');
      return style.getPropertyValue(token).trim() || '#2563eb';
    });
  }

  private _scheduleFrame() {
    if (this._animFrameId) return; // already scheduled
    this._animFrameId = requestAnimationFrame((time) => {
      this._animFrameId = 0;
      const refreshMs = this._options.realTime?.refreshMs ?? 100;
      if (time - this._lastFrameTime < refreshMs) {
        // Throttle — reschedule
        if (this._dirty) this._scheduleFrame();
        return;
      }
      this._lastFrameTime = time;
      this._dirty = false;
      this._renderCanvas();
    });
  }

  // ── Color helper ──

  private _color(index: number, series?: ChartSeries): string {
    return series?.color ?? PALETTE[index % PALETTE.length];
  }

  // ── Y axis ──

  /**
   * Resolve the y band + ticks for a plot `plotHeight` px tall, from the auto-derived bounds the renderer
   * computed off the data.
   *
   * The tick count comes from `yAxis.ticks` when given and from the plot height otherwise, so a 90px card stops
   * printing the six labels tuned for a 300px one. An explicitly requested bound is drawn **exactly** as asked —
   * only bounds we derived ourselves are allowed to round outwards.
   */
  private _yScale(autoMin: number, autoMax: number, plotHeight: number): AxisScale {
    const ax = this._options.yAxis;
    // `ticks` is a label count; the ladder works in intervals.
    const intervals = ax?.ticks != null
      ? Math.max(1, Math.round(ax.ticks) - 1)
      : tickIntervalsForHeight(plotHeight);
    const min = ax?.min ?? autoMin;
    const max = ax?.max ?? autoMax;
    if (ax?.nice === false) return equalScale(min, max, intervals);
    return niceScale(min, max, intervals, { extendMin: ax?.min == null, extendMax: ax?.max == null });
  }

  /** Is the bold last-value label on? `showLatestValue` wins over the `realTime` spelling it replaces. */
  private _showLatestValue(): boolean {
    return this._options.showLatestValue ?? this._options.realTime?.showLatestValue ?? true;
  }

  // ── Threshold lines (shared by the bar and line renderers) ──

  /**
   * Lines and labels come back **separately** because they belong on opposite sides of the data.
   *
   * The line reads as a level the series is measured against, so the series is drawn over it. The label is
   * chrome and has to stay readable, so it goes on top — emitted with the two together, a bar reaching the
   * threshold painted straight through its own label ("cieľ 10000" with a green bar between the `cie` and the
   * `ľ`), which is the actual cause of the "the label overlaps the leftmost bars" report. The halo alone could
   * not have fixed it: the halo was underneath too.
   */
  private _thresholdSvg(
    toY: (v: number) => number,
    geom: { ml: number; mr: number; mt: number; vw: number },
  ): { lines: string; labels: string } {
    let lines = '';
    let labels = '';
    for (const th of this._options.thresholds ?? []) {
      const y = toY(th.value);
      const color = th.color ?? 'var(--b-color-danger)';
      const dash = th.dash ? th.dash.join(' ') : '6 4';
      lines += `<line x1="${geom.ml}" y1="${y}" x2="${geom.vw - geom.mr}" y2="${y}" class="threshold-line" stroke="${escapeAttr(color)}" stroke-dasharray="${escapeAttr(dash)}" />`;
      if (!th.label) continue;
      // Above the line, except when the line runs along the top of the plot — the SVG is `overflow: visible`,
      // so a label placed above the chart area does not clip, it escapes onto the card.
      const ty = y - geom.mt < 12 ? y + 12 : y - 4;
      labels += `<text x="${geom.ml + 4}" y="${ty}" class="threshold-label" fill="${escapeAttr(color)}">${escapeHtml(th.label)}</text>`;
    }
    return { lines, labels };
  }

  // ── Chart padding / layout ──

  private _layout() {
    // Standard chart area with margins for axes
    return { top: 10, right: 10, bottom: 30, left: 40, width: 100, height: 100 };
    // width/height are percentages — actual sizing via viewBox
  }

  // ── Bar chart ──

  private _renderBar(): string {
    const { series, labels } = this._data;
    if (!series.length) return '<svg></svg>';

    const categories = labels ?? series[0].data.map((_, i) => String(i));
    const n = categories.length;
    const seriesCount = series.length;
    if (n === 0) return '<svg></svg>';

    const allValues = series.flatMap(s => s.data.map(d => d.y));
    const thresholdValues = (this._options.thresholds ?? []).map(t => t.value);

    const vw = this._svgWidth, vh = this._svgHeight;
    const ml = 45, mr = 10, mt = 10, mb = 30;
    const cw = vw - ml - mr;
    const ch = vh - mt - mb;

    // Thresholds join the auto range, as they already did on the line renderer: a goal line above every bar was
    // otherwise drawn at a negative y, and an `overflow: visible` SVG does not clip that — it paints it on the
    // card above the chart.
    const scale = this._yScale(
      Math.min(0, ...allValues, ...thresholdValues),
      Math.max(1, ...allValues, ...thresholdValues),
      ch,
    );
    const minVal = scale.min;
    const maxVal = scale.max;
    const range = maxVal - minVal || 1;

    const barGroupW = cw / n;
    // Overlay mode gives every series the whole category width and paints them on top of one another
    // (see ChartOptions.overlay); the default splits that width between them, side by side.
    const overlay = this._options.overlay === true;
    const barW = overlay ? barGroupW * 0.7 : (barGroupW * 0.7) / seriesCount;
    const barGap = barGroupW * 0.3;
    // Same rule the line renderer uses: at most ~8 x labels, whatever the category count.
    const labelStep = Math.max(1, Math.floor(n / 8));

    let bars = '';
    let xLabels = '';
    let gridLines = '';

    // Y grid lines — count and values both come from the resolved scale (see _yScale / niceScale).
    for (const val of scale.ticks) {
      const y = mt + ch - ((val - minVal) / range) * ch;
      gridLines += `<line x1="${ml}" y1="${y}" x2="${vw - mr}" y2="${y}" class="grid-line" />`;
      gridLines += `<text x="${ml - 5}" y="${y + 3}" text-anchor="end" class="axis-label">${formatTick(val, scale.decimals)}</text>`;
    }

    for (let ci = 0; ci < n; ci++) {
      const groupX = ml + ci * barGroupW + barGap / 2;

      for (let si = 0; si < seriesCount; si++) {
        const point = series[si].data[ci];
        if (!point) continue;
        const barH = ((point.y - minVal) / range) * ch;
        // Nothing to draw for a missing value or a bar with no height: a zero-height <rect> is invisible, so
        // emitting one only adds a node that hit-tests, announces itself to AT and inflates the DOM. A category
        // with no value therefore leaves its slot empty — the bar equivalent of a gap in a line.
        if (!Number.isFinite(barH) || barH <= 0) continue;
        const x = overlay ? groupX : groupX + si * barW;
        const y = mt + ch - barH;
        // Per-point colour wins over the series colour — see DataPoint.color.
        const color = point.color ?? this._color(si, series[si]);

        bars += `<rect class="bar-rect" x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${color}" rx="2"
          data-series="${series[si].id}" data-index="${ci}" role="listitem"
          aria-label="${series[si].label}: ${point.y}"><title>${categories[ci]}: ${point.y}</title></rect>`;
      }

      // Thinned like the line renderer's x labels: one per category is unreadable past ~10 bars (a 90-day daily
      // series would print 90 overlapping dates). `labels` still drives WHICH text is shown, this only decides
      // how many are drawn.
      if (ci % labelStep === 0) {
        xLabels += `<text x="${groupX + barGroupW * 0.35}" y="${vh - 5}" text-anchor="middle" class="axis-label">${categories[ci]}</text>`;
      }
    }

    // Threshold lines — behind the bars, their labels in front of them (see _thresholdSvg).
    const th = this._thresholdSvg(v => mt + ch - ((v - minVal) / range) * ch, { ml, mr, mt, vw });

    return `<svg viewBox="0 0 ${vw} ${vh}" role="img" aria-label="Bar chart">${gridLines}${th.lines}${bars}${th.labels}${xLabels}</svg>`;
  }

  // ── Line chart ──

  private _renderLine(): string {
    return this._renderLinePath(false);
  }

  // ── Area chart ──

  private _renderArea(): string {
    return this._renderLinePath(true);
  }

  private _renderLinePath(fillArea: boolean): string {
    const { series, labels } = this._data;
    if (!series.length || !series[0].data.length) return '<svg></svg>';

    const n = series[0].data.length;
    const thresholds = this._options.thresholds ?? [];

    // ── Y range (include threshold values) ──
    const allValues = series.flatMap(s => s.data.map(d => d.y));
    const thresholdValues = thresholds.map(t => t.value);
    const allWithThresholds = [...allValues, ...thresholdValues];
    const rawMin = Math.min(...allWithThresholds, 0);
    const rawMax = Math.max(...allWithThresholds, 1);
    // Rounding an auto bound outwards is itself headroom, so the 5% pad only applies when nice scaling is off.
    const yPad = this._options.yAxis?.nice === false ? ((rawMax - rawMin) * 0.05 || 1) : 0;

    // ── Detect time-based X axis ──
    const hasTimestamps = series[0].data.every(d => typeof d.x === 'number' && d.x > 1e9);
    const rt = this._options.realTime;

    let xMin: number, xMax: number;
    let isTimeAxis = false;
    if (hasTimestamps) {
      isTimeAxis = true;
      const allX = series.flatMap(s => s.data.map(d => d.x as number));
      if (rt?.windowMs) {
        xMax = Math.max(...allX);
        xMin = xMax - rt.windowMs;
      } else {
        xMin = Math.min(...allX);
        xMax = Math.max(...allX);
      }
    } else {
      xMin = 0;
      xMax = n - 1 || 1;
    }
    const xRange = xMax - xMin || 1;

    const vw = this._svgWidth, vh = this._svgHeight;
    const ml = 45, mr = 10, mt = 10, mb = 30;
    const cw = vw - ml - mr;
    const ch = vh - mt - mb;

    const scale = this._yScale(rawMin - yPad, rawMax + yPad, ch);
    const minVal = scale.min;
    const maxVal = scale.max;
    const range = maxVal - minVal || 1;

    const toX = (v: number) => ml + ((v - xMin) / xRange) * cw;
    const toY = (v: number) => mt + ch - ((v - minVal) / range) * ch;

    let gridSvg = '';
    let thresholdSvg = '';
    let pathsSvg = '';
    let pointsSvg = '';
    let xLabelsSvg = '';
    let latestSvg = '';

    // ── Y grid + labels ──
    for (const val of scale.ticks) {
      const y = toY(val);
      gridSvg += `<line x1="${ml}" y1="${y}" x2="${vw - mr}" y2="${y}" class="grid-line" />`;
      gridSvg += `<text x="${ml - 5}" y="${y + 3}" text-anchor="end" class="axis-label">${formatTick(val, scale.decimals)}</text>`;
    }

    // ── X labels ──
    if (isTimeAxis) {
      const timeFmt = rt?.timeFormat ?? 'HH:mm:ss';
      const xTicks = 6;
      for (let i = 0; i <= xTicks; i++) {
        const t = xMin + (i / xTicks) * xRange;
        const x = toX(t);
        xLabelsSvg += `<text x="${x}" y="${vh - 5}" text-anchor="middle" class="axis-label">${this._formatTime(t, timeFmt)}</text>`;
      }
    } else {
      const cats = labels ?? series[0].data.map((_, i) => String(i));
      const step = Math.max(1, Math.floor(n / 8));
      for (let i = 0; i < n; i += step) {
        const x = toX(i);
        xLabelsSvg += `<text x="${x}" y="${vh - 5}" text-anchor="middle" class="axis-label">${cats[i] ?? i}</text>`;
      }
    }

    // ── Threshold lines ── (labels are held back and painted over the series — see _thresholdSvg)
    const th = this._thresholdSvg(toY, { ml, mr, mt, vw });
    thresholdSvg += th.lines;

    // ── Series lines + points ──
    const showLatest = this._showLatestValue();
    const cats = labels ?? series[0].data.map((_, i) => String(i));

    for (let si = 0; si < series.length; si++) {
      const s = series[si];
      const color = this._color(si, s);
      const pts = s.data.map((d, i) => {
        const x = isTimeAxis ? toX(d.x as number) : toX(i);
        const y = toY(d.y);
        return { x, y };
      });

      if (pts.length === 0) continue;

      const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
      pathsSvg += `<path class="line-path" d="${linePath}" stroke="${color}" />`;

      // A one-point series has no line to draw — `M x,y` with no `L` paints nothing — and the `.data-point`
      // markers below are hover-only, which on a touch device means never. So a series holding a single reading
      // would render as a completely empty chart. Give it a visible marker instead: the reading exists, and "I
      // have logged this once" is a normal early state, not an error.
      if (pts.length === 1) {
        pathsSvg += `<circle class="lone-point" cx="${pts[0].x}" cy="${pts[0].y}" r="3.5" fill="${color}"
          role="listitem" aria-label="${s.label}: ${s.data[0].y}"><title>${s.data[0].y}</title></circle>`;
      }

      if (fillArea) {
        const areaPath = `${linePath} L${pts[pts.length - 1].x},${mt + ch} L${pts[0].x},${mt + ch} Z`;
        pathsSvg += `<path class="area-path" d="${areaPath}" fill="${color}" />`;
      }

      for (let i = 0; i < pts.length; i++) {
        const label = isTimeAxis ? this._formatTime(s.data[i].x as number, 'HH:mm:ss') : (cats[i] ?? String(i));
        pointsSvg += `<circle class="data-point" cx="${pts[i].x}" cy="${pts[i].y}" r="3.5" fill="${color}"
          data-series="${s.id}" data-index="${i}" role="listitem"
          aria-label="${s.label}: ${s.data[i].y}"><title>${label}: ${s.data[i].y}</title></circle>`;
      }

      // ── Latest value overlay ──
      if (showLatest && pts.length > 0) {
        const last = pts[pts.length - 1];
        const lastVal = s.data[s.data.length - 1].y;
        latestSvg += `<circle class="latest-dot" cx="${last.x}" cy="${last.y}" r="4" fill="${color}" />`;
        latestSvg += `<text x="${last.x - 6}" y="${last.y - 8}" text-anchor="end" class="latest-value" fill="${color}">${lastVal.toFixed(lastVal % 1 ? 1 : 0)}</text>`;
      }
    }

    const chartLabel = fillArea ? 'Area chart' : 'Line chart';
    return `<svg viewBox="0 0 ${vw} ${vh}" role="img" aria-label="${chartLabel}">${gridSvg}${thresholdSvg}${pathsSvg}${pointsSvg}${th.labels}${latestSvg}${xLabelsSvg}</svg>`;
  }

  // ── Gauge chart ──

  private _renderGauge(): string {
    const series = this._data.series[0];
    if (!series?.data.length) return '<svg></svg>';

    const value = series.data[0].y;
    const min = this._options.yAxis?.min ?? 0;
    const max = this._options.yAxis?.max ?? 100;
    const pct = Math.min(1, Math.max(0, (value - min) / (max - min || 1)));

    const size = 200;
    const cx = size / 2, cy = size / 2;
    const r = 80;
    const strokeW = 12;
    const circumference = 2 * Math.PI * r;
    // Arc from 180° (semi-circle bottom half skipped — use 270° arc)
    const arcLength = circumference * 0.75; // 270° arc
    const dashoffset = arcLength * (1 - pct);

    // Color based on percentage
    let color: string;
    if (pct <= 0.6) color = 'var(--b-color-success)';
    else if (pct <= 0.8) color = 'var(--b-color-warning)';
    else color = 'var(--b-color-danger)';

    return `
      <svg viewBox="0 0 ${size} ${size}" role="meter" aria-valuenow="${value}" aria-valuemin="${min}" aria-valuemax="${max}" aria-label="${series.label}">
        <circle cx="${cx}" cy="${cy}" r="${r}" class="gauge-bg"
          stroke-width="${strokeW}" stroke-dasharray="${arcLength} ${circumference}" stroke-dashoffset="0"
          transform="rotate(135 ${cx} ${cy})" />
        <circle cx="${cx}" cy="${cy}" r="${r}" class="gauge-fill"
          stroke="${color}" stroke-width="${strokeW}"
          stroke-dasharray="${arcLength} ${circumference}" stroke-dashoffset="${dashoffset}"
          stroke-linecap="round" transform="rotate(135 ${cx} ${cy})" />
        <text x="${cx}" y="${cy - 5}" class="gauge-value">${value}</text>
        <text x="${cx}" y="${cy + 18}" class="gauge-label">${series.label}</text>
      </svg>
    `;
  }

  // ── Pie / Donut ──

  private _renderPie(donut: boolean): string {
    const series = this._data.series[0];
    if (!series?.data.length) return '<svg></svg>';

    const total = series.data.reduce((sum, d) => sum + d.y, 0);
    if (total === 0) return '<svg></svg>';

    const size = 300;
    const cx = size / 2, cy = size / 2;
    const outerR = 130;
    const innerR = donut ? outerR * 0.6 : 0;
    const labels = this._data.labels ?? series.data.map((_, i) => String(i));

    let slices = '';
    let startAngle = -Math.PI / 2; // Start from top

    for (let i = 0; i < series.data.length; i++) {
      const d = series.data[i];
      const sliceAngle = (d.y / total) * 2 * Math.PI;
      const endAngle = startAngle + sliceAngle;
      const largeArc = sliceAngle > Math.PI ? 1 : 0;
      const color = this._color(i);

      const x1 = cx + outerR * Math.cos(startAngle);
      const y1 = cy + outerR * Math.sin(startAngle);
      const x2 = cx + outerR * Math.cos(endAngle);
      const y2 = cy + outerR * Math.sin(endAngle);

      let path: string;
      if (donut) {
        const ix1 = cx + innerR * Math.cos(startAngle);
        const iy1 = cy + innerR * Math.sin(startAngle);
        const ix2 = cx + innerR * Math.cos(endAngle);
        const iy2 = cy + innerR * Math.sin(endAngle);
        path = `M${x1},${y1} A${outerR},${outerR} 0 ${largeArc},1 ${x2},${y2} L${ix2},${iy2} A${innerR},${innerR} 0 ${largeArc},0 ${ix1},${iy1} Z`;
      } else {
        path = `M${cx},${cy} L${x1},${y1} A${outerR},${outerR} 0 ${largeArc},1 ${x2},${y2} Z`;
      }

      const pct = ((d.y / total) * 100).toFixed(1);
      slices += `<path class="slice" d="${path}" fill="${color}"
        data-series="${series.id}" data-index="${i}" role="listitem"
        aria-label="${labels[i]}: ${d.y} (${pct}%)"><title>${labels[i]}: ${d.y} (${pct}%)</title></path>`;

      startAngle = endAngle;
    }

    return `<svg viewBox="0 0 ${size} ${size}" role="img" aria-label="${donut ? 'Donut' : 'Pie'} chart">${slices}</svg>`;
  }

  // ── Legend ──

  private _renderLegend(): string {
    const type = this.attr('type', 'bar') as ChartType;
    const items = (type === 'pie' || type === 'donut')
      ? (this._data.labels ?? []).map((l, i) => ({ label: l, color: this._color(i) }))
      : this._data.series.map((s, i) => ({ label: s.label, color: this._color(i, s) }));

    // Series labels and colours come from caller data, so both positions are escaped — the label is a text
    // node, the colour lands inside `style="…"` where an unescaped quote breaks out into an attribute.
    return `<div class="legend">${items.map(i =>
      `<span class="legend-item"><span class="legend-dot" style="background:${escapeAttr(String(i.color ?? ''))}"></span>${escapeHtml(String(i.label ?? ''))}</span>`
    ).join('')}</div>`;
  }

  // ── Canvas real-time ──

  private _renderCanvas() {
    if (!this._canvas) return;
    const ctx = this._canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = this._canvas.width / dpr;
    const h = this._canvas.height / dpr;
    const ml = 50, mr = 10, mt = 10, mb = 25;
    const cw = w - ml - mr;
    const ch = h - mt - mb;

    ctx.save();
    ctx.clearRect(0, 0, w, h);

    const rt = this._options.realTime;
    const showValue = this._showLatestValue();
    const timeFmt = rt?.timeFormat ?? 'HH:mm:ss';
    const colors = this._resolvedColors.length ? this._resolvedColors : ['#2563eb'];

    // Resolve border/text colors
    const style = getComputedStyle(this);
    const gridColor = style.getPropertyValue('--b-border').trim() || '#e2e8f0';
    const textColor = style.getPropertyValue('--b-text-muted').trim() || '#94a3b8';
    const dangerColor = style.getPropertyValue('--b-color-danger').trim() || '#dc2626';
    const bgColor = style.getPropertyValue('--b-bg').trim() || '#ffffff';

    // ── Compute Y range ──
    const allValues = this._data.series.flatMap(s => s.data.map(d => d.y));
    const thresholdValues = (this._options.thresholds ?? []).map(t => t.value);
    const allWithThresholds = [...allValues, ...thresholdValues];
    if (!allWithThresholds.length) { ctx.restore(); return; }

    const rawMin = Math.min(...allWithThresholds, 0);
    const rawMax = Math.max(...allWithThresholds, 1);
    const yPad = this._options.yAxis?.nice === false ? ((rawMax - rawMin) * 0.05 || 1) : 0;
    const scale = this._yScale(rawMin - yPad, rawMax + yPad, ch);
    const minVal = scale.min;
    const maxVal = scale.max;
    const range = maxVal - minVal || 1;

    // ── Compute X range (time-based) ──
    const allX = this._data.series.flatMap(s => s.data.map(d => d.x as number).filter(Boolean));
    let xMin: number, xMax: number;
    if (rt?.windowMs && allX.length) {
      xMax = Math.max(...allX);
      xMin = xMax - rt.windowMs;
    } else if (allX.length) {
      xMin = Math.min(...allX);
      xMax = Math.max(...allX);
    } else {
      xMin = 0; xMax = 1;
    }
    const xRange = xMax - xMin || 1;

    const toX = (v: number) => ml + ((v - xMin) / xRange) * cw;
    const toY = (v: number) => mt + ch - ((v - minVal) / range) * ch;

    // ── Y grid + labels ──
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.font = `${10}px sans-serif`;
    ctx.fillStyle = textColor;
    ctx.textAlign = 'right';

    for (const val of scale.ticks) {
      const y = toY(val);
      ctx.beginPath();
      ctx.moveTo(ml, y);
      ctx.lineTo(w - mr, y);
      ctx.stroke();
      ctx.fillText(formatTick(val, scale.decimals), ml - 6, y + 3);
    }

    // ── X time labels ──
    ctx.setLineDash([]);
    ctx.textAlign = 'center';
    const xTicks = 6;
    for (let i = 0; i <= xTicks; i++) {
      const t = xMin + (i / xTicks) * xRange;
      const x = toX(t);
      ctx.fillText(this._formatTime(t, timeFmt), x, h - 4);
    }

    // ── Threshold lines ──
    const thresholdLabels: Array<{ text: string; y: number; color: string }> = [];
    for (const th of this._options.thresholds ?? []) {
      const y = toY(th.value);
      const thColor = th.color ?? dangerColor;
      ctx.strokeStyle = thColor;
      ctx.lineWidth = 1.5;
      ctx.setLineDash(th.dash ?? [6, 4]);
      ctx.beginPath();
      ctx.moveTo(ml, y);
      ctx.lineTo(w - mr, y);
      ctx.stroke();

      // The label is deferred until after the series are drawn — same reason as the SVG renderer: emitted here
      // it would be painted over by every line that crosses it.
      if (th.label) thresholdLabels.push({ text: th.label, y: y - mt < 12 ? y + 12 : y - 4, color: thColor });
    }

    // ── Series lines ──
    ctx.setLineDash([]);
    for (let si = 0; si < this._data.series.length; si++) {
      const s = this._data.series[si];
      const n = s.data.length;
      if (n < 1) continue;

      const color = s.color ?? colors[si % colors.length];
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();

      for (let i = 0; i < n; i++) {
        const px = toX(s.data[i].x as number);
        const py = toY(s.data[i].y);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Latest value overlay
      if (showValue && n > 0) {
        const last = s.data[n - 1];
        const lx = toX(last.x as number);
        const ly = toY(last.y);

        // Dot
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(lx, ly, 4, 0, Math.PI * 2);
        ctx.fill();

        // Value label
        ctx.fillStyle = color;
        ctx.font = `bold ${11}px sans-serif`;
        ctx.textAlign = 'right';
        ctx.fillText(last.y.toFixed(last.y % 1 ? 1 : 0), lx - 8, ly - 6);
      }
    }

    // ── Threshold labels, over the series ──
    // Background-coloured outline behind the glyphs (the canvas equivalent of the SVG `paint-order: stroke`
    // halo), so a line running under the label leaves it readable.
    if (thresholdLabels.length) {
      ctx.setLineDash([]);
      ctx.textAlign = 'left';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.font = `${10}px sans-serif`;
      for (const label of thresholdLabels) {
        ctx.strokeStyle = bgColor;
        ctx.strokeText(label.text, ml + 4, label.y);
        ctx.fillStyle = label.color;
        ctx.fillText(label.text, ml + 4, label.y);
      }
      ctx.fillStyle = textColor;
    }

    // ── Y axis label ──
    if (this._options.yAxis?.label) {
      ctx.save();
      ctx.fillStyle = textColor;
      ctx.font = `${10}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.translate(12, mt + ch / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(this._options.yAxis.label, 0, 0);
      ctx.restore();
    }

    ctx.restore();
  }

  private _formatTime(ms: number, fmt: string): string {
    if (ms <= 0) return '';
    const d = new Date(ms);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    switch (fmt) {
      case 'HH:mm': return `${hh}:${mm}`;
      case 'mm:ss': return `${mm}:${ss}`;
      default: return `${hh}:${mm}:${ss}`;
    }
  }
}

define('b-chart', BChart);
