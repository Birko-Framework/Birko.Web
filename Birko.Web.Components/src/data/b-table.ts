import { BaseComponent, define } from 'birko-web-core';
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

export class BTable extends BaseComponent {
  static get observedAttributes() { return ['loading', 'empty-text', 'striped', 'hoverable', 'sortable', 'label-no-data']; }

  private _columns: TableColumn[] = [];
  private _data: Record<string, unknown>[] = [];
  private _idField: string | null = null;
  private _sortKey: string | null = null;
  private _sortDesc = false;

  static get styles() {
    return `
      :host { display: block; }
      .table-wrap { overflow-x: auto; overflow-y: auto; max-height: var(--b-table-max-height, none); }
      table { width: 100%; border-collapse: collapse; font-size: var(--b-text-sm, 0.8125rem); }
      th {
        text-align: left; padding: var(--b-space-sm, 0.5rem) var(--b-space-md, 0.75rem);
        font-weight: var(--b-font-weight-semibold, 600); color: var(--b-text-secondary);
        font-size: var(--b-text-xs, 0.6875rem); text-transform: uppercase; letter-spacing: var(--b-letter-spacing-caps, 0.03125rem);
        border-bottom: 2px solid var(--b-border); white-space: nowrap;
        user-select: none;
        position: sticky; top: 0; z-index: 1; background: var(--b-bg);
      }
      th.sortable { cursor: pointer; }
      th.sortable:hover { color: var(--b-text); }
      .sort-icon { margin-left: var(--b-space-xs); opacity: var(--b-muted-opacity); }
      th.sorted .sort-icon { opacity: 1; color: var(--b-color-primary); }
      td {
        padding: var(--b-space-sm, 0.5rem) var(--b-space-md, 0.75rem);
        border-bottom: var(--b-border-width, 1px) solid var(--b-border); color: var(--b-text);
        vertical-align: middle;
      }
      :host([striped]) tr:nth-child(even):not(.skeleton-row) td { background: var(--b-bg-secondary); }
      :host([hoverable]) tr:not(.skeleton-row):hover td { background: var(--b-bg-tertiary); }
      tr.skeleton-row { cursor: default; }
      tr.skeleton-row td { background: var(--b-bg); }
      tr { cursor: default; transition: background var(--b-transition, 150ms ease); }
      .align-center { text-align: center; }
      .align-right { text-align: right; }
      .empty { text-align: center; padding: var(--b-space-3xl, 3rem); color: var(--b-text-muted); }
      .loading-bar { height: var(--b-space-2xs, 0.125rem); background: var(--b-color-primary); animation: loading var(--b-animation-slow, 1.5s) ease infinite; }
      @keyframes loading { 0% { width: 0; } 50% { width: 70%; } 100% { width: 100%; opacity: 0; } }
      /* Editable cell hooks (activated by b-data-table) */
      td.cell-editable { cursor: text; }
      td.cell-editable:hover:not(:has(input, select)) { background: color-mix(in srgb, var(--b-color-primary) 6%, transparent); }
      .cell-val { display: block; min-height: 1em; }
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
                return `<th
                  scope="col"
                  class="${c.sortable ? 'sortable' : ''} ${isSorted ? 'sorted' : ''} ${c.align ? 'align-' + c.align : ''}"
                  style="${c.width ? 'width:' + c.width : ''}"
                  data-key="${c.key}"
                  ${ariaSort}
                >${c.label}${c.sortable ? `<span class="sort-icon" aria-hidden="true">${arrow}</span>` : ''}</th>`;
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
                : sorted.map(row => `<tr data-id="${this._idField ? (row[this._idField] ?? '') : (row['id'] ?? row['guid'] ?? '')}">${
                    this._columns.map(c => {
                      const val = row[c.key];
                      const rendered = c.render ? c.render(val, row) : this._escape(val);
                      if (c.editable) {
                        return `<td class="${c.align ? 'align-' + c.align + ' ' : ''}cell-editable" data-editable="${c.key}"><span class="cell-val">${rendered}</span></td>`;
                      }
                      return `<td class="${c.align ? 'align-' + c.align : ''}">${rendered}</td>`;
                    }).join('')
                  }</tr>`).join('')}
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
