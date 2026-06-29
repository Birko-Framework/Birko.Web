// b-* selector CONSTANTS + shadow-pierce conventions, grounded in the real component source
// (Birko.Web.Components/src/...). These are *logical* CSS fragments — they do NOT encode the
// piercing syntax. Each adapter applies its own piercing so consumers never see the difference:
//   • Playwright CSS pierces open shadow roots automatically → `${host} ${inner}`.
//   • Puppeteer needs the deep combinator → `${host} >>> ${inner}` (crosses all shadow boundaries).
// Use `pierceDeep(host, inner, driver)` below, or the adapter's own `deep()` helper.

/** Escape a value for use inside a `[attr="..."]` selector. */
export function cssAttr(value: string): string {
  return String(value).replace(/["\\]/g, '\\$&');
}

/**
 * Selector pieces. Where a piece targets shadow content of a host element, it is split into
 * `{ host, inner }` so the adapter can join with the right combinator.
 */
export const B = {
  // ── b-data-table (Birko.Web.Components/src/data/b-data-table.ts) ──
  // The table chrome lives in a nested shadow tree: b-data-table » b-table » <table>.
  dataTable: 'b-data-table',
  /** ⋮ row-action trigger button (class .row-action-trigger, carries data-id=<rowId>). */
  rowActionTrigger: { host: 'b-data-table', inner: '.row-action-trigger' },
  rowActionTriggerFor: (rowId: string) => ({ host: 'b-data-table', inner: `.row-action-trigger[data-id="${cssAttr(rowId)}"]` }),
  /** Per-row selection checkbox (.row-select[data-id]) and the header select-all (.select-all). */
  rowSelect: { host: 'b-data-table', inner: '.row-select' },
  rowSelectFor: (rowId: string) => ({ host: 'b-data-table', inner: `.row-select[data-id="${cssAttr(rowId)}"]` }),
  selectAll: { host: 'b-data-table', inner: '.select-all' },
  /** Body rows of the inner b-table (tr[data-id]). */
  tableRow: { host: 'b-data-table', inner: 'tr[data-id]' },
  tableRowFor: (rowId: string) => ({ host: 'b-data-table', inner: `tr[data-id="${cssAttr(rowId)}"]` }),

  // ── b-dropdown-menu (Birko.Web.Components/src/layout/b-dropdown-menu.ts) ──
  // The ONE popover primitive. For a row action, b-data-table appends a fresh <b-dropdown-menu>
  // to document.body and calls show(); its items are <button class="item" data-id role="menuitem">.
  // Selecting emits a `select` CustomEvent { id } (and b-data-table re-emits `row-action`).
  dropdownMenu: 'b-dropdown-menu',
  dropdownItem: { host: 'b-dropdown-menu', inner: '.item' },
  dropdownItemFor: (itemId: string) => ({ host: 'b-dropdown-menu', inner: `.item[data-id="${cssAttr(itemId)}"]` }),

  // ── b-form (Birko.Web.Components/src/inputs/b-form.ts) ──
  // Each field renders as a b-* control with name=<field.name>, wrapped in [data-field=<path>].
  // The editable element is `(el.shadowRoot ?? el).querySelector('input, select, textarea')`.
  form: 'b-form',
  formFieldWrap: (name: string) => ({ host: 'b-form', inner: `[data-field="${cssAttr(name)}"]` }),
  formFieldControl: (name: string) => ({ host: 'b-form', inner: `[name="${cssAttr(name)}"]` }),
  /** Inner native control inside a named field (pierces the field component's own shadow too). */
  formFieldInput: (name: string) => ({ host: 'b-form', inner: `[data-field="${cssAttr(name)}"] :is(input, select, textarea)` }),

  // ── b-select (Birko.Web.Components/src/inputs/b-select.ts) ──
  // A searchable b-select opens its `.combo`, then renders options as `.option[data-value]`
  // inside a `.dropdown` popover (NOT [role="option"]). Selecting clicks the option div.
  select: 'b-select',
  selectFor: (name: string) => `b-select[name="${cssAttr(name)}"]`,
  selectCombo: { host: 'b-select', inner: '.combo' },
  selectComboFor: (name: string) => ({ host: `b-select[name="${cssAttr(name)}"]`, inner: '.combo' }),
  selectOption: { host: 'b-select', inner: '.option[data-value]' },
  selectOptionForName: (name: string) => ({ host: `b-select[name="${cssAttr(name)}"]`, inner: '.option[data-value]' }),
  selectOptionForValue: (name: string, value: string) => ({ host: `b-select[name="${cssAttr(name)}"]`, inner: `.option[data-value="${cssAttr(value)}"]` }),

  // ── b-confirm-dialog (Birko.Web.Components/src/layout/b-confirm-dialog.ts) ──
  // Confirm/cancel are <b-button class="btn-confirm"/".btn-cancel"> (default text "Confirm"/"Cancel",
  // localized via bwc.confirm.*). Target by class — robust to label/locale changes.
  confirmDialog: 'b-confirm-dialog',
  confirmDialogConfirm: { host: 'b-confirm-dialog', inner: '.btn-confirm' },
  confirmDialogCancel: { host: 'b-confirm-dialog', inner: '.btn-cancel' },
  // A page may host MORE than one b-confirm-dialog (e.g. a generic confirm + a delete confirm),
  // making `b-confirm-dialog .btn-confirm` ambiguous. Target the confirm button of the currently
  // OPEN dialog instead — only one is open at a time during a delete.
  confirmConfirmOpen: 'dialog[open] .btn-confirm',

  // ── b-sidebar (Birko.Web.Components/src/nav/b-sidebar.ts) ──
  sidebarItem: (id: string) => ({ host: 'b-sidebar', inner: `a.nav-item[data-id="${cssAttr(id)}"]` }),
  sidebarActive: { host: 'b-sidebar', inner: 'a.nav-item.active' },
  sidebarToggle: { host: 'b-sidebar', inner: '.toggle-btn' },

  // ── b-ribbon (Birko.Web.Components/src/nav/b-ribbon.ts) ──
  ribbonTab: (tabId: string) => ({ host: 'b-ribbon', inner: `button.ribbon-tab[data-tab="${cssAttr(tabId)}"]` }),
  /** A ribbon action item (button[data-item], also carries data-tab + data-group). */
  ribbonItem: (itemId: string) => ({ host: 'b-ribbon', inner: `[data-item="${cssAttr(itemId)}"]` }),

  // ── BaseCrudPage conventions (Birko.Web.Shell/src/pages/base-crud-page.ts) ──
  // Every consumer CRUD page rendered through BaseCrudPage exposes these stable ids in its
  // own shadow root: the "New" button, the create/edit modal, its <b-form id="form">, and Save.
  // NOTE: #btn-create is `disabled` until a required filter (if any) is satisfied.
  crudNewButton: '#btn-create',
  // CAUTION: `#modal` is NOT unique once Playwright pierces shadow roots — shell-level components
  // (e.g. the offline sync-conflict modal) reuse `id="modal"` too. To assert "the CRUD modal is
  // open", target the open native <dialog> instead (b-modal opens via dialog.showModal()):
  crudModal: '#modal',
  openDialog: 'dialog[open]',
  crudForm: '#form',
  crudSaveButton: '#btn-save',
  crudCancelButton: '#btn-cancel',
  crudConfirmDialog: '#confirm',

  // ── BaseSplitPage conventions (Birko.Web.Shell/src/pages/base-split-page.ts, extends BaseCrudPage) ──
  // Master-detail pages: a row-click opens the right-hand detail card; edit/delete live as buttons
  // INSIDE that detail panel — there are no ⋮ row actions unless the page sets `extraRowActions`.
  // Flow: click row → #detail-card appears → #btn-detail-delete → confirm #confirm.
  crudDetailCard: '#detail-card',
  crudDetailEditButton: '#btn-detail-edit',
  crudDetailDeleteButton: '#btn-detail-delete',
} as const;

export type SelectorPiece = { host: string; inner: string };

/** Join a {host, inner} piece into a driver-appropriate deep selector. */
export function pierceDeep(piece: SelectorPiece, driver: 'playwright' | 'puppeteer'): string {
  return driver === 'puppeteer' ? `${piece.host} >>> ${piece.inner}` : `${piece.host} ${piece.inner}`;
}
