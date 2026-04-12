/**
 * Option for select-type filters.
 */
export interface FilterOption {
  value: string;
  label: string;
}

/**
 * Declarative filter definition.
 *
 * Used by `BaseCrudPage.filterDefs` to render a filter row. The base class
 * renders the control, populates options, sets values, wires change events,
 * and auto-collects values into `table.setFilters()`.
 */
export interface FilterDef {
  /** Query param name. Auto-collected and sent to `table.setFilters()`. */
  name: string;
  /** Control type. */
  type: 'search' | 'select' | 'text' | 'date';
  /** Placeholder text. */
  placeholder?: string;
  /** Options for `select` type. Re-evaluated on each render via the getter. */
  options?: FilterOption[];
  /** Current/initial value. Read from page state via the getter. */
  value?: string;
  /** Enable type-ahead search inside a select dropdown. */
  searchable?: boolean;
  /** Show a clear button on a select. */
  clearable?: boolean;
  /** Disable the control (e.g. dependent select waiting for parent). */
  disabled?: boolean;
  /**
   * If `true`, this filter's value is **not** sent to the API.
   * Use for cascade-only filters (e.g. site selector that filters building options)
   * or path-parameter filters where the page changes `endpoint` directly.
   */
  local?: boolean;
}
