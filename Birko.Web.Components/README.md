# Birko.Web.Components

29 Shadow DOM web components for building data-driven UIs. Built on `Birko.Web.Core`.

## Install

```html
<!-- Design tokens (required) -->
<link rel="stylesheet" href="css/tokens.css" />

<!-- Optional reset -->
<link rel="stylesheet" href="css/reset.css" />
```

```typescript
import 'birko-web-components';  // registers all 29 components

// Or import individually:
import { BModal, BDataTable, toast } from 'birko-web-components';
```

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
```

**Validation rule types:** `required`, `minLength`, `maxLength`, `min`, `max`, `range`, `pattern`, `email`, `match`, `custom`
**Field types:** `text`, `email`, `number`, `password`, `textarea`, `select`, `multi-select`, `checkbox`, `switch`, `radio`, `search`, `file`, `custom`

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

Attributes: `title`, `size` (sm|md|lg|xl)
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
el.addEventListener('item-click', e => console.log(e.detail.id));
```

### b-tooltip

```html
<b-tooltip text="Refresh data" position="top">
  <b-button slot="trigger" variant="ghost">⟳</b-button>
</b-tooltip>
```

---

## Data

### b-table

Static table with optional sort.

```typescript
const table = document.querySelector('#table') as BTable;
table.setColumns([
  { key: 'name', label: 'Name', sortable: true },
  { key: 'status', label: 'Status', render: v => `<b-badge variant="success">${v}</b-badge>` },
]);
table.setData(rows);
```

### b-data-table

Auto-fetching table with toolbar, search, filters, pagination, bulk actions.

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

Emits: `action` → `{ id }`, `row-click` → `{ row }`, `row-action` → `{ actionId, row }`

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

### b-empty

```html
<b-empty icon="📭" message="No devices found"></b-empty>
```

### b-skeleton

```html
<b-skeleton type="table" rows="5" columns="4"></b-skeleton>
<b-skeleton type="form" rows="3"></b-skeleton>
```

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

---

## Design tokens

All `--b-*` properties are defined in `css/tokens.css`. Dark theme activates on `[data-theme="dark"]`.

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
