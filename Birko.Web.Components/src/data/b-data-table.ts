import { BaseComponent, define } from 'birko-web-core';
import type { ApiClient, ApiResponse } from 'birko-web-core/http';
import type { TableColumn } from './b-table.js';
import type { DropdownItem } from '../layout/b-dropdown-menu.js';
import { DEFAULT_PAGE_SIZES } from './b-pagination.js';
import './b-table.js';
import './b-pagination.js';
import '../inputs/b-search-input.js';
import '../layout/b-dropdown-menu.js';

// ── Config types ──

export interface ColumnFilter {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

export interface ToolbarAction {
  id: string;
  label: string;
  icon?: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
}

export interface BulkAction {
  id: string;
  label: string;
  icon?: string;
  variant?: 'danger';
  permission?: string;
  confirm?: boolean;
  confirmMessage?: string;
}

export interface RowAction {
  id: string;
  label: string;
  icon?: string;
  variant?: 'danger';
  permission?: string;
  visible?: (row: Record<string, unknown>) => boolean;
}

export interface ExportOption {
  id: string;
  label: string;
  icon?: string;
}

export interface DataTableConfig {
  endpoint: string;
  columns: TableColumn[];
  apiClient: ApiClient;
  pageSize?: number;
  pageSizeOptions?: number[] | false;
  dataKey?: string | null;
  totalKey?: string | null;
  params?: Record<string, string>;
  flatArray?: boolean;

  // Toolbar
  searchable?: boolean;
  searchPlaceholder?: string;
  searchDebounce?: number;
  filters?: ColumnFilter[];
  actions?: ToolbarAction[];

  // Selection + bulk
  selectable?: boolean;
  bulkActions?: BulkAction[];

  // Row identity
  idField?: string;

  // Row actions
  rowActions?: RowAction[];

  // Export
  exportable?: boolean;
  exportFormats?: ExportOption[];

  // Labels (i18n)
  paginationLabels?: PaginationLabels;
  labels?: DataTableLabels;
}

export interface PaginationLabels {
  items?: string;
  page?: string;
  of?: string;
  perPage?: string;
  prev?: string;
  next?: string;
  pageSize?: string;
}

export interface DataTableLabels {
  selected?: string;
  export?: string;
  confirmDefault?: string;
  noData?: string;
}

/** localStorage key for default page size (set via Settings page). */
export const PAGE_SIZE_STORAGE_KEY = 'symbio-page-size';

/**
 * Auto-fetching data table with toolbar, selection, bulk actions, row actions, export, and pagination.
 */
export class BDataTable extends BaseComponent {
  static get observedAttributes() { return ['loading']; }

  private _config: DataTableConfig | null = null;
  private _allData: Record<string, unknown>[] = [];
  private _page = 1;
  private _pageSize = 20;
  private _totalPages = 1;
  private _totalCount = 0;
  private _loading = false;
  private _selected = new Set<string>();
  private _searchQuery = '';
  private _activeFilters = new Map<string, string>();

  static get styles() {
    return `
      :host { display: block; }
      .data-table { display: flex; flex-direction: column; gap: var(--b-space-sm, 0.5rem); }

      /* Toolbar */
      .toolbar {
        display: flex;
        align-items: center;
        gap: var(--b-space-sm, 0.5rem);
        flex-wrap: wrap;
      }
      .toolbar-left { display: flex; align-items: center; gap: var(--b-space-sm, 0.5rem); flex: 1; min-width: 0; }
      .toolbar-right { display: flex; align-items: center; gap: var(--b-space-sm, 0.5rem); }
      .toolbar b-search-input { max-width: 16rem; }
      .filter-select {
        padding: var(--b-space-xs, 0.25rem) var(--b-space-sm, 0.5rem);
        border: var(--b-border-width, 1px) solid var(--b-border);
        border-radius: var(--b-radius, 0.375rem);
        font-size: var(--b-text-sm, 0.8125rem);
        background: var(--b-bg);
        color: var(--b-text);
        cursor: pointer;
      }

      /* Selection */
      .select-col { width: 2.5rem; text-align: center; }
      .select-col input { cursor: pointer; }

      /* Row actions */
      .row-actions-col { width: 2.5rem; text-align: center; }
      .row-action-trigger {
        background: none; border: none; cursor: pointer;
        color: var(--b-text-muted);
        font-size: var(--b-text-lg, 1rem);
        padding: var(--b-space-xs, 0.25rem);
        border-radius: var(--b-radius, 0.375rem);
        line-height: 1;
      }
      .row-action-trigger:hover { background: var(--b-bg-tertiary); color: var(--b-text); }

      /* Footer with bulk actions */
      .footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: var(--b-space-sm, 0.5rem);
        position: sticky; bottom: 0; z-index: 1;
        background: var(--b-bg);
        padding-top: var(--b-space-xs, 0.25rem);
      }
      .bulk-bar {
        display: flex;
        align-items: center;
        gap: var(--b-space-sm, 0.5rem);
        font-size: var(--b-text-sm, 0.8125rem);
      }
      .bulk-count { color: var(--b-text-secondary); white-space: nowrap; }
      .bulk-btn {
        padding: var(--b-space-xs, 0.25rem) var(--b-space-sm, 0.5rem);
        border: var(--b-border-width, 1px) solid var(--b-border);
        border-radius: var(--b-radius, 0.375rem);
        background: var(--b-bg);
        font-size: var(--b-text-sm, 0.8125rem);
        cursor: pointer;
        transition: all var(--b-transition, 150ms ease);
      }
      .bulk-btn:hover { background: var(--b-bg-tertiary); }
      .bulk-btn.danger { color: var(--b-color-danger); border-color: var(--b-color-danger); }
      .bulk-btn.danger:hover { background: var(--b-color-danger-light); }
    `;
  }

  setConfig(config: DataTableConfig) {
    this._config = config;
    this._selected.clear();
    this._activeFilters.clear();
    this._searchQuery = '';
    this._pageSize = this._resolvePageSize();
    this.update();
    this._applyData();
  }

  async load(page?: number): Promise<void> {
    if (!this._config) return;

    if (page) this._page = page;
    this._loading = true;
    this.update();

    try {
      const params: Record<string, string> = { ...this._config.params };
      const pageSize = this._pageSize;

      if (!this._config.flatArray) {
        params['page'] = String(this._page);
        params['pageSize'] = String(pageSize);
      }

      // Pass search and filters as query params
      if (this._searchQuery) params['search'] = this._searchQuery;
      for (const [k, v] of this._activeFilters) {
        if (v) params[k] = v;
      }

      const resp: ApiResponse = await this._config.apiClient.get(this._config.endpoint, params);

      if (!resp.ok) {
        this._allData = [];
        this._totalCount = 0;
        this._totalPages = 1;
      } else if (this._config.flatArray || Array.isArray(resp.data)) {
        const all = (this._config.dataKey
          ? (resp.data as Record<string, unknown>)[this._config.dataKey] as Record<string, unknown>[]
          : resp.data) as Record<string, unknown>[];
        this._allData = all;
        this._totalCount = all.length;
        this._totalPages = Math.max(1, Math.ceil(all.length / pageSize));
      } else {
        const data = resp.data as Record<string, unknown>;
        const items = (this._config.dataKey ? data[this._config.dataKey] : data['items']) as Record<string, unknown>[];
        this._allData = items ?? [];
        this._totalCount = (this._config.totalKey
          ? data[this._config.totalKey] as number
          : data['totalCount'] as number) ?? this._allData.length;
        this._totalPages = Math.max(1, Math.ceil(this._totalCount / pageSize));
      }
    } catch {
      this._allData = [];
      this._totalCount = 0;
    }

    this._loading = false;
    this.update();
    this._applyData();
  }

  async refresh(): Promise<void> {
    await this.load(this._page);
  }

  // ── Data API ──

  getData(): Record<string, unknown>[] { return this._allData; }

  getRowById(id: string): Record<string, unknown> | undefined {
    return this._allData.find(r => this._rowId(r) === id);
  }

  // ── Selection API ──

  getSelected(): string[] { return [...this._selected]; }

  clearSelection() {
    this._selected.clear();
    this.update();
    this._applyData();
  }

  selectAll() {
    const pageData = this._getPageData();
    for (const row of pageData) {
      const id = this._rowId(row);
      if (id) this._selected.add(id);
    }
    this.update();
    this._applyData();
    this.emit('selection-change', { selected: this.getSelected(), count: this._selected.size });
  }

  // ── Render ──

  render() {
    if (!this._config) return '<div class="data-table"></div>';

    const hasToolbar = this._config.searchable || this._config.filters?.length || this._config.actions?.length || this._config.exportable;
    const hasBulk = this._selected.size > 0 && this._config.bulkActions?.length;

    const pageSizeAttr = this._showPageSizePicker() ? ` page-size="${this._pageSize}"` : '';
    const pageSizesAttr = Array.isArray(this._config.pageSizeOptions)
      ? ` page-sizes="${this._config.pageSizeOptions.join(',')}"` : '';
    const labelAttrs = this._buildLabelAttrs();

    return `
      <div class="data-table">
        ${hasToolbar ? this._renderToolbar() : ''}
        <b-table ${this._loading ? 'loading' : ''} hoverable striped${this._config.labels?.noData ? ` label-no-data="${this._config.labels.noData}"` : ''}></b-table>
        <div class="footer">
          ${hasBulk ? this._renderBulkBar() : '<span></span>'}
          <b-pagination page="${this._page}" total-pages="${this._totalPages}" total-count="${this._totalCount}"${pageSizeAttr}${pageSizesAttr}${labelAttrs}></b-pagination>
        </div>
      </div>
    `;
  }

  private _renderToolbar(): string {
    const c = this._config!;
    let left = '';
    let right = '';

    if (c.searchable) {
      left += `<b-search-input placeholder="${c.searchPlaceholder ?? 'Search...'}" debounce="${c.searchDebounce ?? 300}" value="${this._searchQuery}"></b-search-input>`;
    }

    if (c.filters) {
      for (const f of c.filters) {
        const active = this._activeFilters.get(f.key) ?? '';
        left += `<select class="filter-select" data-filter="${f.key}">
          <option value="">${f.label}</option>
          ${f.options.map(o => `<option value="${o.value}" ${o.value === active ? 'selected' : ''}>${o.label}</option>`).join('')}
        </select>`;
      }
    }

    if (c.exportable && c.exportFormats?.length) {
      if (c.exportFormats.length === 1) {
        right += `<b-button variant="secondary" size="sm" class="export-btn" data-format="${c.exportFormats[0].id}">${c.exportFormats[0].icon ?? ''}${c.exportFormats[0].label}</b-button>`;
      } else {
        right += `<b-dropdown-menu id="export-menu" align="right"></b-dropdown-menu>`;
      }
    }

    if (c.actions) {
      for (const a of c.actions) {
        right += `<b-button variant="${a.variant ?? 'primary'}" size="sm" class="toolbar-action" data-action="${a.id}">${a.icon ?? ''}${a.label}</b-button>`;
      }
    }

    return `<div class="toolbar"><div class="toolbar-left">${left}</div><div class="toolbar-right">${right}</div></div>`;
  }

  private _renderBulkBar(): string {
    const count = this._selected.size;
    const buttons = (this._config!.bulkActions ?? []).map(a =>
      `<button class="bulk-btn ${a.variant ?? ''}" data-bulk="${a.id}" data-confirm="${a.confirm ?? false}" data-msg="${(a.confirmMessage ?? '').replace('{count}', String(count))}">${a.icon ?? ''}${a.label}</button>`
    ).join('');

    const lSelected = this._config!.labels?.selected ?? 'selected';
    return `<div class="bulk-bar"><span class="bulk-count">${count} ${lSelected}</span>${buttons}</div>`;
  }

  protected onUpdated() {
    if (!this._config) return;

    // Search
    const searchInput = this.$<HTMLElement>('b-search-input');
    if (searchInput) {
      this.listen(searchInput, 'search', ((e: CustomEvent) => {
        this._searchQuery = e.detail.value;
        this._page = 1;
        this.load();
      }) as EventListener);
    }

    // Filters
    this.$$<HTMLSelectElement>('.filter-select').forEach(sel => {
      this.listen(sel, 'change', () => {
        const key = sel.dataset.filter!;
        if (sel.value) {
          this._activeFilters.set(key, sel.value);
        } else {
          this._activeFilters.delete(key);
        }
        this._page = 1;
        this.load();
      });
    });

    // Export dropdown
    if (this._config.exportFormats && this._config.exportFormats.length > 1) {
      const menu = this.$('#export-menu') as any;
      if (menu?.setItems) {
        menu.setItems(this._config.exportFormats.map((f): DropdownItem => ({ id: f.id, label: f.label, icon: f.icon })));
        // Add trigger button
        const trigger = document.createElement('b-button');
        trigger.setAttribute('variant', 'secondary');
        trigger.setAttribute('size', 'sm');
        trigger.setAttribute('slot', 'trigger');
        trigger.textContent = this._config!.labels?.export ?? 'Export';
        menu.appendChild(trigger);
        this.listen(menu, 'select', ((e: CustomEvent) => {
          this._emitExport(e.detail.id);
        }) as EventListener);
      }
    }

    // Export single button
    const exportBtn = this.$<HTMLElement>('.export-btn');
    if (exportBtn) {
      this.listen(exportBtn, 'click', () => {
        this._emitExport(exportBtn.dataset.format ?? '');
      });
    }

    // Toolbar actions
    this.$$<HTMLElement>('.toolbar-action').forEach(btn => {
      this.listen(btn, 'click', () => {
        this.emit('toolbar-action', { action: btn.dataset.action });
      });
    });

    // Pagination
    const pagination = this.$<HTMLElement>('b-pagination');
    if (pagination) {
      this.listen(pagination, 'page-change', ((e: CustomEvent) => {
        this._page = e.detail.page;
        if (this._config?.flatArray) {
          this.update();
          this._applyData();
        } else {
          this.load(e.detail.page);
        }
      }) as EventListener);

      // Page size change
      this.listen(pagination, 'page-size-change', ((e: CustomEvent) => {
        this._pageSize = e.detail.pageSize;
        this._page = 1;
        if (this._config?.flatArray) {
          this._totalPages = Math.max(1, Math.ceil(this._totalCount / this._pageSize));
          this.update();
          this._applyData();
        } else {
          this.load(1);
        }
      }) as EventListener);
    }

    // Table events — enrich with full row data
    const innerTable = this.$<HTMLElement>('b-table');

    if (innerTable) {
      this.listen(innerTable, 'row-click', ((e: CustomEvent) => {
        const id = e.detail?.id;
        const row = this._allData.find(r => this._rowId(r) === id);
        this.emit('row-click', row ?? e.detail);
      }) as EventListener);

      this.listen(innerTable, 'action-click', ((e: CustomEvent) => {
        const id = e.detail?.id;
        const row = this._allData.find(r => this._rowId(r) === id);
        this.emit('action-click', { action: e.detail.action, id, row: row ?? {} });
      }) as EventListener);

      this.listen(innerTable, 'sort', ((e: CustomEvent) => {
        this.emit('sort', e.detail);
      }) as EventListener);
    }

    // Bulk action buttons
    this.$$<HTMLElement>('.bulk-btn').forEach(btn => {
      this.listen(btn, 'click', () => {
        const action = btn.dataset.bulk!;
        const needsConfirm = btn.dataset.confirm === 'true';
        const lConfirm = this._config!.labels?.confirmDefault ?? 'Are you sure?';
        const msg = btn.dataset.msg || `${lConfirm} (${this._selected.size} items)`;

        if (needsConfirm) {
          // Use native confirm — can be replaced with b-confirm-dialog later
          if (!confirm(msg)) return;
        }

        this.emit('bulk-action', {
          action,
          selected: this.getSelected(),
          count: this._selected.size,
        });
      });
    });
  }

  private _applyData() {
    const table = this.$('b-table') as any;
    if (!table || !this._config) return;

    // Build columns: [checkbox?] + user columns + [row actions?]
    const columns: TableColumn[] = [];

    if (this._config.selectable) {
      const pageData = this._getPageData();
      const allSelected = pageData.length > 0 && pageData.every(r => this._selected.has(this._rowId(r)));
      const someSelected = pageData.some(r => this._selected.has(this._rowId(r)));

      columns.push({
        key: '__select',
        label: `<input type="checkbox" ${allSelected ? 'checked' : ''} ${someSelected && !allSelected ? 'indeterminate' : ''} class="select-all" />`,
        width: '2.5rem',
        align: 'center',
        render: (_v, row) => {
          const id = this._rowId(row);
          return `<input type="checkbox" class="row-select" data-id="${id}" ${this._selected.has(id) ? 'checked' : ''} />`;
        },
      });
    }

    columns.push(...this._config.columns);

    if (this._config.rowActions?.length) {
      columns.push({
        key: '__actions',
        label: '',
        width: '2.5rem',
        align: 'center',
        render: (_v, row) => {
          const id = this._rowId(row);
          return `<button class="row-action-trigger" data-id="${id}" type="button">&#8943;</button>`;
        },
      });
    }

    table.setColumns(columns);
    if (this._config?.idField) table.setIdField(this._config.idField);

    const pageData = this._getPageData();
    table.setData(pageData);

    // Wire selection checkboxes after table renders
    requestAnimationFrame(() => this._wireTableInteractions());
  }

  private _wireTableInteractions() {
    const table = this.$('b-table') as any;
    if (!table?.shadowRoot) return;

    // Select-all checkbox
    const selectAll = table.shadowRoot.querySelector('.select-all') as HTMLInputElement;
    if (selectAll) {
      // Set indeterminate (can't be set via HTML attribute)
      const pageData = this._getPageData();
      const someSelected = pageData.some(r => this._selected.has(this._rowId(r)));
      const allSelected = pageData.length > 0 && pageData.every(r => this._selected.has(this._rowId(r)));
      selectAll.indeterminate = someSelected && !allSelected;

      selectAll.addEventListener('change', () => {
        const pageData = this._getPageData();
        if (selectAll.checked) {
          for (const row of pageData) this._selected.add(this._rowId(row));
        } else {
          for (const row of pageData) this._selected.delete(this._rowId(row));
        }
        this.update();
        this._applyData();
        this.emit('selection-change', { selected: this.getSelected(), count: this._selected.size });
      });
    }

    // Row checkboxes
    table.shadowRoot.querySelectorAll('.row-select').forEach((cb: HTMLInputElement) => {
      cb.addEventListener('change', (e: Event) => {
        e.stopPropagation(); // Don't trigger row-click
        const id = cb.dataset.id!;
        if (cb.checked) {
          this._selected.add(id);
        } else {
          this._selected.delete(id);
        }
        this.update();
        this._applyData();
        this.emit('selection-change', { selected: this.getSelected(), count: this._selected.size });
      });
    });

    // Row action triggers
    table.shadowRoot.querySelectorAll('.row-action-trigger').forEach((btn: HTMLElement) => {
      btn.addEventListener('click', (e: Event) => {
        e.stopPropagation(); // Don't trigger row-click
        const id = btn.dataset.id!;
        const row = this._allData.find(r => this._rowId(r) === id);
        if (!row) return;

        // Build visible actions for this row
        const actions = (this._config!.rowActions ?? [])
          .filter(a => !a.visible || a.visible(row))
          .map((a): DropdownItem => ({
            id: a.id,
            label: a.label,
            icon: a.icon,
            variant: a.variant,
          }));

        // Create a temporary dropdown
        const menu = document.createElement('b-dropdown-menu') as any;
        menu.setAttribute('align', 'right');
        menu.style.position = 'absolute';
        menu.style.zIndex = '1000';

        // Position near the button
        const rect = btn.getBoundingClientRect();
        menu.style.left = `${rect.left}px`;
        menu.style.top = `${rect.bottom}px`;

        document.body.appendChild(menu);
        menu.setItems(actions);
        menu.show();

        menu.addEventListener('select', ((se: CustomEvent) => {
          this.emit('row-action', { action: se.detail.id, id, row });
          menu.remove();
        }) as EventListener);

        // Clean up on outside click (popover handles this, but belt and suspenders)
        const cleanup = () => { menu.remove(); document.removeEventListener('click', cleanup); };
        setTimeout(() => document.addEventListener('click', cleanup), 0);
      });
    });
  }

  private _emitExport(format: string) {
    const filters: Record<string, unknown> = {};
    for (const [k, v] of this._activeFilters) filters[k] = v;
    if (this._searchQuery) filters['search'] = this._searchQuery;

    this.emit('export', {
      format,
      selected: this.getSelected(),
      filters,
    });
  }

  private _getPageData(): Record<string, unknown>[] {
    if (!this._config) return [];
    if (this._config.flatArray) {
      const start = (this._page - 1) * this._pageSize;
      return this._allData.slice(start, start + this._pageSize);
    }
    return this._allData;
  }

  private _rowId(row: Record<string, unknown>): string {
    if (this._config?.idField) return String(row[this._config.idField] ?? '');
    return String(row['id'] ?? row['guid'] ?? '');
  }

  /** Resolve effective page size: config.pageSize > localStorage default > 20. */
  private _resolvePageSize(): number {
    if (this._config?.pageSize) return this._config.pageSize;
    const stored = localStorage.getItem(PAGE_SIZE_STORAGE_KEY);
    if (stored) {
      const n = Number(stored);
      if (n > 0) return n;
    }
    return 20;
  }

  /** Whether to show the page size picker (disabled when pageSizeOptions === false). */
  private _showPageSizePicker(): boolean {
    if (!this._config) return false;
    return this._config.pageSizeOptions !== false;
  }

  /** Build label-* attributes string for b-pagination from config.paginationLabels. */
  private _buildLabelAttrs(): string {
    const l = this._config?.paginationLabels;
    if (!l) return '';
    const map: Record<string, string | undefined> = {
      'label-items': l.items,
      'label-page': l.page,
      'label-of': l.of,
      'label-per-page': l.perPage,
      'label-prev': l.prev,
      'label-next': l.next,
      'label-page-size': l.pageSize,
    };
    return Object.entries(map)
      .filter(([, v]) => v != null)
      .map(([k, v]) => ` ${k}="${v}"`)
      .join('');
  }
}

define('b-data-table', BDataTable);
