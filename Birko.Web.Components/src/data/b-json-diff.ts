import {
  BaseComponent, define, diffJson, formatJsonPath, xmlToTree, xmlToLines,
  type JsonDiffNode, type JsonDiffOptions, type JsonDiffResult, type JsonDiffSummary, type JsonPathSegment,
  type XmlTreeOptions,
} from 'birko-web-core';
import { escapeHtml, escapeAttr, isActivationKey } from '../dom-utils';
import {
  dataViewerCardSheet,
  dataViewerHeaderSheet,
  toolbarBtnSheet,
  srOnlySheet,
} from '../shared-styles';

type View = 'tree' | 'split';
/** The body as given: `xml` holds the text of a side read in `format="xml"`, so the split view can show it as XML. */
type Side = { data: unknown; raw: string; error: string | null; errorKind?: 'json' | 'xml'; xml?: string };

/** `diffJson`'s options, plus how `format="xml"` reads a string body. */
export interface JsonDiffViewOptions extends JsonDiffOptions {
  xml?: XmlTreeOptions;
}
type LineMark = 'added' | 'removed' | 'changed' | 'ignored';

/**
 * Identity of a tree node for expansion state. The path alone is not unique below an array paired by key or
 * unordered: a removed item is listed under its side-A index, which another row may hold on side B.
 */
const nodeKey = (n: JsonDiffNode) =>
  `${n.status === 'removed' ? '-' : '+'}${n.path}|${n.oldSegments ? formatJsonPath(n.oldSegments) : ''}`;

/** Longest inline rendering of a changed container value in the tree before it is cut. */
const INLINE_MAX = 120;

/**
 * Compares two JSON bodies — side A ("old") and side B ("new") — as a tree of changes or side by side.
 * With `format="xml"` a string body is read with `xmlToTree` instead of `JSON.parse`, and the side-by-side view shows
 * the original XML. The comparison is `diffJson` from birko-web-core; `setOptions` takes its options (ignored paths,
 * normalizers, array matching).
 */
export class BJsonDiff extends BaseComponent {
  static get observedAttributes() {
    return ['view', 'only-changes', 'format', 'label-a', 'label-b', 'label-title', 'size', 'max-height'];
  }

  static get sharedStyles() {
    return [dataViewerCardSheet, dataViewerHeaderSheet, toolbarBtnSheet, srOnlySheet];
  }

  private _a: Side | null = null;
  private _b: Side | null = null;
  private _options: JsonDiffViewOptions = {};
  private _inputs: [unknown, unknown] | null = null;
  private _result: JsonDiffResult | null = null;
  private _optionsError: string | null = null;
  private _expanded = new Set<string>();

  static get styles() {
    return `
      :host {
        display: block;
        position: relative;
        font-size: var(--b-text-sm, 0.8125rem);
      }
      :host([size="sm"]) { font-size: var(--b-text-xs, 0.6875rem); }
      :host([size="lg"]) { font-size: var(--b-text-base, 0.875rem); }
      .data-viewer-header { flex-wrap: wrap; }
      .data-viewer-header .actions { flex-wrap: wrap; }
      .summary {
        color: var(--b-text-muted);
        font-size: var(--b-text-xs, 0.6875rem);
        margin-right: auto;
        margin-left: var(--b-space-sm, 0.5rem);
      }
      .summary .n-added { color: var(--b-color-success-text); }
      .summary .n-removed { color: var(--b-color-danger-text); }
      .summary .n-changed { color: var(--b-color-warning-text); }
      .toolbar-btn[aria-pressed="true"] {
        background: var(--b-color-primary-light);
        color: var(--b-color-primary-text);
      }
      .body {
        padding: var(--b-space-md, 0.75rem);
        overflow: auto;
        font-family: var(--b-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
        line-height: 1.5;
        color: var(--b-text);
      }
      .legend {
        margin: 0 0 var(--b-space-sm, 0.5rem);
        display: flex;
        gap: var(--b-space-md, 0.75rem);
        font-size: 0.875em;
      }
      .message, .error {
        margin: 0;
        color: var(--b-text-muted);
        font-style: italic;
      }
      .error { color: var(--b-color-danger-text); font-style: normal; }
      del, ins { text-decoration: none; border-radius: var(--b-radius-sm); padding: 0 var(--b-space-xs, 0.25rem); }
      del { background: var(--b-color-danger-alpha-bg); color: var(--b-color-danger-text); }
      ins { background: var(--b-color-success-alpha-bg); color: var(--b-color-success-text); }
      .node { display: block; }
      .row {
        display: flex;
        align-items: baseline;
        flex-wrap: wrap;
        gap: var(--b-space-xs, 0.25rem);
        padding: 1px 0;
      }
      .toggle {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1rem;
        height: 1rem;
        flex-shrink: 0;
        cursor: pointer;
        color: var(--b-text-muted);
        user-select: none;
        font-size: 0.625rem;
        border-radius: var(--b-radius-sm);
      }
      .toggle:hover { color: var(--b-text); }
      .toggle:focus-visible { outline: 2px solid var(--b-color-primary); outline-offset: 1px; }
      .toggle.leaf { cursor: default; visibility: hidden; }
      .marker { width: 1ch; flex-shrink: 0; font-weight: var(--b-font-weight-semibold, 600); }
      .st-added > .row .marker { color: var(--b-color-success-text); }
      .st-removed > .row .marker { color: var(--b-color-danger-text); }
      .st-changed > .row .marker, .st-modified > .row .marker { color: var(--b-color-warning-text); }
      .st-ignored > .row { opacity: 0.6; }
      .key { color: var(--b-color-info-text, var(--b-color-info)); }
      .index { color: var(--b-text-muted); }
      .colon { color: var(--b-text-muted); }
      .arrow { color: var(--b-text-muted); }
      .meta, .note { color: var(--b-text-muted); font-style: italic; font-size: 0.875em; }
      .count {
        color: var(--b-color-warning-text);
        font-size: 0.875em;
      }
      .children {
        padding-left: 1.25rem;
        border-left: 1px dashed var(--b-border);
        margin-left: 0.5rem;
      }
      .split {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: var(--b-space-md, 0.75rem);
      }
      @media (max-width: 48rem) {
        .split { grid-template-columns: minmax(0, 1fr); }
      }
      .pane { min-width: 0; }
      .pane h3 {
        margin: 0 0 var(--b-space-xs, 0.25rem);
        font-size: var(--b-text-xs, 0.6875rem);
        font-weight: var(--b-font-weight-semibold, 600);
        color: var(--b-text-muted);
        text-transform: uppercase;
      }
      .pane pre {
        margin: 0;
        overflow: auto;
        font: inherit;
      }
      .line { display: block; padding: 0 var(--b-space-xs, 0.25rem); white-space: pre; }
      .line.mk-added { background: var(--b-color-success-alpha-bg); }
      .line.mk-removed { background: var(--b-color-danger-alpha-bg); }
      .line.mk-changed { background: var(--b-color-warning-alpha-bg); }
      .line.mk-ignored { opacity: 0.6; }
    `;
  }

  /**
   * Sets both bodies and compares them. A string is parsed as JSON, or as XML with `format="xml"`; a side that does not
   * parse shows its error and raw text.
   */
  setData(a: unknown, b: unknown) {
    this._inputs = [a, b];
    this._read();
    this._compute(true);
  }

  /** Sets the comparison options (ignored paths, normalizers, array matching, `xml` reading) and compares again. */
  setOptions(options: JsonDiffViewOptions) {
    this._options = options ?? {};
    this._read();
    this._compute(true);
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    // A format switch re-reads the bodies; everything else only re-renders.
    if (name === 'format' && oldValue !== newValue && this._inputs) {
      this._read();
      this._compute(true);
      return;
    }
    super.attributeChangedCallback(name, oldValue, newValue);
  }

  private get _format(): 'json' | 'xml' {
    return this.attr('format') === 'xml' ? 'xml' : 'json';
  }

  private _read() {
    if (!this._inputs) return;
    this._a = this._side(this._inputs[0]);
    this._b = this._side(this._inputs[1]);
  }

  /** The last comparison, or `null` before both sides are set or when a side does not parse. */
  getResult(): JsonDiffResult | null {
    return this._result;
  }

  expandAll() {
    if (!this._result) return;
    const walk = (n: JsonDiffNode) => {
      if (!n.children?.length) return;
      this._expanded.add(nodeKey(n));
      n.children.forEach(walk);
    };
    walk(this._result.tree);
    this.update();
  }

  collapseAll() {
    this._expanded.clear();
    this.update();
  }

  private get _view(): View {
    return this.attr('view') === 'split' ? 'split' : 'tree';
  }

  private _side(value: unknown): Side {
    if (typeof value === 'string' && this._format === 'xml') {
      const data = xmlToTree(value, this._options.xml);
      return data === null
        ? { data: undefined, raw: value, error: 'not XML', errorKind: 'xml' }
        : { data, raw: value, error: null, xml: value };
    }
    if (typeof value !== 'string') {
      let raw: string;
      try { raw = JSON.stringify(value, null, 2) ?? String(value); } catch { raw = String(value); }
      return { data: value, raw, error: null };
    }
    try {
      return { data: JSON.parse(value), raw: value, error: null };
    } catch (err) {
      return { data: undefined, raw: value, error: err instanceof Error ? err.message : String(err), errorKind: 'json' };
    }
  }

  private _compute(reseed: boolean) {
    this._result = null;
    this._optionsError = null;
    if (this._a && this._b && !this._a.error && !this._b.error) {
      try {
        const { xml: _xml, ...diffOptions } = this._options;
        this._result = diffJson(this._a.data, this._b.data, diffOptions);
      } catch (err) {
        this._optionsError = err instanceof Error ? err.message : String(err);
      }
    }
    if (reseed) this._seedExpansion();
    this.update();
    if (this._result) {
      this.emit('diff-computed', { equal: this._result.equal, summary: this._result.summary, changes: this._result.changes });
    }
  }

  /** Containers holding a difference start open; everything else starts closed. */
  private _seedExpansion() {
    this._expanded.clear();
    if (!this._result) return;
    const walk = (n: JsonDiffNode) => {
      if (n.status !== 'modified') return;
      this._expanded.add(nodeKey(n));
      n.children?.forEach(walk);
    };
    walk(this._result.tree);
  }

  render() {
    const view = this._view;
    const onlyChanges = this.boolAttr('only-changes');
    const title = this._title();
    const pressed = (on: boolean) => `aria-pressed="${on}"`;
    const treeActions = view === 'tree'
      ? `<button class="toolbar-btn only-changes" type="button" ${pressed(onlyChanges)}>${escapeHtml(this.label('label-only-changes', 'bwc.jsonDiff.onlyChanges', 'Only changes'))}</button>
         <button class="toolbar-btn expand-all" type="button">${escapeHtml(this.label('label-expand', 'bwc.common.expand', 'Expand'))}</button>
         <button class="toolbar-btn collapse-all" type="button">${escapeHtml(this.label('label-collapse', 'bwc.common.collapse', 'Collapse'))}</button>`
      : '';
    return `
      <div class="data-viewer-card">
        <header class="data-viewer-header">
          <span class="title">${escapeHtml(title)}</span>
          <output class="summary" aria-live="polite">${this._renderSummary()}</output>
          <div class="actions" role="toolbar" aria-label="${escapeAttr(title)}">
            <button class="toolbar-btn view-tree" type="button" ${pressed(view === 'tree')}>${escapeHtml(this.label('label-view-tree', 'bwc.jsonDiff.viewTree', 'Tree'))}</button>
            <button class="toolbar-btn view-split" type="button" ${pressed(view === 'split')}>${escapeHtml(this.label('label-view-split', 'bwc.jsonDiff.viewSplit', 'Side by side'))}</button>
            ${treeActions}
          </div>
        </header>
        <div class="body"${this._bodyStyle()}>${view === 'split' ? this._renderSplit() : this._renderTreeView(onlyChanges)}</div>
      </div>
    `;
  }

  private _title() {
    return this._format === 'xml'
      ? this.label('label-title', 'bwc.jsonDiff.titleXml', 'XML diff')
      : this.label('label-title', 'bwc.jsonDiff.title', 'JSON diff');
  }
  private _labelA() { return this.label('label-a', 'bwc.jsonDiff.sideA', 'A'); }
  private _labelB() { return this.label('label-b', 'bwc.jsonDiff.sideB', 'B'); }

  private _bodyStyle(): string {
    const maxHeight = this.lengthAttr('max-height');
    return maxHeight ? ` style="max-height:${escapeAttr(maxHeight)}"` : '';
  }

  private _renderSummary(): string {
    const r = this._result;
    if (!r) return '';
    if (r.equal) return escapeHtml(this.label('label-no-differences', 'bwc.jsonDiff.noDifferences', 'No differences'));
    const s: JsonDiffSummary = r.summary;
    const part = (cls: string, attr: string, key: string, fallback: string, n: number) =>
      `<span class="${cls}">${escapeHtml(this.label(attr, key, fallback, { count: n }))}</span>`;
    return [
      part('n-added', 'label-count-added', 'bwc.jsonDiff.countAdded', '{count} added', s.added),
      part('n-removed', 'label-count-removed', 'bwc.jsonDiff.countRemoved', '{count} removed', s.removed),
      part('n-changed', 'label-count-changed', 'bwc.jsonDiff.countChanged', '{count} changed', s.changed),
    ].join(', ');
  }

  private _renderProblem(): string | null {
    if (!this._a || !this._b) {
      return `<p class="message">${escapeHtml(this.label('label-no-data', 'bwc.jsonDiff.noData', 'Nothing to compare'))}</p>`;
    }
    const errors: string[] = [];
    if (this._a.error) errors.push(this._parseError(this._labelA(), this._a));
    if (this._b.error) errors.push(this._parseError(this._labelB(), this._b));
    if (this._optionsError) errors.push(`<p class="error" role="alert">${escapeHtml(this._optionsError)}</p>`);
    return errors.length ? errors.join('') : null;
  }

  private _parseError(label: string, side: Side): string {
    const text = side.errorKind === 'xml'
      ? this.label('label-not-xml', 'bwc.jsonDiff.notXml', '{side}: not XML', { side: label })
      : this.label('label-parse-error', 'bwc.jsonDiff.parseError', '{side}: JSON parse error: {message}', { side: label, message: side.error ?? '' });
    return `<p class="error" role="alert">${escapeHtml(text)}</p>`;
  }

  // ── Tree view ──

  private _renderTreeView(onlyChanges: boolean): string {
    const problem = this._renderProblem();
    if (problem || !this._result) return problem ?? '';
    const legend = `<p class="legend"><del>− ${escapeHtml(this._labelA())}</del><ins>+ ${escapeHtml(this._labelB())}</ins></p>`;
    const tree = this._result.tree;
    if (onlyChanges && this._result.equal) {
      return `${legend}<p class="message">${escapeHtml(this.label('label-no-differences', 'bwc.jsonDiff.noDifferences', 'No differences'))}</p>`;
    }
    // The root container is not drawn as a row: its children are the top level.
    const top = tree.children && tree.type !== 'value' && tree.status !== 'changed' && tree.status !== 'ignored'
      ? this._renderChildren(tree, onlyChanges)
      : this._renderNode(tree, onlyChanges);
    return `${legend}<div role="tree" aria-label="${escapeAttr(this._title())}">${top}</div>`;
  }

  private _renderChildren(node: JsonDiffNode, onlyChanges: boolean): string {
    const kids = (node.children ?? []).filter((c) => !onlyChanges || (c.status !== 'equal' && c.status !== 'ignored'));
    if (kids.length === 0) return `<p class="message">${escapeHtml(this.label('label-empty', 'bwc.jsonDiff.empty', '(empty)'))}</p>`;
    return kids.map((c) => this._renderNode(c, onlyChanges)).join('');
  }

  private _renderNode(node: JsonDiffNode, onlyChanges: boolean): string {
    const expandable = node.type !== 'value' && node.status !== 'changed' && (node.children?.length ?? 0) > 0;
    const open = expandable && this._expanded.has(nodeKey(node));
    const toggle = expandable
      ? `<span class="toggle" role="button" tabindex="0" data-node="${escapeAttr(nodeKey(node))}" data-path="${escapeAttr(node.path)}" aria-label="${escapeAttr(this._keyText(node.key) || this._labelRoot())}">${open ? '▾' : '▸'}</span>`
      : '<span class="toggle leaf" aria-hidden="true">·</span>';
    const marker = ({ added: '+', removed: '−', changed: '~', modified: '~', equal: '', ignored: '' } as const)[node.status];
    const statusText = this._statusText(node);
    const row = `
      <div class="row">
        ${toggle}<span class="marker" aria-hidden="true">${marker}</span>${statusText ? `<span class="sr-only">${escapeHtml(statusText)}</span>` : ''}
        ${this._renderKey(node.key)}${this._renderValue(node, expandable)}
      </div>`;
    const children = open ? `<div class="children" role="group">${this._renderChildren(node, onlyChanges && node.status === 'modified')}</div>` : '';
    return `<div class="node st-${node.status}" role="treeitem"${expandable ? ` aria-expanded="${open}"` : ''}>${row}${children}</div>`;
  }

  private _labelRoot() { return this.label('label-root', 'bwc.jsonDiff.root', 'root'); }

  private _statusText(node: JsonDiffNode): string {
    switch (node.status) {
      case 'added': return this.label('label-status-added', 'bwc.jsonDiff.statusAdded', 'added');
      case 'removed': return this.label('label-status-removed', 'bwc.jsonDiff.statusRemoved', 'removed');
      case 'changed': return this.label('label-status-changed', 'bwc.jsonDiff.statusChanged', 'changed');
      case 'modified': return this.label('label-status-modified', 'bwc.jsonDiff.statusModified', 'contains changes');
      case 'ignored': return this.label('label-status-ignored', 'bwc.jsonDiff.statusIgnored', 'ignored');
      default: return '';
    }
  }

  private _keyText(key: JsonPathSegment | undefined): string {
    return key === undefined ? '' : String(key);
  }

  private _renderKey(key: JsonPathSegment | undefined): string {
    if (key === undefined) return '';
    const cls = typeof key === 'number' ? 'index' : 'key';
    return `<span class="${cls}">${escapeHtml(String(key))}</span><span class="colon">:</span>`;
  }

  private _renderValue(node: JsonDiffNode, expandable: boolean): string {
    const shown = node.hasNew ? node.newValue : node.oldValue;
    if (expandable) {
      const count = node.status === 'modified'
        ? ` <span class="count">${escapeHtml(this.label('label-change-count', 'bwc.jsonDiff.changeCount', node.summary.total === 1 ? '({count} change)' : '({count} changes)', { count: node.summary.total }))}</span>`
        : '';
      const meta = `<span class="meta">${escapeHtml(this._containerSummary(shown))}</span>`;
      if (node.status === 'added') return `<ins>${meta}</ins>`;
      if (node.status === 'removed') return `<del>${meta}</del>`;
      return `${meta}${count}`;
    }
    switch (node.status) {
      case 'added': return `<ins>${escapeHtml(this._inline(node.newValue))}</ins>`;
      case 'removed': return `<del>${escapeHtml(this._inline(node.oldValue))}</del>`;
      case 'changed':
        return `<del>${escapeHtml(this._inline(node.oldValue))}</del><span class="arrow" aria-hidden="true">→</span><ins>${escapeHtml(this._inline(node.newValue))}</ins>`;
      case 'ignored':
        return `<span>${escapeHtml(this._inline(shown))}</span> <span class="note">${escapeHtml(this._statusText(node))}</span>`;
      default:
        return `<span>${escapeHtml(this._inline(shown))}</span>`;
    }
  }

  private _containerSummary(value: unknown): string {
    if (Array.isArray(value)) return `Array(${value.length})`;
    const n = value && typeof value === 'object' ? Object.keys(value).length : 0;
    return `{ ${n} ${n === 1 ? 'key' : 'keys'} }`;
  }

  private _inline(value: unknown): string {
    let text: string;
    try { text = JSON.stringify(value) ?? String(value); } catch { text = String(value); }
    return text.length > INLINE_MAX ? `${text.slice(0, INLINE_MAX - 1)}…` : text;
  }

  // ── Side-by-side view ──

  private _renderSplit(): string {
    if (!this._a || !this._b) return this._renderProblem() ?? '';
    const marksA = new Map<string, LineMark>();
    const marksB = new Map<string, LineMark>();
    if (this._result) {
      const walk = (n: JsonDiffNode) => {
        const pathA = n.oldSegments ? formatJsonPath(n.oldSegments) : n.path;
        if (n.status === 'removed' || n.status === 'changed' || n.status === 'ignored') {
          if (n.hasOld) marksA.set(pathA, n.status === 'ignored' ? 'ignored' : n.status === 'changed' ? 'changed' : 'removed');
        }
        if (n.status === 'added' || n.status === 'changed' || n.status === 'ignored') {
          if (n.hasNew) marksB.set(n.path, n.status === 'ignored' ? 'ignored' : n.status === 'changed' ? 'changed' : 'added');
        }
        n.children?.forEach(walk);
      };
      walk(this._result.tree);
    }
    const problem = this._optionsError ? `<p class="error" role="alert">${escapeHtml(this._optionsError)}</p>` : '';
    return `${problem}<div class="split">
      ${this._renderPane('a', this._labelA(), this._a, marksA)}
      ${this._renderPane('b', this._labelB(), this._b, marksB)}
    </div>`;
  }

  private _renderPane(which: 'a' | 'b', label: string, side: Side, marks: Map<string, LineMark>): string {
    const id = `${this.uid}-pane-${which}`;
    const body = side.error
      ? `${this._parseError(label, side)}<pre><code>${escapeHtml(side.raw)}</code></pre>`
      : `<pre><code>${side.xml !== undefined ? this._xmlLines(side.xml, marks) : this._prettyLines(side.data, marks)}</code></pre>`;
    return `<section class="pane" aria-labelledby="${id}"><h3 id="${id}">${escapeHtml(label)}</h3>${body}</section>`;
  }

  /**
   * The original XML, pretty-printed, each line marked by the paths it shows. A line inside a marked element (an added
   * subtree, a value replaced by a container) takes the nearest marked ancestor's mark.
   */
  private _xmlLines(xml: string, marks: Map<string, LineMark>): string {
    const lines = xmlToLines(xml, this._options.xml) ?? [];
    const markOf = (segs: JsonPathSegment[]): LineMark | undefined => {
      for (let n = segs.length; n >= 0; n--) {
        const m = marks.get(formatJsonPath(segs.slice(0, n)));
        if (m) return m;
      }
      return undefined;
    };
    return lines.map((line) => {
      const mark = line.paths.map(markOf).find((m) => m !== undefined);
      return `<span class="line${mark ? ` mk-${mark}` : ''}">${escapeHtml(line.text)}</span>`;
    }).join('');
  }

  /** Pretty-prints a value one line per span, each line marked by the status of the path it belongs to. */
  private _prettyLines(value: unknown, marks: Map<string, LineMark>): string {
    const out: string[] = [];
    const push = (text: string, mark: LineMark | undefined) =>
      out.push(`<span class="line${mark ? ` mk-${mark}` : ''}">${escapeHtml(text)}</span>`);
    const walk = (v: unknown, segs: JsonPathSegment[], indent: string, prefix: string, comma: string, inherited: LineMark | undefined) => {
      const mark = marks.get(formatJsonPath(segs)) ?? inherited;
      if (Array.isArray(v) || (v !== null && typeof v === 'object')) {
        const entries: [JsonPathSegment, unknown, string][] = Array.isArray(v)
          ? v.map((item, i) => [i, item, ''])
          : Object.entries(v as Record<string, unknown>).map(([k, item]) => [k, item, `${JSON.stringify(k)}: `]);
        const [open, close] = Array.isArray(v) ? ['[', ']'] : ['{', '}'];
        if (entries.length === 0) { push(`${indent}${prefix}${open}${close}${comma}`, mark); return; }
        push(`${indent}${prefix}${open}`, mark);
        entries.forEach(([k, item, keyText], i) =>
          walk(item, [...segs, k], `${indent}  `, keyText, i < entries.length - 1 ? ',' : '', mark));
        push(`${indent}${close}${comma}`, mark);
        return;
      }
      let text: string;
      try { text = JSON.stringify(v) ?? String(v); } catch { text = String(v); }
      push(`${indent}${prefix}${text}${comma}`, mark);
    };
    walk(value, [], '', '', '', undefined);
    return out.join('');
  }

  // ── Events ──

  protected onUpdated() {
    const setAttr = (name: string, value: string | null) => {
      if (value === null) this.removeAttribute(name); else this.setAttribute(name, value);
    };
    const viewBtn = (selector: string, view: View) => {
      const btn = this.$<HTMLButtonElement>(selector);
      if (!btn) return;
      this.listen(btn, 'click', () => {
        if (this._view === view) return;
        setAttr('view', view);
        this.emit('view-change', { view });
      });
    };
    viewBtn('.view-tree', 'tree');
    viewBtn('.view-split', 'split');

    const onlyBtn = this.$<HTMLButtonElement>('.only-changes');
    if (onlyBtn) {
      this.listen(onlyBtn, 'click', () => {
        const next = !this.boolAttr('only-changes');
        setAttr('only-changes', next ? '' : null);
        this.emit('only-changes-change', { onlyChanges: next });
      });
    }
    const expandBtn = this.$<HTMLButtonElement>('.expand-all');
    if (expandBtn) this.listen(expandBtn, 'click', () => this.expandAll());
    const collapseBtn = this.$<HTMLButtonElement>('.collapse-all');
    if (collapseBtn) this.listen(collapseBtn, 'click', () => this.collapseAll());

    this.$$<HTMLElement>('.toggle[data-node]').forEach((el) => {
      const toggle = () => {
        const key = el.dataset.node ?? '';
        if (this._expanded.has(key)) this._expanded.delete(key); else this._expanded.add(key);
        this.update();
        this.$<HTMLElement>(`.toggle[data-node="${CSS.escape(key)}"]`)?.focus();
        this.emit('toggle', { path: el.dataset.path ?? '', expanded: this._expanded.has(key) });
      };
      this.listen(el, 'click', toggle);
      this.listen<KeyboardEvent>(el, 'keydown', (e) => {
        if (!isActivationKey(e)) return;
        e.preventDefault();
        toggle();
      });
    });
  }
}

define('b-json-diff', BJsonDiff);
