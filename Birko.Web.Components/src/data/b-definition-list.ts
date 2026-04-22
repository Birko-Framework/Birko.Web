import { BaseComponent, define } from 'birko-web-core';

export interface DefinitionItem {
  term: string;
  description: string;
}

export class BDefinitionList extends BaseComponent {
  static get observedAttributes() {
    return ['layout', 'size', 'align'];
  }

  private _items: DefinitionItem[] = [];
  private _useItems = false;

  static get styles() {
    return `
      :host { display: block; }
      dl {
        margin: 0;
        display: grid;
        gap: var(--b-space-sm, 0.5rem) var(--b-space-md, 0.75rem);
        font-size: var(--b-text-sm, 0.8125rem);
        color: var(--b-text);
      }
      /* stacked (default): term above description */
      :host(:not([layout])) dl,
      :host([layout="stacked"]) dl {
        grid-template-columns: 1fr;
      }
      :host(:not([layout])) dt,
      :host([layout="stacked"]) dt {
        margin-bottom: var(--b-space-xs, 0.25rem);
      }
      /* inline: term + description on one row */
      :host([layout="inline"]) dl {
        grid-template-columns: auto 1fr;
        align-items: baseline;
      }
      /* horizontal: two-column term | description */
      :host([layout="horizontal"]) dl {
        grid-template-columns: minmax(8rem, max-content) 1fr;
        align-items: baseline;
      }
      /* grid: multi-column wrap */
      :host([layout="grid"]) dl {
        grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
      }
      :host([layout="grid"]) .pair {
        display: grid;
        grid-template-columns: minmax(6rem, max-content) 1fr;
        gap: var(--b-space-sm, 0.5rem);
        align-items: baseline;
      }
      dt {
        font-weight: var(--b-font-weight-medium, 500);
        color: var(--b-text-secondary);
        margin: 0;
      }
      dd {
        margin: 0;
        color: var(--b-text);
        overflow-wrap: anywhere;
      }
      :host([align="right"]) dd { text-align: right; }
      :host([size="sm"]) dl { font-size: var(--b-text-xs, 0.6875rem); gap: var(--b-space-xs, 0.25rem) var(--b-space-sm, 0.5rem); }
      :host([size="lg"]) dl { font-size: var(--b-text-base, 0.875rem); gap: var(--b-space-md, 0.75rem) var(--b-space-lg, 1rem); }
    `;
  }

  setItems(items: DefinitionItem[]) {
    this._items = [...items];
    this._useItems = true;
    this.update();
  }

  getItems(): DefinitionItem[] {
    return [...this._items];
  }

  render() {
    if (this._useItems) {
      const layout = this.attr('layout', 'stacked');
      if (layout === 'grid') {
        return `<dl>${this._items.map(i => `
          <div class="pair">
            <dt>${this._escapeHtml(i.term)}</dt>
            <dd>${this._escapeHtml(i.description)}</dd>
          </div>
        `).join('')}</dl>`;
      }
      return `<dl>${this._items.map(i => `
        <dt>${this._escapeHtml(i.term)}</dt>
        <dd>${this._escapeHtml(i.description)}</dd>
      `).join('')}</dl>`;
    }
    return `<dl><slot></slot></dl>`;
  }

  private _escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

define('b-definition-list', BDefinitionList);
