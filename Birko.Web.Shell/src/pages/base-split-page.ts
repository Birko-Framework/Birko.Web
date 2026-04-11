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
 * Abstract base class for split-panel master-detail pages.
 *
 * Left panel: auto-fetching data table (same config model as `BaseListPage`).
 * Right panel: detail view that appears when a row is selected.
 * Optional create/edit modal + delete confirmation.
 *
 * Subclasses provide:
 * - Table config: `endpoint`, `api`, `columns`
 * - Detail rendering: `renderDetail(entity)`, optional `renderDetailHeader(entity)`
 * - Optional CRUD modal: `formSchema` (omit to get a read-only split page)
 *
 * ## Minimal subclass (read-only detail)
 * ```ts
 * class PaymentsPage extends BaseSplitPage<PaymentDto> {
 *   protected endpoint = 'api/payments';
 *   protected get api() { return api; }
 *   protected get columns() { return [...]; }
 *   protected renderDetail(p: PaymentDto) {
 *     return `<div class="info-grid">...</div>`;
 *   }
 * }
 * ```
 *
 * ## With CRUD modal
 * ```ts
 * class DepartmentsPage extends BaseSplitPage<DepartmentDto> {
 *   protected endpoint = 'api/departments';
 *   protected get api() { return api; }
 *   protected get columns() { return [...]; }
 *   protected get formSchema() { return departmentFormSchema(); }
 *   protected renderDetail(d: DepartmentDto) { return `...`; }
 *   protected renderDetailHeader(d: DepartmentDto) {
 *     return { title: d.name, subtitle: d.code };
 *   }
 * }
 * ```
 */
export abstract class BaseSplitPage<T extends Record<string, unknown>> extends BaseComponent {
  private _editingId: string | null = null;
  private _tableReady = false;
  private _selectedEntity: T | null = null;
  private _selectedId: string | null = null;

  // ── Required ──────────────────────────────────────────────────────────────

  /** REST resource base path, e.g. `'api/departments'`. */
  protected abstract endpoint: string;

  /** HTTP client instance. */
  protected abstract get api(): ApiClient;

  /** Column definitions for the master table. */
  protected abstract get columns(): TableColumn[];

  /**
   * Render the detail panel body HTML for the selected entity.
   * Called after the entity is fetched. Use `info-grid` CSS class for key-value layouts.
   */
  protected abstract renderDetail(entity: T): string;

  // ── Optional — override to customise ─────────────────────────────────────

  /**
   * Form schema for the create/edit modal.
   * Return `null` to disable CRUD (read-only split page).
   */
  protected get formSchema(): FormSchema | null { return null; }

  /** Form schema for edit mode. Defaults to `formSchema`. */
  protected get editFormSchema(): FormSchema | null { return this.formSchema; }

  /** Human-readable entity name for titles and toasts. Default: `'Item'`. */
  protected entityLabel = 'Item';

  /** Field used as the row identifier. Default: `'id'`. */
  protected idField = 'id';

  /** Enable search in the table toolbar. Default: `true`. */
  protected searchable = true;

  /** Default page size. */
  protected pageSize?: number;

  /** Whether the API returns a flat array. Default: `true`. */
  protected flatArray = true;

  /** Show Edit in detail panel. Default: `true`. */
  protected editEnabled = true;

  /** Show Delete in detail panel. Default: `true`. */
  protected deleteEnabled = true;

  /** Modal size. */
  protected modalSize?: 'sm' | 'lg' | 'xl' | 'xxl';

  /** Master panel CSS width. Default: `'2fr'`. */
  protected masterWidth = '2fr';

  /** Detail panel CSS width. Default: `'1fr'`. */
  protected detailWidth = '1fr';

  /** Collapse breakpoint in pixels. Default: `'768'`. */
  protected collapseAt = '768';

  /** Message when no entity is selected. Default: empty (detail hidden). */
  protected emptyDetailMessage = '';

  protected createPermission?: string;
  protected editPermission?: string;
  protected deletePermission?: string;

  protected hasPermission(_permission: string): boolean { return true; }

  protected mapToForm(item: T): Record<string, unknown> {
    return item as Record<string, unknown>;
  }

  protected mapFromForm(data: Record<string, unknown>, _isEdit: boolean): Record<string, unknown> {
    return data;
  }

  /**
   * Extra toolbar actions added after the built-in "New" button.
   */
  protected get extraToolbarActions(): ToolbarAction[] { return []; }

  /**
   * Extra row actions on the table (beyond built-in edit/delete which are in the detail panel).
   */
  protected get extraRowActions(): RowAction[] { return []; }

  /**
   * Render the detail card header.
   * Default: shows entity name from `idField`. Override for richer headers.
   */
  protected renderDetailHeader(entity: T): { title: string; subtitle?: string } {
    const name = entity['name'] ?? entity[this.idField] ?? '';
    return { title: String(name) };
  }

  /**
   * Render the modal body HTML.
   * Default: `<b-form id="form"></b-form>`.
   */
  protected renderModalBody(): string {
    return '<b-form id="form"></b-form>';
  }

  /**
   * Called after the modal form is ready (create: entity=null, edit: entity=loaded).
   * Wire cascading selects, load options, etc.
   */
  protected onFormReady(_form: BForm, _entity: T | null): void {}

  /**
   * Called after a successful create or edit, before the table reloads.
   * Use for post-save side effects (e.g. tag association, file upload).
   *
   * @param savedEntity — the entity returned by the POST/PUT response
   * @param isEdit — true if this was an edit, false if create
   */
  protected async afterSave(_savedEntity: T, _isEdit: boolean): Promise<void> {}

  /** Called after a successful create. */
  protected onCreateSuccess?(_item: T): void;

  /** Called after a successful edit. */
  protected onEditSuccess?(_item: T): void;

  /** Called after a successful delete. */
  protected onDeleteSuccess?(_id: string): void;

  /**
   * Called after the detail entity is fetched and rendered.
   * Use to wire event listeners inside the detail panel (e.g. sub-entity buttons).
   */
  protected onDetailUpdated(_entity: T): void {}

  /**
   * Build the detail endpoint URL for a given entity ID.
   * Default: `${endpoint}/${id}`. Override for nested resources.
   */
  protected detailEndpoint(id: string): string {
    return `${this.endpoint}/${id}`;
  }

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

  // ── Public API ────────────────────────────────────────────────────────────

  /** The currently selected entity, or null. */
  protected get selectedEntity(): T | null { return this._selectedEntity; }

  /** Clear the detail selection and hide the detail panel. */
  protected deselectEntity(): void {
    this._selectedEntity = null;
    this._selectedId = null;
    const card = this.$<HTMLElement>('#detail-card');
    if (card) card.hidden = true;
  }

  /** Re-fetch and re-render the currently selected entity's detail. */
  protected async reloadDetail(): Promise<void> {
    if (this._selectedId) await this._selectEntity(this._selectedId);
  }

  /** Reload the master table. */
  protected reload(): void {
    this.$<BDataTable>('#table')?.load();
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  static get styles(): string {
    return `
      :host { display: block; height: 100%; }
      .split-page {
        display: flex;
        flex-direction: column;
        height: 100%;
        gap: var(--b-space-md, 0.75rem);
      }
      b-split-panel { flex: 1; min-height: 0; }
      .page-header {
        display: flex; align-items: center; justify-content: space-between;
        flex-wrap: wrap; gap: var(--b-space-sm, 0.5rem);
      }
      .page-title {
        font-size: var(--b-text-2xl, 1.5rem);
        font-weight: var(--b-font-weight-bold, 700);
        color: var(--b-text); margin: 0;
      }
      .header-actions { display: flex; gap: var(--b-space-sm, 0.5rem); }
      .detail-subtitle { font-size: var(--b-text-sm); color: var(--b-text-muted); }
      .info-grid {
        display: grid; grid-template-columns: auto 1fr;
        gap: var(--b-space-xs) var(--b-space-lg);
        font-size: var(--b-text-sm); margin-bottom: var(--b-space-lg);
      }
      .info-label { color: var(--b-text-muted); white-space: nowrap; }
      .info-value { color: var(--b-text); }
      .detail-actions {
        display: flex; gap: var(--b-space-sm); flex-wrap: wrap;
        margin-top: var(--b-space-md);
      }
    `;
  }

  // ── Template ──────────────────────────────────────────────────────────────

  render(): string {
    const hasCrud = this.formSchema !== null;
    const canCreate = hasCrud && (!this.createPermission || this.hasPermission(this.createPermission));
    const sizeAttr = this.modalSize ? ` size="${this.modalSize}"` : '';

    return `
      <div class="split-page">
        ${this.renderPageHeader(canCreate)}
        <b-split-panel master-width="${this.masterWidth}" detail-width="${this.detailWidth}" collapse-at="${this.collapseAt}">
          <b-card slot="master" padding="none">
            <b-data-table id="table"></b-data-table>
          </b-card>
          <b-card slot="detail" id="detail-card" hidden>
            <div slot="header">
              <span id="detail-title"></span>
              <div class="detail-subtitle" id="detail-subtitle"></div>
            </div>
            <b-button slot="actions" variant="ghost" size="sm" id="btn-close-detail" title="${this.t('common.close')}">&times;</b-button>
            <div id="detail-body"></div>
          </b-card>
        </b-split-panel>
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

  /**
   * Render the page header with title and action buttons.
   * Override to add extra header content (e.g. config selectors).
   */
  protected renderPageHeader(canCreate: boolean): string {
    return `
      <header class="page-header">
        <h1 class="page-title">${this.entityLabel}</h1>
        <div class="header-actions">
          ${canCreate ? `<b-button variant="primary" id="btn-create">${this.t('common.new')}</b-button>` : ''}
        </div>
      </header>
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

    const rowActions: RowAction[] = [...this.extraRowActions];

    const toolbarActions: ToolbarAction[] = [];
    const hasCrud = this.formSchema !== null;
    const canCreate = hasCrud && (!this.createPermission || this.hasPermission(this.createPermission));
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
    const table = this.$<BDataTable>('#table');
    const modal = this.$<BModal>('#modal');
    const confirm = this.$<BConfirmDialog>('#confirm');
    const saveBtn = this.$<BButton>('#btn-save');
    const cancelBtn = this.$<BButton>('#btn-cancel');
    const closeDetailBtn = this.$<HTMLElement>('#btn-close-detail');
    const createBtn = this.$<HTMLElement>('#btn-create');

    if (table) {
      this.listen(table as unknown as EventTarget, 'row-click', ((e: CustomEvent) => {
        const id = (e.detail?.id ?? e.detail?.row?.[this.idField]) as string | undefined;
        if (id) this._selectEntity(id);
      }) as EventListener);

      this.listen(table as unknown as EventTarget, 'toolbar-action', ((e: CustomEvent) => {
        if (e.detail.action === 'new') this._openCreate();
        else this.onToolbarAction(e.detail.action as string);
      }) as EventListener);

      this.listen(table as unknown as EventTarget, 'row-action', ((e: CustomEvent) => {
        this.onRowAction(e.detail.action as string, e.detail.id as string, e.detail.row as T);
      }) as EventListener);
    }

    if (closeDetailBtn) {
      this.listen(closeDetailBtn, 'click', () => this.deselectEntity());
    }

    if (createBtn) {
      this.listen(createBtn, 'click', () => this._openCreate());
    }

    if (modal && saveBtn && cancelBtn) {
      this.listen(saveBtn as unknown as EventTarget, 'click', () => this._save());
      this.listen(cancelBtn as unknown as EventTarget, 'click', () => modal.close());
    }

    // Wire detail panel edit/delete buttons
    const editBtn = this.$<HTMLElement>('#btn-detail-edit');
    const deleteBtn = this.$<HTMLElement>('#btn-detail-delete');
    if (editBtn) this.listen(editBtn, 'click', () => this._openEditSelected());
    if (deleteBtn) this.listen(deleteBtn, 'click', () => this._confirmDeleteSelected());
  }

  // ── Detail selection ──────────────────────────────────────────────────────

  private async _selectEntity(id: string): Promise<void> {
    const resp = await this.api.get<T>(this.detailEndpoint(id));
    if (!resp.ok || !resp.data) {
      toast.error(apiErrorMessage(resp.data));
      return;
    }

    this._selectedEntity = resp.data;
    this._selectedId = id;

    const card = this.$<HTMLElement>('#detail-card');
    if (card) card.hidden = false;

    const header = this.renderDetailHeader(resp.data);
    const titleEl = this.$('#detail-title');
    const subtitleEl = this.$('#detail-subtitle');
    if (titleEl) titleEl.textContent = header.title;
    if (subtitleEl) subtitleEl.innerHTML = header.subtitle ?? '';

    const hasCrud = this.formSchema !== null;
    const canEdit = hasCrud && this.editEnabled && (!this.editPermission || this.hasPermission(this.editPermission));
    const canDelete = hasCrud && this.deleteEnabled && (!this.deletePermission || this.hasPermission(this.deletePermission));

    const detailHtml = this.renderDetail(resp.data);
    const actionButtons = (canEdit || canDelete) ? `
      <div class="detail-actions">
        ${canEdit ? `<b-button variant="secondary" size="sm" id="btn-detail-edit">${this.t('common.edit')}</b-button>` : ''}
        ${canDelete ? `<b-button variant="danger" size="sm" id="btn-detail-delete">${this.t('common.delete')}</b-button>` : ''}
      </div>
    ` : '';

    const body = this.$('#detail-body');
    if (body) body.innerHTML = detailHtml + actionButtons;

    // Re-wire detail buttons (they were just created via innerHTML)
    const editBtn = this.$<HTMLElement>('#btn-detail-edit');
    const deleteBtn = this.$<HTMLElement>('#btn-detail-delete');
    if (editBtn) editBtn.addEventListener('click', () => this._openEditSelected());
    if (deleteBtn) deleteBtn.addEventListener('click', () => this._confirmDeleteSelected());

    this.onDetailUpdated(resp.data);
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  private _openCreate(): void {
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

  private async _openEditSelected(): Promise<void> {
    if (!this._selectedEntity || !this._selectedId) return;
    const schema = this.editFormSchema;
    if (!schema) return;
    const modal = this.$<BModal>('#modal');
    const form = this.$<BForm>('#form');
    const saveBtn = this.$<BButton>('#btn-save');
    if (!modal || !form || !saveBtn) return;

    this._editingId = this._selectedId;
    form.setSchema(schema);
    modal.setAttribute('title', this.t('common.edit'));
    saveBtn.setAttribute('loading', '');
    modal.open();

    const resp = await this.api.get<T>(this.detailEndpoint(this._selectedId));
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

  private async _confirmDeleteSelected(): Promise<void> {
    if (!this._selectedId) return;
    const confirm = this.$<BConfirmDialog>('#confirm');
    if (!confirm) return;

    const confirmed = await confirm.show();
    if (!confirmed) return;

    const resp = await this.api.delete(`${this.endpoint}/${this._selectedId}`);
    if (resp.ok) {
      toast.success(this.t('common.deleted'));
      this.onDeleteSuccess?.(this._selectedId);
      this.deselectEntity();
      this.reload();
    } else {
      toast.error(apiErrorMessage(resp.data));
    }
  }

  private async _save(): Promise<void> {
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

    // afterSave hook — runs before toast/close so subclass can do post-save work
    await this.afterSave(resp.data, isEdit);

    toast.success(this.t('common.saved'));
    if (isEdit) {
      this.onEditSuccess?.(resp.data);
    } else {
      this.onCreateSuccess?.(resp.data);
    }
    modal.close();
    this.reload();

    // Re-select the entity to refresh the detail panel
    if (isEdit && this._selectedId) {
      await this._selectEntity(this._selectedId);
    }
  }

  // ── Extension points ──────────────────────────────────────────────────────

  /** Handle row-click (default: select entity). Override to navigate instead. */
  protected onRowClick(_id: string, _row: T): void {}

  /** Handle extra toolbar actions. */
  protected onToolbarAction(_action: string): void {}

  /** Handle extra row actions. */
  protected onRowAction(_action: string, _id: string, _row: T): void {}
}
