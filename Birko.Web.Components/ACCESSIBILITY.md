# Accessibility — Birko.Web.Components

How the `b-*` Shadow DOM component catalogue supports ARIA and screen readers (SR), the shared helpers that enforce it, and the known limitations.

## Approach

Accessibility is applied **inline** in each component's template (roles + `aria-*` written directly), with three cross-cutting pieces of shared infrastructure:

- **`BaseComponent.uid`** — a stable, unique-per-instance id prefix (`b0`, `b1`, …) allocated lazily and surviving re-renders. Use it to mint deterministic element ids that `aria-*` IDREFs can point at (`${this.uid}-error`, `${this.uid}-body`, `${this.uid}-tip`).
- **`inputs/label-hint.ts` helpers** — `fieldAria()` and `renderError()` centralize form-control validation ARIA so every input behaves identically.
- **`srOnlySheet`** (`shared-styles.css` → `@sheet srOnly`) — the `.sr-only` / `.sr-only-focusable` visually-hidden utility for live regions and off-screen labels.

User-facing names are always localized through `this.label(attrName, i18nKey, fallback, params?)`.

Two shared keyboard helpers live in `src/dom-utils.ts` (alongside `escapeHtml` / `escapeAttr`):
- **`isActivationKey(e)`** — true for Enter/Space; used by every custom button-like control (`b-inline-edit`, `b-file-upload` dropzone, `b-form` collapsible legend).
- **`rovingIndex(e, current, count)`** — roving-tabindex arrow/Home/End math (returns the next index or `null`, and calls `preventDefault()`); used by the radio-group controls (`b-segmented`, `b-option-group`).

## Form-control validation ARIA

All form inputs use the shared helpers rather than hand-rolling validation attributes:

```ts
import { renderLabel, renderError, fieldAria } from './label-hint';

render() {
  const error = this.attr('error');
  return `
    <div class="field">
      ${renderLabel(label, hint, this.boolAttr('required'))}
      <input
        ${this.boolAttr('required') ? 'required' : ''}
        ${fieldAria({ uid: this.uid, error })}
      />
      ${renderError(this.uid, error)}
    </div>`;
}
```

- `fieldAria({ uid, error, required, describedBy })` returns `aria-invalid="true"`, `aria-describedby="${uid}-error"`, and (optionally) `aria-required="true"`. Pass `required: true` **only** for non-native controls (the div-based combos in `b-multi-select`, `b-select` searchable, `b-tag-input`) — a native `<input required>` / `<select required>` already exposes required state, so `aria-required` there is redundant.
- `renderError(uid, error)` renders `<span class="error" id="${uid}-error" role="alert">…</span>`. `role="alert"` makes SRs announce the message as soon as it appears; the matching `id` is what `aria-describedby` links to. It does not HTML-escape — pass an already-escaped message for untrusted input (as `b-markdown-editor` does).

Covered inputs: `b-input`, `b-textarea`, `b-select` (native + combo), `b-multi-select`, `b-tag-input`, `b-color-picker`, `b-date-picker` (native + custom), `b-datetime-picker`, `b-time`, `b-range` (live-region error only — it has multiple labelled sub-inputs), `b-date-range-picker` (native + custom), `b-markdown-editor`.

## ARIA roles by component

| Pattern | Components | Key attributes |
|---|---|---|
| Dialog | `b-modal`, `b-drawer`, `b-tour`, `b-command-palette`, `b-confirm-dialog` | `role="dialog"`, `aria-modal`, `aria-labelledby`/`aria-describedby`, focus trap + restore |
| Tabs | `b-tabs`, `b-ribbon` | `tablist`/`tab`/`tabpanel`, `aria-selected`, roving tabindex, arrow-key nav |
| Menu | `b-dropdown-menu` | `menu`/`menuitem`/`separator`, decorative icons `aria-hidden` |
| Listbox / combobox | `b-command-palette`, `b-select` (combo) | `listbox`/`option`, `aria-selected`, `combobox` + `aria-controls` + `aria-activedescendant` (palette) |
| Radio group | `b-segmented`, `b-option-group` | `radiogroup`/`radio`, `aria-checked`, roving tabindex + arrow/Home/End (focus follows selection) |
| Checkbox group (disclosure) | `b-multi-select` | trigger `aria-haspopup`/`aria-expanded`/`aria-controls`; popup `role="group"` + `aria-label` over native checkboxes (not a listbox — its children are interactive) |
| Tree | `b-tree-menu`, `b-object-tree` | `tree`/`treeitem`/`group`, `aria-expanded`, `aria-busy` while lazy-loading |
| Status / feedback | `b-spinner` (`status`), `b-progress` (`progressbar` + `aria-valuenow/min/max`), `b-toast` (`status`/`alert` + `aria-live`) | live announcement |
| Navigation | `b-breadcrumb` (`nav` + `ol` + `aria-current="page"`), `b-sidebar` (`nav`, list, toggle `aria-expanded`/`aria-controls`) | semantic landmarks |
| Charts | `b-chart` | `role="img"`/`meter` + `aria-label`, per-series `listitem` labels |

## Expand / collapse

Toggles expose their state and target:

- **Tree pattern** (`b-tree-menu`, `b-object-tree`): `aria-expanded` lives on the `role="treeitem"` element (omitted entirely for leaf nodes), children wrapped in `role="group"`. `b-tree-menu` sets `aria-busy="true"` on the treeitem while `onExpand` lazy-loads.
- **Button pattern** (`b-kanban` card toggle, `b-form` collapsible group, `b-sidebar`): the toggle button carries `aria-expanded` + `aria-controls` pointing at the collapsible region's id. `b-form` group legends are `role="button"` + `tabindex="0"` with Enter/Space activation.

## Screen-reader-only content & live regions

Use `srOnlySheet` and an `aria-live` region for transient, SR-only feedback:

- `b-kanban` — `.sr-only` `aria-live="polite"` region announces drag-and-drop moves.
- `b-command-palette` — `.sr-only` `role="status"` region announces result counts / "Searching…" / "No results".
- `b-toast` — `role="status"` + `aria-live="polite"` (or `alert` + `assertive` for the error variant).

The `.sr-only-focusable` variant becomes visible on focus (for skip links).

## Loading / busy

`aria-busy="true"` marks regions whose content is being fetched/updated: `b-button` (loading), `b-tree-menu` treeitem (lazy children). Spinners inside busy controls are `aria-hidden="true"`.

## Shadow DOM caveats

- **IDREF scope** — `aria-labelledby`, `aria-describedby`, and `aria-controls` only resolve **within the same shadow root**. Always mint both the target element and the reference inside the same component. This is why every helper keys off `this.uid`.
- **Cross-boundary names (known limitation)** — `b-tooltip` projects its trigger via `<slot>` (light DOM) while the tip lives in shadow DOM. `aria-describedby` is set on the shadow `.trigger` wrapper, but it cannot reliably associate with the *slotted* focusable element across the boundary. Fully robust tooltip naming would require `ElementInternals` / `ARIAMixin` reflection — tracked as future work.
- **Form association (TASK-035, done)** — the 15 value-bearing inputs are `ElementInternals`-based form-associated custom elements, so they participate in native `<form>` submission and constraint validation, and `form.reportValidity()` anchors the browser's own validation bubble to the inner control. The ARIA layer below is unchanged and remains the primary error channel: `setValidity()` adds *form* participation, not new SR semantics, and the `role="alert"` error region still announces the message. `b-form`'s programmatic collection is untouched. This includes the toggles (`b-checkbox` / `b-switch` / `b-radio`), which follow native checkbox submit semantics — `value` only when checked, absent otherwise. `required` is forwarded to the inner input on checkbox/switch so the browser's "must be checked" rule and its ARIA follow; on `b-radio` it is deliberately unsupported, since a group requirement evaluated per element would mark every unchecked member invalid.

## Keyboard support (summary)

- **Modals/tour**: Tab/Shift+Tab trapped and wrapped; focus auto-set on open, restored on close.
- **Tabs/tree/kanban/ribbon**: arrow keys navigate; Home/End jump; roving tabindex keeps one stop per group.
- **Segmented (radio group)**: arrow/Home/End move and select; one tab stop.
- **Sortable table headers**: focusable inner `<button>`; Enter/Space sort.
- **Collapsible form groups, inline-edit, file-upload dropzone**: Enter/Space activate. The file-upload dropzone is the focusable control because its native `<input type=file>` is `display:none`.

## Custom controls that aren't native elements

A few widgets are focusable non-native elements (`role` + `tabindex="0"` + key handlers) because the interaction can't be expressed with a single native control: `b-inline-edit` (display = `role="button"`), `b-file-upload` (dropzone = `role="button"`), `b-multi-select` / `b-select` combo triggers, `b-form` collapsible legends. Each handles Enter/Space (and arrows where it's a group) and shows a `:focus-visible` ring.
