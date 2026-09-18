import type { TableColumn } from 'birko-web-components/data';
import type { RowAction } from 'birko-web-components/data';
import type { FormSchema } from 'birko-web-components/inputs';
import type { BForm } from 'birko-web-components/inputs';
import type { ApiClient } from 'birko-web-core/http';
import { apiErrorMessage } from 'birko-web-core/http';
import { visibleBounds } from 'birko-web-core';
import { toast } from 'birko-web-components/feedback';
import type { BDataTable } from 'birko-web-components/data';
import { BaseCrudPage } from './base-crud-page.js';
import { entityUrl } from './endpoint-utils.js';

/**
 * How much of the detail card has to be inside the scrolling pane for a selection to count as
 * "visible" — measured against as much of the card as COULD be shown, so a card taller than the pane
 * is judged on its visible slice rather than being permanently under target.
 *
 * Not 1: a card cut off by a few pixels does not justify moving the page under the reader's cursor.
 * Not 0.5 either — measured at that setting, clicking the last row of a 20-row list left the detail
 * 69% visible, so the reveal declined and the card stayed cut off at the fold. The point of the
 * feature is that a click lands somewhere you can read.
 */
const DETAIL_VISIBLE_ENOUGH = 0.85;

/** How long the reveal keeps re-checking as the detail card settles. Long enough to cover the
 *  sub-entity fetches an `onDetailUpdated` override fires, short enough that it is over before a
 *  reader would think to scroll. */
const DETAIL_SETTLE_MS = 1200;

/** Reader gestures that end the reveal watch early — they reach `window` from inside the shadow DOM. */
const REVEAL_CANCEL_EVENTS = ['wheel', 'touchmove', 'keydown'] as const;

/** Options for {@link renderDetailCardScaffold}. */
export interface DetailCardOptions {
  /** id for the `<b-card>`. Default `'detail-card'`. */
  cardId?: string;
  /** id for the title `<span>`. Default `'detail-title'`. */
  titleId?: string;
  /** id for the subtitle `<div>`. Default `'detail-subtitle'`. */
  subtitleId?: string;
  /** id for the body `<div>`. Default `'detail-body'`. */
  bodyId?: string;
  /** id for the close `<b-button>`. Default `'btn-close-detail'`. */
  closeId?: string;
  /** Native tooltip text for the close button. */
  closeTitle?: string;
  /** Optional `slot="footer"` HTML appended inside the card. */
  footer?: string;
}

/**
 * Render a master-detail "detail" card scaffold (slotted via `slot="detail"`).
 *
 * The title / subtitle / body containers are populated imperatively when a row is
 * selected, so they carry `data-morph="skip"` to survive re-renders. Use this from
 * ANY page — including non-`BaseSplitPage` pages that host multiple detail panels —
 * so the scaffold and its morph markers live in one place instead of being copied.
 */
export function renderDetailCardScaffold(opts: DetailCardOptions = {}): string {
  const {
    cardId = 'detail-card',
    titleId = 'detail-title',
    subtitleId = 'detail-subtitle',
    bodyId = 'detail-body',
    closeId = 'btn-close-detail',
    closeTitle = '',
    footer = '',
  } = opts;
  return `
    <b-card slot="detail" id="${cardId}" hidden>
      <div slot="header">
        <span id="${titleId}" data-morph="skip"></span>
        <div class="detail-subtitle" id="${subtitleId}" data-morph="skip"></div>
      </div>
      <b-button slot="actions" variant="ghost" size="sm" id="${closeId}"${closeTitle ? ` title="${closeTitle}"` : ''}>&times;</b-button>
      <div id="${bodyId}" data-morph="skip"></div>
      ${footer ? `<div slot="footer">${footer}</div>` : ''}
    </b-card>
  `;
}

/**
 * Abstract base class for split-panel master-detail pages.
 *
 * Left panel: auto-fetching data table (wrapped in `<b-card>`).
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
 *   protected entityLabel = 'Payments';
 *   protected get api() { return api; }
 *   protected get columns() { return [...]; }
 *   protected renderDetail(p: PaymentDto) {
 *     return `<div class="info-grid">...</div>`;
 *   }
 * }
 * ```
 *
 * ## With CRUD modal + declarative filters
 * ```ts
 * class DepartmentsPage extends BaseSplitPage<DepartmentDto> {
 *   protected endpoint = 'api/departments';
 *   protected entityLabel = 'Departments';
 *   protected get api() { return api; }
 *   protected get columns() { return [...]; }
 *   protected get formSchema() { return departmentFormSchema(); }
 *   protected renderDetail(d: DepartmentDto) { return `...`; }
 *   protected get filterDefs() {
 *     return [
 *       { name: 'configId', type: 'select' as const, placeholder: 'Select config',
 *         options: this._configs.map(c => ({ value: c.id, label: c.name })),
 *         searchable: true },
 *     ];
 *   }
 * }
 * ```
 */
export abstract class BaseSplitPage<T extends Record<string, unknown>> extends BaseCrudPage<T> {
  private _selectedEntity: T | null = null;
  private _selectedId: string | null = null;
  // Monotonic token for out-of-order detail loads. Fast row switching can resolve an earlier
  // detail fetch AFTER a later one; without a guard the stale response overwrites the newer
  // selection and the action buttons target the wrong record. Each _selectEntity call takes the
  // next token and discards its response if a newer selection has since started (latest-wins).
  private _selectToken = 0;
  /** Active detail-reveal watch (see `_revealDetail`), or null when nothing is being watched. */
  private _detailReveal: { ro: ResizeObserver; cancel: () => void; timer: number } | null = null;

  // ── Required ──────────────────────────────────────────────────────────────

  /** REST resource base path, e.g. `'api/departments'`. */
  protected abstract override endpoint: string;

  /** HTTP client instance. */
  protected abstract get api(): ApiClient;

  /** Column definitions for the master table. */
  protected abstract override get columns(): TableColumn[];

  /**
   * Render the detail panel body HTML for the selected entity.
   * Called after the entity is fetched. Use `info-grid` CSS class for key-value layouts.
   */
  protected abstract renderDetail(entity: T): string;

  // ── Optional — override to customise ─────────────────────────────────────

  /** Master panel CSS width. Default: `'2fr'`. */
  protected masterWidth = '2fr';

  /** Detail panel CSS width. Default: `'1fr'`. */
  protected detailWidth = '1fr';

  /** Collapse breakpoint — a CSS length. Default `'48rem'` (= 768px at a default 16px browser,
   *  but tracks a reader who scaled their text up). A bare number is still read as px. */
  protected collapseAt = '48rem';

  /**
   * Extra row actions on the table.
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
   * Called after the detail entity is fetched and rendered.
   * Use to wire event listeners inside the detail panel (e.g. sub-entity buttons).
   * If this override `await`s further fetches, re-check `isSelectionCurrent(entity.id)` after each
   * await and return early when false — otherwise a stale sub-fetch can render under a newer selection.
   */
  protected onDetailUpdated(_entity: T): void {}

  /**
   * Build the detail endpoint URL for a given entity ID.
   * Default: `${endpoint}/${id}`. Override for nested resources.
   */
  protected detailEndpoint(id: string): string {
    return entityUrl(this.endpoint, id);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** The currently selected entity, or null. */
  protected get selectedEntity(): T | null { return this._selectedEntity; }

  /**
   * True while `id` is still the selected entity — i.e. no newer selection has started since it was
   * fetched. Async `onDetailUpdated` overrides that fetch sub-entities MUST re-check this after each
   * `await` and bail early when it returns false, so a superseded sub-fetch can't render stale data
   * (or mis-targeted action buttons) under the newly-selected row. The base main-detail render is
   * already latest-wins guarded; this extends the same guarantee to override sub-fetches.
   */
  protected isSelectionCurrent(id: string): boolean {
    return this._selectedId === id;
  }

  /** Clear the detail selection and hide the detail panel. */
  protected deselectEntity(): void {
    this._selectedEntity = null;
    this._selectedId = null;
    this._endDetailReveal();
    // Invalidate any in-flight detail fetch so it can't re-open the panel after a deselect.
    this._selectToken++;
    const card = this.$<HTMLElement>('#detail-card');
    if (card) card.hidden = true;
    const table = this.$<BDataTable>('#table');
    table?.setActiveRow?.(null);
  }

  /** Re-fetch and re-render the currently selected entity's detail. */
  protected async reloadDetail(): Promise<void> {
    if (this._selectedId) await this._selectEntity(this._selectedId);
  }

  /** Select and fetch detail for a specific entity by ID. */
  protected async selectEntity(id: string): Promise<void> {
    await this._selectEntity(id);
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  static override get styles(): string {
    return BaseCrudPage.styles + `
      .split-page {
        display: flex;
        flex-direction: column;
        height: 100%;
        gap: var(--b-space-md, 0.75rem);
      }
      b-split-panel { flex: 1; min-height: 0; }
    `;
  }

  // ── Content ───────────────────────────────────────────────────────────────

  protected renderContent(): string {
    return `
      <b-split-panel master-width="${this.masterWidth}" detail-width="${this.detailWidth}" collapse-at="${this.collapseAt}">
        ${this.renderMaster()}
        ${this.renderDetailCard()}
      </b-split-panel>
    `;
  }

  /**
   * Render the master (left) panel — slotted into the split panel via `slot="master"`.
   * Default: the auto-fetching data table wrapped in a card. Override to add view
   * toggles, tabs, a kanban board, etc. — but keep a `<b-data-table id="table">`
   * somewhere inside so master selection/row events keep working.
   */
  protected renderMaster(): string {
    return `
      <b-card slot="master" padding="none">
        <b-data-table id="table"></b-data-table>
      </b-card>
    `;
  }

  /**
   * Render the detail (right) panel card. Owns the `#detail-title` / `#detail-subtitle`
   * / `#detail-body` containers, which are populated imperatively on selection and
   * therefore marked `data-morph="skip"` so a re-render doesn't wipe them. Subclasses
   * should NOT re-declare this scaffold — customise the body via `renderDetail()` and
   * the header via `renderDetailHeader()` instead.
   */
  protected renderDetailCard(): string {
    return renderDetailCardScaffold({ closeTitle: this.t('bws.common.close') });
  }

  /**
   * Extra markup appended after the split panel and the built-in CRUD modal —
   * e.g. a page-specific create modal or secondary dialog. Default: nothing.
   */
  protected renderExtras(): string { return ''; }

  // ── Template ──────────────────────────────────────────────────────────────

  render(): string {
    const hasCrud = this.formSchema !== null;
    const sizeAttr = this.modalSize ? ` size="${this.modalSize}"` : '';

    return `
      <div class="split-page">
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
        ${this.renderExtras()}
      </div>
    `;
  }

  // ── Row actions ────────────────────────────────────────────────────────────

  protected override _getRowActions(): RowAction[] {
    return [...this.extraRowActions];
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  protected override onUpdated(): void {
    super.onUpdated();
    this._wireSplitEvents();
  }

  protected override onUnmount(): void {
    super.onUnmount();
    this._endDetailReveal();
  }

  // ── Private event wiring ──────────────────────────────────────────────────

  private _wireSplitEvents(): void {
    const table = this.$<BDataTable>('#table');
    const closeDetailBtn = this.$<HTMLElement>('#btn-close-detail');

    if (table) {
      this.listen(table as unknown as EventTarget, 'row-click', ((e: CustomEvent) => {
        const id = (e.detail?.id ?? e.detail?.row?.[this.idField]) as string | undefined;
        if (id) this._selectEntity(id);
      }) as EventListener);

      this.listen(table as unknown as EventTarget, 'row-action', ((e: CustomEvent) => {
        this.onRowAction(e.detail.action as string, e.detail.id as string, e.detail.row as T);
      }) as EventListener);
    }

    if (closeDetailBtn) {
      this.listen(closeDetailBtn, 'click', () => this.deselectEntity());
    }
    // Detail-panel edit/delete buttons are owned and wired by _selectEntity — they
    // only exist after a row is selected (created via innerHTML there) and are
    // re-bound on every selection, so there is nothing to wire here.
  }

  // ── Detail selection ──────────────────────────────────────────────────────

  private async _selectEntity(id: string): Promise<void> {
    const token = ++this._selectToken;
    const resp = await this.api.get<T>(this.detailEndpoint(id));
    // Latest-wins: a newer selection started while this fetch was in flight → discard this stale
    // response so it can't overwrite the current detail / mis-target the action buttons.
    if (token !== this._selectToken) return;
    if (!resp.ok || !resp.data) {
      toast.error(apiErrorMessage(resp.data));
      return;
    }

    this._selectedEntity = resp.data;
    this._selectedId = id;

    const table = this.$<BDataTable>('#table');
    table?.setActiveRow?.(id);

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
        ${canEdit ? `<b-button variant="secondary" size="sm" id="btn-detail-edit">${this.t('bws.common.edit')}</b-button>` : ''}
        ${canDelete ? `<b-button variant="danger" size="sm" id="btn-detail-delete">${this.t('bws.common.delete')}</b-button>` : ''}
      </div>
    ` : '';

    const body = this.$('#detail-body');
    if (body) body.innerHTML = detailHtml + actionButtons;

    this._revealDetail();

    // Re-wire detail buttons (they were just created via innerHTML)
    const editBtn = this.$<HTMLElement>('#btn-detail-edit');
    const deleteBtn = this.$<HTMLElement>('#btn-detail-delete');
    if (editBtn) editBtn.addEventListener('click', () => this._openEditSelected());
    if (deleteBtn) deleteBtn.addEventListener('click', () => this._confirmDeleteSelected());

    this.onDetailUpdated(resp.data);
  }

  /**
   * Bring the detail card into view when a selection would otherwise land off-screen.
   *
   * Side by side this is a no-op: `b-split-panel` sticks the detail column to the top of the
   * scrolling pane, so it is already beside the row that was clicked. It earns its keep in the
   * COLLAPSED layout, where the panel is one column and the detail is stacked BELOW the master —
   * clicking row 87 of a 100-row table renders the detail an entire table below the fold, so
   * nothing on screen changes and the click reads as dead.
   *
   * Driven by a ResizeObserver rather than a single measurement, because **the card's height is not
   * known when the click lands**. The panel un-hides the detail column from a MutationObserver, and
   * `onDetailUpdated` overrides then fetch sub-entities that keep growing the card for a few hundred
   * milliseconds. Measured once up front, the check sees a card that is briefly short enough to fit
   * on screen, declines to scroll, and the card then grows straight back under the fold — a race that
   * reproduced in Playwright and NOT in a hand-driven browser, which is the worst way to find it.
   * Observing the card instead makes the first callback the un-hide and each later one a growth step;
   * `scrollIntoView` is idempotent once the card is anchored, so the sequence converges rather than
   * jittering.
   *
   * Two further choices worth keeping:
   * - Measured against the SCROLLING PANE (`visibleBounds`), never `innerHeight`. In the app shell
   *   the pane starts below the header/ribbon and ends above the status bar; viewport maths scores
   *   pixels hidden behind that chrome as visible and under-reports what is actually cut off.
   * - Aligned to the card's TOP, not the nearest edge. Anchored to the bottom edge, later growth
   *   pushes the card back under the fold (measured: 49% visible); anchored to the top it grows
   *   downwards from a header that stays put — which is where reading starts anyway.
   */
  private _revealDetail(): void {
    const card = this.$<HTMLElement>('#detail-card');
    if (!card) return;
    this._endDetailReveal();

    const check = (): void => {
      if (!card.isConnected || card.hidden) return;
      const rect = card.getBoundingClientRect();
      const pane = visibleBounds(card);
      const shown = Math.min(rect.bottom, pane.bottom) - Math.max(rect.top, pane.top);
      const showable = Math.min(rect.height, pane.bottom - pane.top);
      if (showable === 0 || shown >= showable * DETAIL_VISIBLE_ENOUGH) return;
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      card.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
    };

    // Scrolling is the reader's prerogative: the moment they move the page themselves, this stops
    // correcting it. Without that, a settle window that outlives their first flick would fight them.
    const cancel = (): void => this._endDetailReveal();
    const ro = new ResizeObserver(check);
    this._detailReveal = { ro, cancel, timer: window.setTimeout(cancel, DETAIL_SETTLE_MS) };
    ro.observe(card);
    for (const evt of REVEAL_CANCEL_EVENTS) window.addEventListener(evt, cancel, { passive: true });
  }

  /** Tear down the reveal watch — settled, superseded, cancelled by the reader, or page unmounted. */
  private _endDetailReveal(): void {
    const watch = this._detailReveal;
    if (!watch) return;
    this._detailReveal = null;
    watch.ro.disconnect();
    clearTimeout(watch.timer);
    for (const evt of REVEAL_CANCEL_EVENTS) window.removeEventListener(evt, watch.cancel);
  }

  // ── Split-specific CRUD ───────────────────────────────────────────────────

  protected async _openEditSelected(): Promise<void> {
    if (!this._selectedEntity || !this._selectedId) return;
    await this._openEdit(this._selectedId);
  }

  private async _confirmDeleteSelected(): Promise<void> {
    if (!this._selectedId) return;
    await this._confirmDelete(this._selectedId);
  }

  protected override _afterDelete(_id: string): void {
    this.deselectEntity();
    this.reload();
  }

  protected override async _afterSaveComplete(entity: T, isEdit: boolean): Promise<void> {
    // Awaited, not fire-and-forget. `reload()` starts an async table fetch; re-selecting the detail
    // panel below starts another and calls `table.setActiveRow(...)` on the way. Left un-awaited the two
    // interleave, so which rows the table ends up rendering depends on request ordering — the shape that
    // makes a list row look "stale" only under load (Symbio TASK-298: the assertion failed in 2 of 4
    // full-suite runs and never in isolation, and could not be reproduced on demand).
    await this.reload();

    // Re-select the entity to refresh the detail panel
    if (isEdit && this._selectedId) {
      await this._selectEntity(this._selectedId);
    }
  }

  // ── Extension points ──────────────────────────────────────────────────────

  /** Handle extra row actions. */
  protected onRowAction(_action: string, _id: string, _row: T): void {}
}
