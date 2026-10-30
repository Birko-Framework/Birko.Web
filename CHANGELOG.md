# Changelog

One entry per tag, newest first. Versioning rules: [README.md § Versions](README.md#versions). Before 1.0 a
**MINOR** bump is a breaking change and its entry carries a **BREAKING** migration; PATCH versions of one MINOR are
interchangeable for consumers.

## v0.1.23 — 2026-10-30

- **A locale switch re-localizes components nested in other components** — Birko TASK-790, found by Symbio
  (TASK-1010). **Fixed:** a switch re-rendered only the components placed in the page itself. One rendered inside
  another component (Symbio's blocks editor in its pages page, and every `b-*` inside such a component) kept the old
  language. Now every component re-renders, the innermost first, so a component's `onUpdated()` runs after the
  components it contains and can re-apply what it sets on them (b-ribbon's keyboard focus order). **Your own
  components:** one nested in another now re-renders on a locale switch too, so wire listeners in `onUpdated()`
  with `this.listen()`: a raw `addEventListener` there adds one more listener on every switch. A form whose schema
  you built with `t()` keeps the old labels until you rebuild it: subscribe with `onI18nChange()` and call
  `setSchema()` again (Birko.Web.Core README, `label()` section).
- **An open modal stays open when it re-renders** — Birko TASK-791, found by Symbio (TASK-1010). **Fixed:** changing an
  attribute `b-modal`, `b-drawer` or `b-confirm-dialog` observes (`title`, `size`, `message`, …) while it was open
  closed it, leaving the dialog half-closed (not shown, yet still modal). A re-render now keeps a `<dialog>`'s `open`,
  with focus and what you typed. Close a dialog with `close()`.
- **Fixed: listeners piling up on re-render** in `b-chart` (a bar click fired `point-click` once per earlier render),
  `b-time` and `b-datetime-picker` (the hour and minute fields). Found by the Playground's new re-render check, which
  re-renders every component in the gallery and fails on any that gains listeners.
- **Docs:** `b-sortable-list` notes from Symbio's adoption: keep it outside a host's re-render (`data-morph="skip"`), and
  how end-to-end tests read rows and drag inside a modal.

## v0.1.22 — 2026-10-29

- **A toast raised while a modal is open is on top of it** — Birko TASK-786, found by Symbio (TASK-731). **Fixed:** a
  toast shown while a `b-modal` (or `b-drawer modal`, `b-confirm-dialog`, a `dialogs` helper, `b-gallery`'s zoom,
  `b-ribbon`'s mobile menu) was open sat behind the dialog and its backdrop, and its buttons could not be clicked.
  The toasts now show inside the open modal, above its content, and move back when it closes, with any toast still
  showing. With no modal open nothing changes. A `<dialog>` an app opens with its own `showModal()` is not tracked,
  and toasts still sit behind it. **Tests:** while a modal is open the toast container is inside the dialog's shadow
  root, so `document.getElementById('b-toast-system')` / `document.querySelector('#b-toast-system …')` do not find it;
  Playwright locators pierce shadow roots and are unaffected. **While a modal is open, a bottom-corner toast shows at
  the top centre**, so it does not cover the modal's footer actions (Symbio: a bottom-right toast covered Create /
  Cancel at a 1280 px window); it goes back to its corner when the modal closes.
- **New: `b-sortable-list` and `b-sortable-picker`** — Birko TASK-787, asked for while walking Symbio TASK-825. A list
  the user reorders by dragging a row (on touch, a short hold or the handle) or by keyboard (Space on the row's handle,
  the arrow keys, Space to drop, Escape to cancel), in a `list`, `grid` or `inline` layout. The rows are your own
  elements with a `data-id`, so they can hold their own fields; `change` gives the new order. `b-sortable-item` is a
  ready-made row (image, label, meta), and `setItems()` fills a list with them. `b-sortable-picker` puts a search over
  it: you supply the search, picks go to the end, a duplicate is pointed at, `max` refuses more, and the chosen items
  keep their labels. Its messages go where you say: each fires a cancelable `notice` event (take it and show the
  text yourself), or `notify="toast"` sends them to the toast; by default they show under the search. It is
  form-associated, one entry per id, in order. New locale keys `bwc.sortable.*` and
  `bwc.sortablePicker.*`.
- **b-data-table's bulk bar, redesigned** — Birko TASK-788, asked for while walking Symbio TASK-500. While rows are
  selected the bar now floats just above the table's footer, centred, with a prominent count, × to clear (and
  Escape), and actions in `b-button`'s look. **New, additive:** `variant: 'primary'` on a bulk action; actions that do
  not fit go into a More menu; `selectAllMatching: true` offers "Select all N matching" (client-paged: every id;
  server-paged: `bulk-action` carries `allMatching: true` with the filters instead of ids). `bulkActions` and
  `bulk-action` are unchanged otherwise, and `.bulk-btn[data-bulk]` still selects an inline action. **Changed:**
  `confirm: true` asks in a `b-confirm-dialog`, not the browser's `confirm()`; action labels are shown as text (they
  were inserted as HTML). New locale keys `bwc.dataTable.*`. On a phone, where one line holds too little, the bar
  wraps (count and "Select all" on top, actions below; long translations wrap, a too-long action label is cut with
  "…" and keeps its full name), and the table keeps room for it under the last row. **Also fixed in the footer:** it
  is inset like the cells (the item count sat on the table's edge); `b-pagination` keeps "24 items" on one line and
  wraps instead; its page-size box always offers the table's own page size (8 per page showed an empty box).
  **Fixed, found in the human test:** clearing the selection left the rows ticked on screen, and the table grew slower
  with every tick, page change or re-render. Each re-render added another set of listeners to the checkboxes, row
  menus and editable cells that `b-table` keeps, so one click ran its handler many times. This predates the redesign
  and affected every list page with `selectable`, row actions or editable cells.

## v0.1.21 — 2026-10-29

- **The tree views keep a value's spaces** — Birko TASK-784. **Fixed:** `b-object-tree` (and `b-json-viewer` through
  it), `b-xml-viewer` and `b-json-diff`'s tree view showed `"a     b"` as `"a b"`, because the browser folds spaces in
  ordinary text. String values, XML text, attribute values, CDATA, comments and the diff's values now keep every space
  (`white-space: pre-wrap`, so a long value still wraps). A string holding a line break now shows it on a new line.
  `b-xml-viewer` now trims the ends of an element's only text, as it already did for mixed content and as the diff
  engine does, so pretty-printed XML (`<a>`, a line break, indented `x`, `</a>`) stays on one row. `b-code-block`, `b-pre` and the side-by-side
  view already kept spaces and are unchanged.

## v0.1.20 — 2026-10-27

- **b-carousel `rotation-control="hover"`: a click no longer keeps the button shown** — Birko TASK-777, found by
  FlowerFur's human test. **Fixed:** in v0.1.19, a mouse click on the stop / start button focused it, and focus within
  kept it visible after the pointer left, until a click outside. Only keyboard focus keeps it shown now (the browser's
  `:focus-visible` on whatever took focus, a key pressed after a click, cleared by a pointer press). Tab into the
  carousel still lands on it and shows it.

## v0.1.19 — 2026-10-27

- **b-carousel stop button on hover or focus only** — Birko TASK-777 (for FlowerFur TASK-133). New opt-in attribute
  `rotation-control="hover"`: the autoplay stop / start button is hidden until the carousel is hovered or has focus
  within. It is hidden by opacity only, so it keeps its tab stop and its name: Tab into the carousel lands on it and
  shows it. Hidden, it takes no pointer input. Touch devices have no hover, so there it is not seen; that WCAG 2.2.2
  trade-off is the consumer's to make. Without the attribute nothing changes: the button is always visible.

## v0.1.18 — 2026-10-23

- **b-json-diff translates** — Birko TASK-765 (reported by Symbio TASK-953). **Fixed:** `locales/en.json` had the
  `jsonDiff` block nested inside `bwc.daterange`, so it shipped as `bwc.daterange.jsonDiff.*` while `b-json-diff`
  reads `bwc.jsonDiff.*`. Every b-json-diff string showed its English default in every locale. The block is now
  `bwc.jsonDiff`, with its keys and values unchanged. **Consumers:** if you copied en.json's structure, move your own
  `bwc.daterange.jsonDiff` block to `bwc.jsonDiff` in each locale. Under the old path it was never read, so moving it
  is what makes those translations show.
- **Six keys added to en.json** that the code read and the bundle lacked: `common.yes` / `common.no` (boolean
  cells), `common.module` / `common.navigation` (Shell's module commands; without a bundle they showed the raw key)
  and `bwc.ribbon.scrollTabsLeft` / `scrollTabsRight`. A locale parity check will report them as new.

## v0.1.17 — 2026-10-22

- **I18n fallback chains** — Birko TASK-750 (for Symbio TASK-953). New `I18nOptions.fallbackChains`, the ordered
  fallbacks per locale, e.g. `{ cs: ['sk', 'en'] }`: a key missing in Czech comes from Slovak, then English.
  `setLocale()` and `loadModule()` load the whole chain, root and module bundles; `t()` and plurals take the first
  locale that has the key. A locale with no entry, and an app that passes no `fallbackChains`, behave exactly as before.
  Core README § Internationalization.

## v0.1.16 — 2026-10-22

- **No empty strip above the ribbon** — Birko TASK-749 (reported by the FinStat web tester). **Fixed:** since v0.1.13
  every `b-ribbon` had an empty strip, about 21px, above its tabs. Ribbons are that much shorter now, and what is
  below them moves up.
- **Carousels and galleries keep the slide chosen on a busy page** — Birko TASK-745. **Fixed:** when the page was busy
  during a smooth scroll, `b-carousel` and `b-gallery` could settle on a slide nobody chose. The index jumped,
  `slide-change` fired and the slide was announced. A scroll the browser ends early is now resumed; the user's own
  swipe or scroll still wins.

## v0.1.15 — 2026-10-22

- **Links in the Quick Access Toolbar** — Birko TASK-748 (for the FinStat web tester). A link command (`href`, no
  `action`) can be added to `b-ribbon`'s toolbar, by the user or as an app default. There it stays a link: a click
  follows it and emits `item-click` with `source: 'qat'`, and middle-click or "open in new tab" work as on the ribbon
  command. A disabled one does nothing. Input boxes still cannot be added.

## v0.1.14 — 2026-10-22

The rest of the Office-like `b-ribbon` (Birko FEATURE-019), signed off by the user. Nothing changes for an app that
uses none of the new options, apart from the two looks marked **Changed look**.

- **Toggle buttons** — TASK-739. `RibbonItem.toggle` / `pressed`, and `toggleGroup` for one-of sets (alignment).
  `item-click` carries `pressed`; `setPressed()` / `isPressed()`.
- **Collapse** — TASK-735. Double-click a tab, or Ctrl+F1 anywhere in the app (`collapse-shortcut` rebinds it or
  turns it off); `toggleRibbon()`.
- **Quick Access Toolbar** — TASK-737. Opt-in with `setQuickAccess(items)`: favourite commands before the tabs
  (`qat-position` above / below), added and removed by right-click, kept per `qat-key`; `quick-access-change`.
- **Key tips** — TASK-736. Alt+Windows key (Ctrl+Option on a Mac) shows letters to reach every tab, command and menu
  choice by keyboard; `keytip` overrides a letter, `keytip-shortcut` rebinds or turns it off.
- **Dialog launcher** — TASK-733. `RibbonGroup.launcher` adds Office's corner arrow; it emits `group-launcher`.
- **Contextual tabs** — TASK-734. `RibbonTab.contextualSet` with `setContextualSets()` / `showContextual()` /
  `hideContextual()`, in three looks (`contextual-style` band / pill / edge).
- **Galleries** — TASK-740. `RibbonItem.gallery`: a row of visual choices with a full grid behind it, in three looks
  (`gallery-style` framed / open / dropdown); `setGallerySelection()`.
- **Input boxes** — TASK-741. `RibbonItem.field`: a text or number box or a dropdown (free values per dropdown), in
  three caption looks (`field-caption`); `item-change` reports a value; `setFieldValue()` / `getFieldValue()`.
  `b-select` gets `no-clear`.
- **Group spacing** — TASK-730. **Changed look:** the divider sits halfway between groups, and the gap is narrower
  (`--b-ribbon-group-gap` is now `var(--b-space-lg)`, 16px, was 24px). A group narrower than its name centres its
  commands (TASK-746). **Changed look.**
- **Folding** — **Fixed** (TASK-746): between about 470 and 525px groups stayed larger than fitted and the last one was
  cut off by up to 49px. A folded group without an icon shows its initial instead of an empty button (TASK-743).
- **Every size is a token** — TASK-747. 21 new `--b-ribbon-*` tokens in `css/tokens.css`, defaulting to the old
  values; measured unchanged.
- **Screen readers** — **Fixed:** a menu choice announced its shortcut twice.

## v0.1.13 — 2026-10-22

- **`renderEmptyFilter()` on the base pages** — Birko TASK-744 (for Symbio TASK-955). While `requiredFilterSet` is
  false, `BaseCrudPage`, `BaseListPage` and `BaseSplitPage` show `renderEmptyFilter()`. Its default is the same
  `<b-card><b-empty>` markup they inlined before, so nothing changes until a page overrides it, for example to put a
  "Create a building" link in `b-empty`'s slot. Shell README § A prerequisite is missing.
- **JSON diff** — Birko TASK-725 (for the FinStat web API tester).
  - New `diffJson(a, b, options)` in `birko-web-core` (also `birko-web-core/diff`). It reports changes by path, a
    tree and summary counts.
  - Options: ignored paths with `*` / `[*]` / `**` patterns, per-path normalizers, and arrays compared by index, by
    key or unordered.
  - New `<b-json-diff>`: a tree of changes with an "Only changes" toggle, or both bodies side by side with the
    differing lines marked. Side names are `label-a` / `label-b`.
- **XML in the diff** — Birko TASK-727. New `xmlToTree` / `xmlToLines`. `b-json-diff format="xml"` compares XML
  bodies and shows the original XML side by side. Text beside attributes is kept under `#text`.
- **Hidden screen-reader text no longer stretches the page** — Birko TASK-725. **Fixed:** `b-json-diff` and `b-tabs`
  inside a scrolling container added a second, window-level scrollbar.
- **`b-tag-input` keeps focus after a tag is committed** — Birko TASK-729. **Fixed:** after Enter, the next value
  typed went nowhere.
- **An Office-like `b-ribbon`** — Birko FEATURE-019, TASK-730 / 731 / 732 / 738.
  - **Layout.** Groups are one height, rows line up, and group names sit under their group. **Changed look.**
  - **Keyboard.** The open ribbon is one Tab stop, and the arrow keys move between commands and groups. Folded groups
    open with Enter, Space or ↓.
  - **Menus.** New `RibbonItem.menu` (and `split`) for menu buttons and split buttons. A choice emits `item-click`
    with `parentId`.
  - **Tooltips.** New `RibbonItem.description` / `shortcut` feed a tooltip. **Changed behaviour:** commands no longer
    carry a native `title`; their name is in `aria-label` and the tooltip. With a tooltip showing, the first Escape
    only hides it.
- **`b-tooltip` themes** — Birko TASK-738. `theme="light"`, `heading` and `shortcut` (as text), and `showFor(anchor,
  content)` / `hide()` for an element it does not wrap. A `text` given alone behaves as before.

## v0.1.12 — 2026-10-18

- **Reorderable tabs, resizable split panels and saved layouts** — Birko TASK-525 (for DraCode STORY-039).
  - `b-tabs`: `reorderable` adds drag and drop, and Ctrl+Shift+Arrow / Home / End from the keyboard, announced to screen
    readers. Each move emits `tab-reorder`, and `order` reads and sets the order.
  - `b-split-panel`: `resizable` adds an ARIA separator for pointer and keyboard. Each change emits `split-resize`.
    `persist-key` saves the sizes in localStorage, and `sizes` reads and sets them (CSS lengths only; anything else is
    refused, since a size goes into an inline style).
  - New `captureLayout` / `applyLayout` save and restore tab order and split sizes by `layout-key`.
  - Components README § b-tabs, § b-split-panel and § Saving a layout.
- **`b-tabs`'s labels are text** — Birko TASK-525. **Changed behaviour:** a label's markup used to be parsed (an
  `onerror` in a label ran), and is now shown as text, as for `b-modal`'s title and `b-toast`'s message. A tab id can no
  longer break out of its attribute.

## v0.1.11 — 2026-10-18

- **OAuth redirect sign-in and token refresh in `birko-web-shell/auth`** — Birko TASK-524 (for DraCode STORY-039). New
  `readAuthFragment()` reads `#access_token=…&refresh_token=…` after a provider redirect and clears it from the address
  bar (a hash route is left alone). New `createAuthSession({ auth, refresh })` refreshes ahead of the JWT's `exp`, after a
  401 (as ApiClient's `onRefreshToken`) and after a network failure, through one pluggable refresh call. Its `getToken`
  is what ApiClient, WsClient and SseClient send. Also new: `tokenExpiresAt`, `decodeJwtPayload`. **Fixed:**
  `setAuth` decoded the payload with a bare `atob`, so a token whose payload contains `-` or `_` (base64url) yielded no
  claims; it now decodes base64url. Shell README § OAuth redirect sign-in.

## v0.1.10 — 2026-10-14

- **A write a closed tab left mid-send is recovered** — Birko TASK-598. It stayed `syncing` forever: never resent, not
  counted, not listed. The next sync now resends a `PUT`, `DELETE` or `idPinned` `POST` (retry count kept); a plain
  `POST` or a `PATCH` may have landed, so it becomes `dead` for the user to retry or discard. **Changed behaviour:**
  `sync()` drains under a Web Lock, so one tab sends at a time (two tabs could send the same action twice), and
  `pendingCount` counts `syncing` actions. New options `locks` and `syncLeaseMs` (the fallback without Web Locks).
  Core README § Offline writes.
- **Every theme's text clears WCAG AA, and a gate keeps it there** — Birko TASK-130, TASK-599 (for Reps TASK-123,
  Presenter). 98 of 232 measured pairs were below 4.5:1, among them the default theme's warning badge (2.86:1) and
  `inverse`'s white text on pale tints (1.10:1). **Changed look:** badge, stat and active-item text is darker on light
  themes and lighter on dark ones (new `--b-color-<x>-text`); toasts on success/warning/info (and every finstat fill)
  carry dark text (new `--b-text-on-<x>`); muted/secondary text moved in neon, finstat and inverse; `inverse` has dark
  tints. Each value is the smallest step that clears AA, so hues are kept. **A consumer that forks `tokens.css`**
  (Symbio) sees no change until it copies the new tokens in: every component falls back to the old token. Gated by
  Birko.DesignTokens' `ContrastTests` and the Playground's `device-fix-check`.
- **`b-drawer`'s title is a heading, and text** — Birko TASK-609. As `b-modal` in v0.1.9: `<h2>` / `heading-level`,
  labelling the drawer, which had no accessible name; markup in the title ran in the page.

## v0.1.9 — 2026-10-14

- **`b-editable-table` shows its data after `setData()` or a row removal** — Birko TASK-552 (for Symbio TASK-900).
  Cells the user had typed in kept their old values on screen while the table's data had moved, so the next
  keystroke wrote the shown value into another row. Text, number, select and checkbox cells. Symbio's
  `syncCellValues` workaround can go.
- **`b-modal`'s title is a heading, and text** — Birko TASK-580 (for Presenter TASK-025). An `<h2>` by default,
  `heading-level` for 1–6, labelling the dialog and styled as before; no title, no heading. Headings inside a dialog
  now nest under it, so start them at `<h3>`. The title was interpolated as HTML: markup in it ran in the page, the
  same defect v0.1.5 fixed in `b-toast`.

## v0.1.8 — 2026-10-14

- **`WsClient.request()`: request/response over a WebSocket** — Birko TASK-523 (for DraCode TASK-116). Sends
  `{ type, id, data }`, resolves with the reply carrying the same id; rejects on an error reply, a timeout (30 s), a
  close or `disconnect()`, and at once when not open. `requestIdField` names the correlation field; `requestMessage()`
  sends another envelope shape. Unsolicited messages reach the handlers as before. Core README § WsClient.
- **`RuntimeConfig`: defaults < server < local settings** — Birko TASK-526 (for DraCode TASK-116). Declared keys and
  types only; the local layer persists, the server's never does; `secretKeys` are memory-only and scrubbed from storage
  an older build wrote. Core README § Runtime configuration.

## v0.1.7 — 2026-10-14

- **A list can refresh when another user changes it** — Birko TASK-583 (for Symbio TASK-898).
  - `BaseListPage.liveRefresh = { moduleId, entityType, debounceMs? }` (off by default) reloads the list on a matching
    `entity-changed` event: debounced (500 ms), never while the create/edit modal is open (one reload when it closes),
    unsubscribed on unmount.
  - The app registers the event source once: `setEntityChangeSource((h) => sse.on('entity-changed', h))`. Opting in
    without one throws when the page connects. New exports: `EntityChangedEvent`, `parseEntityChangedEvent`,
    `LiveRefreshOptions`. Shell README § Live refresh.

## v0.1.6 — 2026-10-14

- **`SyncManager` stops re-sending a write the server will never take** — Birko TASK-581 (for Symbio TASK-151).
  - **Changed default:** a failed write is retried with exponential backoff (`retryBaseMs` 5 s doubling to
    `retryMaxMs` 15 min; the next attempt is persisted with the action) and becomes **`dead` after `maxRetries` (10)**
    attempts. It used to be re-sent every 30 s forever.
  - **Changed default:** a 4xx a retry cannot change (anything but 401, 408, 409, 429) makes it `dead` at once — a 422
    validation refusal no longer sits in the outbox as pending. A `DELETE` 404 still drains (or retries, with
    `deleteMissingIsApplied: false`).
  - **Changed default:** order is kept per entity. While a write to an entity backs off or is dead, later writes to
    that entity wait; other entities go ahead. Before, a later write was sent past a failed one.
  - New: `getDead()`, `retry(id)`, `discard(id)`, `onDead(fn)`; `ActionQueue.get(id)` / `getDead()`;
    `QueuedAction.status` gains `'dead'` and `nextAttemptAt`; `SyncResult` gains `dead`. `pendingCount` excludes dead
    actions, so a consumer shows them through its own failed-write UI. Core README § Offline writes.

## v0.1.5 — 2026-10-14

- **Undo instead of a confirm dialog for reversible deletes** — Birko TASK-545 (for Symbio TASK-899).
  - `toast.show(msg, variant, ms, { action })` and `toast.notify(msg, { action })` render an action button in the
    toast's live region (label default `bwc.common.undo`); clicking it dismisses the toast, then runs the callback.
    Both now return the `<b-toast-item>` (`focusAction()`); a toast with an action lives 10 s by default.
  - `base-crud-page` (list and split pages): `deleteMode: 'undo'` deletes at once and offers Undo, which calls the
    page's `restoreDeleted(id)`. Opting in without it throws when the page connects; a failed restore shows an error
    and the row stays gone; a keyboard-started delete moves focus to Undo. New key `bws.common.restored`.
    `'confirm'` stays the default, so no page changes.
  - **Every toast:** dismissal pauses while it is hovered or holds focus, and resumes with what was left (at least 1 s).
- **A toast's message and icon are text** — Birko TASK-597. Both were rendered as HTML, so a server error, tenant
  name or module label carrying markup ran in the page. Markup is now shown, never parsed. No consumer passed HTML.
- **`b-rating` icon slot** — Birko TASK-592. A slotted `<svg slot="icon">` replaces the star; only its shape
  geometry is kept and the component paints it, so filled/empty and 3:1 contrast hold.

## v0.1.4 — 2026-10-14

- **`b-rating`, a form-associated star-rating input** — Birko TASK-579 (for the storefront's TASK-012 and TASK-025).
  - Whole stars, `max` 1–10 (default 5). Each star is a label for a hidden native radio: one tab stop, arrow keys move
    and select, Home/End jump to the ends, and each star is named "3 of 5" (`bwc.rating.star`).
  - Submits `value` with a form (nothing when unrated); `required` uses the radio group's own validity; `form.reset()`
    restores the `value` attribute. As with a native input, the attribute is the default: after a user pick or a
    `.value` set, changing it does nothing until a reset.
  - `readonly` renders an image named "Rated 4 of 5" (`bwc.rating.readonly` / `bwc.rating.none`): no tab stop.
  - New token `--b-rating-color` (default `--b-color-warning`); the finstat theme sets it to `#a77400`, because its
    brand yellow is 1.7:1 on white. Filled and empty stars clear 3:1 in every shipped theme.
- Components README: Presenter's measured whole-app sizes for per-component imports (TASK-564).

## v0.1.3 — 2026-10-13

- **Import only the components you use** — Birko TASK-564 (for Presenter TASK-035).
  - Every component has its own entry point, the source file itself: `birko-web-components/<category>/<b-name>`
    (e.g. `birko-web-components/inputs/b-button`), through one `./<category>/*` pattern per category in `exports`.
    The full import and the category barrels are unchanged.
  - A component imported alone registers every `b-*` it renders: the hint tooltip of every labelled control, the
    command palette's spinner, `b-confirm-dialog`'s buttons, and all of `b-form`'s field controls.
  - Consumers resolving Birko from source: alias `birko-web-components` to the package's `src` **directory** and
    use `"birko-web-components/*": ["…/src/*"]` in `tsconfig` paths. The older `src/index.ts` alias and
    `src/*/index.ts` pattern still resolve the barrels, but not a component path. Components README § Import only
    what you use has the path table and the measured sizes.
- **A page's tour button sits beside its title** — Birko TASK-582 (for Symbio TASK-677).
  - `BasePage.tourSteps()` (default `null`) renders a `?` beside the `<h1>`, named by `bws.tour.button` ("Take a
    tour"), and starts the tour on click, replaying every time. `renderTourButton()` keeps it in a custom header.
  - The page header now wraps the title in `.page-title-group`. A consumer stylesheet that selects the title as a
    direct child of `.page-header` (`.page-header > .page-title`) no longer matches it.

## v0.1.2 — 2026-10-12

- **Text on a primary fill clears WCAG AA in dark** — Birko TASK-562, TASK-563.
  - New token `--b-text-on-primary` (dark theme: `#0f172a`; light keeps white). Every rule that puts text on
    `--b-color-primary` uses it: `b-button` primary, `b-pagination`'s active page, the date pickers' selected day,
    range ends and apply button, `b-option-group`, `b-markdown-editor`'s active mode, `b-tour`'s primary button and
    `b-chat`'s user bubble and send button. A theme that does not define it falls back to `--b-text-inverse`.
  - `--b-text-muted` is darker in light and lighter in dark, so muted text clears AA on both.
- **`b-modal` focus works with slotted content** — TASK-568, TASK-573.
  - The Tab trap is gone: it saw only the modal's shadow tree and pinned focus on Close. `open()` focuses the first
    slotted control (through slots, open shadow roots and `display: contents`).
  - `open()` on a modal that is already open does nothing. Re-calling it on every render used to pull focus back to
    the first control and overwrite the element `close()` returns focus to.

## v0.1.1 — 2026-10-11

- **A validator's refusal reaches the screen** — Birko TASK-554 (found in Symbio TASK-903).
  - `ApiClient` parses every JSON media type (`application/problem+json` included) as JSON. A validation refusal
    used to come back as the raw JSON **string**, so neither a field error nor a readable message could be shown.
    A caller that worked around this by `JSON.parse`-ing a string `data` now receives the object.
  - `showFormError` and `apiErrorMessage` read field-error entries that are `{ errorCode, message }` objects as
    well as plain strings; such an entry used to show as `[object Object]`.
  - `apiErrorMessage` prefers the first field's own message over the generic ProblemDetails `title`
    (`detail` still comes first).
  - New export `fieldErrorText(entry)` (`birko-web-core/http`): the message of one field-error entry, or `''`.
- README (Core): DevTools *Offline* cannot test `SseClient`'s `_failing`; stop the server or use a device — TASK-547.

## v0.1.0 — 2026-10-10

First tagged version: the state of `main` on 2026-10-10, all four packages. Nothing before it was versioned, so it is
a baseline rather than a list of changes. Most recent work included:

- `b-qty-stepper` — form-associated quantity stepper (decimal step, min/max, unit) — Birko TASK-548
- `b-carousel` — server-rendered slides, arrows, dots, swipe, autoplay that yields — TASK-549
- `b-gallery` — product images with thumbnails, swipe and an accessible zoom — TASK-550
- `b-input` prefix / suffix slots and `clearable` — TASK-484
- `announce()` (dom-utils) — status messages through `Element.ariaNotify` with a live-region fallback
- `I18n.t()` and every `{placeholder}` path fill in one pass via `interpolate()` — TASK-551
- `b-code-block` re-renders when its text content changes — TASK-543
- `SseClient` — one retry loop, `reconnectDelays` schedule, `_failing` event (`failingAfter`, default 5) — TASK-547
