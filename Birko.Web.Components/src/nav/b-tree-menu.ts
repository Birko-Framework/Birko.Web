import { BaseComponent, define } from 'birko-web-core';

// ── Interfaces ───────────────────────────────────────────────────────────────

export interface TreeMenuItem {
  id: string;
  label: string;
  icon?: string;
  href?: string;
  badge?: number | string;
  disabled?: boolean;
  expanded?: boolean;
  children?: TreeMenuItem[];
  actions?: TreeNodeAction[];
  /** Sort order value — displayed as editable input when config.sortable is true. */
  sortOrder?: number;
}

export interface TreeNodeAction {
  id: string;
  label: string;
  icon?: string;
  variant?: 'danger';
}

export interface TreeConfig {
  items?: TreeMenuItem[];
  onExpand?: (id: string, item: TreeMenuItem) => Promise<TreeMenuItem[] | void>;
  actions?: TreeNodeAction[];
  expandOn?: 'click' | 'hover';
  emptyMessage?: string;
  /** When true, shows sort order input and move up/down buttons on each node. */
  sortable?: boolean;
}

// ── Component ────────────────────────────────────────────────────────────────

export class BTreeMenu extends BaseComponent {
  static get observedAttributes() { return ['active', 'expand-on', 'label-expand', 'label-collapse']; }

  private _items: TreeMenuItem[] = [];
  private _expanded = new Set<string>();
  private _config: TreeConfig = {};
  private _loadingNodes = new Set<string>();
  private _loadedNodes = new Set<string>();

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

      /* ── Node actions ── */
      .node-actions {
        display: none;
        align-items: center;
        gap: 2px;
        flex-shrink: 0;
        margin-left: auto;
      }
      .node-row:hover .node-actions,
      .node-row:focus-within .node-actions { display: flex; }

      .node-action-btn {
        border: none; background: none;
        padding: 2px 4px;
        border-radius: var(--b-radius-sm, 0.25rem);
        cursor: pointer;
        font-size: var(--b-text-xs, 0.6875rem);
        color: var(--b-text-muted);
        line-height: 1;
        white-space: nowrap;
      }
      .node-action-btn:hover { background: var(--b-bg-secondary); color: var(--b-text); }
      .node-action-btn.danger:hover { background: var(--b-color-danger-light, #fee2e2); color: var(--b-color-danger); }

      /* ── Sortable controls ── */
      .node-sort {
        display: none;
        align-items: center;
        gap: 2px;
        flex-shrink: 0;
        margin-left: auto;
      }
      .node-row:hover .node-sort,
      .node-row:focus-within .node-sort,
      .node-row.active .node-sort { display: flex; }

      .sort-order {
        width: 2.5rem; text-align: center;
        padding: 1px 2px;
        border: 1px solid var(--b-border);
        border-radius: var(--b-radius-sm, 0.25rem);
        font-size: var(--b-text-xs, 0.6875rem);
        color: var(--b-text);
        background: var(--b-bg);
        line-height: 1.25;
      }
      .sort-order:focus {
        outline: none;
        border-color: var(--b-color-primary);
        box-shadow: 0 0 0 1px var(--b-color-primary-light);
      }

      .sort-btn {
        display: inline-flex; align-items: center; justify-content: center;
        width: 1.25rem; height: 1.25rem;
        border: 1px solid var(--b-border); border-radius: var(--b-radius-sm, 0.25rem);
        background: var(--b-bg); color: var(--b-text-muted);
        cursor: pointer; font-size: 0.625rem; padding: 0;
        line-height: 1;
      }
      .sort-btn:hover { background: var(--b-bg-tertiary); color: var(--b-text); border-color: var(--b-text-muted); }
      .sort-btn:disabled { opacity: 0.2; cursor: default; }
      .sort-btn:disabled:hover { background: var(--b-bg); color: var(--b-text-muted); border-color: var(--b-border); }

      /* ── Loading spinner ── */
      .node-loading {
        width: 0.75rem; height: 0.75rem;
        border: 2px solid var(--b-border);
        border-top-color: var(--b-color-primary);
        border-radius: 50%;
        animation: tree-spin 0.6s linear infinite;
        flex-shrink: 0;
      }
      @keyframes tree-spin { to { transform: rotate(360deg); } }

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

  // ── Public API ──────────────────────────────────────────────────────────────

  setConfig(config: TreeConfig) {
    this._config = config;
    if (config.items) {
      this._items = config.items;
      this._collectExpanded(config.items);
    }
    this.update();
  }

  setItems(items: TreeMenuItem[]) {
    this._items = items;
    // Only add newly-marked expanded items; preserve existing expanded state
    this._collectExpanded(items);
    this.update();
  }

  updateNode(id: string, children: TreeMenuItem[]) {
    const item = this._findItem(this._items, id);
    if (item) {
      item.children = children;
      this._collectExpanded(children);
    }
    this._loadedNodes.add(id);
    this.update();
  }

  async expandAll() {
    // Expand all currently known parent nodes
    this._walkItems(this._items, item => {
      if (item.children?.length || this._hasLazyChildren(item)) {
        this._expanded.add(item.id);
      }
    });
    this.update();

    // Trigger lazy loads for unloaded nodes
    if (this._config.onExpand) {
      const toLoad: { id: string; item: TreeMenuItem }[] = [];
      this._walkItems(this._items, item => {
        if (this._needsLoad(item)) {
          toLoad.push({ id: item.id, item });
        }
      });

      if (toLoad.length) {
        await Promise.all(toLoad.map(({ id, item }) => this._loadChildren(id, item)));
        // After loading, expand newly discovered parent nodes
        this._walkItems(this._items, item => {
          if (item.children?.length) this._expanded.add(item.id);
        });
        this.update();
      }
    }
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

  async toggle(id: string) {
    if (this._expanded.has(id)) {
      this._expanded.delete(id);
      this.update();
      this.emit('toggle', { id, expanded: false });
    } else {
      this._expanded.add(id);
      const item = this._findItem(this._items, id);

      if (item && this._needsLoad(item)) {
        await this._loadChildren(id, item);
      }

      this.update();
      this.emit('toggle', { id, expanded: true });
    }
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

  getExpanded(): string[] {
    return Array.from(this._expanded);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  render() {
    if (!this._items.length) {
      const msg = this._config.emptyMessage;
      if (msg) return `<div style="padding:var(--b-space-md);color:var(--b-text-muted);font-size:var(--b-text-sm);text-align:center;">${msg}</div>`;
    }
    return `<ul class="tree" role="tree">${this._renderLevel(this._items, 0)}</ul>`;
  }

  private _renderLevel(items: TreeMenuItem[], depth: number): string {
    const active = this.attr('active');

    return items.map(item => {
      const hasChildren = this._isParentNode(item);
      const isExpanded = this._expanded.has(item.id);
      const isLoading = this._loadingNodes.has(item.id);
      const isActive = item.id === active;
      const tag = item.href ? 'a' : 'div';
      const hrefAttr = item.href ? `href="${item.href}"` : '';

      // Toggle / loading spinner / placeholder
      const toggleHtml = isLoading
        ? `<span class="node-loading"></span>`
        : hasChildren
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

      // Sortable controls
      const sortableHtml = this._config.sortable
        ? `<span class="node-sort">
            <button class="sort-btn" data-sort="up" data-node="${item.id}" type="button" tabindex="-1" title="Move up">&#9650;</button>
            <input type="number" class="sort-order" data-sort-input="${item.id}" value="${item.sortOrder ?? 0}" min="0" tabindex="-1" />
            <button class="sort-btn" data-sort="down" data-node="${item.id}" type="button" tabindex="-1" title="Move down">&#9660;</button>
          </span>`
        : '';

      // Actions
      const nodeActions = item.actions ?? this._config.actions ?? [];
      const actionsHtml = nodeActions.length
        ? `<span class="node-actions">${nodeActions.map(a =>
            `<button class="node-action-btn ${a.variant === 'danger' ? 'danger' : ''}"
                    data-action="${a.id}" data-node="${item.id}"
                    type="button" tabindex="-1"
                    title="${a.label}">${a.icon ?? a.label}</button>`
          ).join('')}</span>`
        : '';

      // Children
      const childrenHtml = (item.children?.length)
        ? `<ul class="children ${isExpanded ? '' : 'collapsed'}" role="group">
             ${this._renderLevel(item.children, depth + 1)}
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
            ${sortableHtml}
            ${actionsHtml}
          </${tag}>
          ${childrenHtml}
        </li>
      `;
    }).join('');
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  protected onUpdated() {
    const expandOn = this._config.expandOn ?? this.attr('expand-on', 'click');

    // Toggle expand/collapse
    this.shadowRoot?.querySelectorAll<HTMLElement>('[data-toggle]').forEach(btn => {
      this.listen(btn, 'click', (e: Event) => {
        e.stopPropagation();
        e.preventDefault();
        this.toggle(btn.dataset.toggle!);
      });
    });

    // Item click → select or toggle
    this.shadowRoot?.querySelectorAll<HTMLElement>('[data-item]').forEach(row => {
      this.listen(row, 'click', (e: Event) => {
        const clicked = e.target as HTMLElement;
        if (clicked.closest?.('[data-toggle]')) return;
        if (clicked.closest?.('[data-action]')) return;
        if (clicked.closest?.('[data-sort]')) return;
        if (clicked.closest?.('[data-sort-input]')) return;
        const id = row.dataset.item!;
        const item = this._findItem(this._items, id);
        if (!item || item.disabled) return;

        this.emit('select', { id, item });
      });
    });

    // Hover expand
    if (expandOn === 'hover') {
      this.shadowRoot?.querySelectorAll<HTMLElement>('[data-item]').forEach(row => {
        this.listen(row, 'mouseenter', () => {
          const id = row.dataset.item!;
          const item = this._findItem(this._items, id);
          if (item && this._isParentNode(item) && !this._expanded.has(id)) {
            this.toggle(id);
          }
        });
      });
    }

    // Sort buttons (move up/down)
    this.shadowRoot?.querySelectorAll<HTMLElement>('[data-sort]').forEach(btn => {
      this.listen(btn, 'click', (e: Event) => {
        e.stopPropagation();
        e.preventDefault();
        const direction = btn.dataset.sort as 'up' | 'down';
        const nodeId = btn.dataset.node!;
        const item = this._findItem(this._items, nodeId);
        this.emit('sort', { id: nodeId, direction, item });
      });
    });

    // Sort order input
    this.shadowRoot?.querySelectorAll<HTMLInputElement>('[data-sort-input]').forEach(input => {
      this.listen(input, 'change', (e: Event) => {
        e.stopPropagation();
        const nodeId = input.dataset.sortInput!;
        const value = parseInt(input.value, 10);
        if (isNaN(value)) return;
        const item = this._findItem(this._items, nodeId);
        this.emit('sort-order', { id: nodeId, sortOrder: value, item });
      });
      this.listen(input, 'click', (e: Event) => e.stopPropagation());
    });

    // Node action buttons
    this.shadowRoot?.querySelectorAll<HTMLElement>('[data-action]').forEach(btn => {
      this.listen(btn, 'click', (e: Event) => {
        e.stopPropagation();
        e.preventDefault();
        const action = btn.dataset.action!;
        const nodeId = btn.dataset.node!;
        const item = this._findItem(this._items, nodeId);
        this.emit('action-click', { action, id: nodeId, item });
      });
    });

    // Keyboard navigation
    const tree = this.shadowRoot?.querySelector('.tree');
    if (tree) this.listen(tree, 'keydown', (e: Event) => {
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
          if (currentItem && this._isParentNode(currentItem)) {
            if (!this._expanded.has(currentId)) {
              this.toggle(currentId);
            } else {
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
          if (currentItem && this._isParentNode(currentItem) && this._expanded.has(currentId)) {
            this.collapse(currentId);
            this.emit('toggle', { id: currentId, expanded: false });
          } else {
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

  // ── Lazy Loading ────────────────────────────────────────────────────────────

  private _needsLoad(item: TreeMenuItem): boolean {
    if (this._loadedNodes.has(item.id)) return false;
    if (!this._config.onExpand) return false;
    return !item.children ||
      (item.children.length === 1 && item.children[0].id.endsWith('-loading'));
  }

  private _hasLazyChildren(item: TreeMenuItem): boolean {
    return item.children === undefined && !!this._config.onExpand;
  }

  private _isParentNode(item: TreeMenuItem): boolean {
    return !!(item.children?.length) || this._hasLazyChildren(item);
  }

  private async _loadChildren(id: string, item: TreeMenuItem): Promise<void> {
    if (this._loadingNodes.has(id)) return;
    this._loadingNodes.add(id);
    this.emit('load', { id, item });
    this.update();

    try {
      const children = await this._config.onExpand!(id, item);
      if (children) {
        item.children = children;
        this._collectExpanded(children);
      }
      this._loadedNodes.add(id);
    } finally {
      this._loadingNodes.delete(id);
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

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
