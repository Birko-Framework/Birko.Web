import { BaseComponent, define } from 'birko-web-core';
import { dropdownPanelSheet } from '../shared-styles';

export interface DropdownItem {
  id: string;
  label: string;
  icon?: string;
  variant?: 'danger';
  divider?: boolean;
  /**
   * A non-clickable label rendered before this item (after its divider). It starts a group: this item and the ones
   * after it, up to the next divider or heading, are a `role="group"` named by the label. HTML, like `label`.
   */
  heading?: string;
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
      .menu { overflow-x: visible; }
      .menu:popover-open { display: flex; flex-direction: column; }
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
        box-sizing: border-box;
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
      .group { display: flex; flex-direction: column; }
      .heading {
        padding: var(--b-space-xs, 0.25rem) var(--b-space-md, 0.75rem);
        font-size: var(--b-text-xs, 0.6875rem);
        font-weight: 600;
        color: var(--b-text-muted);
        white-space: nowrap;
        cursor: default;
        user-select: none;
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
        ${this._renderItems(menuId)}
      </div>
    `;
  }

  /** Items, with a `heading` opening a group that runs to the next divider or heading. */
  private _renderItems(menuId: string): string {
    let inGroup = false;
    const html = this._items.map((item, i) => {
      const parts: string[] = [];
      if (inGroup && (item.divider || item.heading)) {
        parts.push('</div>');
        inGroup = false;
      }
      if (item.divider) parts.push('<div class="divider" role="separator"></div>');
      if (item.heading) {
        const headingId = `${menuId}-heading-${i}`;
        parts.push(`<div class="group" role="group" aria-labelledby="${headingId}">`);
        parts.push(`<div class="heading" id="${headingId}" aria-hidden="true">${item.heading}</div>`);
        inGroup = true;
      }
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
    }).join('');
    return inGroup ? html + '</div>' : html;
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
    // Expose the menu-button semantics immediately, not only after first open.
    setExpanded(menu.matches(':popover-open'));

    // Trigger click toggles popover
    const trigger = this.$('.trigger');
    if (trigger) this.listen(trigger, 'click', () => {
      menu.togglePopover();
    });

    // Item click → emit select + close
    this.$$<HTMLElement>('.item').forEach(item => {
      this.listen(item, 'click', () => {
        const id = item.dataset.id!;
        menu.hidePopover();
        this.emit('select', { id });
      });
    });

    // Keyboard navigation
    this.listen(menu, 'keydown', (e: Event) => {
      const ke = e as KeyboardEvent;
      const items = this.$$<HTMLElement>('.item');
      const current = items.indexOf(this.$('.item:focus') as HTMLElement);

      if (ke.key === 'ArrowDown') {
        ke.preventDefault();
        const next = current < items.length - 1 ? current + 1 : 0;
        items[next]?.focus();
      } else if (ke.key === 'ArrowUp') {
        ke.preventDefault();
        const prev = current > 0 ? current - 1 : items.length - 1;
        items[prev]?.focus();
      } else if (ke.key === 'Escape') {
        ke.preventDefault();
        menu.hidePopover();
        triggerEl?.focus();
      } else if (ke.key === 'Enter' || ke.key === ' ') {
        const focused = this.$<HTMLElement>('.item:focus');
        if (focused) {
          ke.preventDefault();
          focused.click();
        }
      } else if (ke.key === 'Home') {
        ke.preventDefault();
        items[0]?.focus();
      } else if (ke.key === 'End') {
        ke.preventDefault();
        items[items.length - 1]?.focus();
      }
    });

    // Focus first item when popover opens + track expanded state + position
    this.listen(menu, 'toggle', ((e: ToggleEvent) => {
      if (e.newState === 'open') {
        setExpanded(true);
        this._positionMenu(menu);
        const first = this.$<HTMLElement>('.item');
        first?.focus();
      } else {
        setExpanded(false);
      }
    }) as EventListener);
  }

  private _positionMenu(menu: HTMLElement) {
    const rect = this.getBoundingClientRect();
    const align = this.getAttribute('align');
    const gap = 4; // --b-space-xs fallback
    const edge = 8; // kept clear of the viewport edge

    // Reset all inset properties to prevent UA popover defaults, and measure the menu at its natural height
    menu.style.inset = 'auto';
    menu.style.maxHeight = '';

    // Vertical: prefer below, flip above if not enough space. An action menu shows every row (TASK-935), so it is
    // capped only by the room on the side it opens; just a menu taller than that room scrolls.
    const spaceBelow = window.innerHeight - rect.bottom - gap - edge;
    const spaceAbove = rect.top - gap - edge;
    const above = spaceBelow < menu.offsetHeight && spaceAbove > spaceBelow;
    if (above) {
      menu.style.bottom = `${window.innerHeight - rect.top + gap}px`;
    } else {
      menu.style.top = `${rect.bottom + gap}px`;
    }
    menu.style.maxHeight = `${Math.max(above ? spaceAbove : spaceBelow, 96)}px`;

    // Horizontal: align to left or right edge of trigger
    if (align === 'right') {
      menu.style.right = `${window.innerWidth - rect.right}px`;
    } else {
      menu.style.left = `${rect.left}px`;
    }
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
