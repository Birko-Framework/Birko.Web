# Birko.Web.Components — API Reference

Quick reference for all component attributes, methods, and events.

---

## Form participation

The 16 value-bearing inputs (`b-input`, `b-textarea`, `b-select`, `b-multi-select`, `b-tag-input`,
`b-date-picker`, `b-datetime-picker`, `b-time`, `b-range`, `b-color-picker`, `b-date-range-picker`,
`b-markdown-editor`, `b-qty-stepper`, `b-checkbox`, `b-switch`, `b-radio`) are `ElementInternals`-based **form-associated custom elements**: values land in
`FormData`, constraint validation (`required` / `type` / `min` / `max` / `step` / `pattern`) blocks a
native submit, `checkValidity()` / `reportValidity()` / `validity` / `validationMessage` work on control
and form, `form.reset()` restores, and `<fieldset disabled>` propagates in. An empty control submits **no
entry** (not `""`).

Non-obvious submitted shapes:

| Control | `FormData` | |
|---|---|---|
| `b-multi-select`, `b-tag-input` | one entry per value under `name` | read via `getAll(name)` |
| `b-range` `mode="range"` | `name-from`, `name-to` | single mode → one value under `name` |
| `b-date-range-picker` | `name-start`, `name-end` | ISO dates |
| `b-qty-stepper` | canonical decimal with `.` (`1.5`) | whatever separator the locale shows (`1,5`) |
| `b-color-picker` | base hex `#rrggbb` | alpha dropped; `.value` keeps it |
| `b-markdown-editor` | markdown source | not the rendered preview |
| `b-checkbox`, `b-switch`, `b-radio` | `value` attr (default `on`) only when checked | unchecked → no entry |

`el.value` and `b-form`'s programmatic collection are unchanged — toggles still report `'true'`/`'false'`
from `.value` and their boolean from `.checked`. `required` is unsupported on `b-radio` (group property).

### Validation messages are translatable

A control produces some messages **itself** — the ones no schema rule can express — and `b-form.validate()`
surfaces them to the user. They resolve like every other string in the library: **per-instance `label-*`
attribute > global i18n > English fallback**, so they translate alongside `b-form`'s rule messages instead of
being the one English line in a localised form.

| Message | Key | Override attribute | English fallback |
|---|---|---|---|
| `required` on a control with no native primitive, **with** a `label` | `common.required` | `label-required` | `{label} is required.` |
| …**without** a `label` | `common.requiredNoLabel` | `label-required` | `Please fill out this field.` |
| `b-input type="decimal"` unparseable input | `common.badDecimal` | `label-bad-decimal` | `Enter a number.` |
| `b-input type="decimal"` below `min` | `common.rangeUnderflow` | `label-range-underflow` | `Value must be {min} or more.` |
| `b-input type="decimal"` above `max` | `common.rangeOverflow` | `label-range-overflow` | `Value must be {max} or less.` |
| `b-input type="decimal"` off `step` | `common.stepMismatch` | `label-step-mismatch` | `Value must be a multiple of {step}.` |

Keys live in the **unprefixed `common.*`** tree — `b-form`'s namespace, not the components' `bwc.*` one —
because these render next to `common.required` / `common.minLength` and a consumer should translate one tree,
not two. The `required` message deliberately **reuses `b-form`'s own `common.required` key**: one condition,
one key, so a single registration covers both layers and they cannot disagree about the same field. (Their
English *fallbacks* still differ by a trailing period; that is untranslated-path-only and left alone because
it is asserted downstream.)

Register them like any other messages:

```ts
getI18n().addMessages('sk', { common: { badDecimal: 'Zadajte číslo.', required: '{label} je povinné' } });
```

The `protected` methods behind each (`requiredMessage()` on `FormControlComponent`, `badDecimalMessage()` /
`rangeUnderflowMessage()` / `rangeOverflowMessage()` / `stepMismatchMessage()` on `b-input`) still work as
subclass overrides and still win — i18n is an added layer, not a replacement.

## Inputs

> **`description`** — persistent help text rendered under the control and wired into its
> `aria-describedby`, on all **14** stacked-chrome controls: `b-input`, `b-select`, `b-textarea`,
> `b-multi-select`, `b-tag-input`, `b-date-picker`, `b-datetime-picker`, `b-time`, `b-date-range-picker`,
> `b-range`, `b-color-picker`, `b-markdown-editor`, `b-file-upload`, `b-option-group`. Contrast `hint`, which is a tooltip behind a `?` icon;
> a field may carry both. Escaped on input. `bare` drops the row and falls back to `title`, unless an error claims it.
> `b-form` exposes it as the `description` key on a field. See [README § Inputs](README.md#inputs).

> **`bare`** — every control that renders stacked chrome (the same 14 as `description` above) accepts
> `bare` to strip the `.field`
> wrapper, the label row and the error row, leaving the control alone. For toolbars and table cells where
> the chrome's flex gap adds unwanted vertical space; pairs with `size="sm"`. The `label` / `error` /
> `required` attributes are still honoured — the `has-error` border stays, the label becomes `aria-label`
> and the error message becomes `title` — so a bare control still shows and announces its state; it just
> has nowhere to print the message. Not supported on `b-search-input` (no chrome to begin with) or
> `b-file-upload` / `b-option-group` (no error row — adding one is a feature, not a migration).

### `<b-button>`
| Attribute | Values |
|-----------|--------|
| `variant` | `primary` \| `secondary` \| `ghost` \| `danger` |
| `size` | `sm` \| (default) \| `lg` |
| `type` | `button` (default) \| `submit` \| `reset` — acts on the owning `<form>` |
| `disabled` | boolean |
| `loading` | boolean (shows spinner, disables click) |

Slot: default (button label/content).

CSS custom properties: `--b-button-padding-y`, `--b-button-padding-x` (per-axis padding; each `size` keeps
its own default, so one rule raises the tap target at every call site).

**`type` defaults to `button`, not to native's `submit`.** `b-button` never submitted anything, so consumers
wrote click handlers instead — and a shipped consumer has `b-button`s inside a `<form>` that *also* listens
for `submit` and does something else with it, which a native-faithful default would fire on the same tap.
`type="submit"` is opt-in and calls `form.requestSubmit()`, so constraint validation still runs. A
`b-button` contributes no `FormData` entry: native `name`/`value` submitter semantics can't cross a shadow
boundary (`requestSubmit(submitter)` only accepts a native submit button belonging to the form).

### `<b-input>`
| Attribute | Values |
|-----------|--------|
| `label` | string |
| `type` | `text` \| `email` \| `password` \| `number` \| `tel` \| `url` \| **`decimal`** (component-level, see below) |
| `placeholder` | string |
| `value` | string |
| `name` | string |
| `error` | string (shows error message) |
| `disabled` | boolean |
| `required` | boolean |
| `min` / `max` / `step` | forwarded to the inner `<input>` (native constraint validation; `step` defaults to 1 on `type="number"`). On `type="decimal"` they are **not** forwarded — the component enforces them itself |
| `inputmode` | forwarded — selects the on-screen keyboard (`numeric`, `decimal`, …) |
| `autocomplete` | forwarded |
| `description` | string — persistent help text under the control, wired into `aria-describedby` (contrast `hint`, a `?` tooltip) |
| `bare` | boolean — strip the `.field` wrapper, label row and error row (inline use; see [Inputs](#inputs)) |
| `clearable` | boolean — a × at the inline end of the field, shown while the value is non-empty. Not rendered while `disabled` |
| `label-clear` | string — the ×'s accessible name (default: i18n `bwc.input.clear`, then `Clear`) |

| Slot | Content |
|------|---------|
| `prefix` | Rendered inside the field box at the inline start (an icon, `https://`, a currency sign) |
| `suffix` | Rendered inside the field box at the inline end. With `clearable`, the × comes **after** the slotted content |

Adornments are vertically centred, and the input's text is inset to clear them at every `size`. The inset only
applies while a slot has content and follows it (`slotchange`, and a resize of the slotted element). The ×
keeps its space while hidden, so neither the field nor its text moves as it appears.

| Event | Detail |
|-------|--------|
| `change` | `{ name, value }` |

Clearing with the × goes the same way as a keystroke: a native `input` event, then `change` with
`value: ''`, then focus goes back to the input. An empty field has no `FormData` entry, the same as one
emptied by typing.

Form-associated (`ElementInternals`): the value lands in `FormData` under `name`, and `required` / `type` /
`min` / `max` / `step` are enforced by the wrapping `<form>`. See [Form participation](#form-participation).

#### `type="decimal"` — comma-locale decimal entry

**Not an HTML input type.** It renders the inner control as `type="text" inputmode="decimal"`.

Use it for **any** field that accepts a decimal. `type="number"` looks like the right answer and is not: its
"valid floating-point number" grammar accepts only `.`, so on a keyboard whose decimal key is a **comma**
(Slovak, Czech, German, French, Spanish, …) WebKit **refuses to insert the character at all**. Typing `81,8`
leaves the field holding `818` — which parses cleanly and stores a hundredfold-wrong value with no error
anywhere. That shipped: an 81.8 kg weigh-in recorded as 818 kg.

| Member | Behaviour |
|--------|-----------|
| `numericValue` | `number \| null` — accepts either separator. Stricter than `parseFloat`: trailing junk (`12abc`), two separators and a lone separator give `null`, not a plausible wrong number |
| `min` / `max` | enforced **by the component** as `rangeUnderflow` / `rangeOverflow` |
| `step` | enforced as `stepMismatch`, against a base of `min` (or 0) |
| unparseable input | `badInput` |
| blank | left to `required` |
| `error` attribute | still wins over all of the above, as everywhere else |
| their messages | translatable — `common.badDecimal` / `.rangeUnderflow` / `.rangeOverflow` / `.stepMismatch`, or per-instance `label-bad-decimal` / `label-range-underflow` / `label-range-overflow` / `label-step-mismatch`. See [Validation messages are translatable](#validation-messages-are-translatable) |

The component must own this because the inner control is `type="text"`, which has **no** native numeric
constraints — and since `b-input` is form-associated, mirroring that control's validity would make the field
report itself *valid* for an out-of-range value. Silence would be worse than absence.

> **`step` is a constraint, not a stepper increment.** `step="0.5"` really does make `81.8` invalid — which is
> the exact value this type exists to allow. A control whose ± buttons move by 0.5 but which still accepts a
> freely typed value must keep that increment locally and **leave `step` unset**. No `step` means no step
> constraint, which is the common case.

The parser is exported on its own as `parseDecimal` from `birko-web-core`, for hand-rolled controls that
cannot use a shadow-DOM component.

Every verdict above is visible to `b-form.validate()` — see [its section](#b-form) for exactly which flags
the schema path adopts and which it deliberately ignores.

> **A cleared field stays cleared.** The inner control is restored from the last typed/assigned value after
> every re-render, and `''` is a value, not "unset". Before that distinction existed, clearing a field that
> had a `value` attribute (a schema default, an entity being edited) sprang the old text back into the box on
> the next re-render — and re-renders come from ordinary things, `b-form` dropping the `error` attribute among
> them — so `required` did not fire and the form saved the value the user had just deleted.

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
| `description` | string — persistent help text under the control, wired into `aria-describedby` (contrast `hint`, a `?` tooltip) |
| `bare` | boolean — strip the `.field` wrapper, label row and error row (inline use; see [Inputs](#inputs)) |

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
| `searchable` | boolean (enables combobox mode; filtering is case- and accent-insensitive) |
| `creatable` | boolean — offer "Create “…”" when the query names no option; Enter or a click commits it as the value. Implies combobox mode |
| `label-create` | string — overrides the create row's verb (default: the `bwc.select.create` key) |
| `allow-free-text` | boolean — the typed text itself is the value, committed on Enter **or on close** (Escape included) |
| `description` | string — persistent help text under the control, wired into `aria-describedby` (contrast `hint`, a `?` tooltip) |
| `bare` | boolean — strip the `.field` wrapper, label row and error row (inline use; see [Inputs](#inputs)) |

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
| `description` | string — persistent help text under the control, wired into `aria-describedby` (contrast `hint`, a `?` tooltip) |
| `bare` | boolean — strip the `.field` wrapper, label row and error row (inline use; see [Inputs](#inputs)) |

| Method | Signature |
|--------|-----------|
| `setOptions` | `(options: { value: string; label: string }[]) => void` |
| `getSelected` | `() => string[]` |
| `setSelected` | `(values: string[]) => void` |

| Event | Detail |
|-------|--------|
| `change` | `{ name, values: string[] }` |
| `create` | `{ name, value }` — `creatable` only. **Cancelable:** unless a listener calls `preventDefault()` (synchronously), the typed `value` is added as an option and selected. Before 2026-09-26 the detail was `{ name: <typed text> }` |

### `<b-tag-input>`
Freeform multi-value input. Enter/Tab commits, Backspace removes last, paste splits on separators.

| Attribute | Values |
|-----------|--------|
| `label` | string |
| `name` | string |
| `value` | comma-separated initial tags |
| `placeholder` | string |
| `separators` | string of delimiter chars (default `,\n\t`) |
| `max-count` | number (reject further tags beyond N) |
| `allow-duplicates` | boolean |
| `error` | string |
| `disabled` | boolean |
| `required` | boolean |
| `hint` | string |
| `description` | string — persistent help text under the control, wired into `aria-describedby` (contrast `hint`, a `?` tooltip) |
| `bare` | boolean — strip the `.field` wrapper, label row and error row (inline use; see [Inputs](#inputs)) |

| Method | Signature |
|--------|-----------|
| `setTags` | `(tags: string[]) => void` |
| `getTags` | `() => string[]` |
| `clear` | `() => void` |

| Event | Detail |
|-------|--------|
| `change` | `{ name, tags: string[], value: string }` |
| `add` | `{ tag, tags }` |
| `remove` | `{ tag, tags }` |
| `reject` | `{ tag, reason: 'duplicate' \| 'max-count' }` |

### `<b-checkbox>`
| Attribute | Values |
|-----------|--------|
| `checked` | boolean |
| `indeterminate` | boolean |
| `disabled` | boolean |
| `name` | string |
| `label` | string |
| `value` | string — submitted when checked (default `on`); see [Form participation](#form-participation) |
| `required` | boolean — must be checked; forwarded to the inner input |

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
| `value` | string — submitted when checked (default `on`) |
| `required` | boolean — must be on; forwarded to the inner input |

| Event | Detail |
|-------|--------|
| `change` | `{ name, checked }` |

### `<b-radio>`
| Attribute | Values |
|-----------|--------|
| `checked` | boolean |
| `disabled` | boolean |
| `name` | string (shared across group — the form receives one entry from the checked member) |
| `value` | string — submitted when this member is checked |
| `label` | string |

`required` is **not** supported (it is a group property, not a per-button one) — validate the group in the
page or via `b-form`.

| Event | Detail |
|-------|--------|
| `change` | `{ name, value }` |

### `<b-date-picker>`
Calendar picker. Renders its own panel by default; `native` swaps in `<input type="date">`.

| Attribute | Values |
|-----------|--------|
| `label` | string |
| `name` | string |
| `value` | ISO date (`YYYY-MM-DD`) |
| `placeholder` | string |
| `error` | string |
| `disabled` | boolean |
| `required` | boolean |
| `hint` | string (`?` tooltip) |
| `description` | string — persistent help text under the control, wired into `aria-describedby` (contrast `hint`, a `?` tooltip) |
| `bare` | boolean — strip the `.field` wrapper, label row and error row (inline use; see [Inputs](#inputs)) |
| `min` / `max` | ISO date bounds |
| `native` | boolean — use the browser's own `<input type="date">` instead of the custom panel |
| `label-today` / `label-clear` | string (footer buttons) |
| `label-months` / `label-days` | JSON array of names — per-instance locale override |

| Event | Detail |
|-------|--------|
| `change` | `{ name, value }` — `value` is the ISO date, or `''` when cleared |

Form-associated: submits the **ISO value**, not the formatted text shown in the box. In `native` mode the
inner `<input type="date">`'s own `min`/`max` validity is mirrored; the custom panel enforces `required` only.

### `<b-datetime-picker>`
Calendar + time-of-day picker.

| Attribute | Values |
|-----------|--------|
| `label` | string |
| `name` | string |
| `value` | ISO datetime (`YYYY-MM-DDTHH:mm`; a zoned string is converted to local) |
| `placeholder` | string |
| `error` | string |
| `disabled` | boolean |
| `required` | boolean |
| `hint` | string (`?` tooltip) |
| `description` | string — persistent help text under the control, wired into `aria-describedby` (contrast `hint`, a `?` tooltip) |
| `bare` | boolean — strip the `.field` wrapper, label row and error row (inline use; see [Inputs](#inputs)) |
| `min` / `max` | ISO datetime bounds |
| `label-today` / `label-clear` | string |
| `label-months` / `label-days` | JSON array of names |

| Event | Detail |
|-------|--------|
| `change` | `{ name, value }` — ISO datetime |

### `<b-time>`
Time-of-day picker.

| Attribute | Values |
|-----------|--------|
| `label` | string |
| `name` | string |
| `value` | `HH:mm` |
| `placeholder` | string |
| `error` | string |
| `disabled` | boolean |
| `required` | boolean |
| `hint` | string |
| `min` / `max` | `HH:mm` bounds |
| `step` | number — minute granularity |
| `description` | string — persistent help text under the control, wired into `aria-describedby` (contrast `hint`, a `?` tooltip) |
| `bare` | boolean — strip the `.field` wrapper, label row and error row (inline use; see [Inputs](#inputs)) |

| Event | Detail |
|-------|--------|
| `change` | `{ name, value }` — `HH:mm` |

### `<b-date-range-picker>`
Two-endpoint date range, with optional presets and a confirm step.

| Attribute | Values |
|-----------|--------|
| `label` | string |
| `name` | string |
| `value` | ISO interval `start/end` |
| `placeholder-start` / `placeholder-end` | string |
| `error` | string |
| `disabled` | boolean |
| `required` | boolean |
| `hint` | string |
| `min` / `max` | ISO date bounds |
| `min-days` / `max-days` | number — allowed range length |
| `months-visible` | `1` \| `2` |
| `separator` | string between the two boxes (default `→`) |
| `native` | boolean — two `<input type="date">` instead of the panel |
| `confirm` | boolean — require Apply rather than committing on the second click |
| `presets` | JSON array of `{ label, start, end }` |
| `label-today` / `label-clear` / `label-apply` / `label-cancel` | string |
| `description` | string — persistent help text under the control, wired into `aria-describedby` (contrast `hint`, a `?` tooltip) |
| `bare` | boolean — strip the `.field` wrapper, label row and error row (inline use; see [Inputs](#inputs)) |

| Method | Signature |
|--------|-----------|
| `setRange` | `({ start, end }) => void` |
| `getRange` | `() => { start, end } \| null` |
| `setPresets` | `(presets: { label, start, end }[]) => void` |
| `clear` | `() => void` |

| Event | Detail |
|-------|--------|
| `change` | `{ name, value: { start, end } \| null }` |
| `range-preview` | `{ start, end }` — hover preview while picking |

Form-associated: submits **`name-start` and `name-end`** as two ISO dates, not the joined interval that
`value` returns. See [Form participation](#form-participation).

### `<b-color-picker>`
Hex colour with an optional opacity slider.

| Attribute | Values |
|-----------|--------|
| `label` | string |
| `name` | string |
| `value` | hex — `#rrggbb`, or `#rrggbbaa` in `alpha` mode |
| `placeholder` | string |
| `alpha` | boolean — show the opacity slider and keep the alpha byte in `value` |
| `swatch-only` | boolean — swatch without the hex text box |
| `compact` | boolean — inline layout (pairs with `swatch-only alpha`) |
| `description` | string — persistent help text under the control, wired into `aria-describedby` (contrast `hint`, a `?` tooltip) |
| `bare` | boolean — strip the `.field` wrapper, label row and error row (inline use; see [Inputs](#inputs)) |
| `error` | string |
| `disabled` | boolean |
| `required` | boolean |
| `hint` | string |

| Event | Detail |
|-------|--------|
| `change` | `{ name, value }` — committed colour |
| `input` | `{ name, value }` — live while dragging |

Form-associated: submits the **base hex** (`#rrggbb`); the alpha byte is dropped even in `alpha` mode, while
`el.value` keeps it.

### `<b-markdown-editor>`
Markdown source + rendered preview, with a mode switch.

| Attribute | Values |
|-----------|--------|
| `label` | string |
| `name` | string |
| `value` | markdown source |
| `placeholder` | string |
| `error` | string |
| `disabled` | boolean |
| `required` | boolean |
| `hint` | string |
| `mode` | `split` \| `source` \| `preview` |
| `readonly` | boolean |
| `description` | string — persistent help text under the control, wired into `aria-describedby` (contrast `hint`, a `?` tooltip) |
| `bare` | boolean — strip the `.field` wrapper, label row and error row (inline use; see [Inputs](#inputs)) |
| `rows` | number |

| Method | Signature |
|--------|-----------|
| `setValue` | `(markdown: string) => void` |
| `getValue` | `() => string` |
| `focus` | `() => void` |

| Event | Detail |
|-------|--------|
| `change` | `{ name, value }` — the markdown source |
| `blur` | `{ name, value }` |

Form-associated: submits the markdown **source**, never the rendered preview HTML.

### `<b-option-group>`
Single choice rendered as a list of radio-style options (a labelled group, not `b-radio` buttons).

| Attribute | Values |
|-----------|--------|
| `label` | string |
| `name` | string |
| `value` | selected option value |
| `disabled` | boolean |
| `hint` | string |

| Method | Signature |
|--------|-----------|
| `setOptions` | `(options: { value: string; label: string }[]) => void` |

| Event | Detail |
|-------|--------|
| `change` | `{ name, value }` |

### `<b-segmented>`
Segmented control — a horizontal single-choice switch for 2–4 short options.

| Attribute | Values |
|-----------|--------|
| `label` | string (accessible name for the group) |
| `name` | string |
| `value` | selected option value |
| `disabled` | boolean |

| Method | Signature |
|--------|-----------|
| `setOptions` | `(options: { value: string; label: string }[]) => void` |

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

### `<b-range>`
| Attribute | Values |
|-----------|--------|
| `label` | string |
| `hint` | string |
| `name` | string |
| `error` | string (shows error message) |
| `disabled` | boolean |
| `required` | boolean |
| `min` | number (default 0) |
| `max` | number (default 100) |
| `step` | number (default 1) |
| `mode` | `single` \| `range` (default `single`) |
| `display` | `both` \| `slider` \| `input` (default `both`) |
| `value-type` | `number` \| `int` \| `percent` (default `number`) |
| `value` | string — single: `"42"`, range: `{"from":10,"to":50}` |

| Property | Type | Description |
|----------|------|-------------|
| `inputValue` | `string` (getter/setter) | Single: number string. Range: JSON `{"from":X,"to":Y}` |

| Event | Detail |
|-------|--------|
| `change` | Single: `{ name, value }` — Range: `{ name, value: { from, to } }` |
| `description` | string — persistent help text under the control, wired into `aria-describedby` (contrast `hint`, a `?` tooltip) |
| `bare` | boolean — strip the `.field` wrapper, label row and error row (inline use; see [Inputs](#inputs)) |

**Modes:**
- `single` — one value with slider thumb + number input
- `range` — from-to with two slider thumbs + two number inputs

**Value types:**
- `number` — decimal, stored as-is
- `int` — rounded to nearest integer
- `percent` — displayed 0-100, stored 0-1 (b-form converts automatically)

### `<b-qty-stepper>`
A quantity stepper: − / + around a typed field, with a decimal step anchored at `min` and a unit label.

| Attribute | Values |
|-----------|--------|
| `label` / `hint` / `description` | string |
| `name` | string |
| `value` | canonical decimal string (`"1.5"`) |
| `min` | number (default `0`) — also the anchor of the step grid |
| `max` | number (default none) |
| `step` | number > 0 (default `1`; `0.5` for half units) |
| `unit` | string shown after the control (`m`, `ks`) and read out with the value |
| `placeholder` | string |
| `size` | `sm` \| `lg` |
| `error`, `required`, `disabled`, `bare` | as on every form control |
| `label-decrement` / `label-increment` | per-instance button names (default `Decrease {label}` / `Increase {label}`, `bwc.qtyStepper.*`) |

| Property / method | Description |
|-------------------|-------------|
| `value` | `string` get/set — canonical, `''` when empty. **Assignments are kept verbatim** (no snapping, no `change`) |
| `numericValue` | `number \| null` |
| `stepBy(n)` | step `n` steps (negative = down), clamped; emits `change` |

| Event | Detail |
|-------|--------|
| `change` | `{ name, value }` — once per committed value: a button press, a key, or typed text on blur / Enter |

**Rules.** Steps are integer arithmetic on a scaled grid, so `0.1 × 3` is exactly `0.3`. What the **user** types is
clamped to `[min, max]` and rounded to the nearest step on the grid anchored at `min` (ties up); unreadable text
reverts. What the **app** assigns is kept and, if off the grid or out of range, reported through validity
(`stepMismatch` / `rangeUnderflow` / `rangeOverflow`) rather than silently changed. The first press from an
off-grid value lands on the adjacent grid point. The field shows the value in the current locale without
grouping; both `,` and `.` are accepted when typing.

Keyboard (in the field): ArrowUp / ArrowDown step, PageUp / PageDown step ×10, Home → `min`, End → `max` (only when
there is a max), Enter commits. The field is a plain text field described by the unit; − / + are in the Tab order and
become `aria-disabled` (not `disabled`) at a limit; each step is announced with its unit.

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
| `validate` | `() => { valid, data, errors, groupErrors }` | Validate all fields — schema rules **and** each control's own verdict (see below) |
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

**`type: 'decimal'` in a schema** maps to `b-input type="decimal"` (see its section above) and is what you
want for any field accepting a decimal — `'number'` renders a native `type="number"`, which cannot accept a
comma. `min` / `max` / `step` are forwarded to the **host** element rather than the inner control, because
`b-input` enforces them itself in this mode.

**`type: 'percent'` renders through that same mode**, since a percent is a decimal by definition and `12,5 %`
is an ordinary thing to type. Its `%` suffix and its 0-100 ⇄ 0-1 storage conversion are keyed on the schema
type and are unchanged; `getValues()` / `validate().data` still return the storage form (`0.125`) as a
**number**. The visible tradeoff is that a text-based control has no native spinner arrows.

No implicit `min`/`max` is applied to a percent field — set them explicitly if you want 0-100 enforced.

Two caveats specific to it:

- `getValues()` returns the **raw string** (`'81,8'`), as it does for `'number'` — the form does not coerce.
  Read `numericValue` off the field element, or pass the string through `parseDecimal` from
  `birko-web-core`. `Number('81,8')` is `NaN` and `parseFloat('81,8')` is `81`.
- A `min`/`max`/`range` **rule** and a `min`/`max` **attribute** are separate mechanisms with separate
  messages, but both now report through `validate()`. When a field carries both, the **rule** wins: the
  control is consulted only after the rules have had their say, so one field reports one message.

#### What `validate()` takes from the controls themselves

`validate()` runs the schema rules and then, for a field the rules had nothing to say about, adopts a
**narrow, fixed set** of the control's own validity flags. It is not a `checkValidity()` gate:

| Flag | Adopted | Why |
|---|---|---|
| `badInput` | **always** | "This text is not a number at all." No schema rule can express it, because the value never reaches the form — a native `number` input hands out `''` for junk, which reads as merely empty |
| `rangeUnderflow` / `rangeOverflow` / `stepMismatch` | **only** on `type: 'decimal'` / `'percent'` | There they are `b-input`'s own, set from the `min`/`max`/`step` the schema asked for. On `type: 'number'` they are the browser's, and carry its implicit `step=1` |
| everything else | no | `valueMissing` is `required`'s; `customError` is this form's own `error` from the previous run; `typeMismatch` / `patternMismatch` / `tooLong` / `tooShort` each have a schema rule that says the same thing |

The exclusions are the point. **`12.5` in a plain `type: 'number'` field is already natively invalid** —
`step` defaults to 1, so the browser reports `stepMismatch` ("the two nearest valid values are 12 and 13") —
and `b-form` has always ignored it. A blanket `checkValidity()` gate would newly reject fractional input in
every `number` field that has ever worked: a silent breaking change dressed as a bug fix. Adopting any of the
remaining flags is that same trap one field type at a time, and belongs in its own change.

A field disabled by `readonly` / `disabled` / `field.disabled` is skipped, matching native constraint
validation. Localise the messages by overriding `rangeUnderflowMessage()` / `rangeOverflowMessage()` /
`stepMismatchMessage()` / `badDecimalMessage()` on `b-input`; `common.invalidValue` is the fallback for a
control that reports a flag with no message.

**Known gap, deliberately left open:** an unchecked `required` checkbox still passes. The form's emptiness
test counts `false` as a filled value, so its `required` rule passes and the control is never consulted.
Closing it would start blocking forms that have always submitted.

#### `data` on failure

Check `valid` before reading `data`. For a rejected field `data` still carries what was collected — a
`'12,5'` that failed a `max` rule is still `0.125` — because a consumer echoing the value back needs it. The
one exception is a field whose control reported **`badInput`**: there is no number there, so the entry is
`null` rather than the raw typed string. That does not make ignoring `valid` safe; it removes the case where
the payload was a *string* impersonating a number (`Number('abc')` → `NaN` → serialized `null`, which a
nullable API field with a `HasValue` guard turns into a save that reports success and changes nothing).

---

## Data

### `<b-table>`
| Attribute | Values |
|-----------|--------|
| `loading` | boolean (shows loading bar) |
| `empty-text` / `label-no-data` | string (default: "No data") |
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

**Header content**: `label` is escaped text. For markup in a header, give the column a `headerRender`
(a code opt-in returning raw HTML) — the header counterpart to a cell's `render`. `<b-data-table>`'s
selection column uses it for the "select all" checkbox; see the README § *TableColumn — header content*.

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

`ChartOptions`: `xAxis`, `yAxis`, `tooltip`, `stacked`, `overlay` (bar mode — superimpose series at full
category width for target-vs-actual; background series first), `thresholds`, `showLatestValue` (bold last
value beside each series' final point — default `true`; the `realTime.showLatestValue` spelling still works
and this one wins over it), `realTime`.

`yAxis`: `label`, `min`/`max` (pin the band — a pinned bound is drawn exactly as given and never rounded
outwards), `gridLines`, `ticks` (target label count; omit and it is derived from the plot height — 6 at 300px,
2 at 90px), `nice` (round tick values to 1/2/2.5/5×10ⁿ and extend an auto-derived bound onto one — default
`true`; `false` restores the raw equal-split band).

The axis maths is exported for consumers that need to align their own scale to a chart's:
`niceScale(min, max, targetIntervals, { extendMin?, extendMax? }) => AxisScale`,
`tickIntervalsForHeight(plotHeightPx) => number`, `formatTick(value, decimals) => string`.

### `<b-pre>`
Preformatted text block. Slot-based content.

| Attribute | Values |
|-----------|--------|
| `wrap` | boolean (soft-wrap long lines) |
| `max-height` | string (CSS height — enables scroll) |
| `size` | `sm` \| (default) \| `lg` |

### `<b-code-block>`
Syntax-highlighted code with copy button.

| Attribute | Values |
|-----------|--------|
| `language` | `json`/`js`/`ts`/`html`/`xml`/`css`/`sql`/`csharp`/`bash`/`plain` (aliases: `javascript`, `typescript`, `cs`, `c#`, `shell`, `sh`) |
| `code` | source (overrides text content) |
| `wrap` | boolean |
| `show-line-numbers` | boolean |
| `no-copy` | boolean (hide copy button) |
| `max-height` | string (CSS length; `<pre>` becomes the scroll container) |
| `sticky-header` | `page` — card overflow flips to `visible` so the header pins to the page viewport (mutually exclusive with `max-height`; page mode wins) |
| `size` | `sm` \| (default) \| `lg` |
| `label-copy` / `label-copied` | button text overrides |

| Method | Signature |
|--------|-----------|
| `setCode` | `(code: string, language?: string) => void` |

| Event | Detail |
|-------|--------|
| `copy` | `{ code }` |
| `copy-error` | `{}` |

### `<b-definition-list>`
Semantic `<dl>` term/description pairs.

| Attribute | Values |
|-----------|--------|
| `layout` | `stacked` (default) \| `inline` \| `horizontal` \| `grid` |
| `size` | `sm` \| (default) \| `lg` |
| `align` | `right` (dd text-align) |

| Method | Signature |
|--------|-----------|
| `setItems` | `(items: { term: string; description: string }[]) => void` |
| `getItems` | `() => DefinitionItem[]` |

Slot: default (raw `<dt>`/`<dd>` markup, used when `setItems` is not called).

### `<b-object-tree>`
Recursive property tree for any JS value. Primitive by default; opt in to the shared data-viewer card + toolbar via `show-header`.

| Attribute | Values |
|-----------|--------|
| `expanded-depth` | number (initial open depth; default 1) |
| `max-depth` | number (cap tree expansion) |
| `size` | `sm` \| (default) \| `lg` |
| `show-types` | boolean |
| `show-header` | boolean — when set, wraps the tree in a `data-viewer-card` with a sticky toolbar header (Expand / Collapse / Copy) matching `b-json-viewer` / `b-xml-viewer` |
| `header-title` | string (default `Tree`; only applies when `show-header` is on) |
| `no-copy` | boolean — hide Copy button from the toolbar |
| `no-expand-actions` | boolean — hide Expand/Collapse buttons from the toolbar |
| `max-height` | string (CSS length; body becomes the scroll container) |
| `sticky-header` | `page` — card overflow flips to `visible` so the header pins to the page viewport (mutually exclusive with `max-height`; page mode wins) |
| `label-expand` / `label-collapse` / `label-copy` / `label-copied` | button text overrides |

| Method | Signature |
|--------|-----------|
| `setData` | `(data: unknown) => void` |
| `getData` | `() => unknown` |
| `expandAll` | `() => void` |
| `collapseAll` | `() => void` |

| Event | Detail |
|-------|--------|
| `toggle` | `{ path, expanded }` |
| `copy` | `{ text }` (serialized JSON; emitted when `show-header` is on and Copy is clicked) |
| `copy-error` | `{}` |

### `<b-json-viewer>`
Composes `<b-object-tree>` with JSON-specific UX.

| Attribute | Values |
|-----------|--------|
| `src` | JSON string (parsed on mount) |
| `expanded-depth`, `max-depth`, `size`, `show-types` | forwarded to inner `<b-object-tree>` |
| `no-copy` | boolean |
| `max-height` | string (CSS length; body becomes the scroll container) |
| `sticky-header` | `page` — card overflow flips to `visible` so the header pins to the page viewport (mutually exclusive with `max-height`; page mode wins) |
| `label-expand` / `label-collapse` / `label-copy` / `label-copied` | button text overrides |

| Method | Signature |
|--------|-----------|
| `setData` | `(data: unknown \| string) => void` (strings are parsed) |
| `getData` | `() => unknown` |

| Event | Detail |
|-------|--------|
| `copy` | `{ text }` |
| `copy-error` | `{}` |

### `<b-xml-viewer>`
Collapsible XML tree via DOMParser.

| Attribute | Values |
|-----------|--------|
| `src` | XML string |
| `expanded-depth` | number (initial open depth; default 1) |
| `max-depth` | number |
| `size` | `sm` \| (default) \| `lg` |
| `no-copy` | boolean |
| `max-height` | string (CSS length; body becomes the scroll container) |
| `sticky-header` | `page` — card overflow flips to `visible` so the header pins to the page viewport (mutually exclusive with `max-height`; page mode wins) |
| `label-expand` / `label-collapse` / `label-copy` / `label-copied` | button text overrides |

| Method | Signature |
|--------|-----------|
| `setSource` | `(xml: string) => void` |
| `setDocument` | `(doc: Document) => void` |
| `getSource` | `() => string` |
| `expandAll` | `() => void` |
| `collapseAll` | `() => void` |

| Event | Detail |
|-------|--------|
| `toggle` | `{ path, expanded }` |
| `copy` | `{ text }` |
| `copy-error` | `{}` |

---

## Layout

### `<b-carousel>`
Slides are the element's light-DOM children (server-rendered content is enhanced, never moved).

| Attribute | Values |
|-----------|--------|
| `label` | string — names the carousel region |
| `per-view` | `1`–`6` slides visible at once (default 1). Or set `--b-carousel-per-view` in CSS — that wins, so breakpoints are media queries |
| `loop` | boolean — previous / next wrap |
| `autoplay` | interval in ms (empty → 5000). Never runs under `prefers-reduced-motion` |
| `label-previous` / `label-next` / `label-play` / `label-pause` | per-instance names (`bwc.carousel.*`) |

| CSS property | Default |
|--------------|---------|
| `--b-carousel-per-view` | `1` |
| `--b-carousel-gap` | `var(--b-space-md)` |

| Property / method | Description |
|-------------------|-------------|
| `index` | first visible slide |
| `goTo(i)` / `next()` / `prev()` | navigate (clamped; `next` / `prev` honour `loop`) |

| Event | Detail |
|-------|--------|
| `slide-change` | `{ index }` — from arrows, dots, swipe, drag, autoplay and `goTo` |

One page of slides renders no arrows, dots or autoplay. Off-screen slides are `inert`. Autoplay pauses while
hovered, stops when keyboard focus enters (the start button restarts it) and always shows a stop / start control.

### `<b-gallery>`
Images are the element's light-DOM children — `<img alt="…">`, primary first.

| Attribute | Values |
|-----------|--------|
| `label` | string — names the gallery region |
| `index` | starting image (0-based); setting it later navigates |
| `zoom-close-outside` | boolean — a click on the empty space around the zoomed image closes the zoom (default: only Escape / ×) |
| `label-previous` / `label-next` / `label-zoom` / `label-close` / `label-image` | per-instance names (`bwc.gallery.*`) |

| Per-image attribute | Meaning |
|---------------------|---------|
| `alt` | names the image, its thumbnail and the zoom dialog (missing → "Image n") |
| `data-thumb` | small URL for the thumbnail (default: the image's own source) |
| `data-full` | large URL for the zoom (default: the largest `srcset` candidate, else the image's own source) |

| CSS property | Default |
|--------------|---------|
| `--b-gallery-aspect-ratio` | `1` (main image box; images are `object-fit: contain`) |
| `--b-gallery-thumb-size` | `4rem` |

| Property / method | Description |
|-------------------|-------------|
| `index` | current image |
| `show(i)` | show image `i` (clamped) — use it to switch image on a variant pick |
| `openZoom()` / `closeZoom()` | the full-view dialog |

| Event | Detail |
|-------|--------|
| `image-change` | `{ index }` |
| `zoom-open` / `zoom-close` | `{ index }` |

The zoom is full-screen on a phone and a framed panel over a dimmed backdrop from 48rem, where a click on the
backdrop closes it. One image renders no navigation. In a container narrower than 24rem (a phone column) the thumbnails are drawn as dots.

### `<b-card>`
| Attribute | Values |
|-----------|--------|
| `header` | string (card title) |
| `padding` | `none` \| `sm` \| `md` \| (default `lg`) \| `xl` — one rung each of the `--b-space-*` scale |

Slots: default (body), `header` (custom header), `actions` (header right), `footer`.

CSS custom properties: `--b-card-header-bg`, `--b-card-header-text`, `--b-card-shadow` (elevation;
defaults to `var(--b-shadow-sm)` — set `none` for a flat card without neutralising `--b-shadow-sm` for
everything else in scope).

The card is **chrome** — background, border, radius, elevation. How its contents stack is the contents'
business: there is deliberately no `layout` / `gap` / `direction` attribute, so a card whose children need a
column with a gap wraps them in one element of its own. See `TASK-105` for why.

### `<b-button-group>`
| Attribute | Values |
|-----------|--------|
| `label` | string (aria-label for the group) |

Slot: default (related `<b-button>`s, rendered as one bordered, rounded cluster).

### `<b-toolbar>`
| Attribute | Values |
|-----------|--------|
| `label` | string (aria-label for the toolbar) |

Slots: default (button groups / buttons, laid out with gap + wrap), `end` (pushed to the far edge — destructive/exit actions).

### `<b-modal>`
| Attribute | Values |
|-----------|--------|
| `title` | string |
| `size` | `sm` \| (default = md) \| `lg` \| `xl` \| `xxl` \| `full` (viewport minus `--b-modal-full-inset`, both axes — editor surfaces) |

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
| `size` | `sm` \| (default = md) \| `lg` \| `xl` \| `xxl` |
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

### `<b-accordion>`
| Attribute | Values |
|-----------|--------|
| `multiple` | boolean (allow several sections open at once; default single-open) |
| `size` | `sm` \| `md` \| `lg` (header vertical footprint) |

| Method | Signature |
|--------|-----------|
| `setItems` | `(items: AccordionItem[]) => void` |
| `open` / `close` / `toggle` | `(id: string) => void` |
| `openAll` / `closeAll` | `() => void` |
| `getOpen` | `() => string[]` |

| Event | Detail |
|-------|--------|
| `toggle` | `{ id, open }` |

**AccordionItem**: `{ id, header, open?: boolean, disabled?: boolean }`

Slots: one per section, named after its `id` (e.g. `slot="general"`).

### `<b-split-panel>`
| Attribute | Values |
|-----------|--------|
| `master-width` | CSS value (e.g. `18rem`, `2fr`) |
| `detail-width` | CSS value |
| `collapse-at` | CSS length breakpoint — `48rem` (preferred, tracks browser font size), `800px`, or a bare number read as px. Omitted or unparseable → `48rem` |
| `gap` | CSS value |
| `static-detail` | present = opt out of the sticky detail column (see below) |

Slots: `master`, `detail`.

Side by side, the detail column is **sticky**: it follows the reader down a master taller than the
screen, so a row clicked at the bottom of a long list opens its detail beside that row instead of off
screen above. It is capped at the height of the scrolling pane (measured, not `100dvh`) and scrolls
inside itself beyond that. `--b-split-detail-sticky-top` sets the gap above it, and doubles as its
bottom inset. Collapsed to one column the detail is stacked below the master and stickiness is switched
off — there is no room to travel and the page already scrolls.

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
| `tabs-only` | boolean (pure tab-strip nav — no panel, no expand/pin controls) |
| `label-*` | i18n overrides: `label-ribbon`, `label-open-nav`, `label-expand`, `label-collapse`, `label-pin`, `label-unpin`, `label-navigation`, `label-actions`, `label-close`, `label-scroll-tabs-{left,right}`, `label-scroll-groups-{left,right}` |

Both the tab strip and the panel scroll horizontally when they overflow, with chevron buttons as the
affordance (the scrollbars are hidden so the ribbon's height never changes with the window width).

**RibbonGroup**: `{ id, label, items: RibbonItem[], icon?, scalingPriority?, minSize? }`

`scalingPriority` (default 0) and `minSize` (default `'popup'`) drive Office-style progressive scaling —
`RibbonGroupSize` is `'large' | 'medium' | 'small' | 'popup'`, and a **lower** priority degrades **first**
(priority = importance; this is Birko's direction, not RibbonX's). `icon` is drawn on the collapsed chunk
button at `'popup'`. The degrade pass itself is not implemented yet — these fields are inert today.

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
