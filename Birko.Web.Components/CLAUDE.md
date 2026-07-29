# Birko.Web.Components — AI Instructions

## What this project is

Component library built on `Birko.Web.Core`. 58 Shadow DOM web components covering inputs, layout, data, feedback, navigation, and command palette. Consumed by Symbio UI and any project that imports `birko-web-components`.

## Directory structure

```
src/
├── inputs/          # b-input, b-select, b-button, b-checkbox, b-switch, b-radio,
│                    # b-textarea, b-multi-select, b-tag-input, b-search-input,
│                    # b-file-upload, b-inline-edit, b-range, b-form, b-segmented,
│                    # b-date-picker, b-datetime-picker, b-date-range-picker, b-time, b-markdown-editor,
│                    # b-option-group, b-color-picker
├── layout/          # b-card, b-accordion, b-modal, b-drawer, b-tabs, b-confirm-dialog,
│                    # b-dropdown-menu, b-tooltip, b-split-panel, b-chat,
│                    # b-button-group, b-toolbar
├── data/            # b-table, b-editable-table, b-data-table, b-pagination,
│                    # b-badge, b-tag, b-chart, b-kanban, b-pre, b-code-block,
│                    # b-definition-list, b-object-tree, b-json-viewer, b-xml-viewer
├── feedback/        # b-toast (+ toast manager), b-spinner, b-progress, b-empty, b-skeleton, b-stale-banner
├── dialogs/         # imperative helpers (NOT components): confirm/confirmDelete/alert/prompt/
│                    # choose/promptForm/busy/notify — a lean subpath over the components below
├── nav/             # b-sidebar, b-breadcrumb, b-ribbon, b-tree-menu
├── command/         # b-command-palette, command-provider
├── locales/         # en.json (canonical bwc.* keys)
├── shared-styles.ts # Pre-parsed CSSStyleSheet objects
├── shared-styles.css# Source CSS with @sheet sections
└── dom-utils.ts     # Shared markup/keyboard helpers: escapeHtml/escapeAttr, isActivationKey, rovingIndex
css/
├── tokens.css       # Base/light --b-* design tokens (:root) — required
├── themes/          # One file per opt-in theme (dark.css, neon.css, finstat.css)
└── reset.css        # Minimal reset
```

## Critical rules

### Token usage (MANDATORY)
- Every color, spacing, radius, shadow, z-index → `var(--b-*)` token
- Never: `color: #fff`, `padding: 12px`, `border-radius: 4px`
- Always: `color: var(--b-text)`, `padding: var(--b-space-md)`, `border-radius: var(--b-radius-sm)`
- Full token reference: `css/tokens.css`

### Breakpoints in `rem`, not `px` (MANDATORY)

Width media queries use `rem`: `@media (max-width: 40rem)`, never `640px`. In a media query `rem`
resolves against the **browser's default font size** — *not* a `:root { font-size }` override — so a
reader who scales their browser text up gets the narrow layout at the right moment, and a host app that
sets a 14px root does not shift every breakpoint. The shipped ladder (their px equivalents at a default
16px browser):

| Breakpoint | = px @16px | Used by |
|---|---|---|
| `30rem` | 480 | `b-confirm-dialog` (stacked footer) |
| `40rem` | 640 | `b-modal` (`full` edge-to-edge), `b-drawer` (full-bleed), `b-form` (grid → 1 col) |
| `48rem` | 768 | `b-ribbon` (hamburger), `b-split-panel` (default collapse), Shell `b-app-shell` / `b-core-app-shell` |
| `64rem` | 1024 | `b-ribbon` (tab labels hidden) |

Reuse a rung before inventing one. `prefers-reduced-motion` / `pointer: coarse` queries are unaffected.

### No backticks inside `static get styles()`

The CSS lives in a **template literal**, so a backtick anywhere inside it — including in a comment —
terminates the string and the rest of the file parses as broken TypeScript. The errors that come out
(`TS1005: ',' expected`, `Property 'x' does not exist on type '"
 :host {…"'`) point at a *later* line and
read as something else entirely, which is what makes it expensive.

Write CSS comments with plain text or double quotes: `/* the .options row */`, not `` /* the `.options` row */ ``.
Markdown-style backticks are a habit from the doc comments directly above; they do not survive here.

### Shared stylesheets (MANDATORY — no duplication)
Before writing CSS, check if a shared sheet covers the pattern:

| Sheet | Provides | Use for |
|-------|---------|---------|
| `backdropSheet` | `.backdrop` fullscreen overlay | b-modal, b-drawer, b-confirm-dialog |
| `dialogBaseSheet` | `<dialog>` reset | native dialog elements |
| `closeButtonSheet` | `.close-btn` × icon button | overlay headers |
| `overlayHeaderSheet` | `.overlay-header` flex bar | modal/drawer title rows |
| `overlayBodySheet` | `.overlay-body` scrollable | modal/drawer body |
| `overlayFooterSheet` | `.overlay-footer` actions bar | modal/drawer footer |
| `formFieldSheet` | `.field`, `label`, `.error` | input wrappers |
| `formControlSheet` | `input`, `select`, `textarea` base | form controls |
| `dropdownPanelSheet` | `.dropdown-panel` | menus, popover panels |
| `formToggleSheet` | checkbox/switch/radio wrapper | toggle inputs |
| `spinSheet` | `@keyframes spin` | b-button loading, b-spinner |
| `dataViewerCardSheet` | `.data-viewer-card` shell (bg-tertiary, border, radius) + `.sticky-page` modifier | b-object-tree (header on), b-json-viewer, b-xml-viewer, b-code-block |
| `dataViewerHeaderSheet` | `.data-viewer-header` compact sticky toolbar header with `.title` + `.actions` | same set as above |
| `toolbarBtnSheet` | `.toolbar-btn` small bordered header button with `.copied` state | same set as above |
| `srOnlySheet` | `.sr-only` / `.sr-only-focusable` visually-hidden helper | aria-live regions, off-screen labels |

```typescript
import { overlayHeaderSheet, overlayFooterSheet, closeButtonSheet } from '../shared-styles';

export class MyOverlay extends BaseComponent {
  static get sharedStyles() {
    return [overlayHeaderSheet, overlayFooterSheet, closeButtonSheet];
  }
  static get styles() {
    return `:host { display: contents; }`;  // only unique styles here
  }
}
```

### Semantic HTML (MANDATORY)
Use the right element — do not default to `<div>`:

| Element | Use when |
|---------|----------|
| `<header>` | Title row of a component or page |
| `<footer>` | Action row / bottom of a component, `slot="footer"` content |
| `<section>` | Named content region (add `aria-label`) |
| `<article>` | Self-contained item (notification, feed row, card) |
| `<p>` | Text paragraph (add `margin: 0` in CSS to reset browser default) |
| `<time datetime="iso">` | All timestamps |
| `<h2>`–`<h6>` | Headings inside components (add `margin: 0` in CSS) |
| `<dialog>` | Modal / confirm dialogs (`b-modal`, `b-confirm-dialog` already do this) |
| `<nav>` | Navigation containers (`b-sidebar` already does this) |
| `<kbd>` | Keyboard shortcuts |

When switching from `<div>` / `<span>` to `<p>`, `<h*>`, `<ul>` — always reset browser default margins in CSS.

### Spinner rule
Never write `@keyframes spin` in a component. Use `spinSheet` from `shared-styles.ts`. For loading states use `<b-spinner>`.

### Shared markup/keyboard helpers (MANDATORY — no duplication)
Do **not** re-declare per-component `_escapeHtml` / `_escapeAttr` or hand-roll the same key handling. Import from `dom-utils.ts`:
- `escapeHtml(s)` — escape `& < > "` for HTML text (and double-quoted attributes).
- `escapeAttr(s)` — alias of `escapeHtml`, used at attribute call sites for intent.
- `isActivationKey(e)` — `true` for Enter/Space; gate the keydown handler of any `role="button"` element with it.
- `rovingIndex(e, current, count)` — arrow/Home/End roving-tabindex math for radio groups / toolbars (returns the next index or `null`; calls `preventDefault()`).

### Accessibility (ARIA / screen readers)
Components must be operable and announced correctly. The catalogue's baseline (see [ACCESSIBILITY.md](ACCESSIBILITY.md) for the full map):

- **Roles** — interactive widgets carry the right ARIA role (`dialog`, `tablist`/`tab`/`tabpanel`, `menu`/`menuitem`, `listbox`/`option`, `tree`/`treeitem`/`group`, `status`/`alert`, `progressbar`). Decorative glyphs get `aria-hidden="true"`.
- **Form-control validation (MANDATORY for inputs)** — use the shared helpers from `inputs/label-hint.ts` instead of hand-rolling:
  - `fieldAria({ uid: this.uid, error, required })` → spreads `aria-invalid` / `aria-describedby` / `aria-required` onto the control. Pass `required` **only** for non-native controls (div-based combos / tag inputs); native `<input required>` already exposes it.
  - `renderError(this.uid, error)` → renders the error as `<span role="alert" id="${uid}-error">` so screen readers announce it, linked from the control via `aria-describedby`.
  - `this.uid` (from `BaseComponent`) is a stable per-instance id prefix that survives re-renders — use it to mint element ids (`${this.uid}-error`, `${this.uid}-body`, …).
- **Expand/collapse** — toggles reflect state with `aria-expanded` (on the `treeitem` for tree patterns, on the toggle button otherwise) and `aria-controls` pointing at the collapsible region. Async expansion sets `aria-busy="true"` while loading.
- **Live regions** — transient feedback (toasts, result counts, drag-drop) goes in an `aria-live` region. Use a `.sr-only` element (`srOnlySheet`) with `role="status"`/`aria-live="polite"` (or `alert`/`assertive` for errors) for screen-reader-only announcements.
- **Names** — every icon-only control has an `aria-label` via `this.label(...)`. Dialogs set `aria-labelledby` (and `aria-describedby` when there's body text).
- **Shadow DOM caveat** — `aria-*` IDREF attributes (`aria-labelledby`, `aria-describedby`, `aria-controls`) only resolve **within the same shadow root**. Mint both the referenced element and the reference inside the component. Cross-boundary association (e.g. a tooltip describing slotted light-DOM content) is a known limitation — see ACCESSIBILITY.md.

### Component public API pattern
Every component exposes:
1. **Attributes** for declarative configuration (string, boolean, number)
2. **Methods** for imperative control (`open()`, `close()`, `setData()`, `setConfig()`, `load()`)
3. **Custom events** (composed + bubbles) for reactivity — use `this.emit('event-name', detail)`
4. **Slots** for content projection

Never expose internal state as properties — keep Shadow DOM encapsulation.

### Event naming
All custom events: kebab-case — `row-click`, `page-change`, `tab-change`, `item-click`

### `size` attribute convention
When a component exposes a `size` attribute, it falls into one of five distinct categories. Pick the category that matches the component's primary visual concern:

| Category | What `sm` / `md` / `lg` control | Tokens | Components |
|---|---|---|---|
| **Vertical footprint** | `min-height` of the chrome | `--b-control-min-height-sm/-md/-lg` | form inputs (via `formControlSheet` + `comboControlSheet`), `b-tag-input` |
| **Text scale** | inner `font-size` only | `--b-text-xs / -sm / -base` | `b-pre`, `b-code-block`, `b-object-tree`, `b-json-viewer`, `b-xml-viewer`, `b-definition-list` |
| **Width** | `max-width` / `width` of the panel | `--b-{modal,drawer}-width-{sm,md,lg,xl,xxl}` | `b-modal`, `b-drawer` (extend to `xl`/`xxl`; `b-modal` adds `full` — viewport minus `--b-modal-full-inset` in both axes) |
| **Shape weight** | diameter / track thickness | component-specific | `b-spinner` (diameter), `b-progress` (linear: track height; circular: ring diameter) |
| **Inline chip / button** | `padding` + `font-size` | `--b-space-*` + `--b-text-*` | `b-button`, `b-badge`, `b-tag` |

**Always style via `:host([size="sm"])` / `:host([size="lg"])` selectors** — never via class interpolation (`class="${size}"`). The host-attribute pattern keeps `size` as a pure CSS switch (no `observedAttributes` entry needed, no re-render on change) and stays consistent across the library.

`b-chart` is an exception: it uses `height` (SVG pixel layout) not `size` — different concept, documented.

### `hint` vs `description` (form-control help text)

Two attributes, two presentations, one concept each — do not merge them or add a third:

| Attribute | Renders | Helper | For |
|---|---|---|---|
| `hint` | tooltip behind a `?` icon beside the label | `renderLabel` | terse explainer read once |
| `description` | persistent row under the control, `id="${uid}-help"` | `renderHelp` | value/constraint needed while typing |

`.field .help` uses **`--b-text-secondary`, not `--b-text-muted`** — measured across all five shipped
themes, muted gives 2.03–3.07:1 against the field background (below WCAG AA's 4.5:1 for text at
`--b-text-xs`), secondary gives 3.77–7.24:1. Text meant to be read while typing has to clear AA; reach for
muted only for genuinely decorative text.

- **Both, not a mode.** A single attribute with a `tooltip|text` switch was considered and rejected: it makes
  a field unable to carry a standing constraint *and* a longer explainer at the same time, and any default
  choice is either wrong or a visible change for every consumer already passing `hint`.
- **`description` must go to `fieldAria()` as well as `renderField()`** — that is what puts `${uid}-help`
  into `aria-describedby`. Wiring the row without the ARIA is the whole bug this attribute exists to fix: a
  consumer's own sibling element cannot be referenced from inside shadow DOM, so a screen reader never
  announces it as the field's description.
- **Error and description coexist.** Both ids are described, **error first** (urgency beats reading order);
  visually the order is control → description → error. That divergence is deliberate and commented.
- **`renderHelp` escapes its input**; `renderError` does not (callers pre-escape). New helpers should follow
  `renderHelp` — escape-by-default is the choice that cannot produce an injection, and the caller-escapes
  convention is what produced three unescaped interpolations in `b-select` / `b-textarea`.
- **`bare` drops the row** and `title` carries the description — unless an error has claimed `title`, which
  wins. `title` is one string; concatenating a failure with standing help muddles the important one.
- `b-form`'s `FormField` carries `description?: string` alongside `hint?: string`, forwarded as an attribute.

### `bare` attribute convention (form controls)

A form control renders stacked chrome by default — the `.field` flex wrapper, a label row above and an
error-message row below. `bare` strips all three and emits the control alone, for inline hosts
(toolbars, table cells, editable-table cells, floating action bars) where that chrome and its flex gap
add unwanted vertical space. Pairs with `size="sm"` for dense layouts.

Supported on **all 14** controls that render the stacked chrome: `b-input`, `b-select` (both native and
searchable), `b-multi-select`, `b-textarea`, `b-tag-input`, `b-date-picker`, `b-datetime-picker`, `b-time`,
`b-date-range-picker`, `b-range`, `b-color-picker`, `b-markdown-editor`, `b-file-upload`, `b-option-group`.

`renderField` is the **only** place `.field` is constructed — `grep 'class="field"' src/inputs/*.ts` should
return `label-hint.ts` and nothing else. If it returns a component, that component is drifting.

Deliberately not supported: `b-search-input` renders no `.field` chrome at all (already bare), and the
toggles (`b-checkbox` / `b-switch` / `b-radio`) are inline label+control rather than stacked fields.

Rules when adding `bare` to a new form control:

- **Route the render through `renderField()`** (`src/inputs/label-hint.ts`) — never hand-roll the
  `bare ? … : …` branch. It owns the wrapper/label/error decision for the whole library.
- **`bare` goes in `observedAttributes`** so toggling it re-renders. Unlike `size` (a pure CSS switch)
  this one changes the markup, so it cannot be an attribute-selector-only feature.
- **Everything that is part of the *control* stays inside `control:`** — a `<datalist>`, a `.dropdown`
  / `.dp-panel` popover, a `.combo` / `.container` wrapper. Only the *chrome* is conditional. Popovers
  are resolved by selector and positioned against their trigger, so moving them out of the control
  silently breaks them in bare mode.
- **Pass `bare` (and `label`) to `fieldAria()`.** Removing the chrome removes both the `<label>` that
  named the control and the error span that `aria-describedby` pointed at, so the ARIA has to be
  rebuilt from attributes: `aria-label` from `label`, and the message as `title` instead of a dangling
  `aria-describedby`. A bare control still *announces* its error — it just has nowhere to print it.
  The `has-error` border is unaffected.

### Form-association convention (value-bearing controls)

The 15 value-bearing inputs extend **`FormControlComponent`** (from `birko-web-core`) rather than
`BaseComponent`, which makes them `ElementInternals`-based form-associated custom elements: value in
`FormData`, native constraint validation, `reportValidity()`, `form.reset()`, `<fieldset disabled>`.

**Do not move this onto `BaseComponent`.** `static formAssociated` is read per class at definition time
and `attachInternals()` is constructor-only/once, so putting it there would make every component —
`b-card`, `b-modal`, `b-table` — a submittable listed element, `:invalid`-matchable and
fieldset-disable-able. Form participation is opt-in by base class.

Converting or writing a value-bearing control:

1. **`extends FormControlComponent`**; no `formAssociated` / `attachInternals()` of your own (the base owns
   both, and a second `attachInternals()` throws). The base declares **`abstract get/set value(): string`**,
   so a control that forgets the unified `value` accessor fails to compile rather than at runtime — widen the
   setter if the control also accepts a richer type (`b-date-range-picker` takes a range object).
2. **Call `this.syncFormState()` at the end of `onUpdated()`, before any early return** — *not only* where
   you emit `change`. Imperative setters (`setSelected()`, `setTags()`, `setOptions()`), panel clicks and
   `inputValue` all mutate state and re-render **without** emitting; miss this and the control silently
   never registers a value or a validity. Also call it in the `change` path so typing updates immediately.
3. **Override `formValue()` when the submitted shape isn't "`value` as one string"**:
   - list of like values → `multiFormValue(values)` — one entry per value under `name` (the native
     `<select multiple)>` shape). `b-multi-select`, `b-tag-input`.
   - two distinct values → `suffixedFormValue([['from', a], ['to', b]])` → `name-from` / `name-to`.
     `b-range` (range mode), `b-date-range-picker` (`-start`/`-end`).
   - Return `null` for empty so nothing is submitted — native behaviour, and the difference between a
     server binding an empty list and binding `[""]`.
4. **Override `validationSource()` to `undefined` unless the inner control's `validity` is genuinely
   about the value.** Default behaviour mirrors the first inner `input`/`select`/`textarea` verbatim,
   which is what makes `type="email"`, `min`, `max`, `step` and `pattern` enforceable by the form for
   free. But it is *wrong* where the inner input holds something else: a formatted display string (the
   pickers), an option **label** (searchable `b-select`), a typing buffer (`b-tag-input`), or a control
   that is never empty and never invalid (`type="range"`, `type="color"`). Those get the base's generic
   `required`-only check instead.
5. **Override `formAnchor()`** for div-based controls so the validation bubble lands on the control
   (`.container`, `.drp-input-start`, …) rather than the host's corner.
6. **Override `captureInitialState()` / `restoreInitialState()` unless the state really is the `value`
   attribute.** The base default snapshots that attribute and restores by assigning `value` — right for
   value-backed controls, silently wrong otherwise, because `form.reset()` then feeds the wrong thing
   through a setter that means something else. A toggle resets its **checkedness** (the default would read
   `<b-checkbox value="yes" checked>`'s `"yes"` as unchecked); `b-multi-select` / `b-tag-input` snapshot
   their **list**. The baseline is taken at first sync — i.e. markup-declared state, which is what native
   does — so a control populated imperatively after mount should have `resetFormBaseline()` called once
   it is populated, or reset returns it to empty.
7. **Never write the host's own `disabled` attribute from `formDisabledCallback()`** — the base already
   handles ancestor-disabled via a separate flag folded into `boolAttr('disabled')`. Reflecting it onto
   the attribute makes the element *self*-disabled, so re-enabling the fieldset never fires the callback
   again and the control is stuck disabled permanently.

Precedence for validity is fixed and deliberate: the **`error` attribute wins** (as `customError` with
that message) over the inner control's native validity, because `error` is what `b-form` and page-level
validation set — the app's verdict must beat the browser's, and a control showing a message must not
report itself valid to the form.

**Toggle controls (`b-checkbox`, `b-switch`, `b-radio`) follow native checkbox semantics**, which are not
the same as their `.value`:

- `formValue()` returns the `value` attribute (default `on`) **only when checked**, `null` otherwise — an
  unchecked box must be **absent** from `FormData`, because that is how `bool` model binding detects false.
  Submitting `name=false` would arrive as a present, truthy string and silently mis-bind.
- `.value` / `.inputValue` still return `'true'`/`'false'` and are deliberately left alone: nothing reads
  them (`b-form._getFieldValue` and every consumer read `.checked`), so realigning them would be churn. The
  divergence between the JS surface and the submit surface is intentional — document it, don't "fix" it.
- `required` is forwarded to the inner input on checkbox/switch, so the browser's own "must be checked"
  rule applies. On **`b-radio` it is not supported**: `required` there is a property of the *group*, and
  evaluating it per element marks every unchecked member invalid (one bubble per radio for one logical
  field). `b-radio` sets `supportsRequiredValidation = false`; validate the group in the page or `b-form`.
- `b-radio` needs **no submission coordinator**: members share a `name` and only the checked one returns a
  value, so the form gets exactly one entry per group. But the existing `b-radio-change` sibling listener
  unchecks the previous member **without re-rendering it**, so that path must call `syncFormState()`
  explicitly — otherwise the group submits two entries.

### New component checklist
1. File: `src/{category}/b-{name}.ts`
2. Class: `B{Name} extends BaseComponent`
3. Register: `define('b-{name}', B{Name})`
4. Export from `src/{category}/index.ts` and `src/index.ts`
5. Check shared sheets before writing CSS
6. Use `--b-*` tokens exclusively
7. Use semantic HTML
8. Emit typed `CustomEvent` for state changes
9. Accessibility — follow the [Accessibility (ARIA / screen readers)](#accessibility-aria--screen-readers) rules: semantic role, `aria-hidden="true"` on decorative elements, validation ARIA via `fieldAria()`/`renderError()` for form controls, `aria-expanded` on expand/collapse toggles
10. Add to `CLAUDE.md` component table in this file

## Component inventory

### Inputs (22)
| Tag | Class | Key methods | Key attributes |
|-----|-------|-------------|----------------|
| `<b-input>` | BInput | — | `label`, `type`, `value`, `name`, `error`, `disabled` |
| `<b-select>` | BSelect | `setOptions([{value,label}])` | `label`, `name`, `value`, `error`, `disabled` |
| `<b-button>` | BButton | — | `variant`, `size`, `disabled`, `loading` |
| `<b-checkbox>` | BCheckbox | — | `checked`, `indeterminate`, `disabled`, `name`, `label` |
| `<b-switch>` | BSwitch | — | `checked`, `disabled`, `name`, `label` |
| `<b-radio>` | BRadio | — | `checked`, `disabled`, `name`, `value`, `label` |
| `<b-textarea>` | BTextarea | — | `label`, `name`, `value`, `rows`, `error`, `disabled` |
| `<b-multi-select>` | BMultiSelect | `setOptions([])` | `label`, `name`, `placeholder`, `error`, `disabled` |
| `<b-tag-input>` | BTagInput | `setTags([])`, `getTags()`, `clear()` | `label`, `name`, `value`, `placeholder`, `separators`, `max-count`, `allow-duplicates`, `error`, `disabled` |
| `<b-search-input>` | BSearchInput | — | `placeholder`, `value`, `debounce` |
| `<b-file-upload>` | BFileUpload | — | `accept`, `multiple`, `max-size`, `endpoint`, `disabled` |
| `<b-inline-edit>` | BInlineEdit | — | `value`, `placeholder`, `type` |
| `<b-range>` | BRange | — | `mode` (single\|range), `display` (both\|slider\|input), `value-type` (number\|int\|percent), `min`, `max`, `step` |
| `<b-segmented>` | BSegmented | `setOptions([{value,label}])` | `label`, `name`, `value`, `disabled` |
| `<b-color-picker>` | BColorPicker | — | `label`, `name`, `value` (`#rrggbb`, or `#rrggbbaa` with `alpha`), `placeholder`, `alpha` (opacity slider), `swatch-only` (hide hex field, swatch only), `size`, `error`, `hint`, `required`, `disabled` |
| `<b-date-picker>` | BDatePicker | `setLocale()` (static) | `label`, `name`, `value`, `min`, `max`, `native`, `error`, `disabled` |
| `<b-datetime-picker>` | BDatetimePicker | `setLocale()` (static) | `label`, `name`, `value`, `min`, `max`, `error`, `disabled` |
| `<b-date-range-picker>` | BDateRangePicker | `getRange()`, `setRange({start,end})`, `setPresets([])`, `clear()`, `setLocale()` (static) | `label`, `name`, `value` (ISO interval `start/end`), `min`, `max`, `min-days`, `max-days`, `months-visible` (1\|2), `confirm`, `presets` (JSON), `separator`, `native`, `error`, `disabled` |
| `<b-time>` | BTime | `setLocale()` (static) | `label`, `name`, `value`, `step`, `error`, `disabled` |
| `<b-markdown-editor>` | BMarkdownEditor | `setValue()`, `getValue()`, `setRenderer()` | `value`, `mode` (split\|source\|preview); toolbar: H1–H6, bold/italic/strike/highlight/sup/sub, blockquote, code, bullet/numbered/task lists, link, image, table, hr |
| `<b-option-group>` | BOptionGroup | `setOptions([{value,label,icon?}])` | `label`, `name`, `value`, `disabled` |
| `<b-form>` | BForm | `setSchema()`, `setValues()`, `validate()`, `setFieldError()`, `setFieldOptions()`, `setFieldDisabled()`, `onFieldChange()`, `focusField()`, `reset()` | `validate-on` |

### Layout (13)
| Tag | Class | Key methods | Key attributes |
|-----|-------|-------------|----------------|
| `<b-card>` | BCard | — | `header`, `padding` (none\|sm\|lg\|xl) |
| `<b-accordion>` | BAccordion | `setItems([{id,header,open?,disabled?}])`, `open(id)`, `close(id)`, `toggle(id)`, `openAll()`, `closeAll()`, `getOpen()` | `multiple` (allow several open), `size` (sm\|md\|lg — header footprint); body via `slot="{id}"`; event `toggle` `{id,open}` |
| `<b-button-group>` | BButtonGroup | — | `label` (aria-label); default slot of b-buttons rendered as one bordered cluster |
| `<b-toolbar>` | BToolbar | — | `label` (aria-label); default slot (clusters, gap + wrap) + `end` slot (pushed to far edge) |
| `<b-modal>` | BModal | `open()`, `close()` | `title`, `size` (sm\|md\|lg\|xl\|xxl = `max-width`; `full` = viewport minus `--b-modal-full-inset`, both axes — editor surfaces) |
| `<b-drawer>` | BDrawer | `open()`, `close()` | `title`, `size` (sm\|md\|lg\|xl\|xxl — no `full`), `modal` |
| `<b-tabs>` | BTabs | `setTabs([{id,label}])` | `active` |
| `<b-confirm-dialog>` | BConfirmDialog | `show(): Promise<boolean>` | `title`, `message`, `variant` |
| `<b-dropdown-menu>` | BDropdownMenu | `setItems([{id,label,icon?,variant?,divider?}])` | `align` |
| `<b-tooltip>` | BTooltip | — | `text`, `position` (top\|bottom\|left\|right) |
| `<b-split-panel>` | BSplitPanel | — | `master-width`, `detail-width`, `collapse-at`, `gap` |
| `<b-chat>` | BChat | `setMessages([])`, `appendMessage()`, `setConfig()` | `placeholder`, `disabled` |
| `<b-tour>` | BTour / `tour` singleton | `tour.start(steps, {id})`, `tour.reset(id)`, `tour.seen(id)` | guided onboarding: spotlight + anchored popover, Esc/←/→ keys, once-per-user via localStorage |

### Data (15)
| Tag | Class | Key methods | Key attributes |
|-----|-------|-------------|----------------|
| `<b-table>` | BTable | `setColumns()`, `setData()`, `setIdField()` | `loading`, `striped`, `hoverable`, `label-no-data` |
| `<b-editable-table>` | BEditableTable | `setConfig()`, `setData()`, `getData()`, `validate()` | — |
| `<b-data-table>` | BDataTable | `setConfig(DataTableConfig)`, `load()`, `reload()` | — |
| `<b-pagination>` | BPagination | — | `page`, `total-pages`, `total-count` |
| `<b-badge>` | BBadge | — | `variant` (success\|warning\|danger\|info\|secondary) |
| `<b-stat>` | BStat | — | `label`, `value`, `delta`, `trend` (up\|down\|flat), `sentiment` (auto\|positive\|negative\|neutral), `size` |
| `<b-tag>` | BTag | — | `color`, `removable`, `size` |
| `<b-chart>` | BChart | `setData(ChartData)`, `setOptions(ChartOptions)` | `type`, `height`, `legend`, `animate` |
| `<b-kanban>` | BKanban | `setConfig()`, `setColumns()`, `setCards()`, `addSubCard(parentId,card)`, `getChildren(id)`, `removeCard()`, `toggleCard()`, `expandAll()`, `collapseAll()` | recursive nesting via `KanbanCard.children`/`parentId`/`collapsed`; 3-zone DnD (before/inside/after); `maxNestingDepth`; depth-aware `renderCard(card, depth)` |
| `<b-pre>` | BPre | — | `wrap`, `max-height`, `size` |
| `<b-code-block>` | BCodeBlock | `setCode(code, language?)` | `language`, `code`, `wrap`, `show-line-numbers`, `no-copy`, `max-height`, `size`, `sticky-header` (page) |
| `<b-definition-list>` | BDefinitionList | `setItems([{term,description}])`, `getItems()` | `layout` (stacked\|inline\|horizontal\|grid), `size`, `align` |
| `<b-object-tree>` | BObjectTree | `setData(obj)`, `getData()`, `expandAll()`, `collapseAll()` | `expanded-depth`, `max-depth`, `size`, `show-types`, `show-header`, `header-title`, `no-copy`, `no-expand-actions`, `max-height`, `sticky-header` (page) |
| `<b-json-viewer>` | BJsonViewer | `setData(obj\|string)`, `getData()` | `src`, `expanded-depth`, `max-depth`, `size`, `show-types`, `no-copy`, `max-height`, `sticky-header` (page) |
| `<b-xml-viewer>` | BXmlViewer | `setSource(xml)`, `setDocument(doc)`, `getSource()`, `expandAll()`, `collapseAll()` | `src`, `expanded-depth`, `max-depth`, `size`, `no-copy`, `max-height`, `sticky-header` (page) |

### Feedback (6)
| Tag / Export | Key API |
|---|---|
| `toast` (manager) | `toast.success(msg)`, `toast.error(msg)`, `toast.warning(msg)`, `toast.info(msg)`, `toast.notify(msg, opts)` |
| `<b-spinner>` | `size` attribute (sm\|md\|lg) |
| `<b-progress>` | `setValue(value, max?)`; attributes `type` (linear\|circular), `value`, `max`, `indeterminate`, `label`, `show-value`, `value-format` (percent\|fraction\|value), `size` (sm\|md\|lg\|xl), `variant` (primary\|success\|warning\|danger\|info\|secondary), `striped`, `animated` (linear only), `thickness` (circular stroke width); events `change`, `complete` |
| `<b-empty>` | `icon`, `message` attributes |
| `<b-skeleton>` | `type` (text\|circle\|table\|form), `rows`, `columns` attributes |
| `<b-stale-banner>` | `show(cachedAt)` method, `message` attribute — stale/cached data warning |

### Dialogs (imperative helpers — `birko-web-components/dialogs`)
Functions, not components — call them instead of hand-rendering a `<b-confirm-dialog>`/`<b-modal>` + `await el.show()`. Imported from a **lean subpath** so only the few components used are bundled (importing the `layout`/`inputs` barrels ~doubles the bundle). `promptForm` code-splits `b-form` via dynamic import.
| Export | Signature | Notes |
|---|---|---|
| `confirm` | `(message, opts?) => Promise<boolean>` | over `b-confirm-dialog`; Escape → false |
| `confirmDelete` | `(message, opts?) => Promise<boolean>` | danger variant, Delete/Cancel defaults |
| `alert` | `(message, opts?) => Promise<void>` | modal acknowledgement (blocking OK) — distinct from the transient `notify` toast |
| `prompt` | `(message, opts?) => Promise<string \| null>` | over `b-modal` + `b-input`; `required` blocks empty; Enter submits |
| `choose<T>` | `(message, ChooseOption<T>[], opts?) => Promise<T \| null>` | pick one of N (the "which format?" pattern) |
| `promptForm` | `(FormField[], opts?) => Promise<Record<string,unknown> \| null>` | multi-field over `b-form` (validates); dynamic-imports `b-form` |
| `busy<T>` | `(work: Promise<T> \| () => Promise<T>, opts?) => Promise<T>` | non-dismissable spinner overlay (top-layer `<dialog>`) while work runs |
| `notify` | `(message, variant?) => void` | transient toast (wraps the `toast` manager) |

All render in the browser **top layer** (`<dialog>.showModal()`), so z-index never applies. i18n keys `bwc.dialog.*`.

### Navigation (4)
| Tag | Class | Key methods |
|-----|-------|-------------|
| `<b-sidebar>` | BSidebar | `setItems(SidebarItem[])` |
| `<b-breadcrumb>` | BBreadcrumb | `setItems([{label, href?}])` |
| `<b-ribbon>` | BRibbon | `setTabs(RibbonTab[])`, `setContextActions([])`, `pin()`, `unpin()`; `tabs-only` attribute forces pure tab-strip mode (no panel, no expand/pin). Per-tab: `RibbonTab.noPanel` — explicit, or auto when a tab's groups hold exactly one plain nav link (its panel would only duplicate the tab click); when every tab is panelless the whole ribbon renders tabs-only |
| `<b-tree-menu>` | BTreeMenu | `setItems(TreeMenuItem[])`, `expandAll()`, `collapseAll()`, `reveal(id)` |

### Command (1)
| Tag | Class | Key methods |
|-----|-------|-------------|
| `<b-command-palette>` | BCommandPalette | `openCommandPalette()`, `closeCommandPalette()`, `toggleCommandPalette()` (module exports) |

Supports pluggable `CommandProvider` via `registerProvider()`. Built-in `createRecentProvider()` for recent items.

## Modern HTML & JavaScript

### Semantic HTML (full reference)

| Element | Use for |
|---------|---------|
| `<header>` | Title row of a component or page section |
| `<footer>` | Action row / bottom bar, `slot="footer"` content |
| `<section>` | Named content region — add `aria-label` |
| `<article>` | Self-contained item (notification, feed row, card) |
| `<nav>` | Navigation container (`b-sidebar` already uses this) |
| `<aside>` | Secondary/supplemental content panels |
| `<dialog>` | Modals and confirmations (`b-modal`, `b-confirm-dialog` already use this) |
| `<p>` | Text paragraphs (reset `margin: 0` in CSS) |
| `<h2>`–`<h6>` | Headings inside components (reset `margin: 0` in CSS) |
| `<time datetime="ISO">` | All timestamps — `datetime` attribute must be ISO 8601 |
| `<output>` | Live metric values, counts, calculation results |
| `<kbd>` | Keyboard shortcuts |
| `<picture>` | Responsive images |
| `<figure>` + `<figcaption>` | Charts, diagrams, screenshots |
| `<details>` + `<summary>` | Expand/collapse — replaces custom accordion divs |
| `<mark>` | Highlighted/matched text |
| `<meter>` | Scalar gauge (battery, fill level) |
| `<progress>` | Task progress |

**CSS margin reset rule:** when replacing `<div>` / `<span>` with `<p>`, `<h*>`, or `<ul>`, add `margin: 0` (or precise override) in the component CSS — browser defaults break existing layout.

**Decorative elements:** `aria-hidden="true"` on icons, dots, decorative images.

### Modern JavaScript

| Use | Instead of |
|-----|-----------|
| `obj?.prop` | `obj && obj.prop` |
| `value ?? 'default'` | `value != null ? value : 'default'` |
| `x ??= y` | `if (x == null) x = y` |
| `structuredClone(obj)` | `JSON.parse(JSON.stringify(obj))` |
| `crypto.randomUUID()` | Custom uuid function |
| `items.at(-1)` | `items[items.length - 1]` |
| `items.findLast(fn)` | Manual reverse-find loop |
| `AbortController` + `signal` | Ignored stale responses |
| `queueMicrotask(fn)` | `setTimeout(fn, 0)` |
| `for...of` | `for...in` on arrays |
| Arrow functions | `function` inside methods |
| `const` / `let` | `var` |
| Async / await | `.then()` chains |
| Rest params `...args` | `arguments` |
| Template literals | String concatenation |

**Patterns specific to Web Components:**
- Use `IntersectionObserver` for lazy rendering / infinite scroll (already used in notification-drawer)
- Use `ResizeObserver` for components that must react to size changes
- Use `MutationObserver` for slot content changes (if component behavior depends on slotted children)
- Use `requestAnimationFrame()` for DOM reads after render (not `setTimeout`)
- Use `CustomEvent` with `bubbles: true, composed: true` so events cross Shadow DOM boundaries
- Prefer attribute-based API (`el.setAttribute('disabled', '')`) over property-based for declarative HTML usage

## i18n / user-facing text

Every user-visible string in a component goes through `this.label(attrName, i18nKey, fallback, params?)` — inherited from `BaseComponent`. Do **not** call `this.attr('label-X', 'English')` — the label pattern adds the i18n layer while keeping per-instance attribute overrides working.

```typescript
// In render():
<button aria-label="${this.label('label-close', 'bwc.common.close', 'Close')}">&times;</button>
```

Priority: explicit `label-close` attribute > global i18n lookup (`bwc.common.close`) > English fallback.

**Key namespace:** use `bwc.*` prefixed keys (`bwc.common.*`, `bwc.palette.*`, `bwc.pagination.*`, etc.) so app bundles don't collide. The canonical English key set is shipped at `locales/en.json` — copy it as a starter for other locales.

**BForm validation messages** still use `common.*` keys (`common.required`, `common.minLength`, etc.) and fall back to English via `globalT()`. `BForm.setTranslate(fn)` is kept as a deprecated backward-compat shim — new code should populate messages via the global singleton instead.

**Date/time locale labels** (months, weekday headers) can be set via `BDatePicker.setLocale({months, days, today, clear})` / `BDatetimePicker.setLocale(...)` / `BTime.setLocale(...)`. These are deprecated shims that win over global i18n but are still honoured for back-compat.

## What NOT to do
- Do not hardcode colors, spacing, or sizes — always `var(--b-*)`
- Do not copy `@keyframes spin` — import `spinSheet`
- Do not copy `.backdrop`, `.overlay-header`, etc. — import the shared sheet
- Do not use `document.querySelector` — use `this.$()` inside Shadow DOM
- Do not add non-`--b-*` CSS variables — extend `tokens.css` if a new token is needed
- Do not write `<button>` in component templates — use `<b-button>` (unless you are implementing `<b-button>` itself)
- Do not interpolate caller/user-supplied strings straight into a template's `innerHTML` — escape with `escapeHtml`/`escapeAttr` from `dom-utils.ts`, or set them via `textContent`. Raw interpolation is a stored/reflected-XSS sink (see the b-confirm-dialog fix below).

## Recent Updates

Newest-first log of notable component-library changes. Keep entries short; roll the oldest into project history when this grows past ~5–8.

### `b-ribbon` progressive scaling delivered; the body no longer scrolls (2026-07-29)

Groups now degrade `large → medium → small → popup` as the panel narrows, in author-declared priority
order, and the panel scroller is **gone** — the ribbon body resizes, it never scrolls. Below even an
all-popup row the chunk buttons drop their group names (`compact`), with the name kept in
`title`/`aria-label`. `preferred-group-size` sets the look at full width (default `medium`, unchanged from
what shipped). `large` did not exist on the web at all before this.

`ribbon-scaling.ts` mirrors `RibbonScaling` from `Birko.Xaml.Core`; the playground's
`ribbon-scaling-smoke` asserts the **same numeric table** as the C# unit tests, so the forked *rendering*
cannot let the shared *policy* drift.

Measuring means rendering: each variant goes into an off-screen probe and is measured there. More work
than a cached number, but the only honest way to know what a variant costs with the consumer's real
labels, fonts and tokens. Runs on resize, not per frame.

**Two real bugs came out of building it, both worth remembering:**

- **A double group gap.** `.ribbon-group + .ribbon-group` added a full `--b-ribbon-group-gap` of
  `padding-left` *on top of* the flex `gap`, so actual spacing was twice the gap — while the probe (a group
  with no preceding sibling) never saw that padding. Six groups meant a ~120px under-estimate, so the pass
  under-degraded and clipped the row however tight the variants got. The separator now draws only its
  border and `gap` owns the spacing: **one mechanism, one number.** Lesson for any measure-then-fit code
  here: if two CSS rules contribute spacing, a probe will see one of them.
- **Wiring lost on re-render, for the fourth time in this component.** The chunk button stopped opening
  because its handler was applied in `onUpdated` while the measure pass re-renders the panel. `_hoverTabId`,
  the chevron `visible` class, the chevron's layout footprint and now this — **anything stamped onto
  re-rendered DOM must be re-applied on every path that re-renders, or derived in `render()` instead.**

Also: a stray pair of backticks in a CSS comment terminated the `styles` template literal — three times.
The warning now sits at the top of the block.

### Ribbon scaling model + the two ribbon tokens that were never defined (2026-07-29)

`RibbonGroup` gained `icon`, `scalingPriority` and `minSize` (`RibbonGroupSize` =
`'large' | 'medium' | 'small' | 'popup'`), mirroring `RibbonGroupSize` / `RibbonGroup` in
`Birko.Xaml.Core/Ribbon/RibbonModels.cs`. **Inert today** — TASK-099 adds the degrade pass. They land
in both models at once on purpose: two independently-grown scaling vocabularies could never be
reconciled afterwards. Defaults (`scalingPriority: 0`, `minSize: 'popup'`) reproduce today's rendering
exactly, which is what makes this a safe no-behaviour-change landing.

`scalingPriority` is **importance — lower degrades first**, documented as Birko's own direction in both
the TSDoc and the XML docs. Office's RibbonX has a `scalingPriority` too and its numeric sense is not
what we document; the ambiguity is worth one sentence rather than a future reader guessing.

While adding the token set, found **`--b-ribbon-group-gap` and `--b-ribbon-item-gap` used in
`b-ribbon`'s CSS but defined nowhere** — exactly the `--b-modal-width-xxl` bug from earlier the same day:
the inline fallback silently applies, so the value looks tokenised but cannot be re-themed. Both now
exist in `tokens.json` with their shipped fallbacks as values (no visual change), plus three new ones the
variants need: `--b-ribbon-icon-large` (2rem), `--b-ribbon-icon-small` (1rem), `--b-ribbon-chunk-width`
(3.5rem). Regenerated, not hand-edited; `verify` clean and the 42 DesignTokens parity tests green.

**Also surfaced, and it reshapes TASK-099:** the two skins do not currently render the same Office
variant. `.ribbon-item` is `inline-flex; align-items: center` with a 16px icon — that is **Medium**.
Avalonia's `BuildItem` stacks an 18px icon above a centred wrapping label — that is **Large**. So the web
side has no Large to degrade *from* and Avalonia has no Medium; TASK-099 has to build the missing
rendering rather than just choose between existing ones. Recorded in both enums' docs so it is a
deliberate decision, not a discovery mid-implementation.

### `b-ribbon`: the overflowing panel had no affordance, and the tab arrows ignored resize (2026-07-29)

Reported from the field — on a narrow window the ribbon showed fewer commands with no way to reach the
rest. Two separate causes, one of which *looked* like it worked:

- **`.ribbon-panel-inner` was `overflow-x: auto` with `scrollbar-width: none` and no buttons.** Scrollable
  in theory, invisible in practice: no bar, no chevrons, no cue. A mouse without a horizontal wheel could
  not reach an overflowing group at all. It now has the same chevron pair as the tab strip, and
  `.ribbon-panel` became a flex row so they can flank the scrolling track.
- **`updateArrows` only ran on `scroll` and on re-render.** So narrowing the window left the forward arrow
  hidden *while the tabs overflowed* — you had to reload to see it. Both tracks are now watched by a
  `ResizeObserver` (re-observed each update, since a re-render can replace the elements).

`_setupTabScroll` became `_setupScroll(track, left, right)` shared by both tracks — one `updateArrows`, not
two copies. The four chevrons also gained `label-scroll-{tabs,groups}-{left,right}` i18n overrides; the two
pre-existing ones had hardcoded English `aria-label`s, and they are the only route to hidden commands.

**This is interim on the panel.** STORY-049 decided the ribbon *body* must scale, not scroll — a scroll
offset destroys the spatial memory the ribbon exists to provide ("Cut is top-left of Clipboard"), which is
why Office resizes groups `Large→Medium→Small→Popup` instead. TASK-099 removes the panel scroller again
when that lands. The **tab strip** keeps scrolling permanently — tabs are the documented exception, as in
Office Web / Fluent.

Gate: `ribbon-overflow-smoke` in `Birko.Web.Playground` (16 checks, incl. resize-only reveal/retract).
Verified non-vacuous by disabling the observer + panel wiring — exactly 6 checks fail.

### Breakpoints swept px → rem, and `b-drawer` stopped using `100vw` (2026-07-29)

Every width media query in the library is now `rem` (new **Critical rules § Breakpoints in `rem`** documents
the 30/40/48/64rem ladder). Same px at a default-16px browser, so no visual change there — but a `rem` media
query resolves against the *browser default*, so a reader who scales their text up now gets the narrow layout,
and a host app with a 14px `:root` no longer shifts every breakpoint. Converted: `b-ribbon` (768/1024),
`b-drawer` + `b-form` (640), `b-split-panel` (768), Shell `b-app-shell` / `b-core-app-shell` (768).
`b-confirm-dialog` was already `30rem`.

`b-split-panel`'s `collapse-at` only understood px (a bare number, or a string containing "px"), so
`collapse-at="48rem"` fell through to `48rempx` and the query never applied. It now takes any `px`/`rem`/`em`
length, keeps bare numbers as px for back-compat, and — since the value is interpolated into a `<style>` in the
shadow root — **falls back to the default `48rem` for anything else** instead of injecting it (a value like
`red;}body{display:none` used to land in the stylesheet verbatim).

`b-drawer`'s phone rule was `.drawer { width: 100vw !important }`. `100vw` includes the page scrollbar, so with
a space-reserving scrollbar the drawer ran past the content edge by its width (measured: 500px viewport →
480px content area → a 500px drawer). Now the `<dialog>` carries `inset: 0; width: auto` and the panel is
`width: 100%`, so the box is the content area exactly. `width: auto` matters for the same reason as in
`b-modal size="full"`: the UA stylesheet's `fit-content` sizing beats the inset rectangle.

### `b-modal size="full"` + the two missing `xxl` width tokens (2026-07-29)

`b-modal`/`b-drawer` styled `:host([size="xxl"])` against `--b-modal-width-xxl` / `--b-drawer-width-xxl`,
neither of which existed in `css/tokens.css` — so `xxl` silently used the inline fallback (80rem / 72.5rem) and,
unlike every other size, could not be re-themed by overriding the token. Both tokens added with the shipped
fallbacks as their values (no visual change).

New **`size="full"`** on `b-modal` for editor surfaces (WYSIWYG / markdown editor, complex form editors):
the viewport minus `--b-modal-full-inset` (2rem) on all four sides, in **both** axes — the other sizes cap
`max-width` only and leave `max-height: 85vh`, which is the wrong shape for an editor that wants vertical room.
Implemented by making the `<dialog>` `position: fixed; inset: <gutter>` and the `.modal` `100%`/`100%` inside it,
rather than `100vw`/`100dvh` on `.modal`: `showModal()` leaves the page scrollbar in place, so viewport units
overflow horizontally by its width. **The dialog also needs `width: auto; height: auto`** — the UA stylesheet
sizes `<dialog>` as `fit-content`, which beats the inset rectangle and collapsed the box to its content (caught
in review: a "full" modal measured 102×142px). `min-width` is reset to 0 (the default `min(25rem, 95vw)` can
exceed the inset box on narrow screens) and below 640px the gutter drops to 0 with square corners. Not added to `b-drawer` —
a viewport-wide drawer *is* a modal. Shell's `modalSize` accepts `'full'` (`base-form-modal`, `base-crud-page`).

### `b-chart` overlay bars — the target-vs-actual shape (2026-07-29)

Added `ChartOptions.overlay` (bar mode): a category's series are superimposed at full category width instead of
laid out side by side, so a faint "target" bar behind a "done" bar reads as *the shortfall is what still shows*.
Purely additive — omitted or `false` keeps the existing grouped layout. Series paint in array order, so the
background series goes first.

From Reps TASK-083 (a weekly adherence rollup: sessions done against sessions scheduled). The two existing bar
layouts couldn't express it — grouped halves both bars and makes the reader compare two heights, and `stacked`
would sum quantities that are two measurements of the same thing. Per-point `color` still applies, so "met the
target" can also recolour the front bar.

### Caller data re-escaped inside components: `style="…"` and option labels (2026-07-29)

Symbio TASK-291, the follow-up to the `b-tag` fix below. 21 sites across 7 components:
`b-multi-select` (option/chip colour, label, value, aria-label, search value — each block exists **twice**, a
declarative render plus an imperative `insertAdjacentHTML`), `b-kanban` (column/card accent colour),
`b-table` + `b-editable-table` (`c.width`, `c.key`, `c.label`), `b-skeleton` and `b-split-panel` and `b-chart`
(`width`/`height`/`gap`).

**The rule this makes concrete: escaping at the CALL SITE does not protect a component's own template.** A
consumer that correctly writes `color="${escapeHtml(x)}"` gets the value back from `attr()` **already decoded**
by the browser, so re-interpolating it raw re-opens the break-out the consumer just closed — measured on a
stored tag colour. Anything reaching `style="…"` therefore needs `escapeAttr` *here*, not there.

Second trap, specific to lengths: `lengthAttr()` → `coerceCssLength` looks like validation but is not — it adds
`px` to a bare number and otherwise **passes the string through unchanged** (`Birko.Web.Core/src/css/length.ts`),
so `width="100%\" onmouseover=\"…"` reaches the style attribute intact.

Left raw on purpose, verified: clamped/computed numbers (`b-progress` percent, `b-range` fill, `b-file-upload`
progress, `cell-renderers` pct) and `b-color-picker`'s `rgb` (browser-normalised from a native colour input).

Guard: Symbio `tests/ui-e2e/xss-escaping-check.spec.ts` § TASK-291 — asserts **inside** the component's shadow
root (Playwright CSS pierces open roots, which is why a source read missed `b-tag`), and asserts the swatch
keeps its `background:` so escaping-too-hard fails the same test as escaping-too-little.

### `cell.text()` — the missing safe primitive for plain-text columns (2026-07-29)

Added `text(value, fallback = '—')` to `createCellRenderers` (`src/data/cell-renderers.ts`). Purely additive.

Motivated by a consumer sweep (Symbio TASK-286): a column's `render` return value is inserted as **raw
HTML** — `b-table.ts` and `b-data-table.ts` escape only the *default* cell path (`col.render ? col.render(…)
: escapeValue(val)`). Every other renderer here escapes, but plain text had no primitive, so consumers wrote
`render: (v) => v || '—'` purely to supply the em-dash — and thereby *removed* the escaping the default path
had given them. Measured in one consumer: **66 columns**, on exactly the free-text fields that matter
(`notes`, `description`, `email`, driver/guest names). The library shipped the footgun, so the fix belongs
here: `cell.text(v)` is now the shortest correct spelling, and `cell.text(v, t('x.draft'))` covers the
translated-placeholder variant. Empty values render `muted(fallback)`, matching `date`/`number`/`currency`.

### Form-associated inputs via ElementInternals (2026-07-29)

STORY-023 / TASK-035. The 15 value-bearing inputs now extend the new **`FormControlComponent`**
(`Birko.Web.Core/src/base/`) and are form-associated custom elements — value in `FormData`, native
constraint validation, `reportValidity()`, `form.reset()`, `<fieldset disabled>`. Convention + the six
rules for converting a control: § "Form-association convention". Consumer docs: README/API
§ "Form participation".

Additive by construction: `el.value` is unchanged on every control and `b-form` still collects values
programmatically (asserted). The controls that previously *compensated* for the gap (Reps' per-page
guards, Presenter's landing-page URL guard) stay correct — they become belt-and-braces again.

The payoff is bigger than "values reach FormData": validity is **borrowed, not reimplemented**. Where the
inner control's `validity` is genuinely about the value, it is mirrored verbatim, so `type="url"`, `min`,
`max`, `step` and `pattern` — previously invisible to any wrapping `<form>` — are now enforced by it.
Where it isn't (formatted display strings in the pickers, an option label in searchable `b-select`, a
typing buffer in `b-tag-input`, never-invalid `type="range"`/`type="color"`), the control opts out and
gets a generic `required` check.

Submitted shapes that aren't one plain string: `b-multi-select` / `b-tag-input` → **one entry per value**
under `name` (native `<select multiple>` shape; also non-lossy for values containing a comma, which the
joined `.value` is not); `b-range` range mode → `name-from`/`name-to`; `b-date-range-picker` →
`name-start`/`name-end` (two values in one control has no native analogue, so two ordinary fields beat
inventing a delimiter); `b-color-picker` → base hex, alpha byte dropped; `b-markdown-editor` → the
markdown source. Empty submits **no entry** rather than `""`.

**Toggles converted too** (`b-checkbox`, `b-switch`, `b-radio` — 15 controls total) with native checkbox
semantics: the `value` attribute (default `on`) **only when checked**, absent otherwise, because an
unchecked box must not appear in `FormData` (`bool` model binding reads absence as false, so `name=false`
would bind true). Their `.value` keeps returning `'true'`/`'false'` — a deliberate divergence, safe because
a consumer audit found **every** read path uses `.checked` (`b-form._getFieldValue`, Symbio, gameshow, Reps)
and none reads `.value`. `b-radio` needs no submission coordinator (shared `name`, only the checked member
returns a value) but `required` is unsupported there — it is a group property, and per-element evaluation
would invalidate every unchecked member.

`form.reset()` is baseline-driven rather than value-driven: `captureInitialState()` /
`restoreInitialState()` snapshot markup-declared state at first sync (native semantics — script-assigned
values are ignored on reset), overridden by the toggles (checkedness) and the multi-value controls (their
list), with `resetFormBaseline()` for imperatively-populated controls. The generic value-attribute default
would have silently *unchecked* a `<b-checkbox value="yes" checked>` on reset; confirmed by reverting the
override and watching the new checks fail.

Three traps found by the harness, all silent: `formDisabledCallback` must not write the host's own
`disabled` attribute (an element's disabled state is the union of its own and its ancestors', so that makes
it self-disabled and re-enabling the fieldset never fires the callback again — stuck disabled forever);
`syncFormState()` must run in `onUpdated()` before any early return, because imperative setters re-render
without emitting; and `b-radio`'s sibling-uncheck path re-renders nothing, so it needs its own sync or the
group submits two entries.

**Consumer impact** (audited): Symbio, DraCode, Latent, gameshow, BardStudio and Affiliate have no native
`<form>` at all, so this is inert for them. Reps wraps `b-*` in real forms on 7 pages and relied on the
gap — an invalid control now suppresses the submit event, so its page-level localised messages never
appear; `novalidate` on those forms is the fix (verified) and is a Reps-side decision.

Coverage: new Playground `form-assoc-smoke` harness (97 checks, all 15 controls) + `bare-smoke` 64 and
`backport-smoke` 73 unchanged.

### All 14 chrome controls on `renderField`; danger-text token; editable-table benchmark (2026-07-29)

Closing pass on the form-control family:

- **`b-file-upload` and `b-option-group` migrated too** — the last two hand-rolling `.field`. They had no
  error row at all, so they gained `error` + `required` + `description` + `bare` together. Both are
  div-based, so the ARIA sits on the focusable wrapper (`.dropzone`, `.options[role=radiogroup]`) and
  **without** `label`, since each already carries its own `aria-label` — the duplicate-attribute trap that
  `b-date-range-picker` hit. `has-error` had to paint something or the class would be dead markup: the
  dropzone tints its dashed border; `.options` has no border of its own, so the signal goes on the option
  buttons rather than inventing a box the design uses nowhere else.
  **`grep 'class="field"' src/inputs/*.ts` now returns only `label-hint.ts`** — 14 controls, one owner.
- **New `--b-color-danger-text`**, so error text can clear WCAG AA without recolouring every danger fill,
  border and badge. Defaults to `var(--b-color-danger)` (custom-property substitution is lazy, so a theme
  overriding only the danger colour inherits its own red here). Overridden where measured: dark `#f87171`
  (was 3.03:1), finstat `#b3391a` (2.65:1), inverse `#fca5a5` (2.13:1). All five themes now clear AA for
  label, help row **and** error row. `.required-mark` uses it too.
- **`b-editable-table` stays on raw cells** (TASK-002 decided with numbers). At 500 rows the bare-component
  variant re-renders in ~830 ms vs ~270 ms — 3 000 shadow roots, structural. At 30 rows both are under
  60 ms, so the constraint is the unpaged grid, not the components; if virtualisation lands, re-run the
  harness (`Birko.Web.Playground` → Data → Grid benchmark) at the real visible-row count. The caret risk the
  task was written around does **not** materialise — `b-input`'s `onUpdated` re-assigns an unchanged value,
  which does not move the caret.

### Chrome-owning controls consolidated onto `renderField`; finstat + search-input fixes (2026-07-29)

Manual review of the Playground turned up three things, all now fixed:

1. **`b-search-input` put its query text under the search icon at `size="sm"`/`"lg"`.** `formControlSheet`'s
   size variants set `padding` (the SHORTHAND), which resets the left/right inset the component uses to
   clear its absolutely-positioned icon and clear button — and `:host([size="sm"]) input` (0,1,1) outranks a
   bare `input` (0,0,1). The insets are now re-declared per size. **Watch for this whenever a component
   positions something on top of a native control** — it is a specificity trap, not a one-off.
2. **`b-time` and `b-date-range-picker` had neither `bare` nor `description`** — and neither did `b-range`,
   `b-color-picker` or `b-markdown-editor`. All five still hand-rolled the `.field` chrome, because
   TASK-001's list named only seven controls. Migrated all five onto `renderField`, so the attribute set is
   now uniform across **twelve** controls. *(Superseded by the entry above: `b-file-upload` and
   `b-option-group` were migrated too, so it is 14 and nothing hand-rolls `.field` any more.)*
3. **finstat's `--b-text-secondary` was below WCAG AA** (3.77:1 on `--b-bg-secondary`). Darkened
   `#807a7a` → `#6e6868`, the smallest step in the same warm grey that clears 4.5:1 on all three surface
   tokens. A deliberate deviation from the brand palette, taken because the token carries the field label
   and the help row. All five themes now pass AA for both.

Migrating the five also exposed two ARIA bugs the harness caught immediately: `b-date-range-picker`'s
endpoints already carry their own `aria-label` ("Start date" / "End date"), so also passing the field label
emitted a **duplicate `aria-label`** (first one wins) — `fieldAria` is no longer given `label` there; and
**`b-color-picker` in `swatch-only` mode had no ARIA at all**, because the field's ARIA lived on the `.hex`
box that mode omits — it now goes on the swatch instead.

### `description` — a visible help-text row on the form controls (2026-07-29)

`hint` only ever rendered as a tooltip behind a `?` icon, so there was no way to put a value or constraint
on screen under a control. Consumers worked around it with their own sibling element — which
`aria-describedby` **cannot reach**, because the real control is in shadow DOM, so a screen reader never
announced it as that field's description. (Reps' `progress-page` does exactly this with a local `.hint`
span; that can now move onto the component.)

New `description` attribute on the seven `renderField` controls (`b-input`, `b-select`, `b-textarea`,
`b-multi-select`, `b-tag-input`, `b-date-picker`, `b-datetime-picker`) plus a `description` key on
`b-form`'s `FormField`. New `renderHelp(uid, description)` helper mirrors `renderError` and mints
`${uid}-help`, which `fieldAria` adds to `aria-describedby`; `.field .help` sits beside `.field .error` in
`@sheet formField`, same footprint, muted instead of red. Convention + the naming rationale:
§ "`hint` vs `description`".

Named `description` rather than `help` (too easily confused with `hint` in review) or a `hint-display` mode
(a field could then never carry both a standing constraint and a tooltip explainer). Additive and opt-in per
instance, so no existing layout moves — and `bare`, the dense-inline mode, drops the row entirely.

Colour: `--b-text-secondary` at `--b-text-xs` — same footprint as `.error` so a field's height does not
jump when an error appears beside it. `--b-text-muted` was measured and rejected (below AA in light / neon /
finstat).

Coverage: Playground `description-smoke` harness (90 checks — all 14 render the row and reference it,
none references it when absent, error+description describe both ids in the right order with both resolving,
`hint` and `description` coexist, markup is escaped, `bare` drops the row and falls back to `title` with the
error winning, the attribute is reactive, `b-form`'s schema key drives it, and the row is muted rather than
the error colour). Verified visually in the gallery too.

### `bare` attribute on the form controls (2026-07-28)

STORY-001 / TASK-001. `bare` strips the `.field` wrapper, the label row and the error row from
`b-input`, `b-select` (native + searchable), `b-multi-select`, `b-textarea`, `b-tag-input`,
`b-date-picker` and `b-datetime-picker` — for toolbars / table cells where the stacked chrome and its
flex gap add unwanted vertical space. Additive: unset means today's rendering, verified by the harness.
`b-search-input` was found to have **no** `.field` chrome at all (only `.search-wrap`, for icon and
clear-button positioning) so it is already bare and deliberately takes no attribute.

New shared **`renderField()`** in `src/inputs/label-hint.ts` owns the wrapper/label/error decision for
the whole library, so the seven components no longer each hand-roll it — and everything belonging to
the *control* (a `<datalist>`, a `.dropdown` / `.dp-panel` popover, a `.combo` / `.container` wrapper)
stays inside it, because popovers are resolved by selector and positioned against their trigger.

The non-obvious part is accessibility: dropping the chrome drops the `<label>` that named the control
**and** the error span `aria-describedby` pointed at. So `fieldAria()` gained `bare` + `label` and
rebuilds both from attributes — `aria-label` from `label`, and the message as `title` rather than a
dangling `aria-describedby`. A bare control still announces its error state (and keeps its `has-error`
border); it just has nowhere to print the message. Chromed mode is untouched — no `aria-label`, no
`title`, still linked to the error span.

Coverage: new Playground `bare-smoke` harness (64 checks — default chrome, bare stripping, error/ARIA
surfacing, `aria-label` fallback, attribute reactivity, value round-trip, datalist and popover
survival, and that bare is measurably shorter than chromed). `Birko.Web.Components` ships no unit
runner, so this runs in a real browser via `Birko.Web.Playground`'s `verify.mjs` (`?smoke=1`).

### b-data-table auto-detects the server-paged envelope (page-2-empty footgun) (2026-07-20)

`b-data-table` had two paging modes gated only by the `flatArray` config flag (`true` → client-side slicing; `false` → server page/pageSize + refetch), and `base-crud-page` defaults `flatArray = true`. When a consumer's endpoint is actually **server-paged** (returns a CAPPED `{ items, totalCount, page, pageSize }` envelope), the client default sliced that already-capped page again → **page 2+ rendered empty and no `page=2` request ever fired** — silent and easy to ship. Fix: `load()` now resolves an effective mode per response into a sticky `_serverPaged` flag. A bare array is client-paged; a `{ items, totalCount }` envelope is server-paged; a **capped** envelope (`items.length < totalCount`) auto-flips even a mis-set `flatArray:true` default to server mode (detection wins over the default). `flatArray` is now a tri-state escape hatch: `true` forces client (but a capped envelope still flips), `false` forces server, unset = auto. `_getPageData()` and the page-change / page-size-change handlers now key off `_serverPaged` (never re-slice a server page). Only currently-broken (capped) tables change behavior — bare-array and full-envelope tables are untouched, so no working list regresses. **Not fixed (consumer concern):** list SORT — server paging shows the server's order, so lists must sort newest-first for a freshly-created row to land on page 1 (the `base-crud-page` `flatArray` doc was updated to say so). Regression coverage in the Playground `backport-smoke` harness (`Prompt2(a)…(d)` + `(a2)`). Reported from Symbio `docs/birko-framework-fix-prompts.md`.

### b-pagination: bind clicks on the b-button host, not an inner `<button>` (dead-controls fix) (2026-07-20)

`b-pagination.onUpdated` wired its click handler via `btn.querySelector('button')`, but `b-button` renders its `<button>` in its **shadow root**, so that light-DOM query returned `null` and the listener was never attached — **every prev / next / numbered control was inert for all consumers**. `b-button` is designed for host-level clicks (`:host([disabled]) { pointer-events: none; }`, composed click bubbles to the host), so the handler now binds on the `<b-button>` **host** and guards on the host's `disabled` attribute. Audited the package for the same anti-pattern (`querySelector('button'|'input'|…)` reaching into a child custom element's shadow) — none other found (`b-data-table` and `b-form` deliberately use `child.shadowRoot.querySelector` / `(el.shadowRoot ?? el)`). Regression coverage in the Playground `backport-smoke` harness (`Prompt1 …`: real host clicks emit `page-change`; disabled controls emit nothing). Reported from Symbio `docs/birko-framework-fix-prompts.md`.

### b-confirm-dialog: escape message/title by default (stored-XSS fix) (2026-07-19)

`b-confirm-dialog` interpolated its caller-supplied `message`/`title` straight into `innerHTML`, so a confirm built from user data (e.g. a tenant member's username in a "remove {name}?" prompt) was a **stored/reflected-XSS sink** — inconsistent with the sibling `alert`/`prompt` dialog helpers, which write their body via `textContent`. Both now render as **text by default** via `escapeHtml` (from `dom-utils.ts`). Intentional markup is an explicit opt-in: the `message-html` boolean attribute on the component, surfaced as `allowHtml?: boolean` on `ConfirmOptions` for the `confirm()`/`confirmDelete()` dialog helpers. `confirm()`/`confirmDelete()` are safe by default with **no caller change required** (audited all callers across this repo + `../Consumers/*` — none passed HTML). Regression coverage in the Playground `backport-smoke` harness (`STORY-065 …`): the `<img src=x onerror=…>` payload renders as literal text (no `<img>` node, `onerror` never fires), and the `message-html` opt-in still renders real markup. Reported from Symbio `STORY-065` / `TASK-208`.
