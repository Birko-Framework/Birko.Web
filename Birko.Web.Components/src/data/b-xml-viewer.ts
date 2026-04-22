import { BaseComponent, define } from 'birko-web-core';
import {
  dataViewerCardSheet,
  dataViewerHeaderSheet,
  toolbarBtnSheet,
} from '../shared-styles';

export class BXmlViewer extends BaseComponent {
  static get observedAttributes() {
    return ['src', 'expanded-depth', 'max-depth', 'size', 'no-copy', 'max-height', 'sticky-header'];
  }

  static get sharedStyles() {
    return [dataViewerCardSheet, dataViewerHeaderSheet, toolbarBtnSheet];
  }

  private _doc: Document | null = null;
  private _source = '';
  private _hasData = false;
  private _parseError: string | null = null;
  private _expanded = new Set<string>();

  static get styles() {
    return `
      :host { display: block; }
      .body {
        padding: var(--b-space-md, 0.75rem);
        overflow: auto;
        font-family: var(--b-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
        font-size: var(--b-text-sm, 0.8125rem);
        line-height: 1.5;
        color: var(--b-text);
      }
      :host([size="sm"]) .body { font-size: var(--b-text-xs, 0.6875rem); }
      :host([size="lg"]) .body { font-size: var(--b-text-base, 0.875rem); }
      .error {
        padding: var(--b-space-md, 0.75rem);
        color: var(--b-color-danger);
        font-family: var(--b-font-mono, ui-monospace, monospace);
        font-size: var(--b-text-sm, 0.8125rem);
      }
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
      .children {
        padding-left: 1.25rem;
        border-left: 1px dashed var(--b-border);
        margin-left: 0.5rem;
      }
      .tag-open, .tag-close { color: var(--b-color-primary, #3b82f6); }
      .tag-name { color: var(--b-color-primary, #3b82f6); }
      .tag-punct { color: var(--b-text-muted); }
      .attr-name { color: var(--b-color-info, #06b6d4); }
      .attr-value { color: var(--b-color-success, #10b981); }
      .text { color: var(--b-text); overflow-wrap: anywhere; }
      .cdata { color: var(--b-color-warning, #f59e0b); font-style: italic; }
      .comment { color: var(--b-text-muted); font-style: italic; }
      .pi { color: var(--b-text-muted); font-style: italic; }
      .summary { color: var(--b-text-muted); font-style: italic; margin-left: var(--b-space-xs, 0.25rem); font-size: 0.875em; }
    `;
  }

  setSource(xml: string) {
    this._source = xml;
    this._parse();
    this._hasData = true;
    this._expanded.clear();
    this._seedExpansion();
    this.update();
  }

  setDocument(doc: Document) {
    this._doc = doc;
    this._source = new XMLSerializer().serializeToString(doc);
    this._parseError = null;
    this._hasData = true;
    this._expanded.clear();
    this._seedExpansion();
    this.update();
  }

  getSource(): string {
    return this._source;
  }

  expandAll() {
    if (!this._doc) return;
    this._walkPaths(this._doc.documentElement, '0', p => this._expanded.add(p));
    this.update();
  }

  collapseAll() {
    this._expanded.clear();
    this.update();
  }

  render() {
    const showCopy = !this.boolAttr('no-copy');
    const bodyStyle = this._computeBodyStyle();
    const cardClass = this.attr('sticky-header') === 'page'
      ? 'data-viewer-card sticky-page'
      : 'data-viewer-card';
    return `
      <div class="${cardClass}">
        <header class="data-viewer-header">
          <span class="title">XML</span>
          <div class="actions">
            <button class="toolbar-btn expand-all" type="button">${this._escapeHtml(this.attr('label-expand', 'Expand'))}</button>
            <button class="toolbar-btn collapse-all" type="button">${this._escapeHtml(this.attr('label-collapse', 'Collapse'))}</button>
            ${showCopy ? `<button class="toolbar-btn copy-btn" type="button">${this._escapeHtml(this.attr('label-copy', 'Copy'))}</button>` : ''}
          </div>
        </header>
        ${this._parseError
          ? `<div class="error">XML parse error: ${this._escapeHtml(this._parseError)}</div>`
          : `<div class="body"${bodyStyle}>${this._renderBody()}</div>`}
      </div>
    `;
  }

  private _computeBodyStyle(): string {
    const maxHeight = this.attr('max-height');
    const sticky = this.attr('sticky-header');
    if (!maxHeight || sticky === 'page') return '';
    return ` style="max-height:${this._escapeAttr(maxHeight)}"`;
  }

  protected onMount() {
    this._loadFromAttributes();
  }

  protected onUpdated() {
    const expandBtn = this.$<HTMLButtonElement>('.expand-all');
    if (expandBtn) this.listen(expandBtn, 'click', () => this.expandAll());
    const collapseBtn = this.$<HTMLButtonElement>('.collapse-all');
    if (collapseBtn) this.listen(collapseBtn, 'click', () => this.collapseAll());

    const copyBtn = this.$<HTMLButtonElement>('.copy-btn');
    if (copyBtn) {
      this.listen(copyBtn, 'click', async () => {
        try {
          await navigator.clipboard.writeText(this._source);
          const original = copyBtn.textContent;
          copyBtn.textContent = this.attr('label-copied', 'Copied!');
          copyBtn.classList.add('copied');
          this.emit('copy', { text: this._source });
          setTimeout(() => {
            copyBtn.textContent = original;
            copyBtn.classList.remove('copied');
          }, 1500);
        } catch {
          this.emit('copy-error', {});
        }
      });
    }

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
  }

  private _loadFromAttributes() {
    if (this._hasData) return;
    const src = this.getAttribute('src');
    if (src !== null) {
      this.setSource(src);
      return;
    }
    const text = this.textContent?.trim();
    if (text) this.setSource(text);
  }

  private _parse() {
    this._parseError = null;
    this._doc = null;
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(this._source, 'application/xml');
      const err = doc.querySelector('parsererror');
      if (err) {
        this._parseError = err.textContent?.trim() || 'Invalid XML';
        return;
      }
      this._doc = doc;
    } catch (err) {
      this._parseError = err instanceof Error ? err.message : String(err);
    }
  }

  private _seedExpansion() {
    if (!this._doc) return;
    const depth = this.numAttr('expanded-depth', 1);
    this._walkExpand(this._doc.documentElement, '0', 0, depth);
  }

  private _walkExpand(node: Element, path: string, depth: number, limit: number) {
    if (depth >= limit) return;
    this._expanded.add(path);
    let i = 0;
    for (const child of Array.from(node.children)) {
      this._walkExpand(child, `${path}/${i++}`, depth + 1, limit);
    }
  }

  private _walkPaths(node: Element, path: string, visit: (p: string) => void) {
    if (node.children.length === 0) return;
    visit(path);
    let i = 0;
    for (const child of Array.from(node.children)) {
      this._walkPaths(child, `${path}/${i++}`, visit);
    }
  }

  private _renderBody(): string {
    if (!this._doc) return '';
    const max = this.attr('max-depth');
    const limit = max ? Number(max) : Infinity;
    return this._renderNode(this._doc.documentElement, '0', 0, limit);
  }

  private _renderNode(el: Element, path: string, depth: number, limit: number): string {
    const name = el.tagName;
    const attrs = Array.from(el.attributes).map(a =>
      ` <span class="attr-name">${this._escapeHtml(a.name)}</span><span class="tag-punct">=</span><span class="attr-value">"${this._escapeHtml(a.value)}"</span>`
    ).join('');

    const childNodes = Array.from(el.childNodes);
    const hasChildren = childNodes.some(n =>
      n.nodeType === Node.ELEMENT_NODE ||
      n.nodeType === Node.CDATA_SECTION_NODE ||
      n.nodeType === Node.COMMENT_NODE ||
      n.nodeType === Node.PROCESSING_INSTRUCTION_NODE ||
      (n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '')
    );
    const isEmpty = !hasChildren;

    if (isEmpty) {
      return `
        <div class="node">
          <div class="row">
            <span class="toggle leaf" data-path="${this._escapeAttr(path)}">·</span>
            <span>
              <span class="tag-punct">&lt;</span><span class="tag-name">${this._escapeHtml(name)}</span>${attrs}<span class="tag-punct"> /&gt;</span>
            </span>
          </div>
        </div>
      `;
    }

    // Single text-node → inline
    const onlyText = childNodes.length > 0 && childNodes.every(n =>
      n.nodeType === Node.TEXT_NODE || n.nodeType === Node.CDATA_SECTION_NODE
    );
    if (onlyText) {
      const textContent = childNodes.map(n => {
        if (n.nodeType === Node.CDATA_SECTION_NODE) {
          return `<span class="cdata">&lt;![CDATA[${this._escapeHtml(n.textContent ?? '')}]]&gt;</span>`;
        }
        return `<span class="text">${this._escapeHtml(n.textContent ?? '')}</span>`;
      }).join('');
      return `
        <div class="node">
          <div class="row">
            <span class="toggle leaf" data-path="${this._escapeAttr(path)}">·</span>
            <span>
              <span class="tag-punct">&lt;</span><span class="tag-name">${this._escapeHtml(name)}</span>${attrs}<span class="tag-punct">&gt;</span>${textContent}<span class="tag-punct">&lt;/</span><span class="tag-name">${this._escapeHtml(name)}</span><span class="tag-punct">&gt;</span>
            </span>
          </div>
        </div>
      `;
    }

    const isOpen = this._expanded.has(path) && depth < limit;
    const toggleChar = isOpen ? '▾' : '▸';
    const summary = isOpen ? '' : `<span class="summary">${el.children.length} ${el.children.length === 1 ? 'child' : 'children'}</span>`;

    let childHtml = '';
    if (isOpen) {
      let i = 0;
      for (const n of childNodes) {
        if (n.nodeType === Node.ELEMENT_NODE) {
          childHtml += this._renderNode(n as Element, `${path}/${i++}`, depth + 1, limit);
        } else if (n.nodeType === Node.TEXT_NODE) {
          const text = (n.textContent ?? '').trim();
          if (!text) continue;
          childHtml += `<div class="node"><div class="row"><span class="toggle leaf">·</span><span class="text">${this._escapeHtml(text)}</span></div></div>`;
        } else if (n.nodeType === Node.CDATA_SECTION_NODE) {
          childHtml += `<div class="node"><div class="row"><span class="toggle leaf">·</span><span class="cdata">&lt;![CDATA[${this._escapeHtml(n.textContent ?? '')}]]&gt;</span></div></div>`;
        } else if (n.nodeType === Node.COMMENT_NODE) {
          childHtml += `<div class="node"><div class="row"><span class="toggle leaf">·</span><span class="comment">&lt;!--${this._escapeHtml(n.textContent ?? '')}--&gt;</span></div></div>`;
        } else if (n.nodeType === Node.PROCESSING_INSTRUCTION_NODE) {
          const pi = n as ProcessingInstruction;
          childHtml += `<div class="node"><div class="row"><span class="toggle leaf">·</span><span class="pi">&lt;?${this._escapeHtml(pi.target)} ${this._escapeHtml(pi.data)}?&gt;</span></div></div>`;
        }
      }
    }

    return `
      <div class="node">
        <div class="row">
          <span class="toggle" data-path="${this._escapeAttr(path)}">${toggleChar}</span>
          <span>
            <span class="tag-punct">&lt;</span><span class="tag-name">${this._escapeHtml(name)}</span>${attrs}<span class="tag-punct">&gt;</span>${summary}
          </span>
        </div>
        ${isOpen ? `<div class="children">${childHtml}</div>` : ''}
        ${isOpen ? `<div class="row"><span class="toggle leaf">·</span><span><span class="tag-punct">&lt;/</span><span class="tag-name">${this._escapeHtml(name)}</span><span class="tag-punct">&gt;</span></span></div>` : ''}
      </div>
    `;
  }

  private _escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private _escapeAttr(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }
}

define('b-xml-viewer', BXmlViewer);
