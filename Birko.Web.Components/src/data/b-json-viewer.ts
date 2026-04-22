import { BaseComponent, define } from 'birko-web-core';
import { BObjectTree } from './b-object-tree.js';

export class BJsonViewer extends BaseComponent {
  static get observedAttributes() {
    return ['src', 'expanded-depth', 'max-depth', 'size', 'show-types', 'no-copy'];
  }

  private _data: unknown = undefined;
  private _hasData = false;
  private _parseError: string | null = null;

  static get styles() {
    return `
      :host {
        display: block;
        background: var(--b-bg-tertiary);
        border: var(--b-border-width, 1px) solid var(--b-border);
        border-radius: var(--b-radius, 0.375rem);
        overflow: hidden;
      }
      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--b-space-sm, 0.5rem);
        padding: var(--b-space-xs, 0.25rem) var(--b-space-md, 0.75rem);
        border-bottom: var(--b-border-width, 1px) solid var(--b-border);
        background: var(--b-bg);
        font-size: var(--b-text-xs, 0.6875rem);
        color: var(--b-text-muted);
      }
      header .title {
        font-family: var(--b-font-mono, ui-monospace, monospace);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .actions {
        display: flex;
        gap: var(--b-space-xs, 0.25rem);
      }
      .btn {
        background: transparent;
        border: var(--b-border-width, 1px) solid var(--b-border);
        border-radius: var(--b-radius-sm, 0.25rem);
        color: var(--b-text-secondary);
        font: inherit;
        font-size: var(--b-text-xs, 0.6875rem);
        padding: 0.125rem var(--b-space-sm, 0.5rem);
        cursor: pointer;
      }
      .btn:hover { background: var(--b-bg-tertiary); color: var(--b-text); }
      .btn:focus-visible { box-shadow: var(--b-focus-ring); outline: none; }
      .btn.copied { color: var(--b-color-success); border-color: var(--b-color-success); }
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
    return `
      <header>
        <span class="title">JSON</span>
        <div class="actions">
          <button class="btn expand-all" type="button">${this._escapeHtml(this.attr('label-expand', 'Expand'))}</button>
          <button class="btn collapse-all" type="button">${this._escapeHtml(this.attr('label-collapse', 'Collapse'))}</button>
          ${showCopy ? `<button class="btn copy-btn" type="button">${this._escapeHtml(this.attr('label-copy', 'Copy'))}</button>` : ''}
        </div>
      </header>
      ${this._parseError
        ? `<div class="error">JSON parse error: ${this._escapeHtml(this._parseError)}</div>`
        : `<div class="body">${this._renderTree()}</div>`}
    `;
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
          copyBtn.textContent = this.attr('label-copied', 'Copied!');
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
    if (ed) attrs.push(`expanded-depth="${this._escapeAttr(ed)}"`);
    if (md) attrs.push(`max-depth="${this._escapeAttr(md)}"`);
    if (size) attrs.push(`size="${this._escapeAttr(size)}"`);
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

  private _escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private _escapeAttr(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }
}

// Ensure b-object-tree is registered (import pulls the define call)
void BObjectTree;

define('b-json-viewer', BJsonViewer);
