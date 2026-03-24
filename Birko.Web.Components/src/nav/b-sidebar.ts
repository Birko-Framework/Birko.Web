import { BaseComponent, define } from 'birko-web-core';

export interface SidebarItem {
  id: string;
  label: string;
  icon?: string;
  href?: string;
  children?: SidebarItem[];
}

export class BSidebar extends BaseComponent {
  static get observedAttributes() { return ['collapsed', 'active']; }

  private _items: SidebarItem[] = [];

  static get styles() {
    return `
      :host { display: block; height: 100%; }
      .sidebar {
        width: var(--b-sidebar-width, 15rem); height: 100%;
        background: var(--b-bg-elevated); border-right: var(--b-border-width, 1px) solid var(--b-border);
        display: flex; flex-direction: column; transition: width var(--b-transition-slow, 300ms ease);
        overflow: hidden;
      }
      :host([collapsed]) .sidebar { width: var(--b-sidebar-collapsed-width, 3.5rem); }
      .brand {
        padding: var(--b-space-lg, 1rem); height: var(--b-header-height, 3rem);
        display: flex; align-items: center; gap: var(--b-space-sm, 0.5rem);
        border-bottom: var(--b-border-width, 1px) solid var(--b-border); font-weight: var(--b-font-weight-bold);
        font-size: var(--b-text-lg, 1rem); overflow: hidden; white-space: nowrap;
      }
      .nav { flex: 1; overflow-y: auto; padding: var(--b-space-sm, 0.5rem); }
      .nav-item {
        display: flex; align-items: center; gap: var(--b-space-sm, 0.5rem);
        padding: var(--b-space-sm, 0.5rem) var(--b-space-md, 0.75rem);
        border-radius: var(--b-radius, 0.375rem); cursor: pointer;
        color: var(--b-text-secondary); font-size: var(--b-text-sm, 0.8125rem);
        font-weight: var(--b-font-weight-medium, 500); text-decoration: none;
        transition: all var(--b-transition, 150ms ease); overflow: hidden; white-space: nowrap;
      }
      .nav-item:hover { background: var(--b-bg-tertiary); color: var(--b-text); }
      .nav-item.active { background: var(--b-color-primary-light); color: var(--b-color-primary); }
      .nav-icon { width: var(--b-icon-lg, 1.25rem); text-align: center; flex-shrink: 0; font-size: var(--b-icon-base); }
      .nav-label { overflow: hidden; text-overflow: ellipsis; }
      :host([collapsed]) .nav-label { display: none; }
      .footer { padding: var(--b-space-sm); border-top: var(--b-border-width, 1px) solid var(--b-border); }
      .toggle-btn {
        width: 100%; padding: var(--b-space-sm, 0.5rem); border: none; background: none;
        cursor: pointer; border-radius: var(--b-radius, 0.375rem); color: var(--b-text-muted);
        font-size: var(--b-icon-base); display: flex; justify-content: center;
      }
      .toggle-btn:hover { background: var(--b-bg-tertiary); }
    `;
  }

  setItems(items: SidebarItem[]) {
    this._items = items;
    this.update();
  }

  render() {
    const active = this.attr('active');
    const collapsed = this.boolAttr('collapsed');
    return `
      <nav class="sidebar">
        <div class="brand" part="brand">
          <slot name="brand"></slot>
        </div>
        <div class="nav">
          ${this._items.map(item => `
            <a class="nav-item ${item.id === active ? 'active' : ''}"
               href="${item.href ?? '#/' + item.id}" data-id="${item.id}">
              <span class="nav-icon">${item.icon ?? ''}</span>
              <span class="nav-label">${item.label}</span>
            </a>
          `).join('')}
        </div>
        <div class="footer">
          <button class="toggle-btn">${collapsed ? '&#9654;' : '&#9664;'}</button>
        </div>
      </nav>
    `;
  }

  protected onUpdated() {
    this.$('.toggle-btn')?.addEventListener('click', () => {
      this.toggleAttribute('collapsed');
      this.emit('toggle', { collapsed: this.boolAttr('collapsed') });
    });
  }
}

define('b-sidebar', BSidebar);
