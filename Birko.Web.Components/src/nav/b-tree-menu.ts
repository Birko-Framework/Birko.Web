import { BaseComponent, define } from 'birko-web-core';

export interface TreeMenuItem {
  id: string;
  label: string;
  icon?: string;
  href?: string;
  badge?: number | string;
  disabled?: boolean;
  expanded?: boolean;
  children?: TreeMenuItem[];
}

export class BTreeMenu extends BaseComponent {
  static get observedAttributes() { return ['active', 'label-expand', 'label-collapse']; }

  private _items: TreeMenuItem[] = [];
  private _expanded = new Set<string>();

  static get styles() {
    return `
      :host { display: block; }
      .tree { margin: 0; padding: 0; list-style: none; }

      /* ── Node ── */
      .node { user-select: none; }
      .node-row {
        display: flex;
        align-items: center;
        gap: var(--b-space-xs, 0.25rem);
        padding: var(--b-space-xs, 0.25rem) var(--b-space-sm, 0.5rem);
        border-radius: var(--b-radius-sm, 0.25rem);
        cursor: pointer;
        font-size: var(--b-text-sm, 0.8125rem);
        color: var(--b-text-secondary);
        text-decoration: none;
        transition: background var(--b-transition, 150ms ease), color var(--b-transition, 150ms ease);
        min-height: 1.75rem;
      }
      .node-row:hover { background: var(--b-bg-tertiary); color: var(--b-text); }
      .node-row:focus-visible {
        outline: none;
        box-shadow: var(--b-focus-ring, 0 0 0 2px var(--b-color-primary));
        background: var(--b-bg-tertiary);
      }
      .node-row.active {
        background: var(--b-color-primary-light);
        color: var(--b-color-primary);
        font-weight: var(--b-font-weight-medium, 500);
      }
      .node-row.disabled {
        opacity: var(--b-disabled-opacity, 0.5);
        pointer-events: none;
        cursor: not-allowed;
      }

      /* ── Toggle arrow ── */
      .toggle {
        width: 1rem; height: 1rem;
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
        font-size: 0.5rem;
        color: var(--b-text-muted);
        transition: transform var(--b-transition, 150ms ease);
        border: none; background: none; padding: 0; cursor: pointer;
        border-radius: var(--b-radius-sm, 0.25rem);
      }
      .toggle:hover { color: var(--b-text); background: var(--b-bg-secondary); }
      .toggle.expanded { transform: rotate(90deg); }
      .toggle-placeholder { width: 1rem; flex-shrink: 0; }

      /* ── Icon, label, badge ── */
      .node-icon {
        width: var(--b-icon-base, 1rem);
        text-align: center;
        flex-shrink: 0;
        font-size: var(--b-text-sm, 0.8125rem);
      }
      .node-label {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .node-badge {
        flex-shrink: 0;
        min-width: 1.125rem; height: 1.125rem;
        padding: 0 0.25rem;
        border-radius: var(--b-radius-full, 9999px);
        background: var(--b-color-primary-light);
        color: var(--b-color-primary);
        font-size: var(--b-text-xs, 0.6875rem);
        font-weight: var(--b-font-weight-bold, 700);
        display: flex; align-items: center; justify-content: center;
        line-height: 1;
      }

      /* ── Children (nested) ── */
      .children {
        margin: 0;
        padding: 0 0 0 1rem;
        list-style: none;
        overflow: hidden;
      }
      .children.collapsed { display: none; }

      /* ── Depth indentation guide lines ── */
      .children:not(.collapsed) {
        border-left: 1px solid var(--b-border);
        margin-left: 0.5rem;
        padding-left: 0.5rem;
      }
    `;
  }

  setItems(items: TreeMenuItem[]) {
    this._items = items;
    // Pre-expand items marked as expanded
    this._collectExpanded(items);
    this.update();
  }

  expandAll() {
    this._walkItems(this._items, item => {
      if (item.children?.length) this._expanded.add(item.id);
    });
    this.update();
  }

  collapseAll() {
    this._expanded.clear();
    this.update();
  }

  expand(id: string) {
    this._expanded.add(id);
    this.update();
  }

  collapse(id: string) {
    this._expanded.delete(id);
    this.update();
  }

  toggle(id: string) {
    if (this._expanded.has(id)) this._expanded.delete(id);
    else this._expanded.add(id);
    this.update();
  }

  /** Expand all ancestors of a node so it becomes visible. */
  reveal(id: string) {
    const path = this._findPath(this._items, id);
    if (!path) return;
    for (const ancestor of path.slice(0, -1)) {
      this._expanded.add(ancestor.id);
    }
    this.update();
  }

  render() {
    return `<ul class="tree" role="tree">${this._renderLevel(this._items, 0)}</ul>`;
  }

  private _renderLevel(items: TreeMenuItem[], depth: number): string {
    const active = this.attr('active');

    return items.map(item => {
      const hasChildren = !!(item.children?.length);
      const isExpanded = this._expanded.has(item.id);
      const isActive = item.id === active;
      const tag = item.href ? 'a' : 'div';
      const hrefAttr = item.href ? `href="${item.href}"` : '';

      const toggleHtml = hasChildren
        ? `<button class="toggle ${isExpanded ? 'expanded' : ''}"
                  data-toggle="${item.id}" type="button" tabindex="-1"
                  aria-label="${isExpanded ? this.attr('label-collapse', 'Collapse') : this.attr('label-expand', 'Expand')}">&#9654;</button>`
        : `<span class="toggle-placeholder"></span>`;

      const iconHtml = item.icon
        ? `<span class="node-icon" aria-hidden="true">${item.icon}</span>`
        : '';

      const badgeHtml = item.badge != null
        ? `<span class="node-badge">${item.badge}</span>`
        : '';

      const childrenHtml = hasChildren
        ? `<ul class="children ${isExpanded ? '' : 'collapsed'}" role="group">
             ${this._renderLevel(item.children!, depth + 1)}
           </ul>`
        : '';

      return `
        <li class="node" role="treeitem"
            aria-expanded="${hasChildren ? String(isExpanded) : ''}"
            data-id="${item.id}">
          <${tag} class="node-row ${isActive ? 'active' : ''} ${item.disabled ? 'disabled' : ''}"
               ${hrefAttr}
               data-item="${item.id}"
               tabindex="0"
               ${isActive ? 'aria-current="page"' : ''}>
            ${toggleHtml}
            ${iconHtml}
            <span class="node-label">${item.label}</span>
            ${badgeHtml}
          </${tag}>
          ${childrenHtml}
        </li>
      `;
    }).join('');
  }

  protected onUpdated() {
    // Toggle expand/collapse
    this.shadowRoot?.querySelectorAll<HTMLElement>('[data-toggle]').forEach(btn => {
      btn.addEventListener('click', (e: Event) => {
        e.stopPropagation();
        e.preventDefault();
        const id = btn.dataset.toggle!;
        this.toggle(id);
        this.emit('toggle', { id, expanded: this._expanded.has(id) });
      });
    });

    // Item click → emit select
    this.shadowRoot?.querySelectorAll<HTMLElement>('[data-item]').forEach(row => {
      row.addEventListener('click', (e: Event) => {
        // Don't fire if toggle button was clicked
        if ((e.target as HTMLElement).closest?.('[data-toggle]')) return;
        const id = row.dataset.item!;
        const item = this._findItem(this._items, id);
        if (!item || item.disabled) return;

        // If has children and no href, toggle instead
        if (item.children?.length && !item.href) {
          this.toggle(id);
          this.emit('toggle', { id, expanded: this._expanded.has(id) });
          return;
        }

        this.emit('select', { id, item });
      });
    });

    // Keyboard navigation
    this.shadowRoot?.querySelector('.tree')?.addEventListener('keydown', (e: Event) => {
      const ke = e as KeyboardEvent;
      const rows = Array.from(
        this.shadowRoot?.querySelectorAll<HTMLElement>('[data-item]') ?? []
      );
      const focused = this.shadowRoot?.activeElement as HTMLElement ?? document.activeElement;
      const idx = rows.indexOf(focused?.closest?.('[data-item]') as HTMLElement);
      if (idx < 0) return;

      const currentId = rows[idx].dataset.item!;
      const currentItem = this._findItem(this._items, currentId);

      switch (ke.key) {
        case 'ArrowDown':
          ke.preventDefault();
          rows[Math.min(idx + 1, rows.length - 1)]?.focus();
          break;
        case 'ArrowUp':
          ke.preventDefault();
          rows[Math.max(idx - 1, 0)]?.focus();
          break;
        case 'ArrowRight':
          ke.preventDefault();
          if (currentItem?.children?.length) {
            if (!this._expanded.has(currentId)) {
              this.expand(currentId);
              this.emit('toggle', { id: currentId, expanded: true });
            } else {
              // Focus first child
              requestAnimationFrame(() => {
                const childRows = Array.from(
                  this.shadowRoot?.querySelectorAll<HTMLElement>('[data-item]') ?? []
                );
                const newIdx = childRows.findIndex(r => r.dataset.item === currentId);
                childRows[newIdx + 1]?.focus();
              });
            }
          }
          break;
        case 'ArrowLeft':
          ke.preventDefault();
          if (currentItem?.children?.length && this._expanded.has(currentId)) {
            this.collapse(currentId);
            this.emit('toggle', { id: currentId, expanded: false });
          } else {
            // Focus parent
            const path = this._findPath(this._items, currentId);
            if (path && path.length > 1) {
              const parentId = path[path.length - 2].id;
              const parentRow = this.shadowRoot?.querySelector<HTMLElement>(`[data-item="${parentId}"]`);
              parentRow?.focus();
            }
          }
          break;
        case 'Enter':
        case ' ':
          ke.preventDefault();
          rows[idx]?.click();
          break;
        case 'Home':
          ke.preventDefault();
          rows[0]?.focus();
          break;
        case 'End':
          ke.preventDefault();
          rows[rows.length - 1]?.focus();
          break;
      }
    });
  }

  // ── Helpers ──

  private _collectExpanded(items: TreeMenuItem[]) {
    for (const item of items) {
      if (item.expanded && item.children?.length) this._expanded.add(item.id);
      if (item.children) this._collectExpanded(item.children);
    }
  }

  private _walkItems(items: TreeMenuItem[], fn: (item: TreeMenuItem) => void) {
    for (const item of items) {
      fn(item);
      if (item.children) this._walkItems(item.children, fn);
    }
  }

  private _findItem(items: TreeMenuItem[], id: string): TreeMenuItem | null {
    for (const item of items) {
      if (item.id === id) return item;
      if (item.children) {
        const found = this._findItem(item.children, id);
        if (found) return found;
      }
    }
    return null;
  }

  private _findPath(items: TreeMenuItem[], id: string, path: TreeMenuItem[] = []): TreeMenuItem[] | null {
    for (const item of items) {
      const current = [...path, item];
      if (item.id === id) return current;
      if (item.children) {
        const found = this._findPath(item.children, id, current);
        if (found) return found;
      }
    }
    return null;
  }
}

define('b-tree-menu', BTreeMenu);
