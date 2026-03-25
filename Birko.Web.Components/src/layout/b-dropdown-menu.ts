import { BaseComponent, define } from 'birko-web-core';
import { dropdownPanelSheet } from '../shared-styles';

export interface DropdownItem {
  id: string;
  label: string;
  icon?: string;
  variant?: 'danger';
  divider?: boolean;
}

export class BDropdownMenu extends BaseComponent {
  static get observedAttributes() {
    return ['align'];
  }

  private _items: DropdownItem[] = [];

  static get sharedStyles() {
    return [dropdownPanelSheet];
  }

  static get styles() {
    return `
      :host { display: inline-block; position: relative; }
      .trigger { display: inline-block; }
      .menu { overflow: visible; }
      :host([align="right"]) .menu { right: 0; left: auto; }
      :host(:not([align="right"])) .menu { left: 0; right: auto; }
      .item {
        display: flex;
        align-items: center;
        gap: var(--b-space-sm, 0.5rem);
        padding: var(--b-space-sm, 0.5rem) var(--b-space-md, 0.75rem);
        cursor: pointer;
        font-size: var(--b-text-sm, 0.8125rem);
        color: var(--b-text);
        background: none;
        border: none;
        width: 100%;
        text-align: left;
        white-space: nowrap;
        transition: background var(--b-transition, 150ms ease);
      }
      .item:hover { background: var(--b-bg-tertiary); }
      .item:focus-visible {
        outline: none;
        background: var(--b-bg-tertiary);
      }
      .item.danger { color: var(--b-color-danger); }
      .item.danger:hover { background: var(--b-color-danger-light); }
      .divider {
        height: 1px;
        background: var(--b-border);
        margin: var(--b-space-xs, 0.25rem) 0;
      }
      .item-icon {
        width: var(--b-icon-base, 1rem);
        text-align: center;
        flex-shrink: 0;
      }
    `;
  }

  setItems(items: DropdownItem[]) {
    this._items = items;
    this.update();
  }

  render() {
    const menuId = 'menu-' + (this.id || 'default');

    return `
      <div class="trigger">
        <slot name="trigger"></slot>
      </div>
      <div class="menu dropdown-panel" id="${menuId}" popover>
        ${this._items.map(item => {
          const parts: string[] = [];
          if (item.divider) parts.push('<div class="divider"></div>');
          parts.push(`
            <button class="item ${item.variant ?? ''}"
                    data-id="${item.id}"
                    type="button">
              ${item.icon ? `<span class="item-icon">${item.icon}</span>` : ''}
              <span>${item.label}</span>
            </button>
          `);
          return parts.join('');
        }).join('')}
      </div>
    `;
  }

  protected onUpdated() {
    const menu = this.$<HTMLElement>('.menu');
    if (!menu) return;

    // Trigger click toggles popover
    this.$('.trigger')?.addEventListener('click', () => {
      menu.togglePopover();
    });

    // Item click → emit select + close
    this.$$<HTMLElement>('.item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.dataset.id!;
        menu.hidePopover();
        this.emit('select', { id });
      });
    });

    // Keyboard navigation
    menu.addEventListener('keydown', (e: KeyboardEvent) => {
      const items = this.$$<HTMLElement>('.item');
      const current = items.indexOf(this.$('.item:focus') as HTMLElement);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = current < items.length - 1 ? current + 1 : 0;
        items[next]?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = current > 0 ? current - 1 : items.length - 1;
        items[prev]?.focus();
      }
    });

    // Focus first item when popover opens
    menu.addEventListener('toggle', ((e: ToggleEvent) => {
      if (e.newState === 'open') {
        const first = this.$<HTMLElement>('.item');
        first?.focus();
      }
    }) as EventListener);
  }

  toggle() {
    this.$<HTMLElement>('.menu')?.togglePopover();
  }

  show() {
    this.$<HTMLElement>('.menu')?.showPopover();
  }

  hide() {
    this.$<HTMLElement>('.menu')?.hidePopover();
  }
}

define('b-dropdown-menu', BDropdownMenu);
