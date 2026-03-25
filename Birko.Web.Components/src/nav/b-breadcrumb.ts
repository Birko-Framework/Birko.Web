import { BaseComponent, define } from 'birko-web-core';

export class BBreadcrumb extends BaseComponent {
  private _items: { label: string; href?: string }[] = [];

  static get styles() {
    return `
      :host { display: block; }
      .breadcrumb {
        display: flex; align-items: center; gap: var(--b-space-xs, 0.25rem);
        font-size: var(--b-text-sm, 0.8125rem); color: var(--b-text-muted);
      }
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
      <div class="breadcrumb">
        ${this._items.map((item, i) => {
          const isLast = i === this._items.length - 1;
          const el = isLast
            ? `<span class="current">${item.label}</span>`
            : `<a href="${item.href ?? '#'}">${item.label}</a>`;
          return i > 0 ? `<span class="sep">/</span>${el}` : el;
        }).join('')}
      </div>
    `;
  }
}

define('b-breadcrumb', BBreadcrumb);
