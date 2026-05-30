# Birko.Web.Components

Shadow DOM web components for building data-driven UIs. Built on `Birko.Web.Core`. **54 components** across inputs, layout, data, feedback, navigation, and command palette.

## Install

```html
<!-- Design tokens (required) -->
<link rel="stylesheet" href="css/tokens.css" />

<!-- Optional reset -->
<link rel="stylesheet" href="css/reset.css" />
```

```typescript
import 'birko-web-components';  // registers all components

// Or import individually:
import { BModal, BDataTable, toast } from 'birko-web-components';
```

## Packages

```
birko-web-components              # main (registers all components)
birko-web-components/form-utils   # showFormError, loadOptions, wireSearchableSelect
```

## Internationalization

All built-in user-facing strings (labels, ARIA labels, button captions) use the unified i18n system from `birko-web-core`. Each component renders strings through `this.label(attrName, i18nKey, fallback, params?)` — explicit `label-*` attributes win over the global lookup, which in turn falls back to English.

**Canonical key namespace:** `bwc.*` (Birko Web Components). The English bundle ships at `locales/en.json` — copy it as a starter for other locales. Examples: `bwc.common.close`, `bwc.palette.placeholder`, `bwc.pagination.prev`/`bwc.pagination.next`, `bwc.fileUpload.dropHint`, `bwc.toast.dismiss`.

```typescript
import { useI18n, I18n } from 'birko-web-core';

const myI18n = new I18n('sk');
await myI18n.loadBundle('sk', skBundle);
useI18n(myI18n);          // every BaseComponent re-renders automatically
```

**Per-instance override (unchanged):** any component still honours an explicit `label-*` attribute, so you can pin a single instance to a custom string without touching the global bundle:

```html
<b-pagination label-prev="Späť" label-next="Ďalej"></b-pagination>
```

**Legacy shims kept for back-compat:**
- `BForm.setTranslate(fn)` — still works; new code should populate `common.required`/`common.minLength`/etc. via the global singleton.
- `BDatePicker.setLocale({months, days, today, clear})` / `BDatetimePicker.setLocale(...)` / `BTime.setLocale(...)` — still win over global i18n for per-class month/day overrides.

---

## Inputs

### b-input

```html
<b-input label="Email" type="email" name="email" placeholder="you@example.com" required></b-input>
```

Attributes: `label`, `type` (text|email|number|password|search|tel|url), `name`, `value`, `placeholder`, `error`, `disabled`, `required`
Emits: `change` → `{ name, value }`

### b-select

```html
<b-select label="Status" name="status" placeholder="Select…"></b-select>
```

```typescript
(el as BSelect).setOptions([
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]);
```

Emits: `change` → `{ name, value }`

### b-button

```html
<b-button variant="primary">Save</b-button>
<b-button variant="secondary">Cancel</b-button>
<b-button variant="ghost">Edit</b-button>
<b-button variant="danger">Delete</b-button>
<b-button variant="primary" loading>Saving…</b-button>
```

Attributes: `variant`, `size` (sm|md|lg), `disabled`, `loading`

### b-checkbox / b-switch / b-radio

```html
<b-checkbox name="agree" label="I agree"></b-checkbox>
<b-switch name="notifications" label="Email notifications" checked></b-switch>
<b-radio name="plan" value="pro" label="Pro"></b-radio>
```

### b-textarea

```html
<b-textarea label="Notes" name="notes" rows="4"></b-textarea>
```

### b-multi-select

```html
<b-multi-select label="Tags" name="tags"></b-multi-select>
```

```typescript
(el as BMultiSelect).setOptions([{ value: 'iot', label: 'IoT' }, ...]);
```

### b-tag-input

Freeform multi-value input — fills the gap between `b-input` (plain comma-separated string) and `b-multi-select` (dropdown-driven creatable). Pressing **Enter** or **Tab** commits the typed text as a tag; **Backspace** on an empty input removes the last tag; **paste** splits on delimiters (default `,`, newline, tab).

```html
<b-tag-input label="Invoice numbers" name="invoices"
             placeholder="Enter or paste invoice numbers"></b-tag-input>

<!-- With limits -->
<b-tag-input label="Keywords" name="keywords"
             max-count="10"
             separators=", ;|"
             value="alpha,beta"></b-tag-input>
```

```typescript
import { BTagInput } from 'birko-web-components';

const el = document.querySelector('b-tag-input') as BTagInput;
el.setTags(['alpha', 'beta']);
el.getTags();                       // ['alpha', 'beta']
el.clear();

el.addEventListener('change', e => {
  const detail = (e as CustomEvent).detail as { name: string; tags: string[]; value: string };
  console.log(detail.tags);
});
```

Attributes: `label`, `name`, `value` (comma-separated), `placeholder`, `separators` (default `,`/`\n`/`\t`), `max-count`, `allow-duplicates`, `error`, `disabled`, `required`, `hint`
Emits: `change`, `add`, `remove`, `reject` (duplicate or max-count hit)

### b-search-input

```html
<b-search-input placeholder="Search devices…" debounce="300"></b-search-input>
```

Emits: `search` → `{ value }` (debounced)

### b-file-upload

```html
<b-file-upload accept="image/*,.pdf" multiple max-size="10485760" endpoint="api/upload"></b-file-upload>
```

### b-inline-edit

```html
<b-inline-edit value="Device Alpha" placeholder="Enter name"></b-inline-edit>
```

Emits: `save` → `{ value }`, `cancel`

### b-range

Slider/input for single values or from-to ranges. Supports number, int, and percent value types.

```html
<!-- Single slider + input (default) -->
<b-range label="Volume" name="volume" min="0" max="100" step="1"></b-range>

<!-- Percent: user sees 0-100, stored as 0-1 -->
<b-range label="Opacity" name="opacity" value-type="percent" min="0" max="100"></b-range>

<!-- Range mode: from-to -->
<b-range label="Price range" name="price" mode="range" min="0" max="1000" step="10"></b-range>

<!-- Slider only -->
<b-range label="Brightness" name="brightness" display="slider" min="0" max="255"></b-range>

<!-- Input only -->
<b-range label="Temperature" name="temp" display="input" min="-40" max="80" step="0.5"></b-range>
```

Attributes: `label`, `name`, `min`, `max`, `step`, `mode` (single|range), `display` (both|slider|input), `value-type` (number|int|percent), `error`, `disabled`, `required`
Emits: `change` → `{ name, value }` (single) or `{ name, value: { from, to } }` (range)

### b-form

Schema-driven form builder with validation.

```typescript
const form = document.querySelector('#my-form') as BForm;

form.setSchema({
  name: 'root',
  children: [
    { name: 'email', type: 'email', label: 'Email', required: true },
    { name: 'password', type: 'password', label: 'Password', required: true,
      rules: [{ type: 'minLength', value: 8 }] },
    { name: 'confirmPassword', type: 'password', label: 'Confirm',
      rules: [{ type: 'match', value: 'password', message: 'Passwords must match' }] },
  ],
});

const { valid, data, errors } = form.validate();
if (!valid) return;
// data.email, data.password

// Report server errors:
form.setFieldError('email', 'Email already taken');

// Dynamic field options (select / multi-select):
form.setFieldOptions('group.fieldName', [{ value: 'a', label: 'Option A' }]);

// Enable/disable individual fields at runtime:
form.setFieldDisabled('group.addressId', true);

// React to specific field changes (cascading selects):
// NOTE: callbacks fire only on user interaction, not on programmatic setValues()
// Returns an unsubscribe function — call it in onUnmount() or when the form is destroyed.
const unsub = form.onFieldChange('group.customerId', (value, data) => {
  // value = new field value, data = full form data
  loadAddresses(value);
  form.setValues({ group: { name: '...' } }); // safe — won't re-trigger callbacks
});
// Later:
unsub();

// Focus a field:
form.focusField('email');
```

**Validation rule types:** `required`, `minLength`, `maxLength`, `min`, `max`, `range`, `pattern`, `email`, `match`, `custom`
**Field types:** `text`, `email`, `number`, `password`, `percent`, `textarea`, `select`, `multi-select`, `checkbox`, `switch`, `radio`, `search`, `range`, `file`, `custom`
**Per-field schema properties:** `disabled`, `searchable`, `creatable`, `fullWidth`, `hidden`, `hint`, `placeholder`, `rules`, `options`

### b-date-picker

Calendar dropdown date picker with locale support.

```html
<b-date-picker label="Start date" name="start" min="2026-01-01" max="2026-12-31"></b-date-picker>

<!-- Native browser date input (fallback): -->
<b-date-picker label="Date" name="d" native></b-date-picker>
```

```typescript
// Set locale once on app init:
BDatePicker.setLocale({ months: [...], days: [...], today: 'Dnes', clear: 'Vymazať' });
```

Attributes: `label`, `name`, `value` (ISO yyyy-MM-dd), `min`, `max`, `native`, `placeholder`, `error`, `disabled`, `required`, `hint`
Emits: `change` → `{ name, value }`

### b-datetime-picker

Combined date + time picker. Same locale API as `b-date-picker` (`BDatetimePicker.setLocale({...})`).

```html
<b-datetime-picker label="Starts at" name="startsAt" value="2026-04-22T09:00"></b-datetime-picker>
```

Attributes: `label`, `name`, `value` (ISO `yyyy-MM-ddTHH:mm`), `min`, `max`, `error`, `disabled`, `required`, `hint`

### b-time

Time-only picker with hour/minute steppers.

```html
<b-time label="Open at" name="openAt" value="08:30" step="15"></b-time>
```

Attributes: `label`, `name`, `value` (`HH:mm`), `step` (minutes), `error`, `disabled`, `required`

### b-segmented

Single-select segmented control — picks one of several mutually exclusive values, rendered as connected buttons. Use it where a `<b-option-group>` would feel overkill (no icons, no per-option styling) or where a `<b-select>` would feel heavy (3–5 short choices).

```html
<b-segmented label="View" name="view" value="grid"></b-segmented>
```

```typescript
(el as BSegmented).setOptions([
  { value: 'grid', label: 'Grid' },
  { value: 'list', label: 'List' },
]);
```

Attributes: `label`, `name`, `value`, `disabled`, `hint`
Emits: `change` → `{ name, value }`

### b-markdown-editor

Split-view markdown editor with toolbar, source/preview/split modes, Word HTML paste cleanup, and a pluggable renderer.

```html
<b-markdown-editor name="content" mode="split"></b-markdown-editor>
```

```typescript
import { BMarkdownEditor, type MarkdownRenderer } from 'birko-web-components';

const editor = document.querySelector('b-markdown-editor') as BMarkdownEditor;
editor.setValue('# Hello\n\nSome **bold** text.');
editor.getValue();

// Override the default renderer (e.g. plug in marked / markdown-it):
editor.setRenderer(((md: string) => myRenderer.render(md)) as MarkdownRenderer);
```

**Toolbar:** bold, italic, strikethrough, **highlight** (`==text==` → `<mark>`), **superscript** (`^text^` → `<sup>`), **subscript** (`~text~` → `<sub>`), **heading dropdown (H1–H6)**, blockquote, code, bullet/numbered/**task** lists (`- [ ] task` checkboxes), link, image, **table** (GFM template), horizontal rule.

Attributes: `value`, `mode` (`split` | `source` | `preview`), `placeholder`, `disabled`
Emits: `change` → `{ name, value }`

### b-option-group

Segmented button group for selecting a single value from a small set of options.

```html
<b-option-group label="Theme" name="theme" value="light"></b-option-group>
```

```typescript
(el as BOptionGroup).setOptions([
  { value: 'light', label: 'Light', icon: '☀' },
  { value: 'dark', label: 'Dark', icon: '☾' },
]);
```

Attributes: `label`, `name`, `value`, `disabled`, `hint`
Emits: `change` → `{ name, value }`

Grouped form with grid layout:

```typescript
form.setSchema({
  name: 'root',
  children: [
    {
      name: 'hardware',
      label: 'Hardware',
      layout: 'grid',     // 'stack' | 'grid' | 'inline'
      children: [
        { name: 'manufacturer', type: 'text', label: 'Manufacturer' },
        { name: 'model', type: 'text', label: 'Model' },
      ],
    },
  ],
});
// Access as: data.hardware?.manufacturer
```

---

## Layout

### b-card

```html
<b-card header="Settings" padding="lg">
  <!-- content -->
  <b-button slot="actions" variant="ghost">Edit</b-button>
</b-card>
```

Attributes: `header`, `padding` (none|sm|lg|xl)
Slots: default (body), `actions` (header right)

### b-modal

```html
<b-modal id="my-modal" title="Add Item" size="md">
  <b-form id="form"></b-form>
  <footer slot="footer">
    <b-button variant="secondary" id="cancel">Cancel</b-button>
    <b-button variant="primary" id="save">Create</b-button>
  </footer>
</b-modal>
```

```typescript
(document.querySelector('#my-modal') as BModal).open();
```

Attributes: `title`, `size` (sm|md|lg|xl|xxl)
Slots: default (body), `footer`
Methods: `open()`, `close()`
Emits: `close`

### b-drawer

```html
<b-drawer id="settings-drawer" title="Settings" size="md" modal>
  <!-- content -->
</b-drawer>
```

Same API as `b-modal`. Use for panels where the user needs to see the background content.

### b-tabs

```html
<b-tabs id="tabs">
  <div slot="general">General tab content</div>
  <div slot="advanced">Advanced tab content</div>
</b-tabs>
```

```typescript
(document.querySelector('#tabs') as BTabs).setTabs([
  { id: 'general', label: 'General' },
  { id: 'advanced', label: 'Advanced' },
]);
```

Emits: `tab-change` → `{ id }`

### b-confirm-dialog

```typescript
const dialog = document.querySelector('#confirm') as BConfirmDialog;
const confirmed = await dialog.show();
if (confirmed) deleteItem();
```

```html
<b-confirm-dialog
  id="confirm"
  title="Delete device?"
  message="This action cannot be undone."
  confirm-text="Delete"
  variant="danger">
</b-confirm-dialog>
```

### b-dropdown-menu

```html
<b-dropdown-menu align="right">
  <b-button slot="trigger" variant="ghost">Actions ▾</b-button>
</b-dropdown-menu>
```

```typescript
(el as BDropdownMenu).setItems([
  { id: 'edit', label: 'Edit', icon: '✏' },
  { id: 'duplicate', label: 'Duplicate' },
  { divider: true },
  { id: 'delete', label: 'Delete', variant: 'danger' },
]);
el.addEventListener('select', e => console.log(e.detail.id));
```

### b-tooltip

```html
<b-tooltip text="Refresh data" position="top">
  <b-button slot="trigger" variant="ghost">⟳</b-button>
</b-tooltip>
```

### b-split-panel

Master-detail split layout with responsive collapse.

```html
<b-split-panel master-width="20rem" detail-width="1fr" gap="1rem">
  <div slot="master">List panel</div>
  <div slot="detail">Detail panel</div>
</b-split-panel>
```

Attributes: `master-width`, `detail-width`, `collapse-at`, `gap`
Slots: `master`, `detail`

### b-chat

Chat transcript surface with message list + composer. Useful for AI/agent UIs, support inboxes, and team chat panels.

```typescript
import { BChat, type ChatMessage, type ChatConfig } from 'birko-web-components';

const chat = document.querySelector('b-chat') as BChat;

chat.setConfig({
  placeholder: 'Ask anything…',
  showAvatar: true,
} satisfies ChatConfig);

chat.setMessages([
  { id: '1', role: 'user',      content: 'Hi there' },
  { id: '2', role: 'assistant', content: 'How can I help?' },
]);

chat.appendMessage({ id: '3', role: 'user', content: 'Tell me a joke' });

chat.addEventListener('send', e => {
  const text = (e as CustomEvent<{ value: string }>).detail.value;
  // ... call API, append assistant reply
});
```

Emits: `send` → `{ value }`, `message-click` → `{ message }`

---

## Data

### b-table

Client-side data table with sort, row-click, and per-row action buttons.
Use for local data (detail sub-tables, dashboard, preview). For server-side paginated data, use `b-data-table`.

**Attributes:** `striped`, `hoverable`, `label-no-data`, `loading`

**Methods:** `setColumns(columns)`, `setData(data)`, `setIdField(field)`

**Events:** `row-click` (`{ id }`), `action-click` (`{ action, id }`), `sort` (`{ key, desc }`)

```typescript
// Typed access via child<T>() (preferred)
const table = this.child<BTable>('#table');
table?.setColumns([
  { key: 'name', label: 'Name', sortable: true },
  { key: 'status', label: 'Status', render: v => `<b-badge variant="success">${v}</b-badge>` },
  { key: 'id', label: '', width: '3rem', render: () =>
    `<b-button variant="ghost" size="sm" data-action="remove">&times;</b-button>` },
]);
table?.setData(rows);

// Per-row actions — b-table emits action-click with { action, id }
this.shadowRoot?.addEventListener('action-click', ((e: CustomEvent) => {
  if (e.detail.action === 'remove') this._remove(e.detail.id);
}) as EventListener);
```

**TableColumn — editable columns** (`editable` property):

The `editable` property on a `TableColumn` definition enables click-to-edit on that column when used inside `<b-data-table>`. `<b-table>` renders the required markup hooks but does not activate the editing logic itself.

```typescript
table?.setColumns([
  { key: 'name', label: 'Name' },
  // Plain text input on click:
  { key: 'sku',      label: 'SKU',      editable: 'text' },
  // Numeric input:
  { key: 'qty',      label: 'Qty',      editable: 'number' },
  // Date picker:
  { key: 'dueDate',  label: 'Due date', editable: 'date' },
  // Dropdown with static options:
  { key: 'status', label: 'Status', editable: 'select',
    options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }] },
  // Dropdown with per-row dynamic options:
  { key: 'warehouseId', label: 'Warehouse', editable: 'select',
    getOptions: row => warehousesByZone[row.zoneId as string] ?? [] },
]);
```

`TableColumnOption`: `{ value: string; label: string }`

### b-data-table

Auto-fetching table with toolbar, search, filters, pagination, bulk actions, and optional inline cell editing.

```typescript
(el as BDataTable).setConfig({
  endpoint: 'api/devices',
  apiClient: api,
  pageSize: 20,
  columns: [
    { key: 'name', label: 'Name', sortable: true },
    { key: 'status', label: 'Status', render: v => `<b-badge>${v}</b-badge>` },
  ],
  searchable: true,
  searchPlaceholder: 'Search devices…',
  actions: [
    { id: 'add', label: '+ Add', variant: 'primary' },
  ],
  rowActions: [
    { id: 'edit', label: 'Edit' },
    { id: 'delete', label: 'Delete', variant: 'danger' },
  ],
});
el.load();
```

**Emits:**

| Event | Detail | When |
|-------|--------|------|
| `action` | `{ id }` | Toolbar action button clicked |
| `row-click` | `{ row }` | Row clicked (non-interactive area) |
| `row-action` | `{ actionId, row }` | Per-row action clicked |
| `cell-edit` | `CellEditDetail` | Inline cell committed (Enter/blur) |

**Inline cell editing:**

Add `editable` to any column definition. Clicking a cell activates an input in place; Enter or blur commits, Escape cancels.

```typescript
columns: [
  { key: 'price',  label: 'Price',  editable: 'number' },
  { key: 'status', label: 'Status', editable: 'select',
    options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }] },
]
```

```typescript
el.addEventListener('cell-edit', ((e: CustomEvent<CellEditDetail>) => {
  const { id, key, oldValue, newValue, row } = e.detail;
  // patch to server — optimistic update already applied to table data
  api.patch(`api/products/${id}`, { [key]: newValue });
}) as EventListener);
```

```typescript
interface CellEditDetail {
  id: string;           // row id
  key: string;          // column key
  oldValue: unknown;
  newValue: unknown;
  row: Record<string, unknown>;  // full row after edit
}
```

The table applies optimistic in-place updates to its local `_allData` immediately on commit — no reload needed for read-back.

### b-editable-table

A fully editable table for CRUD-style data entry where every cell is an input. Unlike the click-to-edit pattern in `b-data-table`, all cells are always in edit mode — ideal for pricing rules, line-item forms, configuration grids, etc.

```typescript
import { BEditableTable, type EditableColumn, type EditableTableConfig } from 'birko-web-components';

const table = document.querySelector('#rules-table') as BEditableTable;

table.setConfig({
  columns: [
    { key: 'name',       label: 'Name',     type: 'text',   required: true },
    { key: 'minQty',     label: 'Min qty',  type: 'number', min: 0 },
    { key: 'discount',   label: 'Discount', type: 'number', min: 0, max: 100, step: 0.1 },
    { key: 'validFrom',  label: 'From',     type: 'date' },
    { key: 'category',   label: 'Category', type: 'select',
      options: [{ value: 'A', label: 'Category A' }, { value: 'B', label: 'Category B' }] },
    { key: 'active',     label: 'Active',   type: 'checkbox' },
  ],
  allowAdd: true,
  allowRemove: true,
  addLabel: '+ Add rule',
  defaultRow: { active: true, minQty: 1 },
});

table.setData(existingRows);

// On save:
const { valid, errors, data } = table.validate();
if (valid) {
  await api.put('api/pricing/rules', data);
}
```

**EditableColumn:**

| Property | Type | Description |
|----------|------|-------------|
| `key` | `string` | Data property name |
| `label` | `string` | Column header |
| `type` | `'text'\|'number'\|'date'\|'select'\|'checkbox'` | Input type |
| `required?` | `boolean` | Mark as required (validated by `validate()`) |
| `min?` | `number` | Minimum for number inputs |
| `max?` | `number` | Maximum for number inputs |
| `step?` | `number` | Step for number inputs |
| `placeholder?` | `string` | Input placeholder |
| `width?` | `string` | Column width (CSS value) |
| `options?` | `EditableColumnOption[]` | Static option list for select columns |
| `getOptions?` | `(row) => EditableColumnOption[]` | Per-row dynamic options (takes precedence) |

**EditableTableConfig:**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `columns` | `EditableColumn[]` | — | Column definitions |
| `allowAdd?` | `boolean` | `false` | Show "Add row" button |
| `allowRemove?` | `boolean` | `false` | Show remove button per row |
| `addLabel?` | `string` | `'+ Add row'` | Add button label |
| `defaultRow?` | `object` | `{}` | Default values for new rows |

**Methods:**

```typescript
table.setData(rows);                       // Load initial data
table.getData(): Record<string, unknown>[] // Get current data (including edits)
table.validate(): EditableTableValidateResult  // Validate all required fields
```

**EditableTableValidateResult:**

```typescript
interface EditableTableValidateResult {
  valid: boolean;
  errors: Map<string, string>;   // key: `${rowIndex}.${columnKey}` → error message
  data: Record<string, unknown>[];
}
```

**Events:**

| Event | Detail | When |
|-------|--------|------|
| `row-add` | `{ row }` | New row added |
| `row-remove` | `{ index, row }` | Row removed |
| `cell-change` | `{ index, key, value, row }` | Cell value changed |

Inputs fire `cell-change` on every keystroke (`input` event) and select/checkbox on `change`. No re-render on individual cell changes — only on structural events (add/remove row, validate) — so focus and cursor position are preserved during editing.

### b-pagination

```html
<b-pagination page="3" total-pages="10" total-count="195"></b-pagination>
```

Emits: `page-change` → `{ page }`

### b-badge

```html
<b-badge variant="success">Online</b-badge>
<b-badge variant="danger">Error</b-badge>
<b-badge variant="warning">Warning</b-badge>
<b-badge variant="info">Info</b-badge>
<b-badge variant="secondary">Offline</b-badge>
```

### b-chart

```typescript
(el as BChart).setData({
  labels: ['Jan', 'Feb', 'Mar'],
  series: [
    { id: 'temp', label: 'Temperature', data: [{ y: 20 }, { y: 22 }, { y: 19 }] },
  ],
});

(el as BChart).setOptions({
  yAxis: { label: '°C', min: 0 },
  thresholds: [{ value: 25, color: 'var(--b-color-danger)', label: 'Max' }],
  realTime: { windowMs: 60000, maxPoints: 60, refreshMs: 1000 },
});
```

Attributes: `type` (bar|line|area|pie|donut|gauge), `height`, `legend`, `animate`

### b-kanban

Kanban board with columns, drag-and-drop between cards/columns, keyboard navigation, and **recursive card nesting** (sub-tasks, three-zone drop targets, expand/collapse, depth-aware rendering).

```typescript
import { BKanban, type KanbanColumn, type KanbanCard, type KanbanConfig } from 'birko-web-components';

const board = document.querySelector('b-kanban') as BKanban;

board.setConfig({
  maxNestingDepth: 3,
  renderCard: (card, depth) => `
    <strong>${card.title}</strong>
    ${card.children?.length ? `<span class="muted">${card.children.length} sub</span>` : ''}
  ` ,
} satisfies KanbanConfig);

board.setColumns([
  { id: 'todo',  title: 'To do' },
  { id: 'doing', title: 'In progress' },
  { id: 'done',  title: 'Done' },
]);

board.setCards([
  { id: 'a', columnId: 'todo', title: 'Parent task', children: [
    { id: 'a1', columnId: 'todo', parentId: 'a', title: 'Child 1' },
    { id: 'a2', columnId: 'todo', parentId: 'a', title: 'Child 2' },
  ]},
]);

board.addSubCard('a', { id: 'a3', columnId: 'todo', title: 'Child 3' });
board.getChildren('a');           // returns immediate children
board.removeCard('a');            // removes descendants recursively
```

**3-zone drag targets:** the top 25% of a card is "drop before", the middle 50% is "drop inside" (nest), the bottom 25% is "drop after". Self/descendant nesting is rejected.

**Keyboard:** `↑`/`↓` move, `→` expand parent / focus first child, `←` collapse / focus parent, `Home`/`End`.

Methods: `setColumns()`, `setCards()`, `addSubCard(parentId, card)`, `getChildren(cardId)`, `removeCard(id)`, `toggleCard(id)`, `expandCard(id)`, `collapseCard(id)`, `expandAll()`, `collapseAll()`
Emits: `card-move` → `{ cardId, fromColumnId, toColumnId, parentId, position }`, `card-click` → `{ card }`

### b-pre

Preformatted text block. Monospace, tokenized background/border, scrollable when bounded by `max-height`.

```html
<b-pre>Line 1
Line 2
Line 3</b-pre>

<b-pre wrap max-height="12rem">very-long-content…</b-pre>
```

Attributes: `wrap`, `max-height`, `size` (sm|md|lg)

### b-code-block

Syntax-highlighted code display with copy button and optional line numbers. Built-in lightweight highlighter for `json`, `js`, `ts`, `html`, `xml`, `css`, `sql`, `csharp`, `bash`.

```html
<b-code-block language="json" show-line-numbers>
{
  "ok": true,
  "count": 42
}
</b-code-block>

<b-code-block language="ts" code="const x = 42;"></b-code-block>
```

```typescript
import { BCodeBlock } from 'birko-web-components';
(el as BCodeBlock).setCode('SELECT * FROM users;', 'sql');
```

Attributes: `language`, `code`, `wrap`, `show-line-numbers`, `no-copy`, `max-height`, `sticky-header` (`page`), `size`, `label-copy`, `label-copied`
Emits: `copy` → `{ code }`, `copy-error`

> **Scroll modes (shared with the three viewers below):** `max-height` turns the code `<pre>` into the scroll container; `sticky-header="page"` flips the card's `overflow` to `visible` so the `Copy` button stays pinned to the page viewport while the page scrolls. The two modes are mutually exclusive — `sticky-header="page"` takes precedence.

### b-definition-list

Semantic `<dl>` with term/description pairs. Four `layout` variants: `stacked` (default), `inline`, `horizontal`, `grid`.

```html
<!-- Slot-based -->
<b-definition-list layout="horizontal">
  <dt>Name</dt><dd>Widget Alpha</dd>
  <dt>Status</dt><dd>Active</dd>
</b-definition-list>
```

```typescript
import { BDefinitionList } from 'birko-web-components';

(el as BDefinitionList).setItems([
  { term: 'Name',   description: 'Widget Alpha' },
  { term: 'Status', description: 'Active' },
]);
```

Attributes: `layout` (stacked|inline|horizontal|grid), `size` (sm|md|lg), `align`

### b-object-tree

Generic recursive property tree for any JS value. Lazy expansion, type coloring, optional type tags.

```typescript
import { BObjectTree } from 'birko-web-components';

(el as BObjectTree).setData({
  id: 42,
  name: 'Alpha',
  nested: { active: true, tags: ['a', 'b'] },
  date: new Date(),
});

(el as BObjectTree).expandAll();
```

```html
<!-- Opt-in card chrome with Expand/Collapse/Copy toolbar -->
<b-object-tree show-header header-title="Payload" max-height="320px"></b-object-tree>

<!-- Page-viewport sticky header instead of internal scroll -->
<b-object-tree show-header sticky-header="page"></b-object-tree>
```

Attributes: `expanded-depth` (initial open depth, default `1`), `max-depth`, `size`, `show-types`, `show-header`, `header-title` (default `Tree`), `no-copy`, `no-expand-actions`, `max-height`, `sticky-header` (`page`), `label-expand`, `label-collapse`, `label-copy`, `label-copied`
Emits: `toggle` → `{ path, expanded }`, `copy` → `{ text }` (when `show-header` is on), `copy-error`

### b-json-viewer

Wraps `b-object-tree` with JSON-specific UX — accepts JSON strings or objects, parse-error panel, Expand/Collapse/Copy header.

```html
<b-json-viewer src='{"ok":true,"count":42}'></b-json-viewer>

<!-- Slot text is also parsed -->
<b-json-viewer>
{ "items": [{ "id": 1 }, { "id": 2 }] }
</b-json-viewer>
```

```typescript
import { BJsonViewer } from 'birko-web-components';

(el as BJsonViewer).setData({ id: 1, name: 'Alpha' });
(el as BJsonViewer).setData('{"id":1}');  // strings are parsed
```

Attributes: `src`, `expanded-depth`, `max-depth`, `size`, `show-types`, `no-copy`, `max-height`, `sticky-header` (`page`), `label-expand`, `label-collapse`, `label-copy`, `label-copied`
Emits: `copy` → `{ text }`, `copy-error`

### b-xml-viewer

Collapsible XML tree using `DOMParser`. Renders elements, attributes, text, CDATA, comments, and processing instructions with distinct coloring. Expand/Collapse/Copy header.

```html
<b-xml-viewer>
<?xml version="1.0"?>
<Order id="A-42">
  <Customer>Alpha Corp</Customer>
  <Lines>
    <Line sku="X1" qty="2"/>
    <Line sku="X2" qty="1"/>
  </Lines>
</Order>
</b-xml-viewer>
```

```typescript
import { BXmlViewer } from 'birko-web-components';

(el as BXmlViewer).setSource('<root><child/></root>');
(el as BXmlViewer).setDocument(document.implementation.createDocument(null, 'root', null));
(el as BXmlViewer).expandAll();
```

Attributes: `src`, `expanded-depth`, `max-depth`, `size`, `no-copy`, `max-height`, `sticky-header` (`page`), `label-expand`, `label-collapse`, `label-copy`, `label-copied`
Emits: `toggle` → `{ path, expanded }`, `copy` → `{ text }`, `copy-error`

---

## Feedback

### toast

```typescript
import { toast } from 'birko-web-components';

toast.success('Device saved');
toast.error('Connection failed');
toast.warning('Low battery');
toast.info('Firmware update available');

// User notification (top-right, persistent):
toast.notify('Door sensor triggered', {
  href: '#/devices/door-1',
  duration: 8000,
});
```

### b-spinner

```html
<b-spinner></b-spinner>
<b-spinner size="lg"></b-spinner>
```

### b-progress

Linear progress bar — determinate or indeterminate, with optional label and inline value display.

```html
<b-progress value="42" max="100" label="Uploading" show-value></b-progress>
<b-progress indeterminate label="Working…"></b-progress>
<b-progress value="0.3" max="1" value-format="percent" size="sm" variant="success" striped animated></b-progress>
```

```typescript
(el as BProgress).setValue(75, 100);
```

Attributes: `value`, `max`, `indeterminate`, `label`, `show-value`, `value-format` (`percent`|`fraction`|`value`), `size` (`sm`|`md`|`lg`|`xl`), `variant` (`primary`|`success`|`warning`|`danger`|`info`|`secondary`), `striped`, `animated`
Emits: `change` → `{ value, max }`, `complete` (when `value >= max`)

### b-empty

```html
<b-empty icon="📭" message="No devices found"></b-empty>
```

### b-skeleton

```html
<b-skeleton type="table" rows="5" columns="4"></b-skeleton>
<b-skeleton type="form" rows="3"></b-skeleton>
```

### b-stale-banner

Shows a warning when displayed data is from cache.

```typescript
const banner = document.querySelector('#stale') as BStaleBanner;
if (response.fromCache) banner.show(response.cachedAt);
```

```html
<b-stale-banner id="stale" hidden></b-stale-banner>
```

Attributes: `message`, `hidden`
Methods: `show(cachedAt: Date | string)`

---

## Navigation

### b-sidebar

```typescript
(el as BSidebar).setItems([
  { id: 'dashboard', label: 'Dashboard', icon: '⊞', href: '#/' },
  { id: 'devices', label: 'Devices', icon: '◉', href: '#/devices' },
  {
    id: 'admin', label: 'Admin', icon: '⚙',
    children: [
      { id: 'users', label: 'Users', href: '#/admin/users' },
    ],
  },
]);
```

Attributes: `collapsed`, `active` (item id)

### b-breadcrumb

```typescript
(el as BBreadcrumb).setItems([
  { label: 'Buildings', href: '#/buildings' },
  { label: 'Floor 3', href: '#/buildings/1/floors/3' },
  { label: 'Zone A' },
]);
```

### b-ribbon

Office-style ribbon header with module tabs, grouped items, and context actions.

```typescript
(el as BRibbon).setTabs([
  {
    id: 'iot',
    label: 'IoT',
    groups: [
      {
        id: 'main',
        label: 'Main',
        items: [
          { id: 'devices', label: 'Devices', href: '#/iot/devices' },
          { id: 'alarms', label: 'Alarms', href: '#/iot/alarms' },
        ],
      },
    ],
  },
]);
```

Attributes: `active` (tab id)
Slots: `before-tabs`, `after-tabs`
Methods: `setTabs()`, `setContextActions()`, `pin()`, `unpin()`
Emits: `tab-change` → `{ tab }`, `item-click` → `{ tabId, groupId, itemId }`, `pin` → `{ pinned }`

### b-tree-menu

Hierarchical tree menu with unlimited nesting depth, expand/collapse, keyboard navigation, and guide lines.

```typescript
(el as BTreeMenu).setItems([
  {
    id: 'buildings', label: 'Buildings', icon: '🏢', expanded: true,
    children: [
      {
        id: 'floor-1', label: 'Floor 1', icon: '📐',
        children: [
          { id: 'zone-a', label: 'Zone A', href: '#/zones/a' },
          { id: 'zone-b', label: 'Zone B', href: '#/zones/b', badge: 3 },
        ],
      },
      { id: 'floor-2', label: 'Floor 2', icon: '📐' },
    ],
  },
  { id: 'devices', label: 'Devices', icon: '📡', href: '#/devices' },
]);
```

```typescript
interface TreeMenuItem {
  id: string;
  label: string;
  icon?: string;        // HTML entity or text
  href?: string;        // Navigate on click (renders <a>)
  badge?: number|string;// Count badge on right
  disabled?: boolean;
  expanded?: boolean;   // Initially expanded
  children?: TreeMenuItem[];
}
```

Attributes: `active` (item id — highlights the node)
Methods: `setItems()`, `expandAll()`, `collapseAll()`, `expand(id)`, `collapse(id)`, `toggle(id)`, `reveal(id)` (expands all ancestors)
Emits: `select` → `{ id, item }`, `toggle` → `{ id, expanded }`
Keyboard: `↑`/`↓` move, `→` expand/enter child, `←` collapse/go to parent, `Enter`/`Space` select, `Home`/`End`

---

## Command

### b-command-palette

Ctrl+K / Cmd+K command palette with pluggable providers.

```typescript
import { BCommandPalette, openCommandPalette, registerProvider, createRecentProvider } from 'birko-web-components';

// Register a search provider:
registerProvider({
  id: 'pages',
  search: async (query) => [
    { id: 'dashboard', label: 'Dashboard', action: () => location.hash = '#/' },
  ],
});

// Open the palette:
openCommandPalette();
```

```html
<b-command-palette placeholder="Search or type a command..."></b-command-palette>
```

Exports: `openCommandPalette()`, `closeCommandPalette()`, `toggleCommandPalette()`, `onPaletteChange()`, `registerProvider()`, `createRecentProvider()`

---

## Design tokens

All `--b-*` properties are defined in `css/tokens.css`. Alternate themes activate via the `data-theme` attribute on `<html>`: `[data-theme="dark"]` (dark) and `[data-theme="neon"]` (dark navy base with neon green/cyan accents). The shell restores any saved value from the `{storagePrefix}-theme` localStorage key, so a `<b-option-group>` writing that key is enough to switch themes at runtime.

**Key tokens:**

| Group | Examples |
|-------|---------|
| Colors | `--b-color-primary`, `--b-color-danger`, `--b-color-success` |
| Text | `--b-text`, `--b-text-secondary`, `--b-text-muted`, `--b-text-inverse` |
| Background | `--b-bg`, `--b-bg-secondary`, `--b-bg-tertiary`, `--b-bg-elevated` |
| Border | `--b-border`, `--b-border-hover`, `--b-border-focus` |
| Spacing | `--b-space-xs` (4px) → `--b-space-3xl` (48px) |
| Radius | `--b-radius-sm` (4px) → `--b-radius-xl` (16px), `--b-radius-full` (9999px) |
| Typography | `--b-text-xs` (11px) → `--b-text-3xl` (30px), `--b-font-weight-medium/bold` |
| Shadows | `--b-shadow-sm` → `--b-shadow-xl` |
| Z-index | `--b-z-dropdown` (100), `--b-z-modal` (400), `--b-z-toast` (500) |

---

## Form utilities

```typescript
import { showFormError, loadOptions, wireSearchableSelect } from 'birko-web-components/form-utils';
```

### showFormError

Maps ASP.NET ProblemDetails / ModelState validation errors from an API response back to `b-form` field errors.

```typescript
const resp = await api.post<User>('users', form.validate().data);
if (!resp.ok) {
  showFormError(form, resp.data);          // maps field errors by name
  showFormError(form, resp.data, '_form'); // fallback field for non-field errors
  return;
}
```

Handles `{ errors: { fieldName: ['msg'] } }` (ModelState), `{ detail: '...' }`, `{ title: '...' }`, and plain error strings. Non-field errors are placed on `fallbackField` (default `'_form'`).

### loadOptions

Fetch `SelectOption[]` from an API endpoint for populating `<b-select>` or form field options.

```typescript
import { loadOptions, type SelectOption } from 'birko-web-components/form-utils';

const options = await loadOptions(api, 'api/categories');
// [{ value: 'abc', label: 'Electronics' }, ...]

// Custom key mapping:
const options = await loadOptions(api, 'api/users', {
  dataKey:  'items',     // response key holding the array (default: items/data/root array)
  valueKey: 'guid',      // property to use as value (default: 'id')
  labelKey: 'fullName',  // property to use as label (default: 'name')
  params:   { active: true },  // query params
});

form.setFieldOptions('customerId', options);
```

### wireSearchableSelect

Sets up a live-search select field that queries an API endpoint as the user types, with debounce.

```typescript
const unwire = wireSearchableSelect(form, 'customerId', api, 'api/customers/search', {
  debounce:    300,          // ms between keystrokes (default: 300)
  searchParam: 'q',          // query param name for the search term (default: 'q')
  valueKey:    'id',         // response item key for value (default: 'id')
  labelKey:    'name',       // response item key for label (default: 'name')
  params:      { active: 1 }, // extra static query params
});

// Call in onUnmount():
unwire();
```

Wires `form.onFieldChange(fieldName, ...)` so each user keystroke triggers a debounced API call and updates the field's option list. Useful for large datasets where a static option list would be impractical.

```typescript
interface SelectOption { value: string; label: string; }
interface LoadOptionsConfig {
  dataKey?: string;
  valueKey?: string;
  labelKey?: string;
  params?: Record<string, unknown>;
}
interface WireSearchConfig {
  debounce?: number;
  searchParam?: string;
  valueKey?: string;
  labelKey?: string;
  params?: Record<string, unknown>;
}
```

---

## Authoring components

```typescript
import { BaseComponent, define } from 'birko-web-core';
import { overlayHeaderSheet, closeButtonSheet, spinSheet } from './shared-styles';

export class BMyComponent extends BaseComponent {
  static get sharedStyles() {
    return [overlayHeaderSheet, closeButtonSheet];
  }

  static get styles() {
    return `
      :host { display: block; }
      /* component-specific only — use --b-* tokens */
    `;
  }

  render() {
    return `
      <header class="overlay-header">
        <span>Title</span>
        <button class="close-btn" id="close">×</button>
      </header>
      <section class="overlay-body">
        <!-- content -->
      </section>
      <footer class="overlay-footer">
        <b-button variant="primary" id="confirm">OK</b-button>
      </footer>
    `;
  }

  protected onMount() {
    this.$('#close')?.addEventListener('click', () => this.emit('close'));
    this.$('#confirm')?.addEventListener('click', () => this.emit('confirm'));
  }
}

define('b-my-component', BMyComponent);
```
