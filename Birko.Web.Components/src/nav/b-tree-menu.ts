import { BaseComponent, define } from 'birko-web-core';
import { srOnlySheet } from '../shared-styles';
import { announce, escapeAttr, escapeHtml } from '../dom-utils';
import { GRIP_ICON, PointerDrag, type PointerDragState } from '../pointer-drag';

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
  /**
   * The user reorders the nodes: by dragging a row or its grip (mouse, pen, touch hold), or by keyboard on the grip
   * (Space picks up, ↑ ↓ move, → into the node above, ← out of the parent, Space drops, Escape cancels). Each move
   * emits one `reorder`.
   */
  sortable?: boolean;
  /** With `sortable`, only the grip starts a drag; the row itself does not. */
  handleOnly?: boolean;
  /**
   * With `sortable`, also show the old ▲ / order number / ▼ controls, which emit `sort` and `sort-order`.
   * Deprecated: kept for pages that still listen to those events; use `reorder` (TASK-789, v0.4.0).
   */
  sortControls?: boolean;
}

/** `reorder` detail: the moved node lands before or after the target, or inside it as its last child. */
export interface TreeReorderDetail {
  sourceId: string;
  targetId: string;
  position: 'before' | 'after' | 'inside';
  sourceItem: TreeMenuItem | null;
  targetItem: TreeMenuItem | null;
}

type DropPosition = TreeReorderDetail['position'];

/** Where a node sits: its sibling list, its index there, and its parent (null at the top level). */
interface Place {
  list: TreeMenuItem[];
  index: number;
  parent: TreeMenuItem | null;
}

// ── Component ────────────────────────────────────────────────────────────────

export class BTreeMenu extends BaseComponent {
  static get observedAttributes() { return ['active', 'expand-on', 'label-expand', 'label-collapse']; }

  private _items: TreeMenuItem[] = [];
  private _expanded = new Set<string>();
  private _config: TreeConfig = {};
  private _loadingNodes = new Set<string>();
  private _loadedNodes = new Set<string>();
  /**
   * The consumer's items by id. A move reorders the tree's own copies of the nodes (`_items` after `_copyTree`), never
   * the consumer's arrays, and `reorder` reports the consumer's objects.
   */
  private _originals = new Map<string, TreeMenuItem>();
  /** A node picked up by keyboard, and the items to put back on Escape. */
  private _grab: { id: string; from: Place; restore: TreeMenuItem[] } | null = null;
  /** Where a pointer drag would land, and the bar that shows it. */
  private _dropAt: { to: { targetId: string; position: DropPosition } | null; bar: HTMLElement } | null = null;
  /** Our own re-render and refocus during a keyboard move; a focusout then is not the user leaving. */
  private _quiet = false;
  private readonly _pointer = new PointerDrag({
    host: this,
    row: (path) => {
      const row = path.find((n): n is HTMLElement => n instanceof HTMLElement && n.classList.contains('node-row'));
      return row?.dataset.item ? { el: row, id: row.dataset.item } : null;
    },
    handleClass: 'grip',
    handleOnly: () => !!this._config.handleOnly,
    press: () => { if (this._grab) this._drop(); },
    start: () => {
      const bar = document.createElement('div');
      bar.className = 'drop';
      bar.hidden = true;
      this.shadowRoot!.appendChild(bar);
      this._dropAt = { to: null, bar };
    },
    move: (s) => this._target(s),
    end: (s, cancelled) => this._endDrag(s, cancelled),
  });

  static get sharedStyles() { return [srOnlySheet]; }

  static get styles() {
    return `
      :host { display: block; position: relative; }
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
        gap: var(--b-space-2xs, 0.125rem);
        flex-shrink: 0;
      }
      .node-row:hover .node-actions,
      .node-row:focus-within .node-actions { display: flex; }

      .node-action-btn {
        border: none; background: none;
        padding: var(--b-space-2xs, 0.125rem) var(--b-space-xs, 0.25rem);
        border-radius: var(--b-radius-sm, 0.25rem);
        cursor: pointer;
        font-size: var(--b-text-xs, 0.6875rem);
        color: var(--b-text-muted);
        line-height: 1;
        white-space: nowrap;
      }
      .node-action-btn:hover { background: var(--b-bg-secondary); color: var(--b-text); }
      .node-action-btn.danger:hover { background: var(--b-color-danger-light, #fee2e2); color: var(--b-color-danger-text, var(--b-color-danger)); }

      /* ── Sortable controls ── */
      .node-sort {
        display: none;
        align-items: center;
        gap: var(--b-space-2xs, 0.125rem);
        flex-shrink: 0;
        margin-left: auto;
      }
      .node-row:hover .node-sort,
      .node-row:focus-within .node-sort,
      .node-row.active .node-sort { display: flex; }

      .sort-order {
        width: 2.5rem; text-align: right;
        padding: 1px var(--b-space-2xs, 0.125rem);
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
        cursor: pointer; font-size: var(--b-text-2xs, 0.625rem); padding: 0;
        line-height: 1;
      }
      .sort-btn:hover { background: var(--b-bg-tertiary); color: var(--b-text); border-color: var(--b-text-muted); }
      .sort-btn:disabled { opacity: 0.2; cursor: default; }
      .sort-btn:disabled:hover { background: var(--b-bg); color: var(--b-text-muted); border-color: var(--b-border); }

      /* ── Reordering: grip, drag, keyboard pick-up (as b-sortable-list) ── */
      .grip {
        flex-shrink: 0; display: grid; place-items: center;
        width: 1.25rem; height: 1.25rem; padding: 0;
        border: 0; border-radius: var(--b-radius-sm, 0.25rem); background: none;
        color: var(--b-text-muted); cursor: grab; touch-action: none;
      }
      .grip svg { width: 0.875rem; height: 0.875rem; }
      .grip:hover { background: var(--b-bg-secondary); color: var(--b-text); }
      .grip:focus-visible { outline: none; box-shadow: var(--b-focus-ring, 0 0 0 2px var(--b-color-primary)); }
      .node-row.whole { cursor: grab; -webkit-touch-callout: none; }
      .node-row.pressing { box-shadow: var(--b-shadow-lg); }
      .node-row.dragging {
        position: relative; z-index: 2; cursor: grabbing; transition: none;
        background: var(--b-bg-elevated); color: var(--b-text); box-shadow: var(--b-shadow-lg);
      }
      .node-row.grabbed {
        background: color-mix(in srgb, var(--b-color-primary) 10%, var(--b-bg-elevated));
        box-shadow: inset 0 0 0 1px var(--b-border-focus, var(--b-color-primary)); color: var(--b-text);
      }
      .node-row.grabbed .grip { color: var(--b-color-primary); }
      .node-row.drop-inside {
        outline: 2px solid var(--b-color-primary);
        outline-offset: -2px;
        background: var(--b-color-primary-light);
      }
      .drop {
        position: absolute; z-index: 3; height: 3px; pointer-events: none;
        background: var(--b-color-primary); border-radius: var(--b-radius-full, 9999px);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--b-color-primary) 18%, transparent);
      }
      .drop::before, .drop::after {
        content: ""; position: absolute; top: -2.5px; width: 8px; height: 8px; border-radius: 50%;
        background: var(--b-color-primary);
      }
      .drop::before { left: -4px; }
      .drop::after { right: -4px; }
      .drop[hidden] { display: none; }

      /* ── Loading spinner ── */
      .node-loading {
        width: 0.75rem; height: 0.75rem;
        border: 2px solid var(--b-border);
        border-top-color: var(--b-color-primary);
        border-radius: 50%;
        animation: tree-spin var(--b-animation-speed, 0.6s) linear infinite;
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
      this._takeItems(config.items);
      this._collectExpanded(config.items);
    }
    this.update();
  }

  setItems(items: TreeMenuItem[]) {
    this._takeItems(items);
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

  /** New items from the consumer replace the tree's own copies, and a keyboard pick-up ends. */
  private _takeItems(items: TreeMenuItem[]) {
    this._items = items;
    this._originals.clear();
    this._grab = null;
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  render() {
    if (!this._items.length) {
      const msg = this._config.emptyMessage;
      if (msg) return `<div style="padding:var(--b-space-md);color:var(--b-text-muted);font-size:var(--b-text-sm);text-align:center;">${msg}</div>`;
    }
    const sortable = this._config.sortable
      ? `<span class="sr-only" id="${this.uid}-hint">${escapeHtml(this._t('hint', 'Press Space to pick up and reorder.'))}</span>
         <div class="sr-only live" role="status" aria-live="polite"></div>`
      : '';
    return `<ul class="tree" role="tree">${this._renderLevel(this._items, 0)}</ul>${sortable}`;
  }

  private _renderLevel(items: TreeMenuItem[], depth: number): string {
    const active = this.attr('active');

    return items.map((item, index) => {
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
                    aria-label="${isExpanded ? this.label('label-collapse', 'bwc.common.collapse', 'Collapse') : this.label('label-expand', 'bwc.common.expand', 'Expand')}">&#9654;</button>`
          : `<span class="toggle-placeholder"></span>`;

      const iconHtml = item.icon
        ? `<span class="node-icon" aria-hidden="true">${item.icon}</span>`
        : '';

      const badgeHtml = item.badge != null
        ? `<span class="node-badge">${item.badge}</span>`
        : '';

      // Reordering: a grip per node; the old ▲ / number / ▼ only with sortControls (deprecated)
      const sortable = !!this._config.sortable;
      const grabbed = this._grab?.id === item.id;
      const gripHtml = sortable
        ? `<button class="grip" data-grip="${escapeAttr(item.id)}" type="button"
                  aria-roledescription="${escapeAttr(this._t('roleDescription', 'sortable item'))}"
                  aria-describedby="${this.uid}-hint" aria-pressed="${grabbed}"
                  aria-label="${escapeAttr(this._t('grip', '{label}, position {position} of {count}', { label: item.label, position: index + 1, count: items.length }))}">${GRIP_ICON}</button>`
        : '';
      const sortableHtml = sortable && this._config.sortControls
        ? `<span class="node-sort">
            <button class="sort-btn" data-sort="up" data-node="${item.id}" type="button" tabindex="-1" title="${escapeAttr(this._t('moveUp', 'Move up'))}">&#9650;</button>
            <input type="number" class="sort-order" data-sort-input="${item.id}" value="${item.sortOrder ?? 0}" min="0" tabindex="-1"
                   aria-label="${escapeAttr(this._t('sortOrder', 'Order of {label}', { label: item.label }))}" />
            <button class="sort-btn" data-sort="down" data-node="${item.id}" type="button" tabindex="-1" title="${escapeAttr(this._t('moveDown', 'Move down'))}">&#9660;</button>
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
            ${hasChildren ? `aria-expanded="${isExpanded}"` : ''}
            ${isLoading ? 'aria-busy="true"' : ''}
            data-id="${item.id}">
          <${tag} class="node-row ${isActive ? 'active' : ''} ${item.disabled ? 'disabled' : ''} ${grabbed ? 'grabbed' : ''} ${sortable && !this._config.handleOnly ? 'whole' : ''}"
               ${hrefAttr}
               data-item="${item.id}"
               tabindex="0"
               ${isActive ? 'aria-current="page"' : ''}>
            ${gripHtml}
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

        this.emit('select', { id, item: this._consumerItem(id) });
      });
    });

    // Hover expand
    if (expandOn === 'hover') {
      this.shadowRoot?.querySelectorAll<HTMLElement>('[data-item]').forEach(row => {
        this.listen(row, 'mouseenter', () => {
          if (this._pointer.state?.started) return; // a collapsed parent stays closed under a drag (TASK-789)
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
        const item = this._consumerItem(nodeId);
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
        const item = this._consumerItem(nodeId);
        this.emit('sort-order', { id: nodeId, sortOrder: value, item });
      });
      this.listen(input, 'click', (e: Event) => e.stopPropagation());
    });

    // Reordering: the pointer drag (shared with b-sortable-list), the grip's keyboard pick-up
    const tree = this.shadowRoot?.querySelector<HTMLElement>('.tree');
    if (this._config.sortable && tree) {
      this._pointer.wire(tree, (target, type, fn, options) => this.listen(target, type, fn as EventListener, options));
      this.shadowRoot!.querySelectorAll<HTMLElement>('[data-grip]').forEach(grip => {
        // A grip inside a link row must not follow the link, nor select the row.
        this.listen(grip, 'click', (e: Event) => { e.preventDefault(); e.stopPropagation(); });
      });
      // Tab away while a node is picked up drops it where it is; our own re-render and refocus are not the user leaving.
      this.listen(tree, 'focusout', () => { if (!this._quiet && this._grab) this._drop(); });
    }

    // Node action buttons
    this.shadowRoot?.querySelectorAll<HTMLElement>('[data-action]').forEach(btn => {
      this.listen(btn, 'click', (e: Event) => {
        e.stopPropagation();
        e.preventDefault();
        const action = btn.dataset.action!;
        const nodeId = btn.dataset.node!;
        const item = this._consumerItem(nodeId);
        this.emit('action-click', { action, id: nodeId, item });
      });
    });

    // Keyboard navigation
    if (tree) this.listen(tree, 'keydown', (e: Event) => {
      const ke = e as KeyboardEvent;
      const grip = (ke.target as Element).closest?.<HTMLElement>('[data-grip]');
      if (grip && this._onGripKey(ke, grip.dataset.grip!)) return;
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

  // ── Reordering ──────────────────────────────────────────────────────────────

  private _t(key: string, fallback: string, params?: Record<string, string | number>): string {
    return this.label(`label-${key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}`, `bwc.treeMenu.${key}`, fallback, params);
  }

  private _say(text: string): void {
    const live = this.$('.live');
    if (live) live.textContent = '';
    announce(this, text, live);
  }

  /** The consumer's object for a node, for event details. */
  private _consumerItem(id: string): TreeMenuItem | null {
    return this._originals.get(id) ?? this._findItem(this._items, id);
  }

  /**
   * Copy the node structure (each node and its children array), remembering the consumer's objects by id, so a move
   * reorders the tree's copies and never the consumer's arrays.
   */
  private _copyTree(items: TreeMenuItem[]): TreeMenuItem[] {
    return items.map(item => {
      if (!this._originals.has(item.id)) this._originals.set(item.id, item);
      return { ...item, children: item.children ? this._copyTree(item.children) : undefined };
    });
  }

  private _placeOf(id: string, list: TreeMenuItem[] = this._items, parent: TreeMenuItem | null = null): Place | null {
    for (let index = 0; index < list.length; index++) {
      const item = list[index];
      if (item.id === id) return { list, index, parent };
      if (item.children) {
        const found = this._placeOf(id, item.children, item);
        if (found) return found;
      }
    }
    return null;
  }

  /** "Team, position 2 of 3 in About us": the parameters every announcement shares. */
  private _where(id: string): Record<string, string | number> {
    const place = this._placeOf(id);
    const label = place?.list[place.index].label ?? id;
    const where = place?.parent
      ? this._t('inParent', 'in {parent}', { parent: place.parent.label })
      : this._t('atTop', 'at the top level');
    return { label, position: (place?.index ?? 0) + 1, count: place?.list.length ?? 0, where };
  }

  /**
   * Move a node in the tree's copies. Returns false when it lands where it was, or when the target's children are
   * not loaded yet (the consumer applies that move on `reorder`). A node never lands inside its own subtree.
   */
  private _move(id: string, targetId: string, position: DropPosition): boolean {
    if (id === targetId) return false;
    const source = this._findItem(this._items, id);
    const target = this._findItem(this._items, targetId);
    if (!source || !target || this._findItem(source.children ?? [], targetId)) return false;
    if (position === 'inside' && this._needsLoad(target)) return false;
    this._items = this._copyTree(this._items);
    const from = this._placeOf(id)!;
    const node = from.list[from.index];
    from.list.splice(from.index, 1);
    if (position === 'inside') {
      const into = this._findItem(this._items, targetId)!;
      (into.children ??= []).push(node);
    } else {
      const at = this._placeOf(targetId)!;
      at.list.splice(at.index + (position === 'after' ? 1 : 0), 0, node);
    }
    const to = this._placeOf(id)!;
    return to.parent?.id !== from.parent?.id || to.index !== from.index;
  }

  private _emitReorder(sourceId: string, targetId: string, position: DropPosition): void {
    const detail: TreeReorderDetail = {
      sourceId, targetId, position, sourceItem: this._consumerItem(sourceId), targetItem: this._consumerItem(targetId),
    };
    this.emit('reorder', detail);
  }

  /** Re-render and put focus back on the node's grip; the focusout this causes is ours. */
  private _refocus(id: string): void {
    this._quiet = true;
    try {
      this.update();
      const grip = this.shadowRoot?.querySelector<HTMLElement>(`[data-grip="${CSS.escape(id)}"]`);
      grip?.focus();
      grip?.closest('.node-row')?.scrollIntoView?.({ block: 'nearest' });
    } finally {
      this._quiet = false;
    }
  }

  // Pointer: where the drag would land

  private _target(s: PointerDragState): void {
    const drop = this._dropAt;
    if (!drop) return;
    this.shadowRoot?.querySelectorAll('.node-row.drop-inside').forEach(r => r.classList.remove('drop-inside'));
    drop.bar.hidden = true;
    drop.to = null;
    // The dragged node and its subtree are never a target, and rows in a collapsed parent are not shown.
    const own = s.el.closest('li.node');
    const hit = Array.from(this.shadowRoot?.querySelectorAll<HTMLElement>('.node-row') ?? [])
      .filter(r => !own?.contains(r) && r.getClientRects().length > 0)
      .find(r => { const b = r.getBoundingClientRect(); return s.y >= b.top && s.y < b.bottom; });
    if (!hit?.dataset.item) return;
    const b = hit.getBoundingClientRect();
    const rel = (s.y - b.top) / b.height;
    const position: DropPosition = rel < 0.25 ? 'before' : rel > 0.75 ? 'after' : 'inside';
    drop.to = { targetId: hit.dataset.item, position };
    if (position === 'inside') { hit.classList.add('drop-inside'); return; }
    const host = this.getBoundingClientRect();
    drop.bar.hidden = false;
    Object.assign(drop.bar.style, {
      left: `${b.left - host.left}px`, width: `${b.width}px`,
      top: `${(position === 'before' ? b.top : b.bottom) - host.top - 1.5}px`,
    });
  }

  private _endDrag(s: PointerDragState, cancelled: boolean): void {
    const drop = this._dropAt;
    this._dropAt = null;
    drop?.bar.remove();
    this.shadowRoot?.querySelectorAll('.node-row.drop-inside').forEach(r => r.classList.remove('drop-inside'));
    const to = drop?.to;
    if (cancelled || !to) {
      this._say(this._t('dragCancelled', 'Move cancelled.'));
      return;
    }
    const target = this._findItem(this._items, to.targetId);
    const unloaded = to.position === 'inside' && !!target && this._needsLoad(target);
    const moved = this._move(s.id, to.targetId, to.position);
    if (!moved && !unloaded) return;
    this.update();
    if (moved) this._say(this._t('moved', '{label} moved to position {position} of {count} {where}.', this._where(s.id)));
    else this._say(this._t('movedInto', '{label} moved into {parent}.', { label: this._findItem(this._items, s.id)?.label ?? s.id, parent: target!.label }));
    this._emitReorder(s.id, to.targetId, to.position);
  }

  // Keyboard on a grip: pick up, move, drop

  /** Handles the key when it is a reordering key on a grip; returns false to let the row navigation have it. */
  private _onGripKey(e: KeyboardEvent, id: string): boolean {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (this._grab?.id === id) { this._drop(); return true; }
      if (this._grab) this._drop();
      const restore = this._items;
      this._items = this._copyTree(this._items);
      this._grab = { id, from: this._placeOf(id)!, restore };
      this._refocus(id);
      this._say(this._t('pickedUp', '{label} picked up, position {position} of {count} {where}. Arrow keys move it, right and left change its parent, Space drops it, Escape cancels.', this._where(id)));
      return true;
    }
    if (this._grab?.id !== id) return false;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // a dialog around the tree must not close
      this._items = this._grab.restore;
      this._grab = null;
      this._refocus(id);
      this._say(this._t('cancelled', 'Cancelled. {label} is back at position {position} of {count} {where}.', this._where(id)));
      return true;
    }
    const place = this._placeOf(id);
    if (!place) return false;
    const { list, index, parent } = place;
    const w = this._where(id);
    let move: { targetId: string; position: DropPosition } | null = null;
    switch (e.key) {
      case 'ArrowUp':
        if (index === 0) { this._say(this._t('first', '{label} is already first {where}.', w)); break; }
        move = { targetId: list[index - 1].id, position: 'before' };
        break;
      case 'ArrowDown':
        if (index === list.length - 1) { this._say(this._t('last', '{label} is already last {where}.', w)); break; }
        move = { targetId: list[index + 1].id, position: 'after' };
        break;
      case 'ArrowRight':
        if (index === 0) { this._say(this._t('noneAbove', 'There is nothing above {label} to move into.', w)); break; }
        void this._moveInto(id, list[index - 1]);
        break;
      case 'ArrowLeft':
        if (!parent) { this._say(this._t('atTopAlready', '{label} is already at the top level.', w)); break; }
        move = { targetId: parent.id, position: 'after' };
        break;
      default:
        return false;
    }
    e.preventDefault();
    e.stopPropagation();
    if (move && this._move(id, move.targetId, move.position)) this._afterKeyMove(id);
    return true;
  }

  /** → : into the node above, as its last child; it opens (loading its children first) so focus can follow. */
  private async _moveInto(id: string, into: TreeMenuItem): Promise<void> {
    if (this._needsLoad(into)) {
      this._expanded.add(into.id);
      await this._loadChildren(into.id, into);
      if (this._grab?.id !== id) return;
    }
    this._expanded.add(into.id);
    if (this._move(id, into.id, 'inside')) this._afterKeyMove(id);
  }

  private _afterKeyMove(id: string): void {
    this._refocus(id);
    this._say(this._t('position', '{label}, position {position} of {count} {where}.', this._where(id)));
  }

  /** Never moves focus: the node is already where it is dropped, and a Tab away must keep its new target. */
  private _drop(): void {
    const grab = this._grab;
    if (!grab) return;
    this._grab = null;
    this._quiet = true;
    try { this.update(); } finally { this._quiet = false; }
    const place = this._placeOf(grab.id);
    if (!place) return;
    const w = this._where(grab.id);
    if (place.parent?.id === grab.from.parent?.id && place.index === grab.from.index) {
      this._say(this._t('unchanged', '{label} dropped, still at position {position} of {count} {where}.', w));
      return;
    }
    this._say(this._t('dropped', '{label} dropped at position {position} of {count} {where}.', w));
    // One reorder for the whole move, against a neighbour: after the previous sibling, else before the next, else
    // inside the parent.
    const { list, index, parent } = place;
    if (index > 0) this._emitReorder(grab.id, list[index - 1].id, 'after');
    else if (list.length > 1) this._emitReorder(grab.id, list[1].id, 'before');
    else if (parent) this._emitReorder(grab.id, parent.id, 'inside');
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
        // Mark leaf nodes (no children) so they aren't treated as lazy-loadable
        this._markLeaves(children);
        item.children = children;
        this._collectExpanded(children);
      }
      this._loadedNodes.add(id);
    } catch (err) {
      // Surface the failure instead of leaking an unhandled rejection out of toggle(); leave the
      // node un-marked so a retry re-attempts the load.
      this.emit('load-error', { id, item, error: err });
    } finally {
      // Always clear the spinner and re-render — toggle()'s own update() is skipped on the throw path.
      this._loadingNodes.delete(id);
      this.update();
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /** Set children=[] on leaf nodes so _hasLazyChildren doesn't treat them as expandable. */
  private _markLeaves(items: TreeMenuItem[]) {
    for (const item of items) {
      if (item.children === undefined) item.children = [];
      if (item.children.length) this._markLeaves(item.children);
    }
  }

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
