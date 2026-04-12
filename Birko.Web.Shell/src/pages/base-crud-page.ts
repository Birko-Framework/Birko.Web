import type { ApiClient } from 'birko-web-core/http';
import { apiErrorMessage } from 'birko-web-core/http';
import type { TableColumn } from 'birko-web-components/data';
import type { ToolbarAction, BDataTable } from 'birko-web-components/data';
import type { BModal } from 'birko-web-components/layout';
import type { BConfirmDialog } from 'birko-web-components/layout';
import type { BForm, FormSchema } from 'birko-web-components/inputs';
import type { BButton } from 'birko-web-components/inputs';
import { toast } from 'birko-web-components/feedback';
import { showFormError } from 'birko-web-components/form-utils';
import { BasePage } from './base-page.js';

/**
 * Abstract base class for data-driven CRUD pages.
 *
 * Extends `BasePage` with: filter row, data table setup, modal create/edit,
 * delete confirmation, permission checks, and a required-filter empty state.
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

  // ── Required ──────────────────────────────────────────────────────────────

  /** HTTP client instance (typically the app-level singleton). */
  protected abstract get api(): ApiClient;

  // ── Optional — override to customise ─────────────────────────────────────

  /** REST resource base path, e.g. `'api/products'`. Required for table + CRUD pages. */
  protected endpoint?: string;

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

  /** Enable search box in the table toolbar. Default: `true`. */
  protected searchable = true;

  /** Default page size for the data table. */
  protected pageSize?: number;

  /** Whether the API returns a flat array (true) or a paged envelope (false). Default: `true`. */
  protected flatArray = true;

  /** Show Edit actions. Default: `true`. */
  protected editEnabled = true;

  /** Show Delete actions. Default: `true`. */
  protected deleteEnabled = true;

  /** Modal size — passed to `<b-modal size="...">`. */
  protected modalSize?: 'sm' | 'lg' | 'xl' | 'xxl';

  /** Permission key required to see the create button. `undefined` = always visible. */
  protected createPermission?: string;

  /** Permission key for edit actions. */
  protected editPermission?: string;

  /** Permission key for delete actions. */
  protected deletePermission?: string;

  /**
   * Permission checker — override to integrate with your auth store.
   * Default: always returns `true`.
   */
  protected hasPermission(_permission: string): boolean { return true; }

  // ── Filter area ───────────────────────────────────────────────────────────

  /**
   * Render filter controls (selects, date pickers, etc.) for the filter row.
   * Return empty string to hide the filter row.
   * The base class wraps the result in `<div class="filter-row">`.
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
   * Default: identity pass-through.
   */
  protected mapFromForm(data: Record<string, unknown>, _isEdit: boolean): Record<string, unknown> {
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
   * Extra toolbar actions added after the built-in "New" button.
   */
  protected get extraToolbarActions(): ToolbarAction[] { return []; }

  /**
   * Translation function.
   * Override to return localised labels instead of English defaults.
   */
  protected t(key: string): string {
    const defaults: Record<string, string> = {
      'common.new':           `New ${this.entityLabel}`,
      'common.edit':          `Edit ${this.entityLabel}`,
      'common.delete':        'Delete',
      'common.save':          'Save',
      'common.cancel':        'Cancel',
      'common.close':         'Close',
      'common.confirmDelete': `Delete this ${this.entityLabel}? This cannot be undone.`,
      'common.saved':         `${this.entityLabel} saved`,
      'common.deleted':       `${this.entityLabel} deleted`,
    };
    return defaults[key] ?? key;
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  static override get styles(): string {
    return BasePage.styles + `
      .filter-row {
        display: flex; align-items: flex-end; gap: var(--b-space-md, 0.75rem);
        margin-bottom: var(--b-space-lg, 1.25rem);
        flex-wrap: wrap;
      }
      .filter-row b-select { flex: 1; max-width: 24rem; }
      .filter-row b-input { flex: 1; max-width: 24rem; }
      .filter-row b-button { flex: 0 0 auto; }
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

    return canCreate
      ? `<b-button variant="primary" id="btn-create"${disabled}>${this.t('common.new')}</b-button>`
      : '';
  }

  // ── Template ──────────────────────────────────────────────────────────────

  override render(): string {
    const hasCrud = this.formSchema !== null;
    const sizeAttr = this.modalSize ? ` size="${this.modalSize}"` : '';
    const filters = this.renderFilters();

    return `
      <div class="base-page">
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

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  protected onMount(): void {
    this._setupTable();
  }

  protected onUpdated(): void {
    this._wireCrudEvents();
  }

  // ── Table setup (shared) ──────────────────────────────────────────────────

  /**
   * Configure and load the data table.
   * Subclasses can override to add row actions or custom config.
   */
  protected _setupTable(): void {
    if (this._tableReady || !this.endpoint) return;
    this._tableReady = true;

    const table = this.$<BDataTable>('#table');
    if (!table) return;

    const toolbarActions: ToolbarAction[] = [...this.extraToolbarActions];

    table.setConfig({
      endpoint: this.endpoint,
      apiClient: this.api,
      columns: this.columns,
      searchable: this.searchable,
      pageSize: this.pageSize,
      flatArray: this.flatArray,
      actions: toolbarActions.length ? toolbarActions : undefined,
      idField: this.idField,
    });
    table.load();
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
    modal.setAttribute('title', this.t('common.new'));
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

  /** Show delete confirmation and delete the entity. */
  protected async _confirmDelete(id: string): Promise<void> {
    if (!this.endpoint) return;
    const confirm = this.$<BConfirmDialog>('#confirm');
    if (!confirm) return;

    const confirmed = await confirm.show();
    if (!confirmed) return;

    const resp = await this.api.delete(`${this.endpoint}/${id}`);
    if (resp.ok) {
      toast.success(this.t('common.deleted'));
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

    await this.afterSave(resp.data, isEdit);

    toast.success(this.t('common.saved'));
    if (isEdit) {
      this.onEditSuccess?.(resp.data);
    } else {
      this.onCreateSuccess?.(resp.data);
    }
    modal.close();
    this._afterSaveComplete(resp.data, isEdit);
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
