# Birko.Web.Components — AI Instructions

## What this project is

Component library built on `Birko.Web.Core`. 54 Shadow DOM web components covering inputs, layout, data, feedback, navigation, and command palette. Consumed by Symbio UI and any project that imports `birko-web-components`.

## Directory structure

```
src/
├── inputs/          # b-input, b-select, b-button, b-checkbox, b-switch, b-radio,
│                    # b-textarea, b-multi-select, b-tag-input, b-search-input,
│                    # b-file-upload, b-inline-edit, b-range, b-form, b-segmented,
│                    # b-date-picker, b-datetime-picker, b-date-range-picker, b-time, b-markdown-editor,
│                    # b-option-group
├── layout/          # b-card, b-modal, b-drawer, b-tabs, b-confirm-dialog,
│                    # b-dropdown-menu, b-tooltip, b-split-panel, b-chat
├── data/            # b-table, b-editable-table, b-data-table, b-pagination,
│                    # b-badge, b-tag, b-chart, b-kanban, b-pre, b-code-block,
│                    # b-definition-list, b-object-tree, b-json-viewer, b-xml-viewer
├── feedback/        # b-toast (+ toast manager), b-spinner, b-progress, b-empty, b-skeleton, b-stale-banner
├── nav/             # b-sidebar, b-breadcrumb, b-ribbon, b-tree-menu
├── command/         # b-command-palette, command-provider
├── locales/         # en.json (canonical bwc.* keys)
├── shared-styles.ts # Pre-parsed CSSStyleSheet objects
└── shared-styles.css# Source CSS with @sheet sections
css/
├── tokens.css       # All --b-* design tokens (light + dark + neon theme)
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
| **Shape weight** | diameter / track thickness | component-specific | `b-spinner` (diameter), `b-progress` (track height) |
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
9. `aria-hidden="true"` on decorative elements
10. Add to `CLAUDE.md` component table in this file

## Component inventory

### Inputs (21)
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
| `<b-date-picker>` | BDatePicker | `setLocale()` (static) | `label`, `name`, `value`, `min`, `max`, `native`, `error`, `disabled` |
| `<b-datetime-picker>` | BDatetimePicker | `setLocale()` (static) | `label`, `name`, `value`, `min`, `max`, `error`, `disabled` |
| `<b-date-range-picker>` | BDateRangePicker | `getRange()`, `setRange({start,end})`, `setPresets([])`, `clear()`, `setLocale()` (static) | `label`, `name`, `value` (ISO interval `start/end`), `min`, `max`, `min-days`, `max-days`, `months-visible` (1\|2), `confirm`, `presets` (JSON), `separator`, `native`, `error`, `disabled` |
| `<b-time>` | BTime | `setLocale()` (static) | `label`, `name`, `value`, `step`, `error`, `disabled` |
| `<b-markdown-editor>` | BMarkdownEditor | `setValue()`, `getValue()`, `setRenderer()` | `value`, `mode` (split\|source\|preview); toolbar: H1–H6, bold/italic/strike/highlight/sup/sub, blockquote, code, bullet/numbered/task lists, link, image, table, hr |
| `<b-option-group>` | BOptionGroup | `setOptions([{value,label,icon?}])` | `label`, `name`, `value`, `disabled` |
| `<b-form>` | BForm | `setSchema()`, `setValues()`, `validate()`, `setFieldError()`, `setFieldOptions()`, `setFieldDisabled()`, `onFieldChange()`, `focusField()`, `reset()` | `validate-on` |

### Layout (9)
| Tag | Class | Key methods | Key attributes |
|-----|-------|-------------|----------------|
| `<b-card>` | BCard | — | `header`, `padding` (none\|sm\|lg\|xl) |
| `<b-modal>` | BModal | `open()`, `close()` | `title`, `size` (sm\|md\|lg\|xl\|xxl) |
| `<b-drawer>` | BDrawer | `open()`, `close()` | `title`, `size`, `modal` |
| `<b-tabs>` | BTabs | `setTabs([{id,label}])` | `active` |
| `<b-confirm-dialog>` | BConfirmDialog | `show(): Promise<boolean>` | `title`, `message`, `variant` |
| `<b-dropdown-menu>` | BDropdownMenu | `setItems([{id,label,icon?,variant?,divider?}])` | `align` |
| `<b-tooltip>` | BTooltip | — | `text`, `position` (top\|bottom\|left\|right) |
| `<b-split-panel>` | BSplitPanel | — | `master-width`, `detail-width`, `collapse-at`, `gap` |
| `<b-chat>` | BChat | `setMessages([])`, `appendMessage()`, `setConfig()` | `placeholder`, `disabled` |

### Data (14)
| Tag | Class | Key methods | Key attributes |
|-----|-------|-------------|----------------|
| `<b-table>` | BTable | `setColumns()`, `setData()`, `setIdField()` | `loading`, `striped`, `hoverable`, `label-no-data` |
| `<b-editable-table>` | BEditableTable | `setConfig()`, `setData()`, `getData()`, `validate()` | — |
| `<b-data-table>` | BDataTable | `setConfig(DataTableConfig)`, `load()`, `reload()` | — |
| `<b-pagination>` | BPagination | — | `page`, `total-pages`, `total-count` |
| `<b-badge>` | BBadge | — | `variant` (success\|warning\|danger\|info\|secondary) |
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
| `<b-progress>` | `setValue(value, max?)`; attributes `value`, `max`, `indeterminate`, `label`, `show-value`, `value-format` (percent\|fraction\|value), `size` (sm\|md\|lg\|xl), `variant` (primary\|success\|warning\|danger\|info\|secondary), `striped`, `animated`; events `change`, `complete` |
| `<b-empty>` | `icon`, `message` attributes |
| `<b-skeleton>` | `type` (text\|circle\|table\|form), `rows`, `columns` attributes |
| `<b-stale-banner>` | `show(cachedAt)` method, `message` attribute — stale/cached data warning |

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
