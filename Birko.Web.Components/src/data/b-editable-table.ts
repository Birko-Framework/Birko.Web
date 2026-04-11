import { BaseComponent, define } from 'birko-web-core';

// ── Types ─────────────────────────────────────────────────────────────────

export interface EditableColumnOption {
  value: string;
  label: string;
}

export type EditableCellType =
  | 'text' | 'number' | 'select' | 'checkbox' | 'date' | 'readonly';

export interface EditableColumn {
  /** Data field key — must match the property name in each row object. */
  key: string;
  /** Column header label. */
  label: string;
  /** Column width CSS value, e.g. `'8rem'`. */
  width?: string;
  align?: 'left' | 'center' | 'right';
  /**
   * Cell editor type. Default: `'text'`.
   * - `readonly` — displays value (uses `render` if provided)
   */
  type?: EditableCellType;
  /** Static options for `type: 'select'`. */
  options?: EditableColumnOption[];
  /**
   * Dynamic options for `type: 'select'`, evaluated at render time from current row data.
   * Takes precedence over `options` when provided.
   */
  getOptions?: (row: Record<string, unknown>, rowIndex: number) => EditableColumnOption[];
  placeholder?: string;
  min?: number | string;
  max?: number | string;
  step?: number | string;
  /** Mark field required for `validate()`. */
  required?: boolean;
  /** Value placed in new rows created by the "Add row" button. */
  defaultValue?: unknown;
  /** Custom display function for `type: 'readonly'`. */
  render?: (value: unknown, row: Record<string, unknown>) => string;
}

export interface EditableTableConfig {
  columns: EditableColumn[];
  /** Show "Add row" button. Default: `true`. */
  addable?: boolean;
  /** Show per-row remove button. Default: `true`. */
  removable?: boolean;
  /** Label for the Add row button. Default: `'+ Add row'`. */
  addLabel?: string;
  /** Minimum rows — remove button is disabled at or below this count. Default: `0`. */
  minRows?: number;
}

export interface EditableTableValidateResult {
  valid: boolean;
  /** Errors keyed as `'${rowIndex}.${columnKey}'`. */
  errors: Record<string, string>;
}

// ── Component ──────────────────────────────────────────────────────────────

/**
 * Editable data table with inline `<input>`, `<select>`, and `<checkbox>` cells.
 *
 * Unlike `<b-table>` (display only) and `<b-data-table>` (server-fetched display),
 * this component manages an in-memory array of rows and renders each cell as
 * an editable control. It is designed for embedded editor scenarios such as
 * pricing rule grids, discount tiers, or any list of structured values.
 *
 * ## Usage
 * ```ts
 * const table = this.$<BEditableTable>('b-editable-table')!;
 * table.setConfig({
 *   columns: [
 *     { key: 'type',     label: 'Discount type',  type: 'select',
 *       options: [{ value: '0', label: 'Fixed' }, { value: '1', label: '%' }],
 *       defaultValue: '0', required: true },
 *     { key: 'value',    label: 'Value',           type: 'number', min: 0, required: true },
 *     { key: 'minQty',   label: 'Min qty',         type: 'number', min: 1, placeholder: 'Optional' },
 *   ],
 * });
 * table.setData(existingRules);
 *
 * // Listen for changes
 * table.addEventListener('cell-change', (e: CustomEvent) => {
 *   const { rowIndex, key, value } = e.detail;
 * });
 *
 * // Read data on Save
 * const rows = table.getData();
 * ```
 *
 * ## Events
 * | Event         | Detail                              |
 * |---------------|-------------------------------------|
 * | `cell-change` | `{ rowIndex, key, value, row }`     |
 * | `row-add`     | `{ rowIndex, row }`                 |
 * | `row-remove`  | `{ rowIndex, row }`                 |
 *
 * ## Design
 * Cell edits update the internal `_data` array **in-place** via event delegation —
 * no re-render on keystrokes, so focus and cursor position are always preserved.
 * `update()` is called only on structural changes (add / remove row, validate, setData).
 */
export class BEditableTable extends BaseComponent {
  private _config: EditableTableConfig | null = null;
  private _data: Record<string, unknown>[] = [];
  private _errors = new Map<string, string>(); // '${rowIdx}.${key}' → message

  // ── Styles ──────────────────────────────────────────────────────────────

  static get styles(): string {
    return `
      :host { display: block; }

      .editable-table-wrap { overflow-x: auto; }

      table {
        width: 100%;
        border-collapse: collapse;
        font-size: var(--b-text-sm, 0.8125rem);
      }
      th {
        text-align: left;
        padding: var(--b-space-sm, 0.5rem) var(--b-space-md, 0.75rem);
        font-weight: var(--b-font-weight-semibold, 600);
        color: var(--b-text-secondary);
        font-size: var(--b-text-xs, 0.6875rem);
        text-transform: uppercase;
        letter-spacing: 0.03125rem;
        border-bottom: 2px solid var(--b-border);
        white-space: nowrap;
      }
      th.col-remove { width: 2.5rem; }

      td {
        padding: var(--b-space-xs, 0.25rem) var(--b-space-md, 0.75rem);
        border-bottom: 1px solid var(--b-border);
        vertical-align: middle;
      }
      td:first-child { padding-left: 0; }
      td.col-remove { padding: var(--b-space-xs, 0.25rem); }

      .align-center { text-align: center; }
      .align-right  { text-align: right; }

      /* ── Cell inputs ── */
      .cell-input {
        box-sizing: border-box;
        width: 100%;
        padding: var(--b-space-2xs, 0.125rem) var(--b-space-sm, 0.5rem);
        border: var(--b-border-width, 1px) solid var(--b-border);
        border-radius: var(--b-radius, 0.375rem);
        font-size: var(--b-text-sm, 0.8125rem);
        font-family: inherit;
        background: var(--b-bg);
        color: var(--b-text);
        line-height: 1.5;
        transition: border-color var(--b-transition, 150ms ease);
        outline: none;
      }
      .cell-input:focus {
        border-color: var(--b-color-primary);
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--b-color-primary) 20%, transparent);
      }
      .cell-input--error { border-color: var(--b-color-danger); }
      .cell-input--error:focus {
        border-color: var(--b-color-danger);
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--b-color-danger) 20%, transparent);
      }
      .cell-error-msg {
        display: block;
        margin-top: 0.1rem;
        font-size: var(--b-text-xs, 0.6875rem);
        color: var(--b-color-danger);
      }

      input[type="number"].cell-input { width: auto; min-width: 5rem; }
      input[type="checkbox"].cell-input { width: auto; cursor: pointer; }

      /* ── Remove button ── */
      .btn-remove {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.75rem;
        height: 1.75rem;
        border: none;
        background: none;
        border-radius: var(--b-radius, 0.375rem);
        cursor: pointer;
        color: var(--b-text-muted);
        font-size: 1rem;
        line-height: 1;
        transition: background var(--b-transition, 150ms ease), color var(--b-transition, 150ms ease);
      }
      .btn-remove:not([disabled]):hover { background: var(--b-color-danger-subtle, #fee2e2); color: var(--b-color-danger); }
      .btn-remove[disabled] { opacity: var(--b-disabled-opacity, 0.4); cursor: not-allowed; }

      /* ── Footer add button ── */
      .editable-table-footer {
        margin-top: var(--b-space-sm, 0.5rem);
      }
      .btn-add {
        background: none;
        border: 1px dashed var(--b-border);
        border-radius: var(--b-radius, 0.375rem);
        padding: var(--b-space-2xs, 0.125rem) var(--b-space-md, 0.75rem);
        font-size: var(--b-text-sm, 0.8125rem);
        color: var(--b-text-secondary);
        cursor: pointer;
        transition: border-color var(--b-transition, 150ms ease), color var(--b-transition, 150ms ease);
      }
      .btn-add:hover { border-color: var(--b-color-primary); color: var(--b-color-primary); }

      /* ── Empty state ── */
      .empty-row td {
        text-align: center;
        padding: var(--b-space-xl, 2rem);
        color: var(--b-text-muted);
        font-style: italic;
      }
    `;
  }

  // ── Template ─────────────────────────────────────────────────────────────

  render(): string {
    if (!this._config) return '';

    const { columns, removable = true, addable = true, addLabel = '+ Add row', minRows = 0 } = this._config;
    const canRemove = removable;
    const atMin = this._data.length <= minRows;

    const headerCols = columns.map(c =>
      `<th style="${c.width ? `width:${c.width}` : ''}" class="${c.align ? 'align-' + c.align : ''}">${c.label}</th>`
    ).join('');

    const bodyRows = this._data.length === 0
      ? `<tr class="empty-row"><td colspan="${columns.length + (canRemove ? 1 : 0)}">No rows — use "${addLabel}" to add one.</td></tr>`
      : this._data.map((row, idx) => {
          const cells = columns.map(col => {
            const errKey = `${idx}.${col.key}`;
            const hasErr = this._errors.has(errKey);
            const errMsg = hasErr ? `<span class="cell-error-msg">${this._errors.get(errKey)}</span>` : '';
            return `<td class="${col.align ? 'align-' + col.align : ''}">${this._renderCell(col, row, idx, hasErr)}${errMsg}</td>`;
          }).join('');

          const removeBtn = canRemove
            ? `<td class="col-remove"><button class="btn-remove" data-action="remove" data-idx="${idx}" ${atMin ? 'disabled' : ''} title="Remove row">&times;</button></td>`
            : '';

          return `<tr data-idx="${idx}">${cells}${removeBtn}</tr>`;
        }).join('');

    const footer = addable
      ? `<div class="editable-table-footer"><button class="btn-add" data-action="add">${addLabel}</button></div>`
      : '';

    return `
      <div class="editable-table-wrap">
        <table>
          <thead>
            <tr>
              ${headerCols}
              ${canRemove ? '<th class="col-remove"></th>' : ''}
            </tr>
          </thead>
          <tbody id="tbody">${bodyRows}</tbody>
        </table>
      </div>
      ${footer}
    `;
  }

  private _renderCell(
    col: EditableColumn,
    row: Record<string, unknown>,
    idx: number,
    hasErr: boolean,
  ): string {
    const type = col.type ?? 'text';
    const errClass = hasErr ? ' cell-input--error' : '';
    const val = row[col.key];

    if (type === 'readonly') {
      if (col.render) return col.render(val, row);
      return val !== null && val !== undefined ? String(val) : '<span style="color:var(--b-text-muted)">—</span>';
    }

    if (type === 'checkbox') {
      const checked = val ? 'checked' : '';
      return `<input type="checkbox" class="cell-input${errClass}" data-key="${col.key}" data-idx="${idx}" ${checked}>`;
    }

    if (type === 'select') {
      const opts = col.getOptions ? col.getOptions(row, idx) : (col.options ?? []);
      const optHtml = opts.map(o =>
        `<option value="${_escAttr(o.value)}" ${String(val) === o.value ? 'selected' : ''}>${_escText(o.label)}</option>`
      ).join('');
      return `<select class="cell-input${errClass}" data-key="${col.key}" data-idx="${idx}">${optHtml}</select>`;
    }

    // text, number, date
    const htmlType = type === 'number' ? 'number' : type === 'date' ? 'date' : 'text';
    const minAttr = col.min !== undefined ? ` min="${col.min}"` : '';
    const maxAttr = col.max !== undefined ? ` max="${col.max}"` : '';
    const stepAttr = col.step !== undefined ? ` step="${col.step}"` : '';
    const phAttr = col.placeholder ? ` placeholder="${_escAttr(col.placeholder)}"` : '';
    const valAttr = val !== null && val !== undefined ? ` value="${_escAttr(String(val))}"` : '';

    return `<input
      type="${htmlType}"
      class="cell-input${errClass}"
      data-key="${col.key}"
      data-idx="${idx}"
      ${valAttr}${minAttr}${maxAttr}${stepAttr}${phAttr}
    >`;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  protected onUpdated(): void {
    const tbody = this.$<HTMLElement>('#tbody');
    const addBtn = this.$<HTMLButtonElement>('[data-action="add"]');

    if (tbody) {
      // Delegated listener — handles ALL cell inputs in one handler.
      // We deliberately do NOT call update() here to preserve focus.
      this.listen(tbody, 'input', (e: Event) => {
        const target = e.target as HTMLInputElement;
        const key = target.dataset.key;
        const idx = parseInt(target.dataset.idx ?? '', 10);
        if (!key || isNaN(idx) || !this._data[idx]) return;
        this._data[idx][key] = this._coerce(key, target.value);
        this._errors.delete(`${idx}.${key}`);
        // Clear the visible error class directly without re-render
        target.classList.remove('cell-input--error');
        target.closest('td')?.querySelector('.cell-error-msg')?.remove();
        this.emit('cell-change', { rowIndex: idx, key, value: this._data[idx][key], row: { ...this._data[idx] } });
      });

      // Separate 'change' handler for <select> and <input type="checkbox">
      this.listen(tbody, 'change', (e: Event) => {
        const target = e.target as HTMLInputElement | HTMLSelectElement;
        // 'input' already handles text/number/date — skip those to avoid double-fire
        if (target.tagName === 'INPUT' && target.type !== 'checkbox') return;

        const key = target.dataset.key;
        const idx = parseInt(target.dataset.idx ?? '', 10);
        if (!key || isNaN(idx) || !this._data[idx]) return;

        const value = target.type === 'checkbox'
          ? (target as HTMLInputElement).checked
          : target.value;

        this._data[idx][key] = this._coerce(key, value);
        this._errors.delete(`${idx}.${key}`);
        target.classList.remove('cell-input--error');
        target.closest('td')?.querySelector('.cell-error-msg')?.remove();
        this.emit('cell-change', { rowIndex: idx, key, value: this._data[idx][key], row: { ...this._data[idx] } });
      });

      this.listen(tbody, 'click', (e: Event) => {
        const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-action="remove"]');
        if (!btn || btn.disabled) return;
        const idx = parseInt(btn.dataset.idx ?? '', 10);
        this._removeRow(idx);
      });
    }

    if (addBtn) {
      this.listen(addBtn, 'click', () => this._addRow());
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Configure the table. Triggers a full re-render.
   * Safe to call multiple times — re-renders with existing data on each call.
   */
  setConfig(config: EditableTableConfig): void {
    this._config = config;
    this._errors.clear();
    this.update();
  }

  /**
   * Replace the table data. Triggers a full re-render.
   * Clears any existing validation errors.
   */
  setData(data: Record<string, unknown>[]): void {
    this._data = data.map(row => ({ ...row }));
    this._errors.clear();
    this.update();
  }

  /**
   * Return a copy of the current table data.
   * Reflects the latest in-memory state (includes edits not yet saved).
   */
  getData(): Record<string, unknown>[] {
    return this._data.map(row => ({ ...row }));
  }

  /**
   * Validate all cells marked `required: true`.
   * Highlights invalid cells inline and returns the result.
   * Call before reading `getData()` on save.
   *
   * @example
   * const { valid } = table.validate();
   * if (!valid) return;
   * const rows = table.getData();
   */
  validate(): EditableTableValidateResult {
    this._errors.clear();
    const columns = this._config?.columns ?? [];

    for (let idx = 0; idx < this._data.length; idx++) {
      const row = this._data[idx];
      for (const col of columns) {
        if (!col.required) continue;
        const val = row[col.key];
        const isEmpty = val === null || val === undefined || val === '' || val === false;
        if (isEmpty) {
          this._errors.set(`${idx}.${col.key}`, 'Required');
        }
      }
    }

    this.update();

    const errors: Record<string, string> = {};
    for (const [k, v] of this._errors) errors[k] = v;
    return { valid: this._errors.size === 0, errors };
  }

  /**
   * Clear all validation error highlights.
   */
  clearErrors(): void {
    this._errors.clear();
    this.update();
  }

  /**
   * Programmatically add an empty row (same as clicking the "Add row" button).
   */
  addRow(values?: Record<string, unknown>): void {
    this._addRow(values);
  }

  // ── Private actions ───────────────────────────────────────────────────────

  private _addRow(values?: Record<string, unknown>): void {
    const defaults: Record<string, unknown> = {};
    for (const col of this._config?.columns ?? []) {
      defaults[col.key] = col.defaultValue ?? (col.type === 'checkbox' ? false : col.type === 'number' ? 0 : '');
    }
    const newRow = { ...defaults, ...(values ?? {}) };
    this._data.push(newRow);
    const idx = this._data.length - 1;
    this.update();

    // Focus the first editable input in the new row after render
    requestAnimationFrame(() => {
      const input = this.$<HTMLElement>(`[data-idx="${idx}"]:not([type="checkbox"])`);
      input?.focus();
    });

    this.emit('row-add', { rowIndex: idx, row: { ...newRow } });
  }

  private _removeRow(idx: number): void {
    if (isNaN(idx) || idx < 0 || idx >= this._data.length) return;
    const row = { ...this._data[idx] };
    this._data.splice(idx, 1);

    // Re-key errors above the removed index
    const updated = new Map<string, string>();
    for (const [key, msg] of this._errors) {
      const [rowStr, ...rest] = key.split('.');
      const rowIdx = parseInt(rowStr, 10);
      if (rowIdx === idx) continue; // removed
      const newKey = rowIdx > idx ? `${rowIdx - 1}.${rest.join('.')}` : key;
      updated.set(newKey, msg);
    }
    this._errors = updated;

    this.update();
    this.emit('row-remove', { rowIndex: idx, row });
  }

  /**
   * Coerce a raw string cell value to the appropriate JS type based on column config.
   * Falls back to the string itself when no column is found.
   */
  private _coerce(key: string, value: unknown): unknown {
    const col = this._config?.columns.find(c => c.key === key);
    if (!col) return value;
    if (col.type === 'number') return value === '' ? null : Number(value);
    if (col.type === 'checkbox') return Boolean(value);
    return value;
  }
}

// ── Attribute escape helpers ──────────────────────────────────────────────

function _escAttr(val: string): string {
  return val.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function _escText(val: string): string {
  const el = document.createElement('span');
  el.textContent = val;
  return el.innerHTML;
}

define('b-editable-table', BEditableTable);
