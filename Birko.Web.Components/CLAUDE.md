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
| **Width** | `max-width` / `width` of the panel | `--b-{modal,drawer}-width-{sm,md,lg,xl,xxl}` | `b-modal`, `b-drawer` (extend to `xl`/`xxl`) |
| **Shape weight** | diameter / track thickness | component-specific | `b-spinner` (diameter), `b-progress` (linear: track height; circular: ring diameter) |
| **Inline chip / button** | `padding` + `font-size` | `--b-space-*` + `--b-text-*` | `b-button`, `b-badge`, `b-tag` |

**Always style via `:host([size="sm"])` / `:host([size="lg"])` selectors** — never via class interpolation (`class="${size}"`). The host-attribute pattern keeps `size` as a pure CSS switch (no `observedAttributes` entry needed, no re-render on change) and stays consistent across the library.

`b-chart` is an exception: it uses `height` (SVG pixel layout) not `size` — different concept, documented.

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
| `<b-modal>` | BModal | `open()`, `close()` | `title`, `size` (sm\|md\|lg\|xl\|xxl) |
| `<b-drawer>` | BDrawer | `open()`, `close()` | `title`, `size`, `modal` |
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

### b-data-table auto-detects the server-paged envelope (page-2-empty footgun) (2026-07-20)

`b-data-table` had two paging modes gated only by the `flatArray` config flag (`true` → client-side slicing; `false` → server page/pageSize + refetch), and `base-crud-page` defaults `flatArray = true`. When a consumer's endpoint is actually **server-paged** (returns a CAPPED `{ items, totalCount, page, pageSize }` envelope), the client default sliced that already-capped page again → **page 2+ rendered empty and no `page=2` request ever fired** — silent and easy to ship. Fix: `load()` now resolves an effective mode per response into a sticky `_serverPaged` flag. A bare array is client-paged; a `{ items, totalCount }` envelope is server-paged; a **capped** envelope (`items.length < totalCount`) auto-flips even a mis-set `flatArray:true` default to server mode (detection wins over the default). `flatArray` is now a tri-state escape hatch: `true` forces client (but a capped envelope still flips), `false` forces server, unset = auto. `_getPageData()` and the page-change / page-size-change handlers now key off `_serverPaged` (never re-slice a server page). Only currently-broken (capped) tables change behavior — bare-array and full-envelope tables are untouched, so no working list regresses. **Not fixed (consumer concern):** list SORT — server paging shows the server's order, so lists must sort newest-first for a freshly-created row to land on page 1 (the `base-crud-page` `flatArray` doc was updated to say so). Regression coverage in the Playground `backport-smoke` harness (`Prompt2(a)…(d)` + `(a2)`). Reported from Symbio `docs/birko-framework-fix-prompts.md`.

### b-pagination: bind clicks on the b-button host, not an inner `<button>` (dead-controls fix) (2026-07-20)

`b-pagination.onUpdated` wired its click handler via `btn.querySelector('button')`, but `b-button` renders its `<button>` in its **shadow root**, so that light-DOM query returned `null` and the listener was never attached — **every prev / next / numbered control was inert for all consumers**. `b-button` is designed for host-level clicks (`:host([disabled]) { pointer-events: none; }`, composed click bubbles to the host), so the handler now binds on the `<b-button>` **host** and guards on the host's `disabled` attribute. Audited the package for the same anti-pattern (`querySelector('button'|'input'|…)` reaching into a child custom element's shadow) — none other found (`b-data-table` and `b-form` deliberately use `child.shadowRoot.querySelector` / `(el.shadowRoot ?? el)`). Regression coverage in the Playground `backport-smoke` harness (`Prompt1 …`: real host clicks emit `page-change`; disabled controls emit nothing). Reported from Symbio `docs/birko-framework-fix-prompts.md`.

### b-confirm-dialog: escape message/title by default (stored-XSS fix) (2026-07-19)

`b-confirm-dialog` interpolated its caller-supplied `message`/`title` straight into `innerHTML`, so a confirm built from user data (e.g. a tenant member's username in a "remove {name}?" prompt) was a **stored/reflected-XSS sink** — inconsistent with the sibling `alert`/`prompt` dialog helpers, which write their body via `textContent`. Both now render as **text by default** via `escapeHtml` (from `dom-utils.ts`). Intentional markup is an explicit opt-in: the `message-html` boolean attribute on the component, surfaced as `allowHtml?: boolean` on `ConfirmOptions` for the `confirm()`/`confirmDelete()` dialog helpers. `confirm()`/`confirmDelete()` are safe by default with **no caller change required** (audited all callers across this repo + `../Consumers/*` — none passed HTML). Regression coverage in the Playground `backport-smoke` harness (`STORY-065 …`): the `<img src=x onerror=…>` payload renders as literal text (no `<img>` node, `onerror` never fires), and the `message-html` opt-in still renders real markup. Reported from Symbio `STORY-065` / `TASK-208`.
