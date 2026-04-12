import type { TableColumn } from 'birko-web-components/data';
import type { RowAction, ToolbarAction, BDataTable } from 'birko-web-components/data';
import type { FormSchema } from 'birko-web-components/inputs';
import type { ApiClient } from 'birko-web-core/http';
import { BaseCrudPage } from './base-crud-page.js';

/**
 * Abstract base class for standard CRUD list pages.
 *
 * Renders a page header with create button, optional filter row,
 * a data table (wrapped in `<b-card>`) with per-row Edit/Delete actions,
 * a modal + form for create/edit, and a confirm dialog for delete.
 *
 * Subclasses only provide configuration — all wiring is handled here.
 *
 * ## Minimal subclass
 * ```ts
 * class ProductsPage extends BaseListPage<Product> {
 *   protected endpoint = 'api/products';
 *   protected entityLabel = 'Products';
 *   protected get api() { return api; }
 *   protected get columns(): TableColumn[] { return [...]; }
 *   protected get formSchema(): FormSchema { return { name: 'root', children: [...] }; }
 * }
 * define('s-products-page', ProductsPage);
 * ```
 *
 * ## With permissions + filters
 * ```ts
 * class ProductsPage extends BaseListPage<Product> {
 *   protected endpoint = 'api/products';
 *   protected entityLabel = 'Products';
 *   protected createPermission = 'products:create';
 *   protected editPermission   = 'products:edit';
 *   protected deletePermission = 'products:delete';
 *   protected get api() { return api; }
 *   protected get columns(): TableColumn[] { return [...]; }
 *   protected get formSchema(): FormSchema { return { name: 'root', children: [...] }; }
 *   protected hasPermission(p: string) { return moduleStore.hasPermission('products', p); }
 *   protected renderFilters() { return `<b-select id="category-filter" ...></b-select>`; }
 * }
 * ```
 */
export abstract class BaseListPage<T extends Record<string, unknown>> extends BaseCrudPage<T> {
  // ── Required ──────────────────────────────────────────────────────────────

  /** REST resource base path, e.g. `'api/products'`. */
  protected abstract override endpoint: string;

  /** HTTP client instance. */
  protected abstract get api(): ApiClient;

  /** Column definitions for `<b-data-table>`. */
  protected abstract override get columns(): TableColumn[];

  /** Form schema for the create/edit modal. */
  protected abstract get formSchema(): FormSchema;

  // ── Optional — override to customise ─────────────────────────────────────

  /**
   * Extra row actions added after the built-in Edit/Delete.
   * Override to add custom per-row actions (e.g. status change, duplicate).
   */
  protected get extraRowActions(): RowAction[] { return []; }

  // ── Styles ────────────────────────────────────────────────────────────────

  static override get styles(): string {
    return BaseCrudPage.styles + `
      .list-page {
        display: flex;
        flex-direction: column;
        height: 100%;
        gap: var(--b-space-md, 0.75rem);
      }
      b-card { flex: 1; min-height: 0; }
    `;
  }

  // ── Content ───────────────────────────────────────────────────────────────

  protected renderContent(): string {
    return `
      <b-card padding="none">
        <b-data-table id="table"></b-data-table>
      </b-card>
    `;
  }

  // ── Template ──────────────────────────────────────────────────────────────

  render(): string {
    const hasCrud = this.formSchema !== null;
    const sizeAttr = this.modalSize ? ` size="${this.modalSize}"` : '';
    const filters = this.renderFilters();

    return `
      <div class="list-page">
        ${this.renderPageHeader()}
        ${filters ? `<div class="filter-row">${filters}</div>` : ''}
        ${this.requiredFilterSet
          ? this.renderContent()
          : `<b-card><b-empty message="${this.emptyFilterMessage}"></b-empty></b-card>`
        }
        ${hasCrud ? `
          <b-modal id="modal" title=""${sizeAttr}>
            ${this.renderModalBody()}
            <div slot="footer">
              <b-button id="btn-cancel" variant="ghost">${this.t('common.cancel')}</b-button>
              <b-button id="btn-save" variant="primary">${this.t('common.save')}</b-button>
            </div>
          </b-modal>
          <b-confirm-dialog id="confirm" message="${this.t('common.confirmDelete')}"></b-confirm-dialog>
        ` : ''}
      </div>
    `;
  }

  // ── Table setup ───────────────────────────────────────────────────────────

  protected override _setupTable(): void {
    if (this._tableReady || !this.endpoint) return;
    this._tableReady = true;

    const canEdit   = this.editEnabled   && (!this.editPermission   || this.hasPermission(this.editPermission));
    const canDelete = this.deleteEnabled && (!this.deletePermission || this.hasPermission(this.deletePermission));

    const rowActions: RowAction[] = [];
    if (canEdit)   rowActions.push({ id: 'edit',   label: this.t('common.edit') });
    if (canDelete) rowActions.push({ id: 'delete', label: this.t('common.delete'), variant: 'danger' });
    rowActions.push(...this.extraRowActions);

    const toolbarActions: ToolbarAction[] = [...this.extraToolbarActions];

    const table = this.$<BDataTable>('#table');
    if (!table) return;

    table.setConfig({
      endpoint: this.endpoint,
      apiClient: this.api,
      columns: this.columns,
      searchable: this.searchable,
      pageSize: this.pageSize,
      flatArray: this.flatArray,
      rowActions: rowActions.length ? rowActions : undefined,
      actions: toolbarActions.length ? toolbarActions : undefined,
      idField: this.idField,
    });
    table.load();
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  protected override onUpdated(): void {
    super.onUpdated();
    this._wireListEvents();
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _wireListEvents(): void {
    const table = this.$<BDataTable>('#table');
    if (!table) return;

    this.listen(table as unknown as EventTarget, 'toolbar-action', ((e: CustomEvent) => {
      this.onToolbarAction(e.detail.action as string);
    }) as EventListener);

    this.listen(table as unknown as EventTarget, 'row-click', ((e: CustomEvent) => {
      const id = (e.detail.id ?? e.detail.row?.[this.idField]) as string | undefined;
      if (id) this.onRowClick(id, e.detail.row as T);
    }) as EventListener);

    this.listen(table as unknown as EventTarget, 'row-action', ((e: CustomEvent) => {
      const { action, id } = e.detail as { action: string; id: string };
      if (action === 'edit')        this._openEdit(id);
      else if (action === 'delete') this._confirmDelete(id);
      else this.onRowAction(action, id, e.detail.row as T);
    }) as EventListener);
  }

  // ── Extension points ──────────────────────────────────────────────────────

  /**
   * Called when a row is clicked (not on an action button).
   * Default: no-op. Override to navigate to detail page, open drawer, etc.
   */
  protected onRowClick(_id: string, _row: T): void {}

  /**
   * Called for toolbar actions (including extra ones from `extraToolbarActions`).
   * Default: no-op.
   */
  protected onToolbarAction(_action: string): void {}

  /**
   * Called for extra row actions beyond the built-in 'edit' and 'delete'.
   * Default: no-op.
   */
  protected onRowAction(_action: string, _id: string, _row: T): void {}
}
