import { BaseComponent } from 'birko-web-core';
import type { ApiClient } from 'birko-web-core/http';
import { apiErrorMessage } from 'birko-web-core/http';
import type { TableColumn } from 'birko-web-components/data';
import type { RowAction, ToolbarAction, BDataTable } from 'birko-web-components/data';
import type { BModal } from 'birko-web-components/layout';
import type { BConfirmDialog } from 'birko-web-components/layout';
import type { BForm, FormSchema } from 'birko-web-components/inputs';
import type { BButton } from 'birko-web-components/inputs';
import { toast } from 'birko-web-components/feedback';
import { showFormError } from 'birko-web-components/form-utils';

/**
 * Abstract base class for standard CRUD list pages.
 *
 * Renders a data table with a toolbar "New" button, per-row Edit/Delete actions,
 * a modal + form for create/edit, and a confirm dialog for delete.
 * Subclasses only provide configuration — all wiring is handled here.
 *
 * ## Minimal subclass
 * ```ts
 * class ProductsPage extends BaseListPage<Product> {
 *   protected endpoint = 'api/products';
 *   protected get api() { return api; }
 *   protected get columns(): TableColumn[] { return [...]; }
 *   protected get formSchema(): FormSchema { return { name: 'root', children: [...] }; }
 * }
 * define('s-products-page', ProductsPage);
 * ```
 *
 * ## With permissions + hooks
 * ```ts
 * class ProductsPage extends BaseListPage<Product> {
 *   protected endpoint = 'api/products';
 *   protected entityLabel = 'Product';
 *   protected createPermission = 'products:create';
 *   protected editPermission   = 'products:edit';
 *   protected deletePermission = 'products:delete';
 *   protected get api() { return api; }
 *   protected get columns(): TableColumn[] { return [...]; }
 *   protected get formSchema(): FormSchema { return { name: 'root', children: [...] }; }
 *   protected hasPermission(p: string) { return moduleStore.hasPermission('products', p); }
 *   protected onCreateSuccess(item: Product) { console.log('created', item); }
 * }
 * ```
 */
export abstract class BaseListPage<T extends Record<string, unknown>> extends BaseComponent {
  private _editingId: string | null = null;
  private _tableReady = false;

  // ── Required ──────────────────────────────────────────────────────────────

  /** REST resource base path, e.g. `'api/products'`. */
  protected abstract endpoint: string;

  /** HTTP client instance (typically the app-level singleton). */
  protected abstract get api(): ApiClient;

  /** Column definitions for `<b-data-table>`. */
  protected abstract get columns(): TableColumn[];

  /** Form schema for the create modal (and edit, unless editFormSchema is overridden). */
  protected abstract get formSchema(): FormSchema;

  // ── Optional — override to customise ─────────────────────────────────────

  /** Form schema for the edit modal. Defaults to `formSchema` if not overridden. */
  protected get editFormSchema(): FormSchema { return this.formSchema; }

  /** Human-readable entity name used in modal titles and toast messages. Default: `'Item'`. */
  protected entityLabel = 'Item';

  /** Field used as the row identifier. Default: `'id'`. */
  protected idField = 'id';

  /** Enable search box in the table toolbar. Default: `true`. */
  protected searchable = true;

  /** Default page size for the data table. */
  protected pageSize?: number;

  /** Whether the API returns a flat array (true) or a paged envelope (false). Default: `true`. */
  protected flatArray = true;

  /** Show the Edit row action. Set to `false` for create-only pages. Default: `true`. */
  protected editEnabled = true;

  /** Show the Delete row action. Set to `false` to hide deletion. Default: `true`. */
  protected deleteEnabled = true;

  /** Modal size — passed to `<b-modal size="...">`. Default: `undefined` (medium). */
  protected modalSize?: 'sm' | 'lg' | 'xl' | 'xxl';

  /** Permission key required to see the "New" button. `undefined` = always visible. */
  protected createPermission?: string;

  /** Permission key required to see the "Edit" row action. `undefined` = always visible. */
  protected editPermission?: string;

  /** Permission key required to see the "Delete" row action. `undefined` = always visible. */
  protected deletePermission?: string;

  /**
   * Permission checker — override to integrate with your auth store.
   * Default implementation always returns `true` (no permission checks).
   */
  protected hasPermission(_permission: string): boolean { return true; }

  /**
   * Map a loaded API entity to form field values before populating the edit modal.
   * Override when field names differ between the API response and the form schema.
   * Default: identity (pass entity through as-is).
   */
  protected mapToForm(item: T): Record<string, unknown> {
    return item as Record<string, unknown>;
  }

  /**
   * Map form values to the request body before POST/PUT.
   * Override to transform, add defaults, or strip fields.
   * Default: identity (pass form data through as-is).
   */
  protected mapFromForm(data: Record<string, unknown>, isEdit: boolean): Record<string, unknown> {
    return data;
  }

  /** Called after a successful create. Override for side effects (e.g. navigate, reload store). */
  protected onCreateSuccess?(_item: T): void;

  /** Called after a successful edit. */
  protected onEditSuccess?(_item: T): void;

  /** Called after a successful delete. */
  protected onDeleteSuccess?(_id: string): void;

  /**
   * Translation function.
   * Override to return localised labels instead of English defaults.
   * Keys used:
   *   `'common.new'`, `'common.edit'`, `'common.delete'`, `'common.save'`, `'common.cancel'`,
   *   `'common.confirmDelete'`, `'common.saved'`, `'common.deleted'`
   */
  protected t(key: string): string {
    const defaults: Record<string, string> = {
      'common.new':           `New ${this.entityLabel}`,
      'common.edit':          `Edit ${this.entityLabel}`,
      'common.delete':        'Delete',
      'common.save':          'Save',
      'common.cancel':        'Cancel',
      'common.confirmDelete': `Delete this ${this.entityLabel}? This cannot be undone.`,
      'common.saved':         `${this.entityLabel} saved`,
      'common.deleted':       `${this.entityLabel} deleted`,
    };
    return defaults[key] ?? key;
  }

  /**
   * Extra toolbar actions added after the built-in "New" button.
   * Override to add custom buttons (e.g. import, export, bulk operations).
   */
  protected get extraToolbarActions(): ToolbarAction[] { return []; }

  /**
   * Extra row actions added after the built-in Edit/Delete.
   * Override to add custom per-row actions (e.g. status change, duplicate).
   */
  protected get extraRowActions(): RowAction[] { return []; }

  /**
   * Render the modal body HTML.
   * Default: `<b-form id="form"></b-form>`.
   * Override to add custom components alongside or instead of the form —
   * e.g. a connection builder, sub-table, or editable grid.
   * **Must** include a `<b-form id="form">` if the default _save() flow is used.
   */
  protected renderModalBody(): string {
    return '<b-form id="form"></b-form>';
  }

  /**
   * Called after the form/modal is ready — on both create (entity = null)
   * and edit (entity = loaded data, form values already set).
   *
   * Use this to wire cascading selects, load dynamic options, set up
   * field change listeners, or configure custom modal components.
   *
   * @param form — the `<b-form>` inside the modal
   * @param entity — null for create, loaded entity for edit
   */
  protected onFormReady(_form: BForm, _entity: T | null): void {}

  // ── Styles ────────────────────────────────────────────────────────────────

  static get styles(): string {
    return `
      :host { display: block; height: 100%; }
      .list-page {
        display: flex;
        flex-direction: column;
        height: 100%;
        gap: var(--b-space-md, 0.75rem);
      }
      b-data-table { flex: 1; min-height: 0; }
    `;
  }

  // ── Template ──────────────────────────────────────────────────────────────

  render(): string {
    const sizeAttr = this.modalSize ? ` size="${this.modalSize}"` : '';
    return `
      <div class="list-page">
        <b-data-table id="table"></b-data-table>
        <b-modal id="modal" title=""${sizeAttr}>
          ${this.renderModalBody()}
          <div slot="footer">
            <b-button id="btn-cancel" variant="ghost">${this.t('common.cancel')}</b-button>
            <b-button id="btn-save" variant="primary">${this.t('common.save')}</b-button>
          </div>
        </b-modal>
        <b-confirm-dialog id="confirm" message="${this.t('common.confirmDelete')}"></b-confirm-dialog>
      </div>
    `;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  protected onMount(): void {
    this._setupTable();
  }

  protected onUpdated(): void {
    this._wireEvents();
  }

  // ── Private setup ─────────────────────────────────────────────────────────

  private _setupTable(): void {
    if (this._tableReady) return;
    this._tableReady = true;

    const canCreate = !this.createPermission || this.hasPermission(this.createPermission);
    const canEdit   = this.editEnabled   && (!this.editPermission   || this.hasPermission(this.editPermission));
    const canDelete = this.deleteEnabled && (!this.deletePermission || this.hasPermission(this.deletePermission));

    const rowActions: RowAction[] = [];
    if (canEdit)   rowActions.push({ id: 'edit',   label: this.t('common.edit') });
    if (canDelete) rowActions.push({ id: 'delete', label: this.t('common.delete'), variant: 'danger' });
    rowActions.push(...this.extraRowActions);

    const toolbarActions: ToolbarAction[] = [];
    if (canCreate) toolbarActions.push({ id: 'new', label: this.t('common.new'), variant: 'primary' });
    toolbarActions.push(...this.extraToolbarActions);

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

  private _wireEvents(): void {
    const table   = this.$<BDataTable>('#table');
    const modal   = this.$<BModal>('#modal');
    const form    = this.$<BForm>('#form');
    const confirm = this.$<BConfirmDialog>('#confirm');
    const saveBtn = this.$<BButton>('#btn-save');
    const cancelBtn = this.$<BButton>('#btn-cancel');

    if (!table || !modal || !form || !confirm || !saveBtn || !cancelBtn) return;

    this.listen(table as unknown as EventTarget, 'toolbar-action', ((e: CustomEvent) => {
      if (e.detail.action === 'new') this._openCreate();
      else this.onToolbarAction(e.detail.action as string);
    }) as EventListener);

    this.listen(table as unknown as EventTarget, 'row-click', ((e: CustomEvent) => {
      const id = (e.detail.id ?? e.detail.row?.[this.idField]) as string | undefined;
      if (id) this.onRowClick(id, e.detail.row as T);
    }) as EventListener);

    this.listen(table as unknown as EventTarget, 'row-action', ((e: CustomEvent) => {
      const { action, id } = e.detail as { action: string; id: string };
      if (action === 'edit')   this._openEdit(id);
      else if (action === 'delete') this._confirmDelete(id);
      else this.onRowAction(action, id, e.detail.row as T);
    }) as EventListener);

    this.listen(saveBtn as unknown as EventTarget, 'click', () => this._save());
    this.listen(cancelBtn as unknown as EventTarget, 'click', () => modal.close());
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  private _openCreate(): void {
    const modal = this.$<BModal>('#modal');
    const form  = this.$<BForm>('#form');
    if (!modal || !form) return;

    this._editingId = null;
    form.setSchema(this.formSchema);
    form.reset();
    form.clearErrors();
    modal.setAttribute('title', this.t('common.new'));
    modal.open();
    this.onFormReady(form, null);
  }

  private async _openEdit(id: string): Promise<void> {
    const modal   = this.$<BModal>('#modal');
    const form    = this.$<BForm>('#form');
    const saveBtn = this.$<BButton>('#btn-save');
    if (!modal || !form || !saveBtn) return;

    this._editingId = id;
    form.setSchema(this.editFormSchema);
    modal.setAttribute('title', this.t('common.edit'));
    saveBtn.setAttribute('loading', '');
    modal.open();

    const resp = await this.api.get<T>(`${this.endpoint}/${id}`);
    saveBtn.removeAttribute('loading');

    if (!resp.ok) {
      toast.error(apiErrorMessage(resp.data));
      modal.close();
      return;
    }

    form.reset();
    form.clearErrors();
    requestAnimationFrame(() => {
      form.setValues(this.mapToForm(resp.data));
      this.onFormReady(form, resp.data);
    });
  }

  private async _confirmDelete(id: string): Promise<void> {
    const confirm = this.$<BConfirmDialog>('#confirm');
    if (!confirm) return;

    const confirmed = await confirm.show();
    if (!confirmed) return;

    const resp = await this.api.delete(`${this.endpoint}/${id}`);
    if (resp.ok) {
      toast.success(this.t('common.deleted'));
      this.onDeleteSuccess?.(id);
      this.$<BDataTable>('#table')?.load();
    } else {
      toast.error(apiErrorMessage(resp.data));
    }
  }

  private async _save(): Promise<void> {
    const form    = this.$<BForm>('#form');
    const saveBtn = this.$<BButton>('#btn-save');
    const modal   = this.$<BModal>('#modal');
    if (!form || !saveBtn || !modal) return;

    const { valid, data } = form.validate();
    if (!valid) return;

    saveBtn.setAttribute('loading', '');

    const isEdit = this._editingId !== null;
    const body = this.mapFromForm(data, isEdit);
    const resp = isEdit
      ? await this.api.put<T>(`${this.endpoint}/${this._editingId}`, body)
      : await this.api.post<T>(this.endpoint, body);

    saveBtn.removeAttribute('loading');

    if (!resp.ok) {
      showFormError(form as Parameters<typeof showFormError>[0], resp.data);
      return;
    }

    toast.success(this.t('common.saved'));
    if (this._editingId) {
      this.onEditSuccess?.(resp.data);
    } else {
      this.onCreateSuccess?.(resp.data);
    }
    modal.close();
    this.$<BDataTable>('#table')?.load();
  }

  // ── Extension points ──────────────────────────────────────────────────────

  /**
   * Called when a row is clicked (not on an action button).
   * Default: no-op. Override to navigate to detail page, open drawer, etc.
   */
  protected onRowClick(_id: string, _row: T): void {}

  /**
   * Called for extra toolbar actions added via `extraToolbarActions`.
   * Default: no-op.
   */
  protected onToolbarAction(_action: string): void {}

  /**
   * Called for extra row actions beyond the built-in 'edit' and 'delete'.
   * Default: no-op.
   */
  protected onRowAction(_action: string, _id: string, _row: T): void {}

  /** Reload the data table — useful from subclass hooks or SSE handlers. */
  protected reload(): void {
    this.$<BDataTable>('#table')?.load();
  }
}
