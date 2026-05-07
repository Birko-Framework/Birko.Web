import type { ApiClient } from 'birko-web-core/http';
import { apiErrorMessage } from 'birko-web-core/http';
import { t as globalT } from 'birko-web-core';
import type { TableColumn } from 'birko-web-components/data';
import type { RowAction, ToolbarAction, BDataTable } from 'birko-web-components/data';
import type { BModal } from 'birko-web-components/layout';
import type { BConfirmDialog } from 'birko-web-components/layout';
import type { BForm, FormSchema } from 'birko-web-components/inputs';
import type { BButton } from 'birko-web-components/inputs';
import type { FilterDef } from 'birko-web-components/inputs';
import { toast } from 'birko-web-components/feedback';
import { showFormError } from 'birko-web-components/form-utils';
import { BasePage } from './base-page.js';

// ── BaseCrudPage ────────────────────────────────────────────────────────────

/**
 * Abstract base class for data-driven CRUD pages.
 *
 * Extends `BasePage` with: declarative filter row, data table setup, modal
 * create/edit, delete confirmation, permission checks, and a required-filter
 * empty state.
 *
 * Subclasses choose their content layout:
 * - **`BaseListPage`** — data table with row-level edit/delete actions
 * - **`BaseSplitPage`** — split panel with master table + detail card
 * - **`BaseCrudPage` directly** — custom data layout with built-in CRUD modal
 *
 * ## Minimal subclass
 * ```ts
 * class ItemsPage extends BaseCrudPage<ItemDto> {
 *   protected endpoint = 'api/items';
 *   protected entityLabel = 'Items';
 *   protected get api() { return api; }
 *   protected get columns() { return [...]; }
 *   protected get formSchema() { return itemFormSchema(); }
 *   protected renderContent() { return `<b-data-table id="table"></b-data-table>`; }
 * }
 * ```
 */
export abstract class BaseCrudPage<T extends Record<string, unknown>> extends BasePage {
  protected _editingId: string | null = null;
  protected _tableReady = false;
  private _needsInitialLoad = false;

  // ── Required ──────────────────────────────────────────────────────────────

  /** HTTP client instance (typically the app-level singleton). */
  protected abstract get api(): ApiClient;

  // ── Optional — override to customise ─────────────────────────────────────

  /** REST resource base path, e.g. `'api/products'`. Required for table + CRUD pages. */
  protected declare endpoint?: string;

  /** Column definitions for `<b-data-table>`. Required for pages with a table. */
  protected get columns(): TableColumn[] { return []; }

  /** Form schema for the create/edit modal. Return `null` to disable CRUD. */
  protected get formSchema(): FormSchema | null { return null; }

  /** Form schema for edit mode. Defaults to `formSchema`. */
  protected get editFormSchema(): FormSchema | null { return this.formSchema; }

  /** Human-readable entity name used in titles and toast messages. Default: `'Item'`. */
  protected entityLabel = 'Item';

  /** Field used as the row identifier. Default: `'id'`. */
  protected idField = 'id';

  /** Default page size for the data table. */
  protected declare pageSize?: number;

  /** Whether the API returns a flat array (true) or a paged envelope (false). Default: `true`. */
  protected flatArray = true;

  /** Show Edit actions. Default: `true`. */
  protected editEnabled = true;

  /** Show Delete actions. Default: `true`. */
  protected deleteEnabled = true;

  /** Modal size — passed to `<b-modal size="...">`. */
  protected declare modalSize?: 'sm' | 'lg' | 'xl' | 'xxl';

  /** Permission key required to see the create button. `undefined` = always visible. */
  protected declare createPermission?: string;

  /** Permission key for edit actions. */
  protected declare editPermission?: string;

  /** Permission key for delete actions. */
  protected declare deletePermission?: string;

  /**
   * Permission checker — override to integrate with your auth store.
   * Default: always returns `true`.
   */
  protected hasPermission(_permission: string): boolean { return true; }

  // ── Filter area (config-based) ────────────────────────────────────────────

  /**
   * Declarative filter definitions.
   *
   * Return an array of `FilterDef` objects. The base class renders the controls,
   * populates select options, wires change events, and auto-collects values
   * into `table.setFilters()` as query params.
   *
   * Override this getter to define page-specific filters.
   * Use `local: true` for cascade-only or path-parameter filters.
   *
   * ```ts
   * protected get filterDefs(): FilterDef[] {
   *   return [
   *     { name: 'status', type: 'select', placeholder: 'All statuses',
   *       options: [{ value: 'active', label: 'Active' }, { value: 'draft', label: 'Draft' }] },
   *   ];
   * }
   * ```
   */
  protected get filterDefs(): FilterDef[] { return []; }

  /**
   * Custom filter HTML appended after config-based filters.
   * Prefer `filterDefs` for standard controls. Use this only for truly custom widgets.
   * Named elements (`[name]`) are auto-collected into `table.setFilters()`.
   */
  protected renderFilters(): string { return ''; }

  /**
   * Whether the required filter selection has been made.
   * When `false`, content is replaced with a `<b-empty>` placeholder.
   * Default: `true` (no required filter).
   */
  protected get requiredFilterSet(): boolean { return true; }

  /**
   * Message shown when `requiredFilterSet` is `false`.
   * Default: `'Select a filter to continue'`.
   */
  protected get emptyFilterMessage(): string { return 'Select a filter to continue'; }

  /**
   * Called when any filter value changes.
   *
   * Override for cascading logic (update dependent filter options, change endpoint, etc.).
   * The default implementation calls `_collectAndApplyFilters()` which sends non-local
   * filter values to `table.setFilters()` and triggers a reload.
   *
   * For cascade-only filters, handle the cascade and call `this.update()` — do **not**
   * call `super.onFilterChange()` (this avoids a premature table reload).
   * The table will reload when the downstream filter triggers its own change.
   */
  protected onFilterChange(_name: string, _value: string | null): void {
    this._collectAndApplyFilters();
  }

  // ── CRUD helpers ──────────────────────────────────────────────────────────

  /**
   * Map a loaded API entity to form field values before populating the edit modal.
   * Default: identity pass-through.
   */
  protected mapToForm(item: T): Record<string, unknown> {
    return item as Record<string, unknown>;
  }

  /**
   * Map form values to the request body before POST/PUT.
   * Return `null` to abort the save (e.g. custom validation failed).
   * Default: identity pass-through.
   */
  protected mapFromForm(data: Record<string, unknown>, _isEdit: boolean): Record<string, unknown> | null {
    return data;
  }

  /**
   * Render the modal body HTML.
   * Default: `<b-form id="form"></b-form>`.
   * Override to add custom components alongside or instead of the form.
   * **Must** include a `<b-form id="form">` if the default save flow is used.
   */
  protected renderModalBody(): string {
    return '<b-form id="form"></b-form>';
  }

  /**
   * Called after the form/modal is ready — on both create (entity = null)
   * and edit (entity = loaded data, form values already set).
   */
  protected onFormReady(_form: BForm, _entity: T | null): void {}

  /**
   * Called after a successful create or edit, before the table reloads.
   * Use for post-save side effects (e.g. tag association, file upload).
   */
  protected async afterSave(_savedEntity: T, _isEdit: boolean): Promise<void> {}

  /** Called after a successful create. */
  protected onCreateSuccess?(_item: T): void;

  /** Called after a successful edit. */
  protected onEditSuccess?(_item: T): void;

  /** Called after a successful delete. */
  protected onDeleteSuccess?(_id: string): void;

  /**
   * Extra toolbar actions rendered in the page header after the "New" button.
   */
  protected get extraToolbarActions(): ToolbarAction[] { return []; }

  /** Handle toolbar action button clicks. */
  protected onToolbarAction(_action: string): void {}

  /**
   * Translation function — delegates to the global i18n singleton.
   *
   * Resolution order:
   *   1. `birko-web-core` global `t(key)` (reads the current I18n instance)
   *   2. English defaults below (matches pre-global-i18n behaviour)
   *
   * `{entity}` is auto-interpolated with `this.entityLabel` so bundle entries
   * like `"bws.common.new": "Nový {entity}"` produce `"Nový Account"`.
   *
   * Subclasses may still override to inject custom per-page translations.
   */
  protected t(key: string, params?: Record<string, string | number>): string {
    const defaults: Record<string, string> = {
      'bws.common.new':           'New {entity}',
      'bws.common.edit':          'Edit {entity}',
      'bws.common.delete':        'Delete',
      'bws.common.save':          'Save',
      'bws.common.cancel':        'Cancel',
      'bws.common.close':         'Close',
      'bws.common.confirmDelete': 'Delete this {entity}? This cannot be undone.',
      'bws.common.saved':         '{entity} saved',
      'bws.common.deleted':       '{entity} deleted',
      'bws.common.loadError':     'Failed to load data',
      'bws.pagination.items':     'items',
      'bws.pagination.page':      'Page',
      'bws.pagination.of':        'of',
      'bws.pagination.perPage':   '/ page',
      'bws.pagination.prev':      'Previous page',
      'bws.pagination.next':      'Next page',
      'bws.pagination.pageSize':  'Page size',
    };
    const mergedParams = { entity: this.entityLabel, ...params };
    return globalT(key, mergedParams, defaults[key] ?? key);
  }

  /**
   * Get translated pagination labels.
   * Uses the translation function; returns English defaults if not overridden.
   */
  protected _getPaginationLabels() {
    return {
      items: this.t('bws.pagination.items'),
      page: this.t('bws.pagination.page'),
      of: this.t('bws.pagination.of'),
      perPage: this.t('bws.pagination.perPage'),
      prev: this.t('bws.pagination.prev'),
      next: this.t('bws.pagination.next'),
      pageSize: this.t('bws.pagination.pageSize'),
    };
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  static override get styles(): string {
    return BasePage.styles + `
      .filter-row {
        display: flex; align-items: flex-end; gap: var(--b-space-md, 0.75rem);
        margin-bottom: var(--b-space-lg, 1.25rem);
        flex-wrap: wrap;
      }
      .filter-row b-select { flex: 1; max-width: var(--b-filter-chip-width-xl, 24rem); }
      .filter-row b-input { flex: 1; max-width: var(--b-filter-chip-width-xl, 24rem); }
      .filter-row b-search-input { flex: 0 1 var(--b-filter-chip-width-lg, 16rem); margin-left: auto; }
      .filter-row b-button { flex: 0 0 auto; }
      .filter-row b-date-picker { flex: 0 1 var(--b-filter-chip-width, 12rem); }
      .filter-row b-datetime-picker { flex: 0 1 var(--b-filter-chip-width-lg, 16rem); }
      .filter-row b-multi-select { flex: 1; max-width: var(--b-filter-chip-width-xl, 24rem); }
      .filter-row b-tag-input { flex: 1; max-width: var(--b-filter-chip-width-xl, 24rem); }
      .filter-row b-segmented { flex: 0 0 auto; }
      .filter-row b-switch { flex: 0 0 auto; }
      .filter-row .filter-range {
        display: inline-flex; align-items: center; gap: var(--b-space-xs, 0.25rem);
        flex: 0 1 auto;
      }
      .filter-row .filter-range b-input,
      .filter-row .filter-range b-date-picker {
        flex: 0 1 var(--b-filter-chip-width, 12rem);
        max-width: var(--b-filter-chip-width, 12rem);
      }
      .filter-range-sep { color: var(--b-text-muted); }
      .detail-actions {
        display: flex; gap: var(--b-space-sm); flex-wrap: wrap;
        margin-top: var(--b-space-md);
      }
      .detail-subtitle { font-size: var(--b-text-sm); color: var(--b-text-muted); }
      .info-grid {
        display: grid; grid-template-columns: auto 1fr;
        gap: var(--b-space-xs) var(--b-space-lg);
        font-size: var(--b-text-sm); margin-bottom: var(--b-space-lg);
      }
      .info-label { color: var(--b-text-muted); white-space: nowrap; }
      .info-value { color: var(--b-text); }
      /* Sub-entity list styles */
      .section-header {
        display: flex; justify-content: space-between; align-items: center;
        padding: var(--b-space-md) 0; border-bottom: 1px solid var(--b-border);
        margin-bottom: var(--b-space-md);
      }
      .section-title {
        font-size: var(--b-text-base); font-weight: var(--b-font-weight-semibold);
        color: var(--b-text);
      }
      .sub-row {
        display: flex; align-items: center; gap: var(--b-space-md);
        padding: var(--b-space-sm) var(--b-space-md);
        background: var(--b-surface); border: 1px solid var(--b-border);
        border-radius: var(--b-radius-md); font-size: var(--b-text-sm);
        transition: border-color var(--b-transition, 150ms ease), box-shadow var(--b-transition, 150ms ease);
      }
      .sub-row:hover { border-color: var(--b-border-hover); }
      .sub-info { flex: 1; min-width: 0; }
      .sub-info > strong { font-weight: var(--b-font-weight-medium); color: var(--b-text); }
      .sub-meta {
        color: var(--b-text-muted); font-size: var(--b-text-xs);
        margin-top: var(--b-space-2xs, 0.125rem); display: flex; gap: var(--b-space-sm);
        align-items: center; flex-wrap: wrap;
      }
      .sub-actions { display: flex; gap: var(--b-space-xs); align-items: center; flex-shrink: 0; }
      .sub-row.reply-row {
        margin-left: var(--b-space-lg); background: var(--b-surface-alt);
        border-left: 2px solid var(--b-border);
      }
      .add-row {
        display: flex; justify-content: flex-end; padding: var(--b-space-md) 0;
        margin-top: var(--b-space-sm); border-top: 1px solid var(--b-border);
      }
      .comment-body { white-space: pre-wrap; color: var(--b-text); }
      .comment-system { font-style: italic; color: var(--b-text-muted); }
    `;
  }

  // ── Page header ───────────────────────────────────────────────────────────

  /** Page title defaults to entityLabel. */
  protected override get pageTitle(): string { return this.entityLabel; }
  protected override set pageTitle(_v: string) { /* entityLabel is the source of truth */ }

  protected override renderHeaderActions(): string {
    const hasCrud = this.formSchema !== null;
    const canCreate = hasCrud && (!this.createPermission || this.hasPermission(this.createPermission));
    const disabled = !this.requiredFilterSet ? ' disabled' : '';

    let html = '';
    for (const a of this.extraToolbarActions) {
      html += `<b-button variant="${a.variant ?? 'secondary'}" class="toolbar-action" data-action="${a.id}">${a.icon ?? ''}${a.label}</b-button>`;
    }
    if (canCreate) {
      html += `<b-button variant="primary" id="btn-create"${disabled}>${this.t('bws.common.new')}</b-button>`;
    }
    return html;
  }

  // ── Filter row rendering ─────────────────────────────────────────────────

  /**
   * Render the complete filter row from `filterDefs`, search, and `renderFilters()`.
   * Called by `render()`. Override for completely custom filter layout.
   */
  protected renderFilterRow(): string {
    const defs = this.filterDefs;

    let html = '';

    for (const f of defs) {
      const id = `filter-${f.name}`;
      const dis = f.disabled ? ' disabled' : '';
      const minAttr = f.min != null ? ` min="${f.min}"` : '';
      const maxAttr = f.max != null ? ` max="${f.max}"` : '';
      const stepAttr = f.step != null ? ` step="${f.step}"` : '';
      switch (f.type) {
        case 'select':
        case 'async-select':
          html += `<b-select id="${id}" name="${f.name}" placeholder="${f.placeholder ?? ''}"${(f.searchable || f.type === 'async-select') ? ' searchable' : ''}${f.clearable ? ' clearable' : ''}${dis}></b-select>`;
          break;
        case 'search':
          html += `<b-search-input id="${id}" name="${f.name}" placeholder="${f.placeholder ?? 'Search...'}" debounce="300"></b-search-input>`;
          break;
        case 'text':
          html += `<b-input id="${id}" name="${f.name}" placeholder="${f.placeholder ?? ''}"${dis}></b-input>`;
          break;
        case 'number':
          html += `<b-input id="${id}" name="${f.name}" type="number" placeholder="${f.placeholder ?? ''}"${minAttr}${maxAttr}${stepAttr}${dis}></b-input>`;
          break;
        case 'date':
          html += `<b-date-picker id="${id}" name="${f.name}" placeholder="${f.placeholder ?? ''}"${dis}></b-date-picker>`;
          break;
        case 'datetime':
          html += `<b-datetime-picker id="${id}" name="${f.name}" placeholder="${f.placeholder ?? ''}"${dis}></b-datetime-picker>`;
          break;
        case 'switch':
          html += `<b-switch id="${id}" name="${f.name}"${f.label ? ` label="${f.label}"` : ''}${dis}></b-switch>`;
          break;
        case 'multi-select':
          html += `<b-multi-select id="${id}" name="${f.name}" placeholder="${f.placeholder ?? ''}"${f.searchable ? ' searchable' : ''}${dis}></b-multi-select>`;
          break;
        case 'tags':
          html += `<b-tag-input id="${id}" name="${f.name}" placeholder="${f.placeholder ?? ''}"${dis}></b-tag-input>`;
          break;
        case 'segmented':
          html += `<b-segmented id="${id}" name="${f.name}"${dis}></b-segmented>`;
          break;
        case 'date-range': {
          const nFrom = f.nameFrom ?? `${f.name}From`;
          const nTo = f.nameTo ?? `${f.name}To`;
          html += `<div class="filter-range" id="${id}">`
            + `<b-date-picker name="${nFrom}" placeholder="${f.placeholder ?? ''}"${dis}></b-date-picker>`
            + `<span class="filter-range-sep">–</span>`
            + `<b-date-picker name="${nTo}" placeholder="${f.placeholderTo ?? ''}"${dis}></b-date-picker>`
            + `</div>`;
          break;
        }
        case 'range': {
          const nMin = f.nameMin ?? `${f.name}Min`;
          const nMax = f.nameMax ?? `${f.name}Max`;
          html += `<div class="filter-range" id="${id}">`
            + `<b-input name="${nMin}" type="number" placeholder="${f.placeholder ?? ''}"${minAttr}${maxAttr}${stepAttr}${dis}></b-input>`
            + `<span class="filter-range-sep">–</span>`
            + `<b-input name="${nMax}" type="number" placeholder="${f.placeholderTo ?? ''}"${minAttr}${maxAttr}${stepAttr}${dis}></b-input>`
            + `</div>`;
          break;
        }
      }
    }

    // Append legacy/custom HTML filters
    html += this.renderFilters();

    return html ? `<div class="filter-row">${html}</div>` : '';
  }

  // ── Template ──────────────────────────────────────────────────────────────

  override render(): string {
    const hasCrud = this.formSchema !== null;
    const sizeAttr = this.modalSize ? ` size="${this.modalSize}"` : '';

    return `
      <div class="base-page">
        ${this.renderPageHeader()}
        ${this.renderFilterRow()}
        ${this.requiredFilterSet
          ? this.renderContent()
          : `<b-card><b-empty message="${this.emptyFilterMessage}"></b-empty></b-card>`
        }
        ${hasCrud ? `
          <b-modal id="modal" title=""${sizeAttr}>
            ${this.renderModalBody()}
            <div slot="footer">
              <b-button id="btn-cancel" variant="ghost">${this.t('bws.common.cancel')}</b-button>
              <b-button id="btn-save" variant="primary">${this.t('bws.common.save')}</b-button>
            </div>
          </b-modal>
          <b-confirm-dialog id="confirm" message="${this.t('bws.common.confirmDelete')}"></b-confirm-dialog>
        ` : ''}
      </div>
    `;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  protected onMount(): void {
    this._setupTable();
  }

  protected onUpdated(): void {
    // Retry table setup if it wasn't ready on mount (e.g. requiredFilterSet was false)
    if (!this._tableReady) this._setupTable();
    this._applyFilterDefs();
    this._wireCrudEvents();
    this._wireFilterRow();

    // Initial load: runs once after setup + filter defs are applied
    if (this._needsInitialLoad) {
      this._needsInitialLoad = false;
      this._collectAndApplyFilters();
    }
  }

  // ── Table setup ────────────────────────────────────────────────────────────

  /**
   * Build row actions for the data table.
   * Override in subclasses to add edit/delete or custom actions.
   * Default: empty (subclasses like BaseListPage add edit/delete).
   */
  protected _getRowActions(): RowAction[] {
    return [];
  }

  /**
   * Configure the data table. Single implementation — subclasses customise via `_getRowActions()`.
   * The initial data load is deferred until `onUpdated()` applies filter defs.
   */
  protected _setupTable(): void {
    if (this._tableReady || !this.endpoint) return;

    const table = this.$<BDataTable>('#table');
    if (!table) return;

    this._tableReady = true;
    this._needsInitialLoad = true;
    const rowActions = this._getRowActions();

    table.setConfig({
      endpoint: this.endpoint,
      apiClient: this.api,
      columns: this.columns,
      pageSize: this.pageSize,
      flatArray: this.flatArray,
      rowActions: rowActions.length ? rowActions : undefined,
      idField: this.idField,
      paginationLabels: this._getPaginationLabels(),
    });
  }

  // ── Filter wiring ─────────────────────────────────────────────────────────

  /**
   * Apply filter definitions to the DOM: set select options, values, and disabled state.
   * Called on every `onUpdated()` so changes in `filterDefs` (e.g. updated options
   * after a cascade) are reflected immediately.
   */
  protected _applyFilterDefs(): void {
    for (const f of this.filterDefs) {
      const el = this.$(`#filter-${f.name}`) as any;
      if (!el) continue;

      // Disabled state for control-bearing types (compound types skip — children handle this)
      if (f.type !== 'date-range' && f.type !== 'range') {
        if (f.disabled) el.setAttribute('disabled', '');
        else el.removeAttribute('disabled');
      }

      if (f.type === 'select' || f.type === 'multi-select' || f.type === 'segmented' || f.type === 'async-select') {
        if (f.options && el.setOptions) el.setOptions(f.options);
      }

      if (f.type === 'async-select' && f.optionsLoader && !el.__loaderWired) {
        el.__loaderWired = true;
        // Initial load
        Promise.resolve(f.optionsLoader('')).then(opts => el.setOptions?.(opts));
        // Search: debounced typeahead reload
        let timer: ReturnType<typeof setTimeout> | undefined;
        let seq = 0;
        el.addEventListener('search', (e: Event) => {
          const q = (e as CustomEvent).detail?.query ?? '';
          clearTimeout(timer);
          const my = ++seq;
          timer = setTimeout(async () => {
            const opts = await f.optionsLoader!(q);
            if (my === seq) el.setOptions?.(opts);
          }, 300);
        });
      }

      if (f.type === 'switch') {
        if (f.value === 'true') el.setAttribute('checked', '');
        else if (f.value === 'false') el.removeAttribute('checked');
        continue;
      }

      // Multi-select / tags initial values: CSV
      if (f.type === 'multi-select') {
        if (f.value != null && el.setSelected) el.setSelected(f.value ? f.value.split(',') : []);
        continue;
      }
      if (f.type === 'tags') {
        if (f.value != null && el.setTags) el.setTags(f.value ? f.value.split(',') : []);
        continue;
      }

      // Compound types: split value on '..' if provided ("from..to" / "min..max")
      if (f.type === 'date-range' || f.type === 'range') {
        if (f.value != null) {
          const [a, b] = f.value.split('..');
          const nA = f.type === 'date-range' ? (f.nameFrom ?? `${f.name}From`) : (f.nameMin ?? `${f.name}Min`);
          const nB = f.type === 'date-range' ? (f.nameTo ?? `${f.name}To`) : (f.nameMax ?? `${f.name}Max`);
          const elA = el.querySelector?.(`[name="${nA}"]`);
          const elB = el.querySelector?.(`[name="${nB}"]`);
          if (elA && a != null) elA.setAttribute('value', a);
          if (elB && b != null) elB.setAttribute('value', b);
        }
        continue;
      }

      // Single-value controls
      if (f.value != null) {
        el.setAttribute('value', f.value);
      }
    }
  }

  /**
   * Wire change events on all filter controls in the filter row.
   * Each change calls `onFilterChange()`, which by default triggers
   * `_collectAndApplyFilters()` → `table.setFilters()` → reload.
   */
  protected _wireFilterRow(): void {
    const filterRow = this.$<HTMLElement>('.filter-row');
    if (!filterRow) return;

    // b-search-input: 'search' event (already debounced internally)
    filterRow.querySelectorAll<HTMLElement>('b-search-input[name]').forEach(el => {
      this.listen(el, 'search', ((e: CustomEvent) => {
        this.onFilterChange(el.getAttribute('name')!, e.detail?.value || null);
      }) as EventListener);
    });

    // b-select: 'change' event (immediate)
    filterRow.querySelectorAll<HTMLElement>('b-select[name]').forEach(el => {
      this.listen(el as EventTarget, 'change', ((e: CustomEvent) => {
        this.onFilterChange(el.getAttribute('name')!, e.detail?.value || null);
      }) as EventListener);
    });

    // b-input: debounced 'input' event
    let inputTimer: ReturnType<typeof setTimeout> | undefined;
    filterRow.querySelectorAll<HTMLElement>('b-input[name]').forEach(el => {
      this.listen(el, 'input', () => {
        clearTimeout(inputTimer);
        inputTimer = setTimeout(() => {
          this.onFilterChange(el.getAttribute('name')!, (el as any).value || null);
        }, 300);
      });
    });

    // b-date-picker: 'change' event (immediate)
    filterRow.querySelectorAll<HTMLElement>('b-date-picker[name]').forEach(el => {
      this.listen(el as EventTarget, 'change', ((e: CustomEvent) => {
        this.onFilterChange(el.getAttribute('name')!, e.detail?.value || null);
      }) as EventListener);
    });

    // b-switch: 'change' event (immediate). Sends 'true' when on, null when off.
    filterRow.querySelectorAll<HTMLElement>('b-switch[name]').forEach(el => {
      this.listen(el as EventTarget, 'change', ((e: CustomEvent) => {
        const checked = e.detail?.checked === true;
        this.onFilterChange(el.getAttribute('name')!, checked ? 'true' : null);
      }) as EventListener);
    });

    // b-datetime-picker: 'change' event (immediate)
    filterRow.querySelectorAll<HTMLElement>('b-datetime-picker[name]').forEach(el => {
      this.listen(el as EventTarget, 'change', ((e: CustomEvent) => {
        this.onFilterChange(el.getAttribute('name')!, e.detail?.value || null);
      }) as EventListener);
    });

    // b-multi-select: 'change' with values[] → CSV
    filterRow.querySelectorAll<HTMLElement>('b-multi-select[name]').forEach(el => {
      this.listen(el as EventTarget, 'change', ((e: CustomEvent) => {
        const values: string[] = e.detail?.values ?? [];
        this.onFilterChange(el.getAttribute('name')!, values.length ? values.join(',') : null);
      }) as EventListener);
    });

    // b-tag-input: 'change' with tags[] → CSV
    filterRow.querySelectorAll<HTMLElement>('b-tag-input[name]').forEach(el => {
      this.listen(el as EventTarget, 'change', ((e: CustomEvent) => {
        const tags: string[] = e.detail?.tags ?? [];
        this.onFilterChange(el.getAttribute('name')!, tags.length ? tags.join(',') : null);
      }) as EventListener);
    });

    // b-segmented: 'change' event (immediate)
    filterRow.querySelectorAll<HTMLElement>('b-segmented[name]').forEach(el => {
      this.listen(el as EventTarget, 'change', ((e: CustomEvent) => {
        this.onFilterChange(el.getAttribute('name')!, e.detail?.value || null);
      }) as EventListener);
    });

    // Native select (legacy renderFilters): 'change' event
    filterRow.querySelectorAll<HTMLSelectElement>('select[name]').forEach(el => {
      this.listen(el, 'change', () => {
        this.onFilterChange(el.name, el.value || null);
      });
    });
  }

  /**
   * Collect non-local filter values from the filter row and pass to `table.setFilters()`.
   * Called by the default `onFilterChange()` and during initial table setup.
   */
  protected _collectAndApplyFilters(): void {
    const table = this.$<BDataTable>('#table');
    if (!table) return;

    const filterRow = this.$<HTMLElement>('.filter-row');
    const params: Record<string, string> = {};
    const localNames = new Set<string>();
    for (const f of this.filterDefs) {
      if (!f.local) continue;
      localNames.add(f.name);
      if (f.type === 'date-range') {
        localNames.add(f.nameFrom ?? `${f.name}From`);
        localNames.add(f.nameTo ?? `${f.name}To`);
      } else if (f.type === 'range') {
        localNames.add(f.nameMin ?? `${f.name}Min`);
        localNames.add(f.nameMax ?? `${f.name}Max`);
      }
    }

    if (filterRow) {
      filterRow.querySelectorAll<HTMLElement>('[name]').forEach(el => {
        const name = el.getAttribute('name')!;
        if (localNames.has(name)) return; // Skip local-only filters
        const tag = el.tagName.toLowerCase();
        // Switches/checkboxes return 'true'/'false' strings — only send when truly on
        if (tag === 'b-switch' || tag === 'b-checkbox') {
          if ((el as any).checked) params[name] = 'true';
          return;
        }
        const value = (el as any).value ?? '';
        if (value) params[name] = value;
      });
    }

    table.setFilters(params);
  }

  // ── Event wiring ──────────────────────────────────────────────────────────

  private _wireCrudEvents(): void {
    const modal = this.$<BModal>('#modal');
    const saveBtn = this.$<BButton>('#btn-save');
    const cancelBtn = this.$<BButton>('#btn-cancel');
    const createBtn = this.$<HTMLElement>('#btn-create');

    if (createBtn) {
      this.listen(createBtn, 'click', () => this._openCreate());
    }

    if (modal && saveBtn && cancelBtn) {
      this.listen(saveBtn as unknown as EventTarget, 'click', () => this._save());
      this.listen(cancelBtn as unknown as EventTarget, 'click', () => modal.close());
    }

    // Toolbar actions in header
    this.$$<HTMLElement>('.toolbar-action').forEach(btn => {
      this.listen(btn, 'click', () => {
        this.onToolbarAction(btn.dataset.action ?? '');
      });
    });
  }

  // ── CRUD operations ───────────────────────────────────────────────────────

  /** Open the modal in create mode. */
  protected _openCreate(): void {
    const schema = this.formSchema;
    if (!schema) return;
    const modal = this.$<BModal>('#modal');
    const form = this.$<BForm>('#form');
    if (!modal || !form) return;

    this._editingId = null;
    form.setSchema(schema);
    form.reset();
    form.clearErrors();
    modal.setAttribute('title', this.t('bws.common.new'));
    modal.open();
    this.onFormReady(form, null);
  }

  /** Open the modal in edit mode for the given entity ID. */
  protected async _openEdit(id: string): Promise<void> {
    const schema = this.editFormSchema;
    if (!schema || !this.endpoint) return;
    const modal = this.$<BModal>('#modal');
    const form = this.$<BForm>('#form');
    const saveBtn = this.$<BButton>('#btn-save');
    if (!modal || !form || !saveBtn) return;

    this._editingId = id;
    form.setSchema(schema);
    modal.setAttribute('title', this.t('bws.common.edit'));
    saveBtn.setAttribute('loading', '');
    modal.open();

    let resp: Awaited<ReturnType<ApiClient['get']>>;
    try {
      resp = await this.api.get<T>(`${this.endpoint}/${id}`);
    } catch {
      toast.error(this.t('bws.common.edit') + ' failed');
      modal.close();
      return;
    } finally {
      saveBtn.removeAttribute('loading');
    }

    if (!resp.ok) {
      toast.error(apiErrorMessage(resp.data));
      modal.close();
      return;
    }

    form.reset();
    form.clearErrors();
    requestAnimationFrame(() => {
      form.setValues(this.mapToForm(resp.data as T));
      this.onFormReady(form, resp.data as T);
    });
  }

  /** Show delete confirmation and delete the entity. */
  protected async _confirmDelete(id: string): Promise<void> {
    if (!this.endpoint) return;
    const confirm = this.$<BConfirmDialog>('#confirm');
    if (!confirm) return;

    const confirmed = await confirm.show();
    if (!confirmed) return;

    const resp = await this.api.delete(`${this.endpoint}/${id}`);
    if (resp.ok) {
      toast.success(this.t('bws.common.deleted'));
      this.onDeleteSuccess?.(id);
      this._afterDelete(id);
    } else {
      toast.error(apiErrorMessage(resp.data));
    }
  }

  /** Hook called after a successful delete. Override for subclass-specific cleanup. */
  protected _afterDelete(_id: string): void {
    this.reload();
  }

  /** Save the form (create or edit). */
  protected async _save(): Promise<void> {
    if (!this.endpoint) return;
    const form = this.$<BForm>('#form');
    const saveBtn = this.$<BButton>('#btn-save');
    const modal = this.$<BModal>('#modal');
    if (!form || !saveBtn || !modal) return;

    const { valid, data } = form.validate();
    if (!valid) return;

    saveBtn.setAttribute('loading', '');

    try {
      const isEdit = this._editingId !== null;
      const body = this.mapFromForm(data, isEdit);
      if (!body) return;

      const resp = isEdit
        ? await this.api.put<T>(`${this.endpoint}/${this._editingId}`, body)
        : await this.api.post<T>(this.endpoint, body);

      if (!resp.ok) {
        showFormError(form as Parameters<typeof showFormError>[0], resp.data);
        return;
      }

      await this.afterSave(resp.data, isEdit);

      toast.success(this.t('bws.common.saved'));
      if (isEdit) {
        this.onEditSuccess?.(resp.data);
      } else {
        this.onCreateSuccess?.(resp.data);
      }
      modal.close();
      this._afterSaveComplete(resp.data, isEdit);
    } finally {
      saveBtn.removeAttribute('loading');
    }
  }

  /** Hook called after save + toast + modal close. Override for subclass-specific reload. */
  protected _afterSaveComplete(_entity: T, _isEdit: boolean): void {
    this.reload();
  }

  /** Reload the data table. */
  protected reload(): void {
    this.$<BDataTable>('#table')?.load();
  }
}
