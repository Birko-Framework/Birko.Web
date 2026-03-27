# Birko.Web.Components — API Reference

Quick reference for all component attributes, methods, and events.

---

## Inputs

### `<b-button>`
| Attribute | Values |
|-----------|--------|
| `variant` | `primary` \| `secondary` \| `ghost` \| `danger` |
| `size` | `sm` \| (default) \| `lg` |
| `disabled` | boolean |
| `loading` | boolean (shows spinner, disables click) |

Slot: default (button label/content).

### `<b-input>`
| Attribute | Values |
|-----------|--------|
| `label` | string |
| `type` | `text` \| `email` \| `password` \| `number` \| `tel` \| `url` |
| `placeholder` | string |
| `value` | string |
| `name` | string |
| `error` | string (shows error message) |
| `disabled` | boolean |
| `required` | boolean |

| Event | Detail |
|-------|--------|
| `change` | `{ name, value }` |

### `<b-textarea>`
| Attribute | Values |
|-----------|--------|
| `label` | string |
| `name` | string |
| `value` | string |
| `placeholder` | string |
| `error` | string |
| `disabled` | boolean |
| `rows` | number |

| Event | Detail |
|-------|--------|
| `change` | `{ name, value }` |

### `<b-select>`
| Attribute | Values |
|-----------|--------|
| `label` | string |
| `name` | string |
| `value` | string |
| `placeholder` | string |
| `error` | string |
| `disabled` | boolean |
| `searchable` | boolean (enables combobox mode with filtering) |

| Method | Signature |
|--------|-----------|
| `setOptions` | `(options: { value: string; label: string }[]) => void` |
| `inputValue` | `string` (getter — current value) |

| Event | Detail |
|-------|--------|
| `change` | `{ name, value }` |

### `<b-multi-select>`
| Attribute | Values |
|-----------|--------|
| `label` | string |
| `name` | string |
| `placeholder` | string |
| `error` | string |
| `disabled` | boolean |
| `searchable` | boolean (enables search filtering in dropdown) |

| Method | Signature |
|--------|-----------|
| `setOptions` | `(options: { value: string; label: string }[]) => void` |
| `getSelected` | `() => string[]` |
| `setSelected` | `(values: string[]) => void` |

| Event | Detail |
|-------|--------|
| `change` | `{ name, values: string[] }` |

### `<b-checkbox>`
| Attribute | Values |
|-----------|--------|
| `checked` | boolean |
| `indeterminate` | boolean |
| `disabled` | boolean |
| `name` | string |
| `label` | string |

| Event | Detail |
|-------|--------|
| `change` | `{ name, checked }` |

### `<b-switch>`
| Attribute | Values |
|-----------|--------|
| `checked` | boolean |
| `disabled` | boolean |
| `name` | string |
| `label` | string |

| Event | Detail |
|-------|--------|
| `change` | `{ name, checked }` |

### `<b-radio>`
| Attribute | Values |
|-----------|--------|
| `checked` | boolean |
| `disabled` | boolean |
| `name` | string (shared across group) |
| `value` | string |
| `label` | string |

| Event | Detail |
|-------|--------|
| `change` | `{ name, value }` |

### `<b-search-input>`
| Attribute | Values |
|-----------|--------|
| `placeholder` | string |
| `value` | string |
| `debounce` | number (ms, default 300) |

| Event | Detail |
|-------|--------|
| `search` | `{ value }` |

### `<b-inline-edit>`
| Attribute | Values |
|-----------|--------|
| `value` | string |
| `placeholder` | string |
| `type` | `text` \| `number` |

| Event | Detail |
|-------|--------|
| `save` | `{ value, previousValue }` |

### `<b-file-upload>`
| Attribute | Values |
|-----------|--------|
| `accept` | MIME types (e.g. `image/*,.pdf`) |
| `multiple` | boolean |
| `max-size` | number (bytes) |
| `max-files` | number |
| `disabled` | boolean |
| `label` | string |
| `endpoint` | string (upload URL) |

| Method | Signature |
|--------|-----------|
| `getFiles` | `() => UploadFile[]` |
| `clear` | `() => void` |
| `removeFile` | `(id: string) => void` |

| Event | Detail |
|-------|--------|
| `files-added` | `{ files }` |
| `upload-progress` | `{ fileId, progress }` |
| `upload-complete` | `{ fileId, url? }` |
| `upload-error` | `{ fileId, error }` |
| `all-complete` | `{ succeeded, failed }` |
| `file-removed` | `{ fileId }` |

### `<b-form>`
| Attribute | Values |
|-----------|--------|
| `layout` | `vertical` \| `horizontal` |
| `validate-on` | `blur` \| `submit` |
| `readonly` | boolean |
| `disabled` | boolean |

| Method | Signature | Description |
|--------|-----------|-------------|
| `setSchema` | `(schema: FormSchema) => void` | Set form field definitions |
| `setValue` | `(name: string, value: unknown) => void` | Set a single field value |
| `setValues` | `(values: Record<string, unknown>) => void` | Set multiple field values |
| `getValues` | `() => Record<string, unknown>` | Get all field values |
| `validate` | `() => { valid, data, errors, groupErrors }` | Validate all fields |
| `validateGroup` | `(groupName: string) => FormResult` | Validate a specific group |
| `clearErrors` | `() => void` | Clear all validation errors |
| `reset` | `() => void` | Reset all fields to defaults |
| `setFieldError` | `(path: string, error: string) => void` | Set error on a specific field |
| `setFieldOptions` | `(path: string, options: { value, label }[]) => void` | Set select/multi-select options |
| `focusField` | `(path: string) => void` | Focus a specific field |

| Event | Detail |
|-------|--------|
| `change` | `{ path, value, data }` |
| `group-toggle` | `{ group, collapsed }` |

---

## Data

### `<b-table>`
| Attribute | Values |
|-----------|--------|
| `loading` | boolean (shows loading bar) |
| `empty-text` | string (default: "No data") |
| `striped` | boolean |
| `hoverable` | boolean |
| `sortable` | boolean |

| Method | Signature |
|--------|-----------|
| `setColumns` | `(columns: TableColumn[]) => void` |
| `setData` | `(data: Record<string, unknown>[]) => void` |
| `setIdField` | `(field: string) => void` |

| Event | Detail |
|-------|--------|
| `row-click` | `{ id }` |
| `action-click` | `{ action, id }` — for `[data-action]` buttons in cells |
| `sort` | `{ key, desc }` |

**Action pattern**: use `data-action="name"` on any element in a column render function. The table handles shadow DOM boundary crossing automatically.

```typescript
// Column render
{ key: 'actions', render: (_, row) =>
  `<b-button data-action="edit" variant="ghost" size="sm">Edit</b-button>
   <b-button data-action="delete" variant="ghost" size="sm">Delete</b-button>` }

// Listen
table.addEventListener('action-click', (e) => {
  const { action, id } = e.detail;
});
```

### `<b-data-table>`
Wraps `<b-table>` with auto-fetching, pagination, search, filters, selection, bulk actions, and row actions.

| Attribute | Values |
|-----------|--------|
| `loading` | boolean |

| Method | Signature | Description |
|--------|-----------|-------------|
| `setConfig` | `(config: DataTableConfig) => void` | Configure columns, endpoint, features |
| `load` | `(page?: number) => Promise<void>` | Fetch data from endpoint |
| `refresh` | `() => Promise<void>` | Reload current page |
| `getData` | `() => Record<string, unknown>[]` | Get all loaded data |
| `getRowById` | `(id: string) => Record<string, unknown> \| undefined` | Find row by ID |
| `getSelected` | `() => string[]` | Get selected row IDs |
| `clearSelection` | `() => void` | Clear all selections |
| `selectAll` | `() => void` | Select all rows on current page |

**DataTableConfig**:
```typescript
{
  endpoint: string;          // API URL
  columns: TableColumn[];    // Column definitions
  apiClient: ApiClient;      // HTTP client
  pageSize?: number;         // Default 20
  dataKey?: string;          // Key in response for data array
  totalKey?: string;         // Key in response for total count
  params?: Record<string, string>;
  flatArray?: boolean;       // Response is flat array (client-side pagination)
  idField?: string;          // Row identity field (default: 'id' or 'guid')
  searchable?: boolean;
  searchPlaceholder?: string;
  searchDebounce?: number;
  filters?: ColumnFilter[];
  actions?: ToolbarAction[];
  selectable?: boolean;
  bulkActions?: BulkAction[];
  rowActions?: RowAction[];  // Dropdown menu actions per row
  exportable?: boolean;
  exportFormats?: ExportOption[];
}
```

| Event | Detail |
|-------|--------|
| `row-click` | Full row object |
| `action-click` | `{ action, id, row }` — for `[data-action]` buttons in cells |
| `row-action` | `{ action, id, row }` — from rowActions dropdown menu |
| `toolbar-action` | `{ action }` |
| `bulk-action` | `{ action, selected, count }` |
| `selection-change` | `{ selected, count }` |
| `sort` | `{ key, desc }` |
| `export` | `{ format, selected, filters }` |

**Action pattern** (preferred over composedPath delegation):
```typescript
// In column render — use data-action, no need for data-id or CSS classes
{ key: 'actions', render: (_, row) =>
  `<b-button data-action="edit" variant="ghost" size="sm">Edit</b-button>` }

// In page onMount — row data included automatically
table.addEventListener('action-click', (e: CustomEvent) => {
  const { action, id, row } = e.detail;
  if (action === 'edit') openEditModal(row);
  if (action === 'delete') confirmDelete(id);
});
```

### `<b-pagination>`
| Attribute | Values |
|-----------|--------|
| `page` | number |
| `total-pages` | number |
| `total-count` | number |

| Event | Detail |
|-------|--------|
| `page-change` | `{ page }` |

### `<b-badge>`
| Attribute | Values |
|-----------|--------|
| `variant` | `primary` \| `success` \| `warning` \| `danger` \| `neutral` |
| `size` | `sm` \| (default) |

Slot: default (badge text).

### `<b-chart>`
| Attribute | Values |
|-----------|--------|
| `type` | `line` \| `bar` \| `area` \| `pie` \| `donut` \| `scatter` |
| `height` | string (CSS value) |
| `legend` | boolean |
| `animate` | boolean |
| `renderer` | `svg` \| `canvas` |

| Method | Signature |
|--------|-----------|
| `setData` | `(data: ChartData) => void` |
| `setOptions` | `(options: ChartOptions) => void` |
| `appendPoint` | `(seriesId: string, point: DataPoint) => void` |

| Event | Detail |
|-------|--------|
| `point-click` | `{ seriesId, index, point }` |

---

## Layout

### `<b-card>`
| Attribute | Values |
|-----------|--------|
| `header` | string (card title) |
| `padding` | `none` \| (default) |

Slots: default (body), `header` (custom header).

### `<b-modal>`
| Attribute | Values |
|-----------|--------|
| `title` | string |
| `size` | `sm` \| (default) \| `lg` |

| Method | Signature |
|--------|-----------|
| `open` | `() => void` |
| `close` | `() => void` |

| Event | Detail |
|-------|--------|
| `close` | (none) |

Slots: default (body), `footer` (action buttons).

### `<b-drawer>`
| Attribute | Values |
|-----------|--------|
| `title` | string |
| `size` | `sm` \| (default) \| `lg` |
| `modal` | boolean |

| Method | Signature |
|--------|-----------|
| `open` | `() => void` |
| `close` | `() => void` |

| Event | Detail |
|-------|--------|
| `close` | (none) |

Slots: default (body), `footer`.

### `<b-confirm-dialog>`
| Attribute | Values |
|-----------|--------|
| `title` | string |
| `message` | string |
| `confirm-text` | string |
| `cancel-text` | string |
| `variant` | `danger` \| (default) |

| Method | Signature | Description |
|--------|-----------|-------------|
| `show` | `() => Promise<boolean>` | Show dialog, resolves `true` on confirm, `false` on cancel |

### `<b-tabs>`
| Attribute | Values |
|-----------|--------|
| `active` | string (active tab id) |

| Method | Signature |
|--------|-----------|
| `setTabs` | `(tabs: { id: string; label: string }[]) => void` |

| Event | Detail |
|-------|--------|
| `tab-change` | `{ tab }` |

Slots: named slots matching tab IDs (e.g. `slot="tab-1"`).

### `<b-split-panel>`
| Attribute | Values |
|-----------|--------|
| `master-width` | CSS value (e.g. `18rem`, `2fr`) |
| `detail-width` | CSS value |
| `collapse-at` | number (px breakpoint) |
| `gap` | CSS value |

Slots: `master`, `detail`.

### `<b-dropdown-menu>`
| Attribute | Values |
|-----------|--------|
| `align` | `left` \| `right` |

| Method | Signature |
|--------|-----------|
| `setItems` | `(items: DropdownItem[]) => void` |
| `toggle` | `() => void` |
| `show` | `() => void` |
| `hide` | `() => void` |

**DropdownItem**: `{ id, label, icon?, variant?: 'danger', divider?: boolean }`

| Event | Detail |
|-------|--------|
| `select` | `{ id }` |

Slot: `trigger` (element that opens the menu).

### `<b-tooltip>`
| Attribute | Values |
|-----------|--------|
| `text` | string |
| `position` | `top` \| `bottom` \| `left` \| `right` |

Slot: default (trigger element).

---

## Navigation

### `<b-sidebar>`
| Attribute | Values |
|-----------|--------|
| `collapsed` | boolean |
| `active` | string (active item id) |

| Method | Signature |
|--------|-----------|
| `setItems` | `(items: SidebarItem[]) => void` |

| Event | Detail |
|-------|--------|
| `toggle` | `{ collapsed }` |

Slot: `brand`.

### `<b-breadcrumb>`
| Method | Signature |
|--------|-----------|
| `setItems` | `(items: { label: string; href?: string }[]) => void` |

### `<b-ribbon>`
| Attribute | Values |
|-----------|--------|
| `active` | string (active tab id) |
| `expanded` | boolean |
| `pinned` | boolean |

| Method | Signature |
|--------|-----------|
| `setTabs` | `(tabs: RibbonTab[]) => void` |
| `setContextActions` | `(items: RibbonItem[]) => void` |
| `expand` / `collapse` / `toggleExpand` | `() => void` |
| `pin` / `unpin` / `togglePin` | `() => void` |

| Event | Detail |
|-------|--------|
| `tab-change` | `{ tab }` |
| `item-click` | `{ id, moduleId?, optionId? }` |
| `expand` | `{ expanded }` |
| `pin` | `{ pinned }` |

### `<b-tree-menu>`
| Attribute | Values |
|-----------|--------|
| `active` | string (active item id) |

| Method | Signature |
|--------|-----------|
| `setItems` | `(items: TreeMenuItem[]) => void` |
| `expandAll` / `collapseAll` | `() => void` |
| `expand` / `collapse` / `toggle` | `(id: string) => void` |
| `reveal` | `(id: string) => void` (expand all ancestors) |

**TreeMenuItem**: `{ id, label, icon?, href?, badge?, disabled?, expanded?, children?: TreeMenuItem[] }`

| Event | Detail |
|-------|--------|
| `select` | `{ id, item }` |
| `toggle` | `{ id, expanded }` |

---

## Feedback

### `toast` (singleton, not a tag)
```typescript
import { toast } from 'birko-web-components';

toast.success('Saved');
toast.error('Failed');
toast.warning('Careful');
toast.info('FYI');
toast.notify('Custom', { variant: 'success', durationMs: 5000, href: '/link' });
toast.configure({ position: 'top-right', maxVisible: 5 });
```

### `<b-spinner>`
| Attribute | Values |
|-----------|--------|
| `size` | `sm` \| (default) \| `lg` |

### `<b-empty>`
| Attribute | Values |
|-----------|--------|
| `icon` | string (emoji/icon) |
| `message` | string |

Slot: default (action buttons below message).

### `<b-skeleton>`
| Attribute | Values |
|-----------|--------|
| `type` | `text` \| `circle` \| `rect` \| `table` |
| `width` | CSS value |
| `height` | CSS value |
| `rows` | number (for table type) |
| `columns` | number (for table type) |

---

## Command

### `<b-command-palette>`
Global command palette (Ctrl+K). Used via `command-provider.ts`:

```typescript
import { registerProvider } from 'birko-web-components/command';

registerProvider({
  id: 'my-provider',
  label: 'Search...',
  priority: 10,
  search: async (query) => [{ id, label, href?, onSelect? }],
});
```
