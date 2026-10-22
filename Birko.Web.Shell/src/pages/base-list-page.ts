import type { TableColumn } from 'birko-web-components/data';
import type { RowAction } from 'birko-web-components/data';
import type { FormSchema } from 'birko-web-components/inputs';
import type { ApiClient } from 'birko-web-core/http';
import type { BDataTable } from 'birko-web-components/data';
import { BaseCrudPage } from './base-crud-page.js';
import { getEntityChangeSource, parseEntityChangedEvent } from './live-refresh.js';

/** Opt-in live refresh: reload when the server announces a change to this page's entity type. */
export interface LiveRefreshOptions {
  moduleId: string;
  entityType: string;
  /** Events closer together than this cause one reload (default 500 ms). */
  debounceMs?: number;
}

/**
 * Abstract base class for standard CRUD list pages.
 *
 * Renders a page header with create button, declarative filter row,
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
 * ## With permissions + declarative filters
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
 *   protected get filterDefs() {
 *     return [
 *       { name: 'status', type: 'select' as const, placeholder: 'All statuses',
 *         options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }] },
 *     ];
 *   }
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

  /** Form schema for the create/edit modal. Return `null` to opt out of the built-in modal. */
  protected abstract override get formSchema(): FormSchema | null;

  // ── Optional — override to customise ─────────────────────────────────────

  /**
   * Extra row actions added after the built-in Edit/Delete.
   * Override to add custom per-row actions (e.g. status change, duplicate).
   */
  protected get extraRowActions(): RowAction[] { return []; }

  /**
   * Reload when another tab or user creates, edits or deletes this page's entity type. Off by default.
   * Needs the app to have called `setEntityChangeSource(...)` once; opting in without one throws when the page
   * connects. A burst of events causes one reload, and none happens while the create/edit modal is open: it runs
   * when the modal closes, so an open form is not disturbed.
   */
  protected liveRefresh?: LiveRefreshOptions;

  private _liveUnsubscribe: (() => void) | null = null;
  private _liveTimer: ReturnType<typeof setTimeout> | null = null;
  private _livePending = false;

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

    return `
      <div class="list-page">
        ${this.renderPageHeader()}
        ${this.renderFilterRow()}
        ${this.requiredFilterSet ? this.renderContent() : this.renderEmptyFilter()}
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

  // ── Row actions ────────────────────────────────────────────────────────────

  protected override _getRowActions(): RowAction[] {
    const canEdit   = this.editEnabled   && (!this.editPermission   || this.hasPermission(this.editPermission));
    const canDelete = this.deleteEnabled && (!this.deletePermission || this.hasPermission(this.deletePermission));

    // Order: edit first, page-specific actions next, destructive delete always last.
    const actions: RowAction[] = [];
    if (canEdit)   actions.push({ id: 'edit',   label: this.t('bws.common.edit') });
    actions.push(...this.extraRowActions);
    if (canDelete) actions.push({ id: 'delete', label: this.t('bws.common.delete'), variant: 'danger' });
    return actions;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  protected override onUpdated(): void {
    super.onUpdated();
    this._wireListEvents();
  }

  override connectedCallback(): Promise<void> {
    // The base first: its synchronous guards may throw, and must not leave a subscription behind.
    const connected = super.connectedCallback();
    this._subscribeLiveRefresh();
    return connected;
  }

  override disconnectedCallback(): void {
    this._stopLiveRefresh();
    super.disconnectedCallback();
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _subscribeLiveRefresh(): void {
    const opts = this.liveRefresh;
    if (!opts) return;
    const source = getEntityChangeSource();
    if (!source) {
      throw new Error(`${this.constructor.name}: liveRefresh needs an event source — call `
        + `setEntityChangeSource((h) => sse.on('entity-changed', h)) once at app boot, or remove liveRefresh.`);
    }
    this._stopLiveRefresh();
    this._liveUnsubscribe = source((payload) => {
      const event = parseEntityChangedEvent(payload);
      if (!event || event.moduleId !== opts.moduleId || event.entityType !== opts.entityType) return;
      if (this._liveTimer) clearTimeout(this._liveTimer);
      this._liveTimer = setTimeout(() => { this._liveTimer = null; this._liveReload(); }, opts.debounceMs ?? 500);
    });
  }

  private _stopLiveRefresh(): void {
    this._liveUnsubscribe?.();
    this._liveUnsubscribe = null;
    if (this._liveTimer) clearTimeout(this._liveTimer);
    this._liveTimer = null;
    this._livePending = false;
  }

  private _liveReload(): void {
    if (!this.isConnected) return;
    const dlg = this.$('#modal')?.shadowRoot?.querySelector('dialog');
    if (dlg?.open) {
      this._livePending = true; // the modal's close event reloads
      return;
    }
    void this.reload();
  }

  private _wireListEvents(): void {
    const modal = this.$('#modal');
    if (modal) this.listen(modal, 'close', () => {
      if (!this._livePending) return;
      this._livePending = false;
      void this.reload();
    });

    const table = this.$<BDataTable>('#table');
    if (!table) return;

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
   * Called for extra row actions beyond the built-in 'edit' and 'delete'.
   * Default: no-op.
   */
  protected onRowAction(_action: string, _id: string, _row: T): void {}
}
