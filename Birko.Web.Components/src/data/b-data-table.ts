import { BaseComponent, define } from 'birko-web-core';
import { announce, escapeAttr, escapeHtml, rovingIndex } from '../dom-utils';
import { srOnlySheet } from '../shared-styles';
import type { ApiClient, ApiResponse } from 'birko-web-core/http';
import type { TableColumn } from './b-table.js';
import type { DropdownItem } from '../layout/b-dropdown-menu.js';
import './b-table.js';
import './b-pagination.js';
import '../layout/b-dropdown-menu.js';
import '../layout/b-confirm-dialog.js';
import '../inputs/b-button.js';

// ── Config types ──

export interface ToolbarAction {
  id: string;
  label: string;
  icon?: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
}

export interface BulkAction {
  id: string;
  label: string;
  /** Markup shown before the label: an inline SVG or a glyph. */
  icon?: string;
  /** `primary` marks the main action; `danger` is red and always last. */
  variant?: 'primary' | 'danger';
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

export interface DataTableConfig {
  endpoint: string;
  columns: TableColumn[];
  apiClient: ApiClient;
  pageSize?: number;
  pageSizeOptions?: number[] | false;
  dataKey?: string | null;
  totalKey?: string | null;
  params?: Record<string, string>;
  /**
   * Paging mode escape hatch. Leave UNSET (recommended) to auto-detect from the response shape:
   * a bare array is client-paged; a `{ items, totalCount }` envelope is server-paged. Set `true`
   * to force client-side slicing, `false` to force server paging. NOTE: even with `true`, a CAPPED
   * envelope (`items.length < totalCount`) auto-switches to server mode — client slicing can only
   * blank page 2+ of a page the server already capped, so detection wins over a mis-set default.
   */
  flatArray?: boolean;

  // Selection + bulk
  selectable?: boolean;
  bulkActions?: BulkAction[];
  /**
   * Offer "Select all N matching" once a whole page is selected and more rows exist. On a client-paged table it
   * selects every row's id. On a server-paged one the other pages' ids are not loaded, so `bulk-action` carries
   * `allMatching: true` with the current filters and params instead: turn it on only where the endpoint takes those.
   */
  selectAllMatching?: boolean;

  // Row identity
  idField?: string;

  // Row actions
  rowActions?: RowAction[];

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
  confirmDefault?: string;
  noData?: string;
  actions?: string;
  /** Accessible name for the header "select all rows" checkbox (default "Select all rows"). */
  selectAll?: string;
  /** Accessible name for each row's selection checkbox (default "Select row"). */
  selectRow?: string;
  /** The bulk bar's accessible name (default "Bulk actions"). */
  bulkActions?: string;
  /** The bulk bar's × (default "Clear selection"). */
  clearSelection?: string;
  /** "Select all {count} matching"; `{count}` is the total. */
  selectAllMatching?: string;
  /** Undoes "select all matching" (default "Only the selected"). */
  onlyThisPage?: string;
  /** The overflow menu's button (default "More actions"). */
  moreActions?: string;
  /** Announced when the selection is cleared (default "Selection cleared"). */
  selectionCleared?: string;
  /** The confirm dialog's Cancel (default "Cancel"). */
  cancel?: string;
}

/** `bulk-action` detail. With `allMatching`, `selected` is only what is loaded; act on `filters` / `params`. */
export interface BulkActionDetail {
  action: string;
  selected: string[];
  count: number;
  allMatching?: boolean;
  filters?: Record<string, string>;
  params?: Record<string, string>;
}

/** localStorage key for default page size (set via Settings page). */
export const PAGE_SIZE_STORAGE_KEY = 'symbio-page-size';

/**
 * Auto-fetching data grid with pagination, selection, bulk actions, row actions, and inline editing.
 * Filtering is handled externally via `setFilters()` — the page-level filter row
 * collects filter values and passes them as query params.
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
  /**
   * Effective paging mode for the CURRENT data — resolved per load, not just from `flatArray`.
   * `true`  → `_allData` is one server page: render as-is, refetch on page-change.
   * `false` → `_allData` is the full set: slice locally, no refetch on page-change.
   * Detection (see `load()`) can flip a mis-set `flatArray:true` default to server mode when the
   * response is a CAPPED envelope; an explicit `flatArray:false` is always server mode. Sticky once
   * server mode is detected so subsequent loads keep sending page/pageSize.
   */
  private _serverPaged = false;
  private _selected = new Set<string>();
  private _activeRowId: string | null = null;
  private _filters: Record<string, string> = {};
  /** "Select all N matching" on a server-paged table: the selection is every row the filters match, ids unknown. */
  private _allMatching = false;
  private _barObserver: ResizeObserver | null = null;
  /** The bar's roving tab stop, by data-key, so a re-render keeps it. */
  private _barStop = '';

  static get sharedStyles() { return [srOnlySheet]; }

  static get styles() {
    return `
      :host { display: block; position: relative; }
      .data-table { display: flex; flex-direction: column; gap: var(--b-space-sm, 0.5rem); }

      /* Selection */
      .select-col { width: 2.5rem; text-align: center; }
      .select-col input { cursor: pointer; }

      /* Row actions */
      .row-actions-col { width: var(--b-space-xl, 3rem); text-align: center; }
      .row-action-trigger-icon {
        font-size: var(--b-text-lg, 1.125rem);
        font-weight: 600;
        user-select: none;
      }

      /* Footer with bulk actions */
      .footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: var(--b-space-sm, 0.5rem);
        position: sticky; bottom: 0; z-index: 1;
        background: var(--b-bg);
        /* Left as b-table's cells pad their text, so "24 items" lines up with the rows, not the table's edge. */
        padding: var(--b-space-xs, 0.25rem) var(--b-space-sm, 0.5rem) 0 var(--b-space-md, 0.75rem);
      }
      /* The bulk bar floats just above the sticky footer, centred on the table (TASK-788): it follows the table,
         never the window, so it does not cover the pagination or other content on a split page or in a modal.
         While rows are selected the table keeps room under its last row, so nothing stays hidden behind it. */
      .data-table.selecting b-table { margin-bottom: var(--b-bulk-room, var(--_bulk-room, 3.75rem)); }
      .bulk-bar {
        position: absolute; z-index: 3; left: 50%; bottom: calc(100% + var(--b-space-sm, 0.5rem));
        transform: translateX(-50%); box-sizing: border-box;
        width: max-content; max-width: calc(100% - 2 * var(--b-space-sm, 0.5rem));
        display: flex; align-items: center; gap: var(--b-space-sm, 0.5rem);
        padding: var(--b-space-xs, 0.25rem) var(--b-space-xs, 0.25rem) var(--b-space-xs, 0.25rem) var(--b-space-lg, 1rem);
        background: var(--b-bg-elevated); color: var(--b-text);
        border: var(--b-border-width, 1px) solid color-mix(in srgb, var(--b-color-primary) 45%, var(--b-border));
        border-radius: var(--b-radius-lg, 0.625rem); box-shadow: var(--b-shadow-xl);
        font-size: var(--b-text-sm, 0.8125rem);
        animation: b-bulk-rise var(--b-transition, 150ms ease);
      }
      @keyframes b-bulk-rise { from { opacity: 0; transform: translate(-50%, 0.5rem); } }
      .bulk-bar [hidden] { display: none !important; }
      .bulk-count { white-space: nowrap; color: var(--b-text-secondary); font-variant-numeric: tabular-nums; }
      .bulk-count strong { color: var(--b-text); font-weight: var(--b-font-weight-bold, 700); }
      .bulk-link {
        border: 0; background: none; padding: 0 var(--b-space-xs, 0.25rem); cursor: pointer; white-space: nowrap;
        color: var(--b-color-primary); font: inherit; font-weight: var(--b-font-weight-semibold, 600);
        text-decoration: underline; text-underline-offset: 2px;
      }
      .bulk-sep { flex: none; width: 1px; align-self: stretch; margin: var(--b-space-xs, 0.25rem) 0; background: var(--b-border); }
      /* flex: none, never min-width: 0: a group allowed to shrink kept its overflow to itself, so _fitBulkBar() saw a
         bar that fitted while More sat on top of × (measured in Chrome at a 390px phone). */
      .bulk-actions { flex: none; display: flex; align-items: center; gap: var(--b-space-xs, 0.25rem); }
      .bulk-info, .bulk-tools { flex: none; display: flex; align-items: center; gap: var(--b-space-sm, 0.5rem); }
      /* Too narrow for one line: the count and "Select all" on top, the actions and × on the row below. */
      .bulk-bar.wrapped { flex-wrap: wrap; row-gap: var(--b-space-xs, 0.25rem); padding-left: var(--b-space-md, 0.75rem); }
      .bulk-bar.wrapped .bulk-sep { display: none; }
      .bulk-bar.wrapped .bulk-info, .bulk-bar.wrapped .bulk-tools { flex-basis: 100%; }
      .bulk-bar.wrapped .bulk-clear { margin-left: auto; }
      /* Wrapped, the top row's text may wrap too: a long translation of "selected" or "Select all N matching". */
      .bulk-bar.wrapped .bulk-info { flex-wrap: wrap; column-gap: var(--b-space-sm, 0.5rem); row-gap: 0; min-width: 0; }
      .bulk-bar.wrapped .bulk-count, .bulk-bar.wrapped .bulk-link { white-space: normal; text-align: left; padding: 0; }
      .bulk-bar.squeeze .bulk-tools, .bulk-bar.squeeze .bulk-actions { flex: 1 1 auto; min-width: 0; }
      .bulk-bar.squeeze .bulk-btn { flex: 0 1 auto; min-width: 0; }
      .bulk-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
      /* Matches b-button's look: the same padding, radius, weight and variants. */
      .bulk-btn {
        display: inline-flex; align-items: center; gap: var(--b-space-xs, 0.25rem); white-space: nowrap;
        padding: var(--b-space-xs, 0.25rem) var(--b-space-md, 0.75rem); min-height: 2rem; box-sizing: border-box;
        border: var(--b-border-width, 1px) solid var(--b-border); border-radius: var(--b-radius, 0.375rem);
        background: var(--b-bg); color: var(--b-text); cursor: pointer;
        font: inherit; font-size: var(--b-text-sm, 0.8125rem); font-weight: var(--b-font-weight-medium, 500);
        transition: background var(--b-transition, 150ms ease), border-color var(--b-transition, 150ms ease);
      }
      .bulk-btn:hover { background: var(--b-bg-tertiary); border-color: var(--b-border-hover); }
      .bulk-btn.primary { background: var(--b-color-primary); border-color: var(--b-color-primary); color: var(--b-text-on-primary, var(--b-text-inverse)); }
      .bulk-btn.primary:hover { background: var(--b-color-primary-hover); }
      .bulk-btn.danger { color: var(--b-color-danger); border-color: color-mix(in srgb, var(--b-color-danger) 45%, transparent); }
      .bulk-btn.danger:hover { background: var(--b-color-danger-light); }
      .bulk-btn svg, .bulk-icon svg { width: var(--b-icon-sm, 0.875rem); height: var(--b-icon-sm, 0.875rem); }
      .bulk-icon { display: inline-flex; }
      .bulk-icon-btn {
        flex: none; display: grid; place-items: center; width: 2rem; height: 2rem; padding: 0;
        border: 0; border-radius: var(--b-radius, 0.375rem); background: none; color: var(--b-text-secondary);
        cursor: pointer; font: inherit; font-size: var(--b-text-lg, 1rem); line-height: 1;
      }
      .bulk-icon-btn:hover { background: var(--b-bg-tertiary); color: var(--b-text); }
      .bulk-bar button:focus-visible { outline: none; box-shadow: var(--b-focus-ring); }
    `;
  }

  setConfig(config: DataTableConfig) {
    this._config = config;
    this._selected.clear();
    this._allMatching = false;
    this._filters = {};
    // Explicit flatArray:false starts in server mode; everything else starts client and may be
    // flipped by envelope detection on the first load.
    this._serverPaged = config.flatArray === false;
    this._pageSize = this._resolvePageSize();
    this.update();
    this._applyData();
  }

  /**
   * Re-apply localized labels — columns, row actions, pagination labels, and the
   * label set — WITHOUT resetting data, filters, selection or the current page.
   * Use after a locale switch; unlike `setConfig()` this preserves table state.
   */
  relabel(labels: Partial<Pick<DataTableConfig, 'columns' | 'rowActions' | 'paginationLabels' | 'labels'>>): void {
    if (!this._config) return;
    if (labels.columns) this._config.columns = labels.columns;
    if ('rowActions' in labels) this._config.rowActions = labels.rowActions;
    if (labels.paginationLabels) this._config.paginationLabels = labels.paginationLabels;
    if (labels.labels) this._config.labels = labels.labels;
    this.update();      // re-renders pagination labels, no-data, action aria-label
    this._applyData();  // re-applies columns/row-actions over the current page data
  }

  /**
   * Set external filter parameters.
   * Merges into query params on next load, resets to page 1, and triggers a reload.
   */
  setFilters(params: Record<string, string>): void {
    this._filters = { ...params };
    // "All matching" meant the old filters' rows.
    this._allMatching = false;
    this._page = 1;
    this.load();
  }

  async load(page?: number): Promise<void> {
    if (!this._config) return;

    if (page) this._page = page;
    this._loading = true;
    this.update();

    try {
      const params: Record<string, string> = { ...this._config.params };
      const pageSize = this._pageSize;

      // Send server-paging params when we KNOW we're server-paged: an explicit flatArray:false, or a
      // mode already detected on a prior load (sticky). An explicit flatArray:true suppresses them
      // (client escape hatch) until a capped envelope forces the flip; an unset flatArray sends them
      // eagerly since a bare-array endpoint harmlessly ignores unknown query params.
      if (this._config.flatArray !== true || this._serverPaged) {
        params['page'] = String(this._page);
        params['pageSize'] = String(pageSize);
      }

      // Merge external filters as query params
      for (const [k, v] of Object.entries(this._filters)) {
        if (v) params[k] = v;
      }

      const resp: ApiResponse = await this._config.apiClient.get(this._config.endpoint, params);

      if (!resp.ok) {
        this._allData = [];
        this._totalCount = 0;
        this._totalPages = 1;
      } else if (Array.isArray(resp.data)) {
        // Bare array. Client-paged unless the consumer explicitly forced server mode.
        const all = (this._config.dataKey
          ? ((resp.data as unknown as Record<string, unknown>)[this._config.dataKey] as Record<string, unknown>[])
          : resp.data) as Record<string, unknown>[];
        this._allData = all ?? [];
        this._totalCount = this._allData.length;
        this._totalPages = Math.max(1, Math.ceil(this._totalCount / pageSize));
        if (this._config.flatArray !== false) this._serverPaged = false;
      } else {
        const env = this._extractEnvelope(resp.data);
        if (env) {
          // { items, totalCount } envelope. Auto-detect the mode: a CAPPED page (fewer rows than
          // totalCount) can ONLY be paged by the server — client slicing would blank page 2+ — so
          // switch to server mode even if flatArray was left at its client default. A full list that
          // merely arrives wrapped in an envelope stays client-paged when flatArray:true. An explicit
          // flatArray:false is always server. Server mode is sticky (next load sends page/pageSize).
          this._allData = env.items;
          this._totalCount = env.totalCount;
          this._totalPages = Math.max(1, Math.ceil(env.totalCount / pageSize));
          const capped = env.items.length < env.totalCount;
          if (this._config.flatArray === true) this._serverPaged = this._serverPaged || capped;
          else this._serverPaged = true;
        } else {
          // Unrecognised object shape → treat as an empty result rather than mis-render.
          this._allData = [];
          this._totalCount = 0;
          this._totalPages = 1;
        }
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

  // ── Active row (single-row highlight, distinct from bulk-checkbox selection) ──

  /** Highlight a single row as active/selected. Persists across reloads until cleared. */
  setActiveRow(id: string | null): void {
    this._activeRowId = id == null ? null : String(id);
    const table = this.$('b-table') as any;
    if (table?.setActiveRow) table.setActiveRow(this._activeRowId);
  }

  getActiveRow(): string | null { return this._activeRowId; }

  // ── Selection API ──

  getSelected(): string[] { return [...this._selected]; }

  clearSelection() {
    this._selected.clear();
    this._allMatching = false;
    this.update();
    this._applyData();
  }

  selectAll() {
    const pageData = this._getPageData();
    for (const row of pageData) {
      const id = this._rowId(row);
      if (id) this._selected.add(id);
    }
    this._selectionChanged();
  }

  /** Whether the selection is every row the filters match (server-paged "select all matching"). */
  isAllMatching(): boolean { return this._allMatching; }

  /** The count the bar shows: every matching row after "select all matching" on a server-paged table. */
  private _selectedCount(): number {
    return this._allMatching ? Math.max(this._totalCount, this._selected.size) : this._selected.size;
  }

  /** After the user changed the selection: re-render, announce the count, emit `selection-change`. */
  private _selectionChanged(keepAllMatching = false): void {
    if (!keepAllMatching) this._allMatching = false;
    this.update();
    this._applyData();
    const n = this._selectedCount();
    const live = this.$('.bulk-live');
    if (live) live.textContent = '';
    announce(this, n
      ? `${n} ${this._config?.labels?.selected ?? this.label('label-selected', 'bwc.dataTable.selected', 'selected')}`
      : this._config?.labels?.selectionCleared ?? this.label('label-selection-cleared', 'bwc.dataTable.selectionCleared', 'Selection cleared'), live);
    this.emit('selection-change', { selected: this.getSelected(), count: n, allMatching: this._allMatching });
  }

  // ── Render ──

  render() {
    if (!this._config) return '<div class="data-table"></div>';

    const hasBulk = this._selected.size > 0 && !!this._config.bulkActions?.length;

    const pageSizeAttr = this._showPageSizePicker() ? ` page-size="${this._pageSize}"` : '';
    const pageSizesAttr = Array.isArray(this._config.pageSizeOptions)
      ? ` page-sizes="${this._config.pageSizeOptions.join(',')}"` : '';
    const labelAttrs = this._buildLabelAttrs();

    return `
      <div class="data-table${hasBulk ? ' selecting' : ''}">
        <b-table ${this._loading ? 'loading' : ''} hoverable striped${this._config.labels?.noData ? ` label-no-data="${escapeAttr(this._config.labels.noData)}"` : ''}></b-table>
        <div class="footer">
          <span></span>
          ${hasBulk ? this._renderBulkBar() : ''}
          <b-pagination page="${this._page}" total-pages="${this._totalPages}" total-count="${this._totalCount}"${pageSizeAttr}${pageSizesAttr}${labelAttrs}></b-pagination>
        </div>
        <div class="sr-only bulk-live" role="status" aria-live="polite"></div>
        <b-confirm-dialog class="bulk-confirm"></b-confirm-dialog>
      </div>
    `;
  }

  /** The bulk actions in bar order: as configured, with `danger` ones last. */
  private _bulkActions(): BulkAction[] {
    const all = this._config?.bulkActions ?? [];
    return [...all.filter(a => a.variant !== 'danger'), ...all.filter(a => a.variant === 'danger')];
  }

  private _l(key: keyof DataTableLabels, i18nKey: string, fallback: string, params?: Record<string, string | number>): string {
    const own = this._config?.labels?.[key];
    if (own) return params ? own.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : own;
    return this.label(`label-${String(key).replace(/[A-Z]/g, c => '-' + c.toLowerCase())}`, i18nKey, fallback, params);
  }

  /**
   * Every action is rendered inline; `_fitBulkBar()` then moves the ones that do not fit into More, measured. The
   * labels are text: they were interpolated raw before. `icon` stays markup (an SVG), as documented.
   */
  private _renderBulkBar(): string {
    const n = this._selectedCount();
    const pageData = this._getPageData();
    const pageAll = pageData.length > 0 && pageData.every(r => this._selected.has(this._rowId(r)));
    const total = this._totalCount;
    const offerAll = !!this._config!.selectAllMatching && pageAll && !this._allMatching && total > this._selected.size;
    const buttons = this._bulkActions().map(a =>
      `<button type="button" class="bulk-btn ${a.variant ?? ''}" data-bulk="${escapeAttr(a.id)}" data-key="a:${escapeAttr(a.id)}" title="${escapeAttr(a.label)}">${a.icon ? `<span class="bulk-icon" aria-hidden="true">${a.icon}</span>` : ''}<span class="bulk-label">${escapeHtml(a.label)}</span></button>`
    ).join('');
    const selected = this._l('selected', 'bwc.dataTable.selected', 'selected');
    return `
      <div class="bulk-bar" role="toolbar" aria-label="${escapeAttr(`${this._l('bulkActions', 'bwc.dataTable.bulkActions', 'Bulk actions')}: ${n} ${selected}`)}">
        <span class="bulk-info">
          <span class="bulk-count"><strong>${n}</strong> ${escapeHtml(selected)}</span>
          ${offerAll ? `<button type="button" class="bulk-link" data-select-all data-key="all">${escapeHtml(this._l('selectAllMatching', 'bwc.dataTable.selectAllMatching', 'Select all {count} matching', { count: total }))}</button>` : ''}
          ${this._allMatching ? `<button type="button" class="bulk-link" data-only-page data-key="page">${escapeHtml(this._l('onlyThisPage', 'bwc.dataTable.onlyThisPage', 'Only the selected'))}</button>` : ''}
        </span>
        <span class="bulk-sep" aria-hidden="true"></span>
        <span class="bulk-tools">
          <span class="bulk-actions">${buttons}
            <b-dropdown-menu class="bulk-more" align="right" hidden>
              <button type="button" slot="trigger" class="bulk-icon-btn" data-key="more" aria-label="${escapeAttr(this._l('moreActions', 'bwc.dataTable.moreActions', 'More actions'))}">&#8943;</button>
            </b-dropdown-menu>
          </span>
          <button type="button" class="bulk-icon-btn bulk-clear" data-clear data-key="clear" aria-label="${escapeAttr(this._l('clearSelection', 'bwc.dataTable.clearSelection', 'Clear selection'))}"
                  title="${escapeAttr(this._l('clearSelection', 'bwc.dataTable.clearSelection', 'Clear selection'))}">&times;</button>
        </span>
      </div>`;
  }

  /**
   * Hide the actions that do not fit, last first, into More; at least one stays inline. When even one does not fit
   * on one line (a phone, with "Select all N matching" showing), the bar wraps: the count on top, the actions, More
   * and × below, fitted again to that row. Measured in Chrome at 390px: without it, More and × sat past the bar's edge.
   */
  private _fitBulkBar(): void {
    const bar = this.$<HTMLElement>('.bulk-bar');
    const more = this.$<HTMLElement & { setItems(items: DropdownItem[]): void }>('.bulk-more');
    if (!bar || !more) return;
    const btns = this.$$<HTMLButtonElement>('.bulk-btn');
    const overflows = () => bar.scrollWidth > bar.clientWidth + 1;
    const fit = () => {
      btns.forEach(b => { b.hidden = false; });
      more.hidden = true;
      let shown = btns.length;
      while (overflows() && shown > 1) {
        btns[--shown].hidden = true;
        more.hidden = false;
      }
    };
    bar.classList.remove('wrapped');
    fit();
    if (overflows()) {
      bar.classList.add('wrapped');
      fit();
    }
    // Last resort, wrapped and still too wide (one long translated label): that label is cut with an ellipsis; its
    // text stays its accessible name, and the button's title shows it whole.
    bar.classList.remove('squeeze');
    if (overflows()) bar.classList.add('squeeze');
    // The room under the last row is the bar's real height (two rows when wrapped) plus its gap above the footer.
    const gap = parseFloat(getComputedStyle(bar).bottom) - bar.parentElement!.offsetHeight;
    this.$<HTMLElement>('.data-table')?.style.setProperty('--_bulk-room', `${Math.ceil(bar.offsetHeight + Math.max(gap, 0) + 8)}px`);
    const actions = this._bulkActions();
    more.setItems?.(btns.filter(b => b.hidden).map(b => {
      const a = actions.find(x => x.id === b.dataset.bulk)!;
      return { id: a.id, label: a.label, ...(a.variant === 'danger' ? { variant: 'danger' as const } : {}) };
    }));
    this._syncBarStops();
  }

  /** One tab stop in the toolbar (roving tabindex): the remembered one if still shown, else the first. */
  private _syncBarStops(): void {
    const stops = this._barButtons();
    if (!stops.length) return;
    const current = stops.find(b => b.dataset.key === this._barStop) ?? stops[0];
    stops.forEach(b => { b.tabIndex = b === current ? 0 : -1; });
  }

  private _barButtons(): HTMLButtonElement[] {
    return this.$$<HTMLButtonElement>('.bulk-bar button').filter(b => !b.hidden && !b.closest('[hidden]'));
  }

  private async _runBulk(id: string): Promise<void> {
    const action = this._config?.bulkActions?.find(a => a.id === id);
    if (!action) return;
    const n = this._selectedCount();
    if (action.confirm) {
      const dlg = this.$<HTMLElement & { show(): Promise<boolean> }>('.bulk-confirm');
      if (!dlg) return;
      const confirmDefault = this._config?.labels?.confirmDefault ?? this.label('label-confirm-default', 'bwc.dataTable.confirmDefault', 'Are you sure?');
      const message = action.confirmMessage
        ? action.confirmMessage.replace('{count}', String(n))
        : `${confirmDefault} (${n})`;
      dlg.setAttribute('title', `${action.label} (${n})`);
      dlg.setAttribute('message', message);
      dlg.setAttribute('confirm-text', action.label);
      dlg.setAttribute('cancel-text', this._l('cancel', 'bwc.common.cancel', 'Cancel'));
      dlg.setAttribute('variant', action.variant === 'danger' ? 'danger' : 'primary');
      if (!await dlg.show()) return;
    }
    const detail: BulkActionDetail = { action: action.id, selected: this.getSelected(), count: n };
    if (this._allMatching) Object.assign(detail, { allMatching: true, filters: { ...this._filters }, params: { ...(this._config?.params ?? {}) } });
    this.emit('bulk-action', detail);
  }

  protected onUpdated() {
    if (!this._config) return;

    // Pagination
    const pagination = this.$<HTMLElement>('b-pagination');
    if (pagination) {
      this.listen(pagination, 'page-change', ((e: CustomEvent) => {
        this._page = e.detail.page;
        if (this._serverPaged) {
          this.load(e.detail.page);
        } else {
          this.update();
          this._applyData();
        }
      }) as EventListener);

      // Page size change
      this.listen(pagination, 'page-size-change', ((e: CustomEvent) => {
        this._pageSize = e.detail.pageSize;
        this._page = 1;
        if (this._serverPaged) {
          this.load(1);
        } else {
          this._totalPages = Math.max(1, Math.ceil(this._totalCount / this._pageSize));
          this.update();
          this._applyData();
        }
      }) as EventListener);
    }

    // Table events — enrich with full row data
    const innerTable = this.$<HTMLElement>('b-table');

    if (innerTable) {
      this.listen(innerTable, 'row-click', ((e: CustomEvent) => {
        // Stop the raw bubble from b-table (which only carries {id}) so page-level
        // listeners don't see the pre-enrichment event AND then our re-emit below.
        e.stopPropagation();
        const id = e.detail?.id;
        const row = this._allData.find(r => this._rowId(r) === id);
        // Emit { id, row } to match row-action's shape — consumers read e.detail.row.
        this.emit('row-click', { id, row: row ?? {} });
      }) as EventListener);

      this.listen(innerTable, 'action-click', ((e: CustomEvent) => {
        e.stopPropagation();
        const id = e.detail?.id;
        const row = this._allData.find(r => this._rowId(r) === id);
        this.emit('action-click', { action: e.detail.action, id, row: row ?? {} });
      }) as EventListener);

      this.listen(innerTable, 'sort', ((e: CustomEvent) => {
        this.emit('sort', e.detail);
      }) as EventListener);
    }

    // Escape anywhere in the table clears the selection, unless an open menu or dialog takes it first.
    this.listen<KeyboardEvent>(this, 'keydown', (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented || !this._selected.size) return;
      if (e.composedPath().some(n => n instanceof Element && n.matches('b-dropdown-menu, b-confirm-dialog'))) return;
      e.preventDefault();
      this._clearFromBar();
    });

    this._barObserver?.disconnect();
    this._barObserver = null;
    const bar = this.$<HTMLElement>('.bulk-bar');
    if (!bar) return;
    this.listen<MouseEvent>(bar, 'click', (e) => {
      const btn = (e.target as Element).closest<HTMLButtonElement>('button');
      if (!btn || !bar.contains(btn)) return;
      if (btn.dataset.key) this._barStop = btn.dataset.key;
      if (btn.dataset.bulk) void this._runBulk(btn.dataset.bulk);
      else if (btn.hasAttribute('data-clear')) this._clearFromBar();
      else if (btn.hasAttribute('data-select-all')) this._selectAllMatching();
      else if (btn.hasAttribute('data-only-page')) { this._selectionChanged(); this._focusBar('clear'); }
    });
    const more = this.$<HTMLElement>('.bulk-more');
    if (more) this.listen<CustomEvent<{ id: string }>>(more, 'select', (e) => { e.stopPropagation(); void this._runBulk(e.detail.id); });
    // A toolbar is one tab stop; the arrow keys, Home and End move within it.
    this.listen<KeyboardEvent>(bar, 'keydown', (e) => {
      if (e.composedPath().some(n => n instanceof Element && n.classList.contains('menu'))) return;
      const stops = this._barButtons();
      const i = stops.indexOf(e.target as HTMLButtonElement);
      if (i < 0) return;
      const next = rovingIndex(e, i, stops.length);
      if (next === null) return;
      this._barStop = stops[next].dataset.key ?? '';
      this._syncBarStops();
      stops[next].focus();
    });
    this._fitBulkBar();
    const footer = this.$<HTMLElement>('.footer');
    if (footer && typeof ResizeObserver !== 'undefined') {
      this._barObserver = new ResizeObserver(() => this._fitBulkBar());
      this._barObserver.observe(footer);
    }
  }

  protected onUnmount(): void {
    this._barObserver?.disconnect();
    this._barObserver = null;
  }

  private _focusBar(key: string): void {
    const btn = this._barButtons().find(b => b.dataset.key === key) ?? this._barButtons()[0];
    if (!btn) return;
    this._barStop = btn.dataset.key ?? '';
    this._syncBarStops();
    btn.focus();
  }

  /** Clear, and give focus to the header checkbox when it was in the bar, which is gone now. */
  private _clearFromBar(): void {
    const hadFocus = !!this.shadowRoot?.activeElement?.closest('.bulk-bar');
    this._selected.clear();
    this._barStop = '';
    this._selectionChanged();
    if (!hadFocus) return;
    requestAnimationFrame(() => {
      const table = this.$('b-table');
      (table?.shadowRoot?.querySelector<HTMLInputElement>('.select-all') ?? table)?.focus();
    });
  }

  /** Client-paged: every row's id. Server-paged: the rows the filters match, by flag; the ids are not loaded. */
  private _selectAllMatching(): void {
    if (this._serverPaged) {
      this._allMatching = true;
    } else {
      for (const row of this._allData) {
        const id = this._rowId(row);
        if (id) this._selected.add(id);
      }
    }
    this._selectionChanged(this._serverPaged);
    this._focusBar(this._serverPaged ? 'page' : 'clear');
  }

  private _applyData() {
    // Elements cloned from <template> content are uncustomized until they're
    // adopted into a connected tree AND a CEReactions checkpoint runs. When
    // _applyData is called synchronously right after update() (e.g. from
    // setConfig), the <b-table> inserted by morphing can still be a plain
    // HTMLElement. Force the upgrade here so setColumns/setData are callable.
    if (this.shadowRoot) customElements.upgrade(this.shadowRoot);

    const table = this.$('b-table') as any;
    if (!table || !this._config) return;

    // Build columns: [checkbox?] + user columns + [row actions?]
    const columns: TableColumn[] = [];

    if (this._config.selectable) {
      const pageData = this._getPageData();
      const allSelected = pageData.length > 0 && pageData.every(r => this._selected.has(this._rowId(r)));

      columns.push({
        key: '__select',
        label: this._config?.labels?.selectAll ?? 'Select all rows',
        headerRender: () => `<input type="checkbox" ${allSelected ? 'checked' : ''} class="select-all" aria-label="${escapeAttr(this._config?.labels?.selectAll ?? 'Select all rows')}" />`,
        width: '2.5rem',
        align: 'center',
        render: (_v, row) => {
          const id = this._rowId(row);
          return `<input type="checkbox" class="row-select" data-id="${escapeAttr(id)}" ${this._selected.has(id) ? 'checked' : ''} aria-label="${escapeAttr(this._config?.labels?.selectRow ?? 'Select row')}" />`;
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
          return `<b-button variant="secondary" size="sm" class="row-action-trigger" data-id="${id}" aria-label="${this._config?.labels?.actions ?? 'Actions'}"><span class="row-action-trigger-icon">⋮</span></b-button>`;
        },
      });
    }

    table.setColumns(columns);
    if (this._config?.idField) table.setIdField(this._config.idField);

    const pageData = this._getPageData();
    table.setData(pageData);
    if (table.setActiveRow) table.setActiveRow(this._activeRowId);

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
        this._selectionChanged();
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
        this._selectionChanged();
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

        // Position the menu element at the button location
        // The internal _positionMenu uses this.getBoundingClientRect() to position the popover
        const rect = btn.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.left = `${rect.left}px`;
        menu.style.top = `${rect.bottom}px`;
        menu.style.width = `${rect.width}px`;
        menu.style.height = '0';

        document.body.appendChild(menu);
        menu.setItems(actions);
        menu.show();

        // Single teardown shared by both the select and outside-click paths. Selecting an item is
        // the common path — it must also unregister the document listener, otherwise every
        // row-action leaves a dangling listener whose closure retains the removed menu.
        const cleanup = () => { menu.remove(); document.removeEventListener('click', cleanup); };

        menu.addEventListener('select', ((se: CustomEvent) => {
          this.emit('row-action', { action: se.detail.id, id, row });
          cleanup();
        }) as EventListener);

        // Clean up on outside click (popover handles this, but belt and suspenders)
        setTimeout(() => document.addEventListener('click', cleanup), 0);
      });
    });

    // Inline editable cells
    const editableCols = this._config?.columns.filter(c => c.editable) ?? [];
    if (editableCols.length) {
      (table.shadowRoot as ShadowRoot).querySelectorAll<HTMLTableCellElement>('td[data-editable]').forEach((td) => {
        td.addEventListener('click', (e: Event) => {
          // Ignore if already editing (input/select already injected)
          if (td.querySelector('input, select')) return;
          e.stopPropagation(); // Don't trigger row-click

          const colKey = td.dataset.editable!;
          const rowEl = td.closest<HTMLElement>('tr[data-id]');
          if (!rowEl) return;

          const rowId = rowEl.dataset.id!;
          const row = this._allData.find(r => this._rowId(r) === rowId);
          const col = editableCols.find(c => c.key === colKey);
          if (!row || !col) return;

          this._startCellEdit(td, col, row, rowId);
        });
      });
    }
  }

  private _startCellEdit(
    td: HTMLElement,
    col: TableColumn,
    row: Record<string, unknown>,
    rowId: string,
  ): void {
    const span = td.querySelector<HTMLElement>('.cell-val');
    if (!span) return;

    const originalValue = row[col.key];
    let cancelled = false;

    // Build the edit control
    let input: HTMLInputElement | HTMLSelectElement;

    const isSelect = col.editable === 'select'
      || (col.editable === true && !!(col.options?.length || col.getOptions));

    if (isSelect) {
      const sel = document.createElement('select');
      const opts = col.getOptions ? col.getOptions(row) : (col.options ?? []);
      for (const opt of opts) {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        if (String(originalValue) === opt.value) o.selected = true;
        sel.appendChild(o);
      }
      input = sel;
    } else {
      const inp = document.createElement('input');
      inp.type = col.editable === 'number' ? 'number'
        : col.editable === 'date' ? 'date'
        : 'text';
      inp.value = originalValue !== null && originalValue !== undefined ? String(originalValue) : '';
      input = inp;
    }

    // Style to match design tokens — injected directly since we're in b-table's shadow DOM
    Object.assign(input.style, {
      boxSizing: 'border-box',
      width: '100%',
      padding: '0.125rem 0.375rem',
      border: '1px solid var(--b-color-primary)',
      borderRadius: 'var(--b-radius, 0.375rem)',
      fontSize: 'var(--b-text-sm, 0.8125rem)',
      fontFamily: 'inherit',
      background: 'var(--b-bg)',
      color: 'var(--b-text)',
      outline: 'none',
      boxShadow: '0 0 0 2px color-mix(in srgb, var(--b-color-primary) 20%, transparent)',
    });

    span.innerHTML = '';
    span.appendChild(input);
    input.focus();
    if (input instanceof HTMLInputElement && input.type === 'text') input.select();

    const _display = (val: unknown): string =>
      col.render ? col.render(val, { ...row, [col.key]: val }) : _escapeValue(val);

    const commit = () => {
      if (cancelled) return;
      const raw = input.value;
      const coerced: unknown = col.editable === 'number' && raw !== '' ? Number(raw) : raw;
      span.innerHTML = _display(coerced);
      // Optimistic update in _allData
      const idx = this._allData.findIndex(r => this._rowId(r) === rowId);
      if (idx !== -1) this._allData[idx][col.key] = coerced;
      this.emit('cell-edit', {
        id: rowId,
        key: col.key,
        oldValue: originalValue,
        newValue: coerced,
        row: { ...row, [col.key]: coerced },
      });
    };

    const cancel = () => {
      cancelled = true;
      span.innerHTML = _display(originalValue);
    };

    input.addEventListener('blur', commit, { once: true });
    input.addEventListener('keydown', (e: Event) => {
      const ke = e as KeyboardEvent;
      if (ke.key === 'Enter')  { ke.preventDefault(); input.blur(); }
      if (ke.key === 'Escape') { cancel(); input.blur(); }
    });
  }

  /**
   * Recognise a `{ items, totalCount }` (PagedResult) envelope, honouring `dataKey`/`totalKey`
   * overrides. Returns null for anything that isn't an object carrying an array under the items key.
   */
  private _extractEnvelope(data: unknown): { items: Record<string, unknown>[]; totalCount: number } | null {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    const obj = data as Record<string, unknown>;
    const itemsKey = this._config?.dataKey || 'items';
    const items = obj[itemsKey];
    if (!Array.isArray(items)) return null;
    const totalKey = this._config?.totalKey || 'totalCount';
    const rawTotal = obj[totalKey];
    const totalCount = typeof rawTotal === 'number' ? rawTotal : items.length;
    return { items: items as Record<string, unknown>[], totalCount };
  }

  private _getPageData(): Record<string, unknown>[] {
    if (!this._config) return [];
    // Server-paged: _allData is already the current page — never re-slice (that is the page-2-empty
    // trap). Client-paged: _allData is the full set — slice to the current page locally.
    if (!this._serverPaged) {
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

/** Detail payload carried by the `cell-edit` custom event on `<b-data-table>`. */
export interface CellEditDetail {
  /** Row identity value (resolved via `idField` or `id`/`guid`). */
  id: string;
  /** Column key that was edited. */
  key: string;
  /** Value before the edit. */
  oldValue: unknown;
  /** Coerced new value (number for `editable:'number'`, string otherwise). */
  newValue: unknown;
  /** Full row with the new value applied. */
  row: Record<string, unknown>;
}

/** Escape a raw cell value to safe display HTML. */
function _escapeValue(val: unknown): string {
  if (val === null || val === undefined) return '<span style="color:var(--b-text-muted)">—</span>';
  const el = document.createElement('span');
  el.textContent = String(val);
  return el.innerHTML;
}
