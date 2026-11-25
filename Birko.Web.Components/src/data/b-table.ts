import { BaseComponent, define } from 'birko-web-core';
import { escapeHtml, escapeAttr } from '../dom-utils';
import '../feedback/b-skeleton.js';

export interface TableColumnOption {
  value: string;
  label: string;
}

export interface TableColumn {
  key: string;
  label: string;
  width?: string;
  align?: 'left' | 'center' | 'right' | (string & {});
  // `any` intentional: allows consumers to declare narrow render signatures
  // like `(v: number) => string` without widening to `unknown` everywhere.
  render?: (value: any, row: any) => string;
  /**
   * Render the header cell as **HTML** instead of escaping {@link label}.
   *
   * A code opt-in, exactly like {@link render} for cells — the returned string is
   * inserted without escaping, so escape any consumer data it interpolates. `label`
   * stays escaped by default, which is what keeps an ordinary column heading from
   * becoming an injection point.
   *
   * Consumed by `<b-data-table>` for the selection column; a sortable column still
   * wraps the result in its header button.
   */
  headerRender?: (column: TableColumn) => string;
  sortable?: boolean;
  /**
   * Enable inline click-to-edit for this column in `<b-data-table>`.
   * - `true` / `'text'`   — plain text input
   * - `'number'`          — numeric input
   * - `'date'`            — date picker input
   * - `'select'`          — dropdown (requires `options` or `getOptions`)
   *
   * The cell shows its display value at rest; clicking it activates an input.
   * Blur or Enter commits the edit and fires a `cell-edit` event on the table.
   * Escape cancels without saving.
   *
   * Only consumed by `<b-data-table>` — `<b-table>` only adds the required
   * markup hooks (`data-editable`, `.cell-val` wrapper).
   */
  editable?: boolean | 'text' | 'number' | 'date' | 'select';
  /** Static option list for `editable: 'select'` columns. */
  options?: TableColumnOption[];
  /**
   * Dynamic options computed per-row at edit time.
   * Takes precedence over `options` when provided.
   */
  getOptions?: (row: Record<string, unknown>) => TableColumnOption[];
}

/**
 * A data table: sortable headers, `row-click` / `action-click` / `sort` events.
 *
 * **`clickable-rows`** says a row opens something (`row-click` has a listener that acts on it). The rows then take
 * part in the keyboard order, as one tab stop with a roving tabindex: the row last focused, else the active row
 * ({@link setActiveRow}), else the first. On a focused row, **Enter** emits `row-click` exactly as a click does,
 * and so does **Space**, unless the row holds a checkbox (a selectable `<b-data-table>`), which Space then toggles.
 * **Up / Down** move between rows and **Home / End** go to the first / last. Keys pressed inside a control in the
 * row (a button, link, input, row menu) are that control's own. Without the attribute rows stay out of the tab
 * order, because a focusable row that does nothing is a dead stop (TASK-978).
 */
export class BTable extends BaseComponent {
  static get observedAttributes() { return ['loading', 'empty-text', 'striped', 'hoverable', 'sortable', 'label-no-data', 'clickable-rows']; }

  private _columns: TableColumn[] = [];
  private _data: Record<string, unknown>[] = [];
  private _idField: string | null = null;
  private _sortKey: string | null = null;
  private _sortDesc = false;
  private _activeRowId: string | null = null;
  /** The row that holds the body's tab stop (the one last focused), while it is still shown. */
  private _focusRowId: string | null = null;

  static get styles() {
    return `
      :host { display: block; }
      .table-wrap { overflow-x: auto; overflow-y: auto; max-height: var(--b-table-max-height, none); }
      table { width: 100%; border-collapse: collapse; font-size: var(--b-text-sm, 0.8125rem); }
      th {
        text-align: left;
        height: var(--b-table-row-height, var(--b-control-min-height, 2.375rem));
        padding: 0 var(--b-space-md, 0.75rem); box-sizing: border-box; vertical-align: middle;
        font-weight: var(--b-font-weight-semibold, 600); color: var(--b-table-header-text, var(--b-text-secondary));
        font-size: var(--b-text-xs, 0.6875rem); text-transform: uppercase; letter-spacing: var(--b-letter-spacing-caps, 0.03125rem);
        border-bottom: 2px solid var(--b-border); white-space: nowrap;
        user-select: none;
        position: sticky; top: 0; z-index: 1; background: var(--b-table-header-bg, var(--b-bg));
      }
      th.sortable { cursor: pointer; }
      th.sortable:hover { color: var(--b-table-header-text-hover, var(--b-text)); }
      /* Sortable headers use an inner <button> so they're keyboard-operable;
         strip its chrome so it reads as the header text. */
      .th-sort-btn {
        display: inline-flex; align-items: center;
        background: none; border: none; padding: 0; margin: 0; cursor: pointer;
        font: inherit; color: inherit; letter-spacing: inherit; text-transform: inherit;
      }
      .th-sort-btn:focus-visible { outline: none; box-shadow: var(--b-focus-ring); border-radius: var(--b-radius-sm, 0.25rem); }
      .sort-icon { margin-left: var(--b-space-xs); opacity: var(--b-muted-opacity); }
      th.sorted .sort-icon { opacity: 1; color: var(--b-color-primary); }
      td {
        height: var(--b-table-row-height, var(--b-control-min-height, 2.375rem));
        padding: 0 var(--b-space-md, 0.75rem); box-sizing: border-box;
        border-bottom: var(--b-border-width, 1px) solid var(--b-border); color: var(--b-text);
        vertical-align: middle;
      }
      :host([striped]) tr:nth-child(even):not(.skeleton-row) td { background: var(--b-bg-secondary); }
      :host([hoverable]) tr:not(.skeleton-row):hover td { background: var(--b-row-hover-bg, var(--b-bg-tertiary)); }
      tr.skeleton-row { cursor: default; }
      tr.skeleton-row td { background: var(--b-bg); }
      tr { cursor: default; transition: background var(--b-transition, 150ms ease); }
      /* Selected row — wins over striped, hover darkens slightly */
      tr[aria-selected="true"] td,
      :host([striped]) tr[aria-selected="true"]:nth-child(even) td {
        background: var(--b-color-primary-light);
      }
      tr[aria-selected="true"] td:first-child {
        box-shadow: inset 3px 0 0 var(--b-color-primary);
      }
      :host([hoverable]) tr[aria-selected="true"]:not(.skeleton-row):hover td {
        background: color-mix(in srgb, var(--b-color-primary-light) 80%, var(--b-color-primary) 20%);
      }
      .align-center { text-align: center; }
      .align-right { text-align: right; }
      .empty { text-align: center; padding: var(--b-space-3xl, 3rem); color: var(--b-text-muted); }
      .loading-bar { height: var(--b-space-2xs, 0.125rem); background: var(--b-color-primary); animation: loading var(--b-animation-slow, 1.5s) ease infinite; }
      @keyframes loading { 0% { width: 0; } 50% { width: 70%; } 100% { width: 100%; opacity: 0; } }
      /* Editable cell hooks (activated by b-data-table) */
      td.cell-editable { cursor: text; }
      td.cell-editable:hover:not(:has(input, select)) { background: color-mix(in srgb, var(--b-color-primary) 6%, transparent); }
      .cell-val { display: block; min-height: 1em; }
      /* Rows that open something (TASK-978) */
      :host([clickable-rows]) tbody tr[data-id] { cursor: pointer; }
      tbody tr[data-id]:focus { outline: none; }
      tbody tr[data-id]:focus-visible { outline: 2px solid var(--b-color-primary); outline-offset: -2px; }
    `;
  }

  setColumns(columns: TableColumn[]) {
    this._columns = columns;
    this.update();
  }

  setData(data: Record<string, unknown>[]) {
    this._data = data;
    this.update();
  }

  setIdField(field: string) {
    this._idField = field;
  }

  /** Highlight a single row as the active/selected one (or pass null to clear). */
  setActiveRow(id: string | null) {
    this._activeRowId = id == null ? null : String(id);
    this.update();
  }

  getActiveRow(): string | null { return this._activeRowId; }

  render() {
    const loading = this.boolAttr('loading');
    const emptyText = this.attr('empty-text') || this.label('label-no-data', 'bwc.common.noData', 'No data');

    const sorted = this._sortKey ? [...this._data].sort((a, b) => {
      const aVal = a[this._sortKey!];
      const bVal = b[this._sortKey!];
      const cmp = String(aVal ?? '').localeCompare(String(bVal ?? ''), undefined, { numeric: true });
      return this._sortDesc ? -cmp : cmp;
    }) : this._data;

    const showSkeleton = loading && sorted.length === 0;

    // The body's one tab stop, when rows open something: the row last focused, else the active row, else the first.
    let tabStopId: string | null = null;
    if (this.boolAttr('clickable-rows') && sorted.length > 0) {
      const ids = sorted.map(r => this._rowId(r));
      tabStopId = [this._focusRowId, this._activeRowId].find(id => id !== null && ids.includes(id)) ?? ids[0];
    }

    return `
      ${loading && !showSkeleton ? '<div class="loading-bar"></div>' : ''}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              ${this._columns.map(c => {
                const isSorted = this._sortKey === c.key;
                const arrow = isSorted ? (this._sortDesc ? '&#9660;' : '&#9650;') : '&#9650;';
                const ariaSort = !c.sortable ? '' : isSorted ? (this._sortDesc ? 'aria-sort="descending"' : 'aria-sort="ascending"') : 'aria-sort="none"';
                const label = c.headerRender ? c.headerRender(c) : escapeHtml(String(c.label ?? ''));
                return `<th
                  scope="col"
                  class="${c.sortable ? 'sortable' : ''} ${isSorted ? 'sorted' : ''} ${c.align ? 'align-' + c.align : ''}"
                  style="${c.width ? 'width:' + escapeAttr(String(c.width)) : ''}"
                  data-key="${escapeAttr(String(c.key))}"
                  ${ariaSort}
                >${c.sortable
                  ? `<button type="button" class="th-sort-btn">${label}<span class="sort-icon" aria-hidden="true">${arrow}</span></button>`
                  : label}</th>`;
              }).join('')}
            </tr>
          </thead>
          <tbody>
            ${showSkeleton
              ? Array.from({ length: 5 }, () =>
                  `<tr class="skeleton-row">${this._columns.map(c =>
                    `<td class="${c.align ? 'align-' + c.align : ''}"><b-skeleton></b-skeleton></td>`
                  ).join('')}</tr>`
                ).join('')
              : sorted.length === 0
                ? `<tr><td colspan="${this._columns.length}" class="empty">${emptyText}</td></tr>`
                : sorted.map(row => {
                    const rowId = this._rowId(row);
                    const isActive = this._activeRowId !== null && rowId === this._activeRowId;
                    const tabindex = tabStopId === null ? '' : ` tabindex="${rowId === tabStopId ? 0 : -1}"`;
                    return `<tr data-id="${escapeAttr(rowId)}"${isActive ? ' aria-selected="true"' : ''}${tabindex}>${
                    this._columns.map(c => {
                      const val = row[c.key];
                      const rendered = c.render ? c.render(val, row) : this._escape(val);
                      if (c.editable) {
                        return `<td class="${c.align ? 'align-' + c.align + ' ' : ''}cell-editable" data-editable="${c.key}"><span class="cell-val">${rendered}</span></td>`;
                      }
                      return `<td class="${c.align ? 'align-' + c.align : ''}">${rendered}</td>`;
                    }).join('')
                  }</tr>`;
                  }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  protected onUpdated() {
    this.$$<HTMLElement>('th.sortable').forEach(th => {
      this.listen(th, 'click', () => {
        const key = th.dataset.key!;
        if (this._sortKey === key) {
          this._sortDesc = !this._sortDesc;
        } else {
          this._sortKey = key;
          this._sortDesc = false;
        }
        this.update();
        this.emit('sort', { key: this._sortKey, desc: this._sortDesc });
      });
    });

    this.$$<HTMLElement>('tbody tr[data-id]').forEach(tr => {
      this.listen(tr, 'click', (e: Event) => {
        // Walk composedPath to find [data-action] across shadow boundaries (e.g. inside b-button)
        const path = e.composedPath() as HTMLElement[];
        const actionEl = path.find(el => el?.dataset?.action) as HTMLElement | undefined;
        if (actionEl) {
          e.stopPropagation();
          this.emit('action-click', { action: actionEl.dataset.action, id: tr.dataset.id });
          return;
        }

        // Don't emit row-click when the user clicked an interactive element inside the row
        const isInteractive = path.some(el =>
          el !== tr && el.nodeType === 1 && el.matches?.('button, a, input, select, textarea, b-button, b-dropdown-menu, [role="button"]')
        );
        if (isInteractive) return;
        this.emit('row-click', { id: tr.dataset.id });
      });
    });

    if (!this.boolAttr('clickable-rows')) return;
    const rows = this.$$<HTMLElement>('tbody tr[data-id]');
    rows.forEach((tr, i) => {
      this.listen(tr, 'focus', () => this._takeTabStop(tr));
      this.listen<KeyboardEvent>(tr, 'keydown', (e) => {
        // A key pressed inside a control in the row is that control's.
        if (e.target !== tr || e.altKey || e.ctrlKey || e.metaKey) return;
        let to: HTMLElement | undefined;
        switch (e.key) {
          case 'Enter':
            e.preventDefault();
            this.emit('row-click', { id: tr.dataset.id });
            return;
          case ' ': {
            e.preventDefault();
            const check = tr.querySelector<HTMLInputElement>('input[type="checkbox"]');
            if (check) check.click();
            else this.emit('row-click', { id: tr.dataset.id });
            return;
          }
          case 'ArrowDown': to = rows[i + 1]; break;
          case 'ArrowUp': to = rows[i - 1]; break;
          case 'Home': to = rows[0]; break;
          case 'End': to = rows[rows.length - 1]; break;
          default: return;
        }
        e.preventDefault();
        if (to) { this._takeTabStop(to); to.focus(); }
      });
    });

    // A re-render (new data, a sort) may replace the focused row: put focus back on the row holding the tab stop.
    if (this._refocusRow) {
      this._refocusRow = false;
      this.$<HTMLElement>('tbody tr[tabindex="0"]')?.focus();
    }
  }

  /** Set when focus was on a row as a re-render started, so {@link onUpdated} can put it back. */
  private _refocusRow = false;

  override update(): void {
    const focused = this.shadowRoot?.activeElement;
    this._refocusRow = !!focused && (focused as Element).matches?.('tbody tr[data-id]');
    super.update();
  }

  /**
   * Focus the row whose id is `id` and make it the body's tab stop (TASK-989). Rows are focusable only with
   * `clickable-rows`; returns `false` when no such row is rendered (not on this page, filtered out, or not focusable).
   */
  focusRow(id: string): boolean {
    const tr = this.$$<HTMLElement>('tbody tr[data-id]').find(r => r.dataset.id === id);
    if (!tr || !tr.hasAttribute('tabindex')) return false;
    this._takeTabStop(tr);
    tr.focus();
    return true;
  }

  /** Focus the row holding the body's tab stop (TASK-989); `false` when the body has no focusable row. */
  focusTabStop(): boolean {
    const tr = this.$<HTMLElement>('tbody tr[tabindex="0"]');
    if (!tr) return false;
    tr.focus();
    return true;
  }

  /** Make `tr` the body's one tab stop. */
  private _takeTabStop(tr: HTMLElement): void {
    this._focusRowId = tr.dataset.id ?? null;
    this.$$<HTMLElement>('tbody tr[data-id]').forEach(r => r.setAttribute('tabindex', r === tr ? '0' : '-1'));
  }

  private _rowId(row: Record<string, unknown>): string {
    return String(this._idField ? (row[this._idField] ?? '') : (row['id'] ?? row['guid'] ?? ''));
  }

  private _escape(val: unknown): string {
    if (val === null || val === undefined) return '<span style="color:var(--b-text-muted)">—</span>';
    const s = String(val);
    const el = document.createElement('span');
    el.textContent = s;
    return el.innerHTML;
  }
}

define('b-table', BTable);
