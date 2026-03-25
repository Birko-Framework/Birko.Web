# Birko.Web.Components — AI Instructions

## What this project is

Component library built on `Birko.Web.Core`. 31 Shadow DOM web components covering inputs, layout, data, feedback, and navigation. Consumed by Symbio UI and any project that imports `birko-web-components`.

## Directory structure

```
src/
├── inputs/          # b-input, b-select, b-button, b-checkbox, b-switch, b-radio,
│                    # b-textarea, b-multi-select, b-search-input, b-file-upload,
│                    # b-inline-edit, b-form
├── layout/          # b-card, b-modal, b-drawer, b-tabs, b-confirm-dialog,
│                    # b-dropdown-menu, b-tooltip
├── data/            # b-table, b-data-table, b-pagination, b-badge, b-chart
├── feedback/        # b-toast (+ toast manager), b-spinner, b-empty, b-skeleton
├── nav/             # b-sidebar, b-breadcrumb, b-ribbon, b-tree-menu
├── shared-styles.ts # Pre-parsed CSSStyleSheet objects
└── shared-styles.css# Source CSS with @sheet sections
css/
├── tokens.css       # All --b-* design tokens (light + dark theme)
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

### Inputs (12)
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
| `<b-search-input>` | BSearchInput | — | `placeholder`, `value`, `debounce` |
| `<b-file-upload>` | BFileUpload | — | `accept`, `multiple`, `max-size`, `endpoint`, `disabled` |
| `<b-inline-edit>` | BInlineEdit | — | `value`, `placeholder`, `type` |
| `<b-form>` | BForm | `setSchema()`, `setValues()`, `validate()`, `setFieldError()`, `reset()` | `validate-on` |

### Layout (7)
| Tag | Class | Key methods | Key attributes |
|-----|-------|-------------|----------------|
| `<b-card>` | BCard | — | `header`, `padding` (none\|sm\|lg\|xl) |
| `<b-modal>` | BModal | `open()`, `close()` | `title`, `size` (sm\|md\|lg\|xl) |
| `<b-drawer>` | BDrawer | `open()`, `close()` | `title`, `size`, `modal` |
| `<b-tabs>` | BTabs | `setTabs([{id,label}])` | `active` |
| `<b-confirm-dialog>` | BConfirmDialog | `show(): Promise<boolean>` | `title`, `message`, `variant` |
| `<b-dropdown-menu>` | BDropdownMenu | `setItems([{id,label,icon?,variant?,divider?}])` | `align` |
| `<b-tooltip>` | BTooltip | — | `text`, `position` (top\|bottom\|left\|right) |

### Data (5)
| Tag | Class | Key methods | Key attributes |
|-----|-------|-------------|----------------|
| `<b-table>` | BTable | `setColumns()`, `setData()` | `loading`, `striped`, `hoverable` |
| `<b-data-table>` | BDataTable | `setConfig(DataTableConfig)`, `load()`, `reload()` | — |
| `<b-pagination>` | BPagination | — | `page`, `total-pages`, `total-count` |
| `<b-badge>` | BBadge | — | `variant` (success\|warning\|danger\|info\|secondary) |
| `<b-chart>` | BChart | `setData(ChartData)`, `setOptions(ChartOptions)` | `type`, `height`, `legend`, `animate` |

### Feedback (4)
| Tag / Export | Key API |
|---|---|
| `toast` (manager) | `toast.success(msg)`, `toast.error(msg)`, `toast.warning(msg)`, `toast.info(msg)`, `toast.notify(msg, opts)` |
| `<b-spinner>` | `size` attribute (sm\|md\|lg) |
| `<b-empty>` | `icon`, `message` attributes |
| `<b-skeleton>` | `type` (text\|circle\|table\|form), `rows`, `columns` attributes |

### Navigation (4)
| Tag | Class | Key methods |
|-----|-------|-------------|
| `<b-sidebar>` | BSidebar | `setItems(SidebarItem[])` |
| `<b-breadcrumb>` | BBreadcrumb | `setItems([{label, href?}])` |
| `<b-ribbon>` | BRibbon | `setTabs(RibbonTab[])`, `setContextActions([])`, `pin()`, `unpin()` |
| `<b-tree-menu>` | BTreeMenu | `setItems(TreeMenuItem[])`, `expandAll()`, `collapseAll()`, `reveal(id)` |

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

## What NOT to do
- Do not hardcode colors, spacing, or sizes — always `var(--b-*)`
- Do not copy `@keyframes spin` — import `spinSheet`
- Do not copy `.backdrop`, `.overlay-header`, etc. — import the shared sheet
- Do not use `document.querySelector` — use `this.$()` inside Shadow DOM
- Do not add non-`--b-*` CSS variables — extend `tokens.css` if a new token is needed
- Do not write `<button>` in component templates — use `<b-button>` (unless you are implementing `<b-button>` itself)
