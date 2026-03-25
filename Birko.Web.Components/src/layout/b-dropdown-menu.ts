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
      <div class="menu dropdown-panel" id="${menuId}" popover role="menu">
        ${this._items.map(item => {
          const parts: string[] = [];
          if (item.divider) parts.push('<div class="divider" role="separator"></div>');
          parts.push(`
            <button class="item ${item.variant ?? ''}"
                    data-id="${item.id}"
                    type="button"
                    role="menuitem">
              ${item.icon ? `<span class="item-icon" aria-hidden="true">${item.icon}</span>` : ''}
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

    // Set aria-expanded on trigger
    const triggerSlot = this.$<HTMLSlotElement>('slot[name="trigger"]');
    const triggerEl = triggerSlot?.assignedElements?.()[0] as HTMLElement | undefined;

    const setExpanded = (open: boolean) => {
      triggerEl?.setAttribute('aria-expanded', String(open));
      triggerEl?.setAttribute('aria-haspopup', 'menu');
    };

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
      } else if (e.key === 'Escape') {
        e.preventDefault();
        menu.hidePopover();
        triggerEl?.focus();
      } else if (e.key === 'Enter' || e.key === ' ') {
        // Enter/Space on focused item triggers click
        const focused = this.$<HTMLElement>('.item:focus');
        if (focused) {
          e.preventDefault();
          focused.click();
        }
      } else if (e.key === 'Home') {
        e.preventDefault();
        items[0]?.focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        items[items.length - 1]?.focus();
      }
    });

    // Focus first item when popover opens + track expanded state
    menu.addEventListener('toggle', ((e: ToggleEvent) => {
      if (e.newState === 'open') {
        setExpanded(true);
        const first = this.$<HTMLElement>('.item');
        first?.focus();
      } else {
        setExpanded(false);
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
