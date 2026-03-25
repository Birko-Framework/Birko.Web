import { BaseComponent, define } from 'birko-web-core';

// ── Types ──

export interface DataPoint {
  x?: string | number;
  y: number;
  label?: string;
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
  yAxis?: { label?: string; min?: number; max?: number; gridLines?: boolean };
  tooltip?: boolean;
  stacked?: boolean;
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

  static get styles() {
    return `
      :host { display: block; }
      .chart-container { position: relative; width: 100%; }
      svg { width: 100%; overflow: visible; }
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
      .data-point { opacity: 0; transition: opacity var(--b-transition, 150ms ease); }
      svg:hover .data-point { opacity: 1; }
      .data-point:hover { r: 5; cursor: pointer; }
      .axis-label {
        font-size: 0.625rem;
        fill: var(--b-text-muted);
      }
      .grid-line { stroke: var(--b-border); stroke-width: 1; stroke-dasharray: 4 4; }
      .threshold-line { stroke-width: 1.5; }
      .threshold-label { font-size: 0.5625rem; }
      .latest-dot { transition: none; }
      .latest-value { font-size: 0.625rem; font-weight: 700; }
      .gauge-bg { fill: none; stroke: var(--b-bg-tertiary); }
      .gauge-fill { fill: none; transition: stroke-dashoffset 0.6s ease; }
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
    const height = this.attr('height', '300px');
    const type = this.attr('type', 'bar') as ChartType;
    const showLegend = this.attr('legend') !== 'false';
    const renderer = this.attr('renderer', 'svg');

    if (renderer === 'canvas') {
      return `
        <div class="chart-container" style="height:${height}">
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
      <div class="chart-container" style="height:${height}">
        ${svg}
      </div>
      ${needsLegend ? this._renderLegend() : ''}
    `;
  }

  protected onUpdated() {
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

    // Canvas mode
    if (this.attr('renderer') === 'canvas') {
      this._canvas = this.$<HTMLCanvasElement>('canvas');
      if (this._canvas) {
        this._sizeCanvas();
        this._resolveColors();
        this._renderCanvas();

        // Resize observer for responsive canvas
        this._resizeObserver = new ResizeObserver(() => {
          this._sizeCanvas();
          this._renderCanvas();
        });
        this._resizeObserver.observe(this._canvas.parentElement!);
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
    const maxVal = this._options.yAxis?.max ?? Math.max(...allValues, 1);
    const minVal = this._options.yAxis?.min ?? 0;
    const range = maxVal - minVal || 1;

    const vw = 500, vh = 300;
    const ml = 45, mr = 10, mt = 10, mb = 30;
    const cw = vw - ml - mr;
    const ch = vh - mt - mb;
    const barGroupW = cw / n;
    const barW = (barGroupW * 0.7) / seriesCount;
    const barGap = barGroupW * 0.3;

    let bars = '';
    let xLabels = '';
    let gridLines = '';

    // Y grid lines
    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
      const y = mt + ch - (i / yTicks) * ch;
      const val = minVal + (i / yTicks) * range;
      gridLines += `<line x1="${ml}" y1="${y}" x2="${vw - mr}" y2="${y}" class="grid-line" />`;
      gridLines += `<text x="${ml - 5}" y="${y + 3}" text-anchor="end" class="axis-label">${Math.round(val)}</text>`;
    }

    for (let ci = 0; ci < n; ci++) {
      const groupX = ml + ci * barGroupW + barGap / 2;

      for (let si = 0; si < seriesCount; si++) {
        const point = series[si].data[ci];
        if (!point) continue;
        const barH = ((point.y - minVal) / range) * ch;
        const x = groupX + si * barW;
        const y = mt + ch - barH;
        const color = this._color(si, series[si]);

        bars += `<rect class="bar-rect" x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${color}" rx="2"
          data-series="${series[si].id}" data-index="${ci}" role="listitem"
          aria-label="${series[si].label}: ${point.y}"><title>${categories[ci]}: ${point.y}</title></rect>`;
      }

      xLabels += `<text x="${groupX + barGroupW * 0.35}" y="${vh - 5}" text-anchor="middle" class="axis-label">${categories[ci]}</text>`;
    }

    // Threshold lines
    let thresholdSvg = '';
    for (const th of this._options.thresholds ?? []) {
      const y = mt + ch - ((th.value - minVal) / range) * ch;
      const color = th.color ?? 'var(--b-color-danger)';
      const dash = th.dash ? th.dash.join(' ') : '6 4';
      thresholdSvg += `<line x1="${ml}" y1="${y}" x2="${vw - mr}" y2="${y}" class="threshold-line" stroke="${color}" stroke-dasharray="${dash}" />`;
      if (th.label) {
        thresholdSvg += `<text x="${ml + 4}" y="${y - 4}" class="threshold-label" fill="${color}">${th.label}</text>`;
      }
    }

    return `<svg viewBox="0 0 ${vw} ${vh}" role="img" aria-label="Bar chart">${gridLines}${thresholdSvg}${bars}${xLabels}</svg>`;
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
    const yPad = (rawMax - rawMin) * 0.05 || 1;
    const minVal = this._options.yAxis?.min ?? rawMin - yPad;
    const maxVal = this._options.yAxis?.max ?? rawMax + yPad;
    const range = maxVal - minVal || 1;

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

    const vw = 500, vh = 300;
    const ml = 45, mr = 10, mt = 10, mb = 30;
    const cw = vw - ml - mr;
    const ch = vh - mt - mb;

    const toX = (v: number) => ml + ((v - xMin) / xRange) * cw;
    const toY = (v: number) => mt + ch - ((v - minVal) / range) * ch;

    let gridSvg = '';
    let thresholdSvg = '';
    let pathsSvg = '';
    let pointsSvg = '';
    let xLabelsSvg = '';
    let latestSvg = '';

    // ── Y grid + labels ──
    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
      const val = minVal + (i / yTicks) * range;
      const y = toY(val);
      gridSvg += `<line x1="${ml}" y1="${y}" x2="${vw - mr}" y2="${y}" class="grid-line" />`;
      gridSvg += `<text x="${ml - 5}" y="${y + 3}" text-anchor="end" class="axis-label">${val.toFixed(val % 1 ? 1 : 0)}</text>`;
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

    // ── Threshold lines ──
    for (const th of thresholds) {
      const y = toY(th.value);
      const color = th.color ?? 'var(--b-color-danger)';
      const dash = th.dash ? th.dash.join(' ') : '6 4';
      thresholdSvg += `<line x1="${ml}" y1="${y}" x2="${vw - mr}" y2="${y}" class="threshold-line" stroke="${color}" stroke-dasharray="${dash}" />`;
      if (th.label) {
        thresholdSvg += `<text x="${ml + 4}" y="${y - 4}" class="threshold-label" fill="${color}">${th.label}</text>`;
      }
    }

    // ── Series lines + points ──
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
      if (rt?.showLatestValue !== false && pts.length > 0) {
        const last = pts[pts.length - 1];
        const lastVal = s.data[s.data.length - 1].y;
        latestSvg += `<circle class="latest-dot" cx="${last.x}" cy="${last.y}" r="4" fill="${color}" />`;
        latestSvg += `<text x="${last.x - 6}" y="${last.y - 8}" text-anchor="end" class="latest-value" fill="${color}">${lastVal.toFixed(lastVal % 1 ? 1 : 0)}</text>`;
      }
    }

    const chartLabel = fillArea ? 'Area chart' : 'Line chart';
    return `<svg viewBox="0 0 ${vw} ${vh}" role="img" aria-label="${chartLabel}">${gridSvg}${thresholdSvg}${pathsSvg}${pointsSvg}${latestSvg}${xLabelsSvg}</svg>`;
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

    return `<div class="legend">${items.map(i =>
      `<span class="legend-item"><span class="legend-dot" style="background:${i.color}"></span>${i.label}</span>`
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
    const showValue = rt?.showLatestValue !== false;
    const timeFmt = rt?.timeFormat ?? 'HH:mm:ss';
    const colors = this._resolvedColors.length ? this._resolvedColors : ['#2563eb'];

    // Resolve border/text colors
    const style = getComputedStyle(this);
    const gridColor = style.getPropertyValue('--b-border').trim() || '#e2e8f0';
    const textColor = style.getPropertyValue('--b-text-muted').trim() || '#94a3b8';
    const dangerColor = style.getPropertyValue('--b-color-danger').trim() || '#dc2626';

    // ── Compute Y range ──
    const allValues = this._data.series.flatMap(s => s.data.map(d => d.y));
    const thresholdValues = (this._options.thresholds ?? []).map(t => t.value);
    const allWithThresholds = [...allValues, ...thresholdValues];
    if (!allWithThresholds.length) { ctx.restore(); return; }

    const rawMin = this._options.yAxis?.min ?? Math.min(...allWithThresholds, 0);
    const rawMax = this._options.yAxis?.max ?? Math.max(...allWithThresholds, 1);
    const yPad = (rawMax - rawMin) * 0.05 || 1;
    const minVal = this._options.yAxis?.min ?? rawMin - yPad;
    const maxVal = this._options.yAxis?.max ?? rawMax + yPad;
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

    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
      const val = minVal + (i / yTicks) * range;
      const y = toY(val);
      ctx.beginPath();
      ctx.moveTo(ml, y);
      ctx.lineTo(w - mr, y);
      ctx.stroke();
      ctx.fillText(val.toFixed(val % 1 ? 1 : 0), ml - 6, y + 3);
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

      if (th.label) {
        ctx.fillStyle = thColor;
        ctx.textAlign = 'left';
        ctx.fillText(th.label, ml + 4, y - 4);
        ctx.fillStyle = textColor;
      }
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
