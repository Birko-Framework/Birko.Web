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
 *
 * ## Filter type → API param mapping
 *
 * Most types send a single param: `?{name}=value`.
 *
 * Compound types render a pair of controls and send two params:
 *   - `range`      → `?{name}Min=&{name}Max=`        (numeric)
 *   - `date-range` → `?{name}From=&{name}To=`        (ISO dates)
 *
 * Multi-value types send a comma-separated string:
 *   - `multi-select` → `?{name}=a,b,c`
 *   - `tags`         → `?{name}=tag1,tag2`
 *
 * Boolean types only send the param when ON:
 *   - `switch` → `?{name}=true` (omitted when off)
 */
export interface FilterDef {
  /** Query param name. Auto-collected and sent to `table.setFilters()`. */
  name: string;
  /** Control type. */
  type:
    | 'search' | 'select' | 'text' | 'date'
    | 'switch' | 'number' | 'datetime'
    | 'date-range' | 'range'
    | 'multi-select' | 'tags' | 'segmented' | 'async-select';
  /** Placeholder text. For range/date-range, applied to the "from" control unless `placeholderTo` is set. */
  placeholder?: string;
  /** Placeholder for the "to" control of `range` / `date-range`. */
  placeholderTo?: string;
  /** Inline label. Used by `switch` (rendered next to the toggle). */
  label?: string;
  /** Static options for `select`, `multi-select`, `segmented`, `async-select` (initial set). */
  options?: FilterOption[];
  /**
   * Async loader for `async-select`. Called with the current type-ahead query
   * (debounced 300ms). Return matching options. The base wires this to the
   * `b-select` `search` event and replaces options on each result.
   */
  optionsLoader?: (query: string) => Promise<FilterOption[]>;
  /** Current/initial value. Read from page state via the getter. */
  value?: string;
  /** Enable type-ahead search inside a select dropdown. */
  searchable?: boolean;
  /** Show a clear button on a select. */
  clearable?: boolean;
  /** Disable the control (e.g. dependent select waiting for parent). */
  disabled?: boolean;
  /** Min bound for `number` and `range`. */
  min?: number;
  /** Max bound for `number` and `range`. */
  max?: number;
  /** Step for `number` and `range`. */
  step?: number;
  /** For `date-range`: override the "from" param name (defaults to `{name}From`). */
  nameFrom?: string;
  /** For `date-range`: override the "to" param name (defaults to `{name}To`). */
  nameTo?: string;
  /** For `range`: override the "min" param name (defaults to `{name}Min`). */
  nameMin?: string;
  /** For `range`: override the "max" param name (defaults to `{name}Max`). */
  nameMax?: string;
  /**
   * If `true`, this filter's value is **not** sent to the API.
   * Use for cascade-only filters (e.g. site selector that filters building options)
   * or path-parameter filters where the page changes `endpoint` directly.
   */
  local?: boolean;
}
