import { BaseComponent, define } from 'birko-web-core';
import { escapeHtml, escapeAttr } from '../dom-utils';
import {
  dataViewerCardSheet,
  dataViewerHeaderSheet,
  toolbarBtnSheet,
} from '../shared-styles';

type Primitive = string | number | boolean | null | undefined | bigint;

export class BObjectTree extends BaseComponent {
  static get observedAttributes() {
    return [
      'expanded-depth', 'max-depth', 'size', 'show-types',
      'show-header', 'header-title', 'no-copy', 'no-expand-actions',
      'max-height', 'sticky-header',
    ];
  }

  static get sharedStyles() {
    return [dataViewerCardSheet, dataViewerHeaderSheet, toolbarBtnSheet];
  }

  private _data: unknown = undefined;
  private _expanded = new Set<string>();
  private _hasData = false;

  static get styles() {
    return `
      :host {
        display: block;
        font-family: var(--b-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
        font-size: var(--b-text-sm, 0.8125rem);
        line-height: 1.5;
        color: var(--b-text);
      }
      :host([size="sm"]) { font-size: var(--b-text-xs, 0.6875rem); }
      :host([size="lg"]) { font-size: var(--b-text-base, 0.875rem); }
      .body { overflow: auto; }
      :host([show-header]) .body { padding: var(--b-space-md, 0.75rem); }
      .node { display: block; }
      .row {
        display: flex;
        align-items: baseline;
        gap: var(--b-space-xs, 0.25rem);
        padding: 1px 0;
      }
      .toggle {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1rem;
        height: 1rem;
        cursor: pointer;
        color: var(--b-text-muted);
        user-select: none;
        flex-shrink: 0;
        font-size: 0.625rem;
      }
      .toggle:hover { color: var(--b-text); }
      .toggle.leaf { cursor: default; visibility: hidden; }
      .key { color: var(--b-color-info, #06b6d4); }
      .index { color: var(--b-text-muted); }
      .colon { color: var(--b-text-muted); margin-right: var(--b-space-xs, 0.25rem); }
      .val-string { color: var(--b-color-success, #10b981); }
      .val-number { color: var(--b-color-warning, #f59e0b); }
      .val-boolean { color: var(--b-color-warning, #f59e0b); }
      .val-null { color: var(--b-text-muted); font-style: italic; }
      .val-undefined { color: var(--b-text-muted); font-style: italic; }
      .val-bigint { color: var(--b-color-warning, #f59e0b); }
      .val-symbol { color: var(--b-color-info, #06b6d4); }
      .val-function { color: var(--b-color-info, #06b6d4); font-style: italic; }
      .meta {
        color: var(--b-text-muted);
        font-size: 0.875em;
        font-style: italic;
      }
      .type-tag {
        color: var(--b-text-muted);
        font-size: 0.75em;
        margin-left: var(--b-space-xs, 0.25rem);
      }
      .children {
        padding-left: 1.25rem;
        border-left: 1px dashed var(--b-border);
        margin-left: 0.5rem;
      }
      .empty {
        color: var(--b-text-muted);
        font-style: italic;
      }
    `;
  }

  setData(data: unknown) {
    this._data = data;
    this._hasData = true;
    this._expanded.clear();
    this._seedExpansion(data, '', 0);
    this.update();
  }

  getData(): unknown {
    return this._data;
  }

  expandAll() {
    this._walkPaths(this._data, '', p => this._expanded.add(p));
    this.update();
  }

  collapseAll() {
    this._expanded.clear();
    this.update();
  }

  render() {
    const showHeader = this.boolAttr('show-header');
    const bodyStyle = this._computeBodyStyle();
    const body = !this._hasData
      ? `<div class="empty"><slot></slot></div>`
      : this._renderNode(this._data, '', undefined, 0);
    if (!showHeader) {
      return `<div class="body" role="tree"${bodyStyle}>${body}</div>`;
    }
    const cardClass = this.attr('sticky-header') === 'page'
      ? 'data-viewer-card sticky-page'
      : 'data-viewer-card';
    return `
      <div class="${cardClass}">
        ${this._renderHeader()}
        <div class="body" role="tree"${bodyStyle}>${body}</div>
      </div>
    `;
  }

  private _computeBodyStyle(): string {
    const maxHeight = this.lengthAttr('max-height');
    const sticky = this.attr('sticky-header');
    if (!maxHeight || sticky === 'page') return '';
    return ` style="max-height:${escapeAttr(maxHeight)}"`;
  }

  private _renderHeader(): string {
    const title = this.attr('header-title', 'Tree');
    const showCopy = !this.boolAttr('no-copy');
    const showExpandActions = !this.boolAttr('no-expand-actions');
    const expandActions = showExpandActions
      ? `<button class="toolbar-btn expand-all" type="button">${escapeHtml(this.label('label-expand', 'bwc.common.expand', 'Expand'))}</button>
         <button class="toolbar-btn collapse-all" type="button">${escapeHtml(this.label('label-collapse', 'bwc.common.collapse', 'Collapse'))}</button>`
      : '';
    const copyBtn = showCopy
      ? `<button class="toolbar-btn copy-btn" type="button">${escapeHtml(this.label('label-copy', 'bwc.common.copy', 'Copy'))}</button>`
      : '';
    return `
      <header class="data-viewer-header">
        <span class="title">${escapeHtml(title)}</span>
        <div class="actions">${expandActions}${copyBtn}</div>
      </header>
    `;
  }

  protected onUpdated() {
    this.$$<HTMLElement>('.toggle:not(.leaf)').forEach(el => {
      this.listen(el, 'click', (e) => {
        e.stopPropagation();
        const path = el.dataset.path ?? '';
        if (this._expanded.has(path)) this._expanded.delete(path);
        else this._expanded.add(path);
        this.update();
        this.emit('toggle', { path, expanded: this._expanded.has(path) });
      });
    });

    const expandBtn = this.$<HTMLButtonElement>('.expand-all');
    if (expandBtn) this.listen(expandBtn, 'click', () => this.expandAll());
    const collapseBtn = this.$<HTMLButtonElement>('.collapse-all');
    if (collapseBtn) this.listen(collapseBtn, 'click', () => this.collapseAll());

    const copyBtn = this.$<HTMLButtonElement>('.copy-btn');
    if (copyBtn) {
      this.listen(copyBtn, 'click', async () => {
        const text = this._serialize();
        try {
          await navigator.clipboard.writeText(text);
          const original = copyBtn.textContent;
          copyBtn.textContent = this.label('label-copied', 'bwc.common.copied', 'Copied!');
          copyBtn.classList.add('copied');
          this.emit('copy', { text });
          setTimeout(() => {
            copyBtn.textContent = original;
            copyBtn.classList.remove('copied');
          }, 1500);
        } catch {
          this.emit('copy-error', {});
        }
      });
    }
  }

  private _serialize(): string {
    try {
      return JSON.stringify(this._data, null, 2);
    } catch {
      return String(this._data);
    }
  }

  private _seedExpansion(node: unknown, path: string, depth: number) {
    const maxDepth = this.numAttr('expanded-depth', 1);
    if (depth >= maxDepth) return;
    if (!this._isContainer(node)) return;
    this._expanded.add(path);
    if (Array.isArray(node)) {
      node.forEach((item, i) => this._seedExpansion(item, `${path}/${i}`, depth + 1));
    } else if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        this._seedExpansion(v, `${path}/${k}`, depth + 1);
      }
    }
  }

  private _walkPaths(node: unknown, path: string, visit: (p: string) => void) {
    if (!this._isContainer(node)) return;
    visit(path);
    if (Array.isArray(node)) {
      node.forEach((item, i) => this._walkPaths(item, `${path}/${i}`, visit));
    } else if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        this._walkPaths(v, `${path}/${k}`, visit);
      }
    }
  }

  private _renderNode(value: unknown, path: string, key: string | number | undefined, depth: number): string {
    const maxDepth = this.attr('max-depth');
    const limit = maxDepth ? Number(maxDepth) : Infinity;
    const keyHtml = this._renderKey(key);
    const isContainer = this._isContainer(value);
    const isOpen = isContainer && this._expanded.has(path) && depth < limit;
    const toggleChar = isContainer ? (isOpen ? '▾' : '▸') : '·';
    const toggleClass = isContainer ? '' : 'leaf';

    if (!isContainer) {
      return `
        <div class="node" role="treeitem">
          <div class="row">
            <span class="toggle ${toggleClass}" data-path="${escapeAttr(path)}" aria-hidden="true">${toggleChar}</span>
            ${keyHtml}${this._renderPrimitive(value as Primitive)}
          </div>
        </div>
      `;
    }

    const summary = this._renderSummary(value);
    const children = isOpen ? this._renderChildren(value, path, depth + 1) : '';

    return `
      <div class="node" role="treeitem" aria-expanded="${isOpen}">
        <div class="row">
          <span class="toggle" data-path="${escapeAttr(path)}" aria-hidden="true">${toggleChar}</span>
          ${keyHtml}<span class="meta">${summary}</span>
        </div>
        ${isOpen ? `<div class="children" role="group">${children}</div>` : ''}
      </div>
    `;
  }

  private _renderChildren(value: unknown, path: string, depth: number): string {
    if (Array.isArray(value)) {
      if (value.length === 0) return `<div class="empty">(empty)</div>`;
      return value.map((item, i) => this._renderNode(item, `${path}/${i}`, i, depth)).join('');
    }
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return `<div class="empty">(empty)</div>`;
    return entries.map(([k, v]) => this._renderNode(v, `${path}/${k}`, k, depth)).join('');
  }

  private _renderKey(key: string | number | undefined): string {
    if (key === undefined) return '';
    if (typeof key === 'number') {
      return `<span class="index">${key}</span><span class="colon">:</span>`;
    }
    return `<span class="key">${escapeHtml(key)}</span><span class="colon">:</span>`;
  }

  private _renderPrimitive(v: Primitive): string {
    const showTypes = this.boolAttr('show-types');
    if (v === null) return `<span class="val-null">null</span>${showTypes ? '<span class="type-tag">null</span>' : ''}`;
    if (v === undefined) return `<span class="val-undefined">undefined</span>${showTypes ? '<span class="type-tag">undefined</span>' : ''}`;
    const t = typeof v;
    if (t === 'string') return `<span class="val-string">"${escapeHtml(String(v))}"</span>${showTypes ? '<span class="type-tag">string</span>' : ''}`;
    if (t === 'number') return `<span class="val-number">${v}</span>${showTypes ? '<span class="type-tag">number</span>' : ''}`;
    if (t === 'boolean') return `<span class="val-boolean">${v}</span>${showTypes ? '<span class="type-tag">boolean</span>' : ''}`;
    if (t === 'bigint') return `<span class="val-bigint">${v}n</span>${showTypes ? '<span class="type-tag">bigint</span>' : ''}`;
    return `<span class="val-string">${escapeHtml(String(v))}</span>`;
  }

  private _renderSummary(value: unknown): string {
    if (Array.isArray(value)) return `Array(${value.length})`;
    if (value instanceof Date) return `Date "${value.toISOString()}"`;
    const entries = Object.entries(value as Record<string, unknown>);
    const name = (value as object).constructor?.name ?? 'Object';
    return `${name} { ${entries.length} ${entries.length === 1 ? 'key' : 'keys'} }`;
  }

  private _isContainer(v: unknown): boolean {
    if (v === null || v === undefined) return false;
    if (typeof v !== 'object') return false;
    if (v instanceof Date) return false;
    return true;
  }
}

define('b-object-tree', BObjectTree);
