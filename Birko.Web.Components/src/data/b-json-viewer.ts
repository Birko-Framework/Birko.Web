import { BaseComponent, define } from 'birko-web-core';
import { escapeHtml, escapeAttr } from '../dom-utils';
import {
  dataViewerCardSheet,
  dataViewerHeaderSheet,
  toolbarBtnSheet,
} from '../shared-styles';
import { BObjectTree } from './b-object-tree.js';

export class BJsonViewer extends BaseComponent {
  static get observedAttributes() {
    return ['src', 'expanded-depth', 'max-depth', 'size', 'show-types', 'no-copy', 'max-height', 'sticky-header'];
  }

  static get sharedStyles() {
    return [dataViewerCardSheet, dataViewerHeaderSheet, toolbarBtnSheet];
  }

  private _data: unknown = undefined;
  private _hasData = false;
  private _parseError: string | null = null;

  static get styles() {
    return `
      :host { display: block; }
      .body {
        padding: var(--b-space-md, 0.75rem);
        overflow: auto;
      }
      .error {
        padding: var(--b-space-md, 0.75rem);
        color: var(--b-color-danger);
        font-family: var(--b-font-mono, ui-monospace, monospace);
        font-size: var(--b-text-sm, 0.8125rem);
      }
      b-object-tree { display: block; }
    `;
  }

  setData(data: unknown) {
    this._data = typeof data === 'string' ? this._tryParse(data) : data;
    this._hasData = true;
    this.update();
  }

  getData(): unknown {
    return this._data;
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
          <span class="title">JSON</span>
          <div class="actions">
            <button class="toolbar-btn expand-all" type="button">${escapeHtml(this.label('label-expand', 'bwc.common.expand', 'Expand'))}</button>
            <button class="toolbar-btn collapse-all" type="button">${escapeHtml(this.label('label-collapse', 'bwc.common.collapse', 'Collapse'))}</button>
            ${showCopy ? `<button class="toolbar-btn copy-btn" type="button">${escapeHtml(this.label('label-copy', 'bwc.common.copy', 'Copy'))}</button>` : ''}
          </div>
        </header>
        ${this._parseError
          ? `<div class="error">JSON parse error: ${escapeHtml(this._parseError)}</div>`
          : `<div class="body"${bodyStyle}>${this._renderTree()}</div>`}
      </div>
    `;
  }

  private _computeBodyStyle(): string {
    const maxHeight = this.attr('max-height');
    const sticky = this.attr('sticky-header');
    if (!maxHeight || sticky === 'page') return '';
    return ` style="max-height:${escapeAttr(maxHeight)}"`;
  }

  protected onMount() {
    this._loadFromAttributes();
  }

  protected onUpdated() {
    const tree = this.$<HTMLElement>('b-object-tree') as BObjectTree | null;
    if (tree && this._hasData && !this._parseError) {
      tree.setData(this._data);
    }

    const expandBtn = this.$<HTMLButtonElement>('.expand-all');
    if (expandBtn) {
      this.listen(expandBtn, 'click', () => {
        const t = this.$<HTMLElement>('b-object-tree') as BObjectTree | null;
        t?.expandAll();
      });
    }
    const collapseBtn = this.$<HTMLButtonElement>('.collapse-all');
    if (collapseBtn) {
      this.listen(collapseBtn, 'click', () => {
        const t = this.$<HTMLElement>('b-object-tree') as BObjectTree | null;
        t?.collapseAll();
      });
    }
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

  private _loadFromAttributes() {
    if (this._hasData) return;
    const src = this.getAttribute('src');
    if (src !== null) {
      this._data = this._tryParse(src);
      this._hasData = true;
      this.update();
      return;
    }
    const text = this.textContent?.trim();
    if (text) {
      this._data = this._tryParse(text);
      this._hasData = true;
      this.update();
    }
  }

  private _tryParse(text: string): unknown {
    this._parseError = null;
    try {
      return JSON.parse(text);
    } catch (err) {
      this._parseError = err instanceof Error ? err.message : String(err);
      return undefined;
    }
  }

  private _renderTree(): string {
    if (!this._hasData) return `<div class="empty">No data</div>`;
    const attrs: string[] = [];
    const ed = this.attr('expanded-depth');
    const md = this.attr('max-depth');
    const size = this.attr('size');
    if (ed) attrs.push(`expanded-depth="${escapeAttr(ed)}"`);
    if (md) attrs.push(`max-depth="${escapeAttr(md)}"`);
    if (size) attrs.push(`size="${escapeAttr(size)}"`);
    if (this.boolAttr('show-types')) attrs.push('show-types');
    return `<b-object-tree ${attrs.join(' ')}></b-object-tree>`;
  }

  private _serialize(): string {
    try {
      return JSON.stringify(this._data, null, 2);
    } catch {
      return String(this._data);
    }
  }
}

// Ensure b-object-tree is registered (import pulls the define call)
void BObjectTree;

define('b-json-viewer', BJsonViewer);
