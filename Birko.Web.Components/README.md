# Birko.Web.Components

Shadow DOM web components for building data-driven UIs. Built on `Birko.Web.Core`. **54 components** across inputs, layout, data, feedback, navigation, and command palette.

## Install

```html
<!-- Design tokens — base/light, required -->
<link rel="stylesheet" href="css/tokens.css" />

<!-- Alternate themes — opt in to ONLY the ones you use -->
<link rel="stylesheet" href="css/themes/dark.css" />
<link rel="stylesheet" href="css/themes/finstat.css" />

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
birko-web-components/dialogs      # imperative confirm/confirmDelete/alert/prompt/choose/promptForm/busy/notify
birko-web-components/form-utils   # showFormError, loadOptions, wireSearchableSelect
```

### Imperative dialogs

Instead of hand-rendering `<b-confirm-dialog>` / `<b-modal>` and awaiting `el.show()`, call a function:

```ts
import { confirm, confirmDelete, prompt, choose, promptForm, busy, alert, notify }
  from 'birko-web-components/dialogs';

if (await confirmDelete('Delete this item?')) { /* … */ }
const name = await prompt('Your name?', { defaultValue: 'Ada' });        // string | null
const fmt  = await choose('Export as', [{ label: 'PDF', value: 'pdf' }, { label: 'CSV', value: 'csv' }]);
const data = await promptForm([{ name: 'email', type: 'email', label: 'Email', required: true }]);
await busy(() => api.save(model), { message: 'Saving…' });               // spinner overlay while it runs
notify('Saved', 'success');                                             // transient toast
```

This is a **lean subpath** — it pulls only the handful of components each helper uses (not the `layout`/`inputs` barrels, which bundle `b-chat`, pickers, data-table and roughly double the bundle). All dialogs render in the browser top layer (`<dialog>.showModal()`), so they sit above any z-index and are Escape-dismissable.

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

## Accessibility

Components ship with ARIA roles, keyboard support, focus management, and screen-reader announcements built in. Form controls automatically wire validation ARIA (`aria-invalid` / `aria-describedby` + a `role="alert"` error region) when you set the `error` attribute, so screen-reader users hear validation failures:

```html
<b-input label="Email" required error="Enter a valid email"></b-input>
```

See [ACCESSIBILITY.md](ACCESSIBILITY.md) for the full role map, the `fieldAria()` / `renderError()` helpers used to build new inputs, expand/collapse and live-region conventions, and the Shadow DOM IDREF caveats.

---

## Form participation

The 15 value-bearing inputs — `b-input`, `b-textarea`, `b-select`, `b-multi-select`, `b-tag-input`,
`b-date-picker`, `b-datetime-picker`, `b-time`, `b-range`, `b-color-picker`, `b-date-range-picker`,
`b-markdown-editor`, `b-checkbox`, `b-switch`, `b-radio` — are **form-associated custom elements** (`ElementInternals`). Drop them in a plain
`<form>` and it behaves as if they were native controls:

```html
<form id="f">
  <b-input name="email" type="email" required></b-input>
  <b-input name="weight" type="number" min="0" step="0.1"></b-input>
  <button type="submit">Save</button>
</form>
```

```ts
const f = document.querySelector('#f') as HTMLFormElement;
f.addEventListener('submit', (e) => {
  e.preventDefault();
  const data = new FormData(f);       // includes every b-* value, keyed by `name`
});
// An empty `required`, a malformed email or a negative weight blocks the submit and shows the
// browser's own validation bubble anchored to the control — no page-level guard needed.
```

What you get: values in `FormData`; `required` / `type` / `min` / `max` / `step` / `pattern` enforced;
`checkValidity()` / `reportValidity()` / `validity` / `validationMessage` on both control and form;
`form.reset()` restoring initial state; `<fieldset disabled>` propagating in.

**`form.reset()`** returns each control to its **markup-declared** state — the `value` attribute, or
`checked` for toggles — which is what native controls do (they ignore script-assigned values on reset). A
control you populate *imperatively* after load (`setOptions()` + `setSelected()`, `setTags()`) has no markup
to declare, so call `el.resetFormBaseline()` once you have populated it if reset should return there
instead of to empty.

**Submitted shapes.** Most controls submit one string under `name`. Three don't, and the difference
matters server-side:

| Control | `FormData` shape | Note |
|---|---|---|
| `b-multi-select`, `b-tag-input` | **one entry per value** under `name` | The native `<select multiple>` shape — read with `getAll(name)`; binds to `string[]` in ASP.NET Core, `name[]` in PHP. Unlike the joined `.value`, this is safe for values containing a comma. |
| `b-range` (`mode="range"`) | `name-from` + `name-to` | Two values, no native equivalent — two ordinary fields beat inventing a delimiter. Single mode submits one plain value under `name`. |
| `b-date-range-picker` | `name-start` + `name-end` | Same reasoning; both ISO dates. |
| `b-color-picker` | base hex `#rrggbb` | The alpha byte is dropped even in `alpha` mode. `el.value` still returns `#rrggbbaa`. |
| `b-markdown-editor` | the markdown **source** | Never the rendered preview HTML. |
| `b-checkbox`, `b-switch`, `b-radio` | `value` attr (default `on`) **only when checked** | Unchecked contributes nothing — that absence is how a server reads false. |

An **empty** control submits **no entry at all** (not `""`), matching native behaviour — so a server sees
an absent field, not an empty list.

**Nothing about `el.value` changed**, and `b-form` still collects values programmatically exactly as
before. Form participation is an additional surface, not a replacement — if you already read values in
your page, keep doing that.

**Toggles use native checkbox semantics.** `b-checkbox`, `b-switch` and `b-radio` submit their `value`
attribute (default `on`) **only when checked**, and contribute **nothing** when unchecked — which is how a
server distinguishes false (`bool` binding reads an absent field as false; a literal `false` string would
bind as true). Their `.value` still returns `'true'`/`'false'` for JS callers, so read `el.checked` for the
boolean exactly as before.

`b-radio` members share a `name` and the form receives exactly one entry, from the checked member.
`required` is **not** supported on `b-radio` — it is a property of the group, not of one button — so
validate radio groups in your page or via `b-form`.

**Custom controls:** extend `FormControlComponent` (from `birko-web-core`) instead of `BaseComponent`, and
call `this.syncFormState()` whenever your value changes. See `Birko.Web.Components/CLAUDE.md`
§ "Form-association convention".

---

## Inputs

**`hint` vs `description` — two kinds of help, two presentations.** Both are supported on all 14
stacked-chrome controls (see `bare` below for the list), and a field may carry both:

| Attribute | Renders as | Use for |
|---|---|---|
| `hint` | a tooltip behind a `?` icon beside the label | a terse explainer read once — *"Same number = performed back-to-back as a superset"* |
| `description` | persistent text under the control | a value or constraint needed at a glance while typing — *"Goal 8000 steps"*, *"Max 20 characters"* |

```html
<b-input label="Steps" type="number" description="Goal 8000 steps"></b-input>

<!-- both: a standing constraint on screen, plus an explainer behind the icon -->
<b-input label="Superset group" type="number"
         description="Max 10"
         hint="Same number = performed back-to-back as a superset"></b-input>
```

**Use `description` rather than your own sibling element.** The row is wired into the control's
`aria-describedby`, so a screen reader announces it as that field's description. An element you render
*outside* the component cannot be — the real control lives in shadow DOM, so nothing outside it can be
referenced by id. When an error is also present, both are announced (error first) rather than one replacing
the other.

Escaped on the way in, so text from a schema or an API is safe to pass. Dropped by `bare` (see below),
where it becomes the control's `title` instead — unless an error has claimed `title`, which wins.

Styled at `--b-text-xs` in `--b-text-secondary` — lighter than the label but chosen to clear WCAG AA
contrast in the shipped themes, since this is text meant to be read rather than decoration.

**`bare` — drop the stacked chrome.** By default a form control renders a `.field` wrapper with a label
row above and an error row below. `bare` strips all three and emits the control alone, for toolbars,
table cells and other inline hosts where that chrome (and its flex gap) adds unwanted vertical space.
Pairs with `size="sm"`.

```html
<!-- in a toolbar / table cell: no label row, no error row, no stacked gap -->
<b-input bare size="sm" label="Quantity" type="number" min="0" inputmode="numeric"></b-input>
```

Supported by all 14 stacked-chrome controls: `b-input`, `b-select`, `b-textarea`, `b-multi-select`,
`b-tag-input`, `b-date-picker`, `b-datetime-picker`, `b-time`, `b-date-range-picker`, `b-range`,
`b-color-picker`, `b-markdown-editor`, `b-file-upload`, `b-option-group`.

Not supported, deliberately: `b-search-input` renders no chrome at all (so it is already bare), and the
toggles (`b-checkbox` / `b-switch` / `b-radio`) are inline label+control rather than stacked fields.

Keep passing `label`, `description` and `error` — a bare control still honours them, it just has nowhere
to *print* text: the `has-error` border stays, `label` becomes the control's `aria-label` (so it keeps an
accessible name without a visible one), and `title` carries the error, or the description when there is no
error. Your page is responsible for showing the message somewhere if users need to read it.

### b-input

```html
<b-input label="Email" type="email" name="email" placeholder="you@example.com" required></b-input>

<!-- numeric entry: min/max/step drive native validation, inputmode picks the phone keyboard -->
<b-input label="Weight (kg)" type="number" name="weight" min="0" step="0.1" inputmode="decimal"></b-input>
```

Attributes: `label`, `type` (text|email|number|password|search|tel|url), `name`, `value`, `placeholder`, `error`, `disabled`, `required`
Passed through to the inner `<input>`: `min`, `max`, `step`, `inputmode`, `autocomplete` (omitted when unset).
`step` matters on `type="number"` — it defaults to `1`, so `81.4` is invalid without `step="0.1"`; `inputmode`
decides which on-screen keyboard a phone opens.
Emits: `change` → `{ name, value }`

> **Form-associated.** Despite the real `<input>` living in shadow DOM, this is an `ElementInternals`-based
> form-associated custom element: its value is included in `FormData(form)`, `required` / `type` / `min` /
> `max` / `step` block a native submit, `form.reportValidity()` shows the bubble on the control,
> `form.reset()` restores it, and `<fieldset disabled>` disables it. `el.value` still works exactly as
> before — see [Form participation](#form-participation).

### b-select

```html
<b-select label="Status" name="status" placeholder="Select…"></b-select>

<!-- combobox mode: type-to-filter over a long option list -->
<b-select label="Exercise" name="exercise" searchable label-no-matches="No matches"></b-select>
```

```typescript
(el as BSelect).setOptions([
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]);
```

Emits: `change` → `{ name, value }`, and `search` → `{ query, name }` in `searchable` mode.

`searchable` filtering is **case- and accent-insensitive** (`foldForSearch`/`matchesSearch` from
`birko-web-core`): typing `pritahy` finds `Príťahy`, `muller` finds `Müller`. Nobody types diacritics into a
filter box in a hurry, least of all on a phone keyboard.

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

<!-- Vertical (equalizer): stack several slider-only vertical ranges in a flex row -->
<b-range orientation="vertical" display="slider" min="0" max="100" value="60"></b-range>
```

Attributes: `label`, `name`, `min`, `max`, `step`, `mode` (single|range), `display` (both|slider|input), `orientation` (horizontal|vertical), `value-type` (number|int|percent), `error`, `disabled`, `required`
Emits: `change` → `{ name, value }` (single) or `{ name, value: { from, to } }` (range)

`orientation="vertical"` renders the slider bottom-to-top (fill grows from the bottom) — set a height on the host (or a flex-row container) and use `display="slider"` to build an equalizer/mixer bank. Single and range modes both work vertically.

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

### b-accordion

```html
<b-accordion multiple>
  <div slot="general">General settings…</div>
  <div slot="advanced">Advanced settings…</div>
</b-accordion>
<script>
  document.querySelector('b-accordion').setItems([
    { id: 'general', header: 'General', open: true },
    { id: 'advanced', header: 'Advanced' },
  ]);
</script>
```

Collapsible disclosure group. Single-open by default; add `multiple` to allow several open at once. Each section's body is a slot named after its `id`. Headers are native buttons (`aria-expanded`/`aria-controls`), keyboard-operable with Enter/Space (toggle) and Up/Down/Home/End (move between headers).

Attributes: `multiple`, `size` (sm|md|lg — header footprint)
Methods: `setItems([{id, header, open?, disabled?}])`, `open(id)`, `close(id)`, `toggle(id)`, `openAll()`, `closeAll()`, `getOpen()`
Events: `toggle` → `{ id, open }`
Slots: one per section, `slot="{id}"`

### b-button-group + b-toolbar

```html
<b-toolbar label="Contest controls">
  <b-button-group label="Transport">
    <b-button size="lg" variant="primary">▶ Start</b-button>
    <b-button size="lg" variant="secondary">⏸ Pause</b-button>
    <b-button size="lg" variant="secondary">⏹ Stop</b-button>
  </b-button-group>
  <b-button-group>
    <b-button size="lg" variant="secondary">↺ Reset</b-button>
  </b-button-group>
  <b-button slot="end" variant="danger">✕ Close</b-button>
</b-toolbar>
```

`b-button-group` renders related buttons as one bordered, rounded cluster; `b-toolbar` lays the clusters out in a wrapping row, with the `end` slot pushed to the far edge (destructive/exit actions). Both are purely presentational — buttons keep their own variant/size/clicks.

Attributes (both): `label` (aria-label)
Slots: default; `b-toolbar` adds `end`

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

Attributes: `title`, `size` (sm|md|lg|xl|xxl|full)
Slots: default (body), `footer`
Methods: `open()`, `close()`
Emits: `close`

`sm`–`xxl` cap `max-width` (380 / 520 / 720 / 960 / 1280px via `--b-modal-width{,-sm,-lg,-xl,-xxl}`); the modal stays 90% wide and at most `85vh` tall. `full` is the editor size — the viewport minus `--b-modal-full-inset` (2rem) on all four sides, in **both** axes, so a WYSIWYG field or a complex form editor gets the full height instead of a 85vh cap. Below 640px it goes edge to edge with square corners.

```html
<b-modal id="editor-modal" title="Edit article" size="full">
  <b-markdown-editor id="body"></b-markdown-editor>
  <footer slot="footer">
    <b-button variant="secondary" id="cancel">Cancel</b-button>
    <b-button variant="primary" id="save">Save</b-button>
  </footer>
</b-modal>
```

### b-drawer

```html
<b-drawer id="settings-drawer" title="Settings" size="md" modal>
  <!-- content -->
</b-drawer>
```

Same API as `b-modal`, except `size` is `sm|md|lg|xl|xxl` (360 / 480 / 640 / 860 / 1160px via `--b-drawer-width{,-sm,-lg,-xl,-xxl}`) — no `full`: a viewport-wide drawer is a modal, so use `<b-modal size="full">` for that. Always full height, and full width below 640px. Use for panels where the user needs to see the background content.

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

`collapse-at` takes a CSS length — prefer `rem`/`em` (`collapse-at="48rem"`), which tracks the reader's browser font size; a bare number (`collapse-at="800"`) is still read as px. Omitted or unparseable, the panel collapses at the default `48rem`.

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

**Per-point colour (bar mode).** A `DataPoint` may carry its own `color`, which wins over the series colour —
for bars whose meaning depends on their own value rather than on which series they belong to:

```typescript
(el as BChart).setData({
  series: [{ id: 'steps', label: 'Steps', data: days.map(d => ({
    y: d.steps,
    color: d.steps >= goal ? 'var(--b-color-success)' : 'var(--b-color-primary)',
  })) }],
});
(el as BChart).setOptions({ thresholds: [{ value: goal, label: `goal ${goal}` }] });
```

Splitting the states into two series is *not* equivalent: bars from different series are laid out side by side
within each category, so you would get pairs of half-width bars instead of one bar per category.

**Overlay bars (`options.overlay`) — target vs actual.** When two series measure the *same* quantity and their
difference is the reading ("sessions done" against "sessions scheduled"), `overlay` gives both the full
category width and paints them on top of one another, so the part of the target still showing is the shortfall:

```typescript
(el as BChart).setData({
  labels: weeks.map(w => w.label),
  series: [
    { id: 'target', label: 'Scheduled', color: 'var(--b-bg-tertiary)', data: weeks.map(w => ({ y: w.scheduled })) },
    { id: 'done',   label: 'Done',      data: weeks.map(w => ({ y: w.done, color: w.done >= w.scheduled ? 'var(--b-color-success)' : 'var(--b-color-primary)' })) },
  ],
});
(el as BChart).setOptions({ overlay: true });
```

Series paint in array order, so list the background (target) series **first** and give it a muted colour — an
opaque background series hides a shorter one in front. Distinct from `stacked`, which would sum the two.

**Empty slots.** A category whose value is missing or yields no bar height draws nothing rather than an invisible
zero-height `<rect>` — the bar equivalent of a gap in a line. Useful for a daily series where some days have no
entry: the slot stays, the bar doesn't.

**x labels are thinned** to ~8 across the axis in both bar and line mode, so a 90-day daily series doesn't print
90 overlapping labels.

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

Progress indicator — determinate or indeterminate, with optional label and inline value display. `type="linear"` (default) renders a horizontal bar; `type="circular"` renders an SVG ring (value centered, label below).

```html
<b-progress value="42" max="100" label="Uploading" show-value></b-progress>
<b-progress indeterminate label="Working…"></b-progress>
<b-progress value="0.3" max="1" value-format="percent" size="sm" variant="success" striped animated></b-progress>

<!-- circular -->
<b-progress type="circular" value="72" show-value variant="success"></b-progress>
<b-progress type="circular" indeterminate label="Loading…"></b-progress>
<b-progress type="circular" value="40" size="lg" thickness="2.5"></b-progress>
```

`size` controls the ring diameter (`sm`/`lg`/`xl`, or `--b-progress-ring-size`); `thickness` (unitless, `~3.5` default) sets stroke width via `--b-progress-ring-thickness`. `striped`/`animated` apply to the linear bar only.

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

The base/light tokens (`:root`) ship in `css/tokens.css` (required). **Each alternate theme is its own file under `css/themes/` so a project pulls in only the ones it wants** — no unused theme bytes:

| File | `data-theme` | Look |
|------|-------------|------|
| `css/tokens.css` | _(none — `:root`)_ | Light / default (always loaded) |
| `css/themes/dark.css` | `dark` | Dark |
| `css/themes/neon.css` | `neon` | Dark navy + neon green/cyan accents |
| `css/themes/finstat.css` | `finstat` | Finstat brand — green primary, warm-grey surfaces, Roboto, flat/square corners (extracted from the Finstat app's LESS tokens) |
| `css/themes/inverse.css` | `inverse` | **Partial accent** — flips only surfaces/text/borders to dark charcoal; brand color **inherits** from the page theme. For scoped dark chrome (Finstat-style dark top menu + footer), not a global theme |

Link/bundle `tokens.css` plus only the theme files you use, then register the matching switcher entries in your shell bootstrap (`registerThemes([BUILTIN_THEMES.dark, …])` — see `Birko.Web.Shell`). A theme activates via the `data-theme` attribute on `<html>`; the shell restores any saved value from the `{storagePrefix}-theme` localStorage key. To author a project-private theme, add a `[data-theme="my-brand"]` block in your app's own CSS and `registerTheme({ id: 'my-brand', label: '…' })` — no framework change needed.

### Scoped accents (dark menu/footer, alternate component colors)

Themes are plain `[data-theme]` attribute selectors and `--b-*` custom properties **inherit across the Shadow DOM boundary**, so you can theme a *region* or a *single component* — not just the whole app. Two patterns:

1. **`data-theme` on a light-DOM element/host** — works for elements the global stylesheet can match (page chrome, or a component placed in light DOM):
   ```html
   <header data-theme="inverse"> … </header>   <!-- dark top bar, brand accent kept -->
   <b-card data-theme="inverse"> … </b-card>
   ```
2. **Per-instance token overrides (inline)** — `--b-*` set inline always inherit, regardless of nesting. Best for accenting one part of a component:
   ```html
   <!-- dark card header only; body stays light -->
   <b-card style="--b-card-header-bg:#434040; --b-card-header-text:#fff" header="Reports"> … </b-card>
   <!-- dark table header band (works on b-table AND b-data-table — it wraps a b-table) -->
   <b-table style="--b-table-header-bg:#434040; --b-table-header-text:#fff; --b-table-header-text-hover:#fff"></b-table>
   ```

For shell chrome (ribbon/header/footer) the shell renders for you, use the `headerAccent` / `ribbonAccent` / `footerAccent` hooks — see `Birko.Web.Shell`.

**Key tokens:**

| Group | Examples |
|-------|---------|
| Colors | `--b-color-primary`, `--b-color-danger`, `--b-color-success` |
| Status alpha | `--b-color-{danger,success,warning,info}-alpha-bg/-border` (tinted backgrounds/borders; themes retune for dark surfaces) |
| Overlay | `--b-overlay-subtle/light/medium` (neutral tints/dividers; white-based in dark/neon) |
| Text | `--b-text`, `--b-text-secondary`, `--b-text-muted`, `--b-text-inverse` |
| Background | `--b-bg`, `--b-bg-secondary`, `--b-bg-tertiary`, `--b-bg-elevated` |
| Border | `--b-border`, `--b-border-hover`, `--b-border-focus` |
| Spacing | `--b-space-xs` (4px) → `--b-space-3xl` (48px) |
| Radius | `--b-radius-sm` (4px) → `--b-radius-xl` (16px), `--b-radius-full` (9999px) |
| Typography | `--b-text-xs` (11px) → `--b-text-3xl` (30px), `--b-font` (body), `--b-font-heading` (titles — card/modal/drawer headers; defaults to `--b-font`), `--b-font-weight-medium/bold` |
| Data table | `--b-table-header-bg`, `--b-table-header-text`, `--b-table-header-text-hover`, `--b-row-hover-bg` (hoverable rows), `--b-table-row-height` (uniform header+body band height; defaults to `--b-control-min-height` = 38px) |
| Card | `--b-card-header-bg`, `--b-card-header-text` (override per instance for an accent header band) |
| Shadows | `--b-shadow-sm` → `--b-shadow-xl` |
| Z-index | `--b-z-sticky` (200), `--b-z-dropdown` (220 — overlays sticky bars), `--b-z-modal` (400), `--b-z-toast` (500) |

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
