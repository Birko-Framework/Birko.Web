import { BaseComponent, define } from 'birko-web-core';

export class BBreadcrumb extends BaseComponent {
  private _items: { label: string; href?: string }[] = [];

  static get styles() {
    return `
      :host { display: block; }
      .breadcrumb { font-size: var(--b-text-sm, 0.8125rem); color: var(--b-text-muted); }
      ol {
        display: flex; align-items: center; gap: var(--b-space-xs, 0.25rem);
        list-style: none; margin: 0; padding: 0;
      }
      li { display: flex; align-items: center; }
      a { color: var(--b-text-secondary); text-decoration: none; }
      a:hover { color: var(--b-color-primary); text-decoration: underline; }
      .current { color: var(--b-text); font-weight: var(--b-font-weight-medium, 500); }
      .sep { margin: 0 var(--b-space-xs); }
    `;
  }

  setItems(items: { label: string; href?: string }[]) {
    this._items = items;
    this.update();
  }

  render() {
    return `
      <nav class="breadcrumb" aria-label="${this.label('label-nav', 'bwc.breadcrumb.label', 'Breadcrumb')}">
        <ol>
          ${this._items.map((item, i) => {
            const isLast = i === this._items.length - 1;
            const sep = i > 0 ? '<span class="sep" aria-hidden="true">/</span>' : '';
            const el = isLast
              ? `<span class="current" aria-current="page">${item.label}</span>`
              : `<a href="${item.href ?? '#'}">${item.label}</a>`;
            return `<li>${sep}${el}</li>`;
          }).join('')}
        </ol>
      </nav>
    `;
  }
}

define('b-breadcrumb', BBreadcrumb);
