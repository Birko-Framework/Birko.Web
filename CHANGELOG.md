# Changelog

One entry per tag, newest first. Versioning rules: [README.md § Versions](README.md#versions). Before 1.0 a
**MINOR** bump is a breaking change and its entry carries a **BREAKING** migration; PATCH versions of one MINOR are
interchangeable for consumers.

## v0.5.0 — 2026-11-22

- **BREAKING: the shell's user menu offers Profile only when the app asks for it** — Birko TASK-966, reported by
  DraCode. `BCoreAppShell.getUserMenuItems()` always included a Profile item going to `#/profile`, a dead link in an
  app with no profile page. It is now off by default. **Migration:** an app with a profile page that uses the default
  menu (or builds on `super.getUserMenuItems()`) adds `protected get showProfileMenuItem() { return true; }` to its
  shell, or Profile disappears from its user menu.

## v0.4.23 — 2026-11-22

- **SECURITY: the shell's user menu escapes the user's name** — Birko TASK-965, reported by DraCode.
  `BCoreAppShell.renderUserDropdown` put `getUserName()` and `getUserInitials()` into its HTML unescaped. The name
  usually comes from the token's `name` claim, which a GitHub or other federated sign-in lets anyone set, so a name like
  `<img src=x onerror=…>` ran script in the header of every app using the default user menu. Both are now escaped where
  they are rendered, and both methods return plain text. An override that escapes its own value (DraCode's, as a
  workaround) must stop doing so, or names with `&`, `<` or quotes show escaped twice.

## v0.4.22 — 2026-11-22

- **A component's own attributes survive its parent's re-render** — Birko TASK-962, reported by DraCode. The morph
  removed every attribute a parent's new render did not contain, so a page re-render unchecked a checked `b-checkbox`
  and dropped `b-tabs` `active`, `b-sidebar` `collapsed`, `b-sync-status` `hidden`, `b-kanban` `stacked` and the like
  (DraCode's stacked board un-stacked). Now only an attribute the parent rendered last time and no longer renders is
  removed; one the parent renders still wins. A page that counted on a re-render to clear such an attribute (to
  uncheck a box, say) must now clear it itself, e.g. `checkbox.checked = false`.
- **`b-kanban`: a drop lands where it is dropped** — Birko TASK-964, found at TASK-961; older than v0.4.21. The drop
  position was worked out against the column's first card only, so a drop anywhere below it landed second; and
  "before" / "after" a card counted the sub-cards shown above it. Both now use the card under the pointer and its place
  among its siblings.
- **`b-kanban`: `maxNestingDepth: 0` means no sub-cards** — Birko TASK-961, reported by DraCode. 0 counted as no limit
  (an empty strip on every card), and a drop on a card's middle nested it whatever the limit said. Nesting by drop now
  keeps within the limit, counting the dropped card's own sub-cards.
- **`b-kanban`: the column footer can be translated** — Birko TASK-963. "N cards" is `bwc.kanban.cardCount`.

## v0.4.21 — 2026-11-22

- **`b-kanban`: locked columns, a move rule, and refusing or undoing a move** — Birko TASK-947 (FEATURE-022, asked for
  by DraCode). `KanbanColumn.locked` stops a person moving cards into or out of a column, by mouse or keyboard;
  `KanbanConfig.canMove(move)` refuses any other move, with a reason that is announced; a new cancelable
  `card-move-request` fires before a person's move; `revertMove(cardId)` undoes the last one without an event. The
  app's own `moveCard()` is not limited. Boards that use none of this behave as before, and `card-move` is unchanged.
- **`b-kanban` lanes inside a column** — Birko TASK-948 (FEATURE-022). `KanbanColumn.lanes` stacks lanes in a column,
  each with a label, count and drop area; a card names its lane with `laneId` (none, or an unknown one, goes to
  `defaultLane`, else the first lane). A lane change, even within a column, is a `card-move` with `fromLane` /
  `toLane`; `canMove`, `card-move-request`, `revertMove`, `moveCard(…, lane)` and `getCards(column, lane)` know lanes.
  Columns without lanes are unchanged.
- **`b-kanban` reordering off per column, and the keyboard across lanes** — Birko TASK-949 (FEATURE-022).
  `KanbanColumn.sortable: false` keeps the app's `order` (no renumbering, no drop line; a dropped card takes its place
  by its own `order`; a drag within its lane changes nothing). `↑`/`↓` cross lanes by keyboard, skipping refused ones,
  and the announcement names the column, lane and position.
- **`b-kanban` lanes as rows across the board, and board-level lanes** — Birko TASK-956 (FEATURE-022).
  `KanbanConfig.laneLayout: 'rows'` draws lanes as swimlanes across all columns (`'sections'` stays the default);
  `KanbanConfig.lanes` / `defaultLane` set lanes for the whole board, which a column's own `lanes` override and
  `lanes: []` opts out of. A card moving into another column keeps its lane when that column has it.
- **`b-kanban` lanes as tags on cards** — Birko TASK-957 (FEATURE-022). `laneLayout: 'tags'` groups a column's cards by
  lane with no headings; each card's lane tag opens a lane menu that moves it (through the same rules as a drag) and
  never starts a drag or fires `card-click`. A move given no position (a drop at the end, a lane pick) now lands at the
  end of its lane or column instead of wherever the card's old `order` sorted it.
- **`b-kanban` stacks when narrow, if the page asks** — Birko TASK-950 (FEATURE-022). `KanbanConfig.stackBelow` stacks
  the columns one per row, with no sideways scroll, while the board's own width is below it; rows show as sections
  while stacked. Boards without it are unchanged.
- **`b-kanban`: buttons, links and fields on a card are not the card** — Birko TASK-946 (FEATURE-022, asked for by
  DraCode). A click on a `button`, `a`, `input`, `select`, `textarea` or `label` in a card, or inside `[data-no-drag]`,
  no longer fires `card-click`, and a press on one no longer starts a drag; a control inside a component's shadow root
  (`b-button`) counts. A board that relied on a click on such an element being a card click must handle the control's
  own click (Symbio's three boards have none).
- **`b-kanban`: a card dropped at a position among ordered cards lands there** — Birko TASK-960, found testing
  FEATURE-022, and older than it (v0.4.20 does the same). A drop before or after a card put the card at that place in
  the list and then sorted the group by the cards' old `order`, so when cards carried their own `order` the card went
  back where it was, while `card-reorder` reported the new index. The group is now numbered in its new order.
- **`b-kanban`: the board stays one Tab stop when cards carry buttons** — Birko TASK-958 (FEATURE-022 D21), found at
  TASK-946. Only the focused card's controls are in the Tab order: Tab goes from the card through its controls and out
  of the board, instead of through every card's buttons. Escape on a control returns to its card; a card with controls
  is described by a hint on how to reach them (`bwc.kanban.cardControls`).
- **`b-kanban`: a card no longer stays dimmed, and the board no longer stops responding, after a drag** — Birko
  TASK-959, found by the user testing FEATURE-022. A drag that ended without redrawing the board (refused, dropped in
  place, released outside it) left the card dimmed; a drop that redrew it lost the drag-end listener, so the board kept
  thinking a drag was on and ignored every card click. Drag end now always clears both.
- **`b-kanban` can be used from the keyboard at all** — Birko TASK-955, found testing TASK-947. Every card had
  `tabindex="-1"` and Tab stopped only on the board, which ignored keys unless a card had focus, so no card could be
  reached, picked up or moved without a mouse. The board now has a roving tabindex: Tab lands on the first card, or the
  one last focused, as ACCESSIBILITY.md already promised.

## v0.4.20 — 2026-11-21

- **SECURITY: `BMarkdownEditor.renderMarkdown` no longer lets markdown run script** — Birko TASK-943, reported by
  DraCode. It escaped only `& < >`, so a link or image target, an image's alt text or a code fence's language could
  close its attribute and add a handler (`[q](x" onmouseover="…)`), and a link or image target was never checked for
  its scheme (`[x](javascript:…)` ran on click). It now escapes quotes too, keeps a target only if it passes `safeHref`
  (http(s), mailto, tel or relative; a refused one stays as its source text), and keeps a fence language only if it is
  a plain name. This covers the editor's own preview and any page that puts the output into `innerHTML`.
- **`renderMarkdown` lists and code blocks render as written** — Birko TASK-944, reported by DraCode. An indented line
  continuing a list item now stays in that item (it ended the list); a list right after a paragraph line, with no blank
  line between, no longer gets `<br>` between its items; a code fence with no language no longer starts with a blank
  line.
- **`b-chat` escapes its placeholder and send label** — Birko TASK-945, reported by DraCode. Both went into markup
  unescaped, so a `"` in the placeholder closed its attribute and a send label could add an element with a handler.
  **Consumers that escaped these themselves must stop**, or the entities show (`&amp;` instead of `&`).
- **`b-json-diff`'s coloured text is readable in every theme** — Birko TASK-951. Its added, removed and changed text
  was below 4.5:1 (dark: the added value at 2.80:1; light: 4.23:1; inside an `inverse` box ~3.5:1). The shared
  data-viewer card (`b-json-diff`, `b-json-viewer`, `b-object-tree`, `b-xml-viewer`, `b-code-block`) now sits on
  `--b-bg-secondary` instead of `--b-bg-tertiary`; added and removed values use the solid `-light` tint; and the
  `inverse` theme's success and warning text are lighter (`#4ade80`, `#fbbf24`), as its danger text already was.
  **Visible:** the data-viewer card is a shade darker in dark mode, and green and amber text inside `inverse` is lighter.
- **The app shell's own strings can be translated** — Birko TASK-952, reported by Symbio (Czech and Slovak admin). The
  command-palette button's name, the theme switcher's name and the theme names were English in every locale. They now
  read `bws.shell.commandPalette`, `bws.shell.theme` and `bws.shell.themes.<id>` from the app's locale bundle, with the
  same English as before when a key is missing; `label-command-palette` / `label-theme` on the shell still win.
- **`b-data-table`'s selection and row-action labels can be translated** — Birko TASK-953, reported by Symbio. The
  select-all and select-row checkboxes and the row-action `⋮` button were English unless a table's config passed
  labels; they now read `bwc.dataTable.selectAll`, `selectRow` and `actions` like the table's other labels (a config
  label still wins). A row id containing a quote no longer breaks out of the action button's `data-id`.

## v0.4.19 — 2026-11-19

- **A row with no applicable row action shows no `⋮`** — Birko TASK-940, seen in Symbio's Customers → Erasure
  requests. `b-data-table` drew the row-action trigger on every row and filtered `rowActions` by `visible(row)` only
  when the menu opened, so a completed or rejected request got a button that opened an empty menu. Such a row now has
  an empty actions cell; the column stays, so alignment does not change.

## v0.4.18 — 2026-11-17

- **`b-form` and ribbon select fields can be clearable** — Birko TASK-937, follow-up to TASK-936. `b-select` learned
  `clearable` in v0.4.17, but a `b-form` select field and a `b-ribbon` select field had no way to ask for it, so an
  optional form select or a ribbon filter could not go back to no value. `FormField.clearable` and
  `RibbonField.clearable` now pass it through (opt-in; nothing changes without it). A ribbon field emits
  `item-change` with `''` when its empty choice is picked.

## v0.4.17 — 2026-11-16

- **A clearable `b-select` can be cleared** — Birko TASK-936, found in Symbio's product filters. A non-searchable
  `b-select` renders a native `<select>` whose placeholder option was always disabled, and `clearable` (which
  `BaseCrudPage` / `BaseListPage` put on filter selects) was ignored, so a filter set to a value could never go back
  to "any". With `clearable` the empty option, labelled by `placeholder`, stays pickable; picking it removes the
  value and emits `change` with `''`. Without `clearable` nothing changes. The placeholder text is now escaped.

## v0.4.16 — 2026-11-15

- **`b-dropdown-menu` shows every row** — Birko TASK-935, found in Symbio's user menu (TASK-1071). The menu inherited
  the shared panel's 12.5rem cap, so an ordinary action menu (6 rows, 2 dividers and a heading, ~240 px) scrolled on a
  desktop screen. It is now capped only by the room on the side it opens; only a menu taller than that room scrolls,
  and it stays inside the viewport. `b-select` and `b-multi-select` keep their own 12.5rem caps.

## v0.4.15 — 2026-11-15

- **`b-dropdown-menu`: group headings** — Birko TASK-934, asked for by Symbio's user menu (TASK-1071).
  `DropdownItem.heading` (and Shell's `MenuItem.heading`) renders a small non-clickable label before the item, after
  its divider. The item and the ones after it, up to the next divider or heading, form a `role="group"` named by the
  label; the label is never focused and arrow keys skip it. Items without it render as before.

## v0.4.14 — 2026-11-15

- **`b-form`: a `required` checkbox / switch must be ticked** — Birko TASK-132. The form's emptiness test counted `false`
  as a filled value, so a required consent box submitted unticked while the control itself reported `valueMissing`.
  Emptiness is now decided per field type; a non-required toggle still collects `false`. **Behaviour change:** a form
  that marks a toggle `required` now blocks while it is unticked (no consumer in this workspace does).
- **`b-checkbox` / `b-switch` show an `error`** — Birko TASK-932. They ignored the attribute, so the message above
  failed invisibly; they now render it under the control, linked by `aria-describedby`, like a text field.
- **`b-form`: `type: 'radio'` fields work** — Birko TASK-133. The members carried no `data-path`, so the field was
  missing from `getValues()` / `validate().data`, a required group could never pass, and `setValues`, `reset`,
  `setFieldError`, `setFieldDisabled`, `focusField` and `change` all skipped it. The members now sit in one
  `role="radiogroup"` element that carries the path, the field's label (with the required mark) and one error line.

## v0.4.13 — 2026-11-15

- **Shell: the mobile top bar counts the top safe-area inset once** — Birko TASK-930, found on an iPhone (iOS 27.2)
  while testing TASK-600. `BMobileAppShell`'s `.mobile-topbar` adds the inset to its height and pads its content
  down by it, which needs `box-sizing: border-box`; `reset.css` sets that with a universal rule that does not reach
  the shell's shadow DOM, so the bar was `content-box` and came out the inset too tall (measured: 42 + 50 + 50 = 143
  instead of 92), an empty band under the status bar. Only apps with `viewport-fit=cover` (a non-zero inset) change.
- **`b-sortable-list`: a mouse wheel over the list scrolls the page again** — Birko TASK-787, found by its human test.
  The list's scroller always had `overscroll-behavior: contain`, so a wheel over any row of a list with nothing to
  scroll (no `max-height`, or shorter than it) scrolled nothing at all; the page stuck under the pointer. The
  containment now applies only while the list really overflows its `max-height`, so a list that scrolls still keeps
  the wheel to itself.

## v0.4.12 — 2026-11-15

- **`b-time` and `b-datetime-picker` share one time row: − | 14 | + per number** — Birko TASK-928, the user's pick
  (variant E of six, chosen for touch devices). `b-time` had ▲ / ▼ above and below each number; `b-datetime-picker`
  had two plain number boxes with the browser's own tiny arrows, no names for screen readers and a fixed 5-minute
  step. Both now draw the same joined control from one shared module (`inputs/time-stepper.ts`, sheet
  `timeStepperSheet`): full-height buttons that grow to the touch-target height on a touch screen, named buttons and
  boxes, and typing, the wheel and ↑ / ↓ as before. `b-datetime-picker` takes `step` (default 5), and its OK button
  is translated (`bwc.dialog.ok`). **Visual change:** `--b-time-picker-width` 11rem → 13.5rem, and `b-time`'s panel
  is one line shorter.
- **`b-time` / `b-datetime-picker`: the panel stays put while you use it** — Birko TASK-927, found by the user in the
  Playground. A `b-time` arrow, or a date picked in `b-datetime-picker` (whose panel stays open for the time), sets
  the `value` attribute; the re-render dropped the fixed panel's position, so it jumped far down the page (measured:
  y 531 → 2232) and the next click landed outside it and closed it. Both now re-place the panel after every render
  while it is open. `b-date-picker`, `b-date-range-picker`, `b-multi-select` and searchable `b-select` were measured
  and keep their place.
- **An open `b-multi-select` list no longer takes every Escape on the page** — Birko TASK-922. Since v0.4.11 (TASK-819)
  an open list took Escape on the document in the capture phase and stopped it, wherever it was aimed: with a list
  left open (tabbed away from), Escape in a `b-time` or date picker panel closed that list and left the picker open,
  with focus inside it. The list now takes only an Escape from inside its own field, or one that starts nowhere (focus
  fell to the page or a dialog, TASK-819's case); any other Escape goes to its control. This was also the Playground's
  intermittent `picker-popup-smoke` b-time / b-date-range-picker failure.

- **`b-form.validateGroup()` validates a nested group's own values** — Birko TASK-926, found while building TASK-925.
  It looked a group up with the root's name in its path, so `validateGroup('adv')` read the values at `root.adv`
  (none): a filled `required` field was reported missing, under `root.adv.extra`, a path no field has, so the error
  showed at form level instead of on the field. It now uses the same paths as `validate()`, and its `errors`,
  `groupErrors` and `valid` cover that group only (they used to include every error the form held). No Birko or
  Symbio code called it.

- **`b-form`: conditional fields, `FormField.visibleWhen`** — Birko TASK-925, asked for by Symbio TASK-1090. A field
  shows only while another field has given values: `{ field, equals }`, `{ field, in: [...] }`, `{ field }` (not
  empty) or a function of the values. Re-evaluated on any field change and after `setSchema`, `setValues` and `reset`.
  While hidden it is `display: none` (`b-form-field--hidden`), **not validated** (a `required` hidden field no longer
  blocks submit) and left out of `validate().data`; `getValues()` still returns it. Additive: `hidden: true` is
  unchanged. New exported type `FieldCondition`.

- **`b-select` (native, not searchable): the `value` attribute applies after the user has picked** — Birko TASK-924,
  found by Symbio TASK-1089. Once the user picked from the inner `<select>`, a later `value` attribute change or
  re-render only moved the options' `selected` attribute, which the browser ignores on a select the user has touched,
  so the control kept showing the old pick (Symbio: "All" over a filtered tree). Each render now selects the rendered
  option; with no value it shows the placeholder, else the first enabled option, as an untouched select does.

- **`b-tree-menu`: `TreeMenuItem.muted` shows a row for context, not as a result** — Birko TASK-923, asked for by
  Symbio TASK-1089 (a category filter that keeps the ancestors of each match). The row's `.node-row` gets the `muted`
  class and the `--b-text-muted` text colour. Unlike `disabled` it stays selectable and keyboard reachable, has no
  `aria-disabled`, and emits `select`. Additive; nothing else changes.

- **Shell: `refreshContextualRibbon({ open: true })` re-raises the contextual tab for the same record AND opens it** —
  Birko TASK-921, asked for by Symbio TASK-1051. A sub-row selected in the detail (an attendee, a production step) can
  add a group to the tab, but on an unpinned ribbon the pointer leaving the panel to click that row had collapsed it,
  and a re-raise for the same record never opened it. `BaseSplitPage` and `BaseDetailPage` take `{ open: true }`;
  without it a refresh still leaves the tab as the user left it. `ContextualRibbonLink.raise` takes `{ select }`, and
  `b-ribbon.showContextual(id, { select: true })` now cancels a hover-leave collapse already queued. On a pinned
  ribbon with the tab open it changes nothing.

## v0.4.11 — 2026-11-06

- **`b-multi-select`: Escape after clicking in its open list closes the list, not the modal** — Birko TASK-819, the
  rest of v0.4.10's fix, found by the user's human test in Symbio. Picking an option or a quick pick rebuilds the list,
  which dropped focus to the page, so the next Escape reached only the `<dialog>`. The open list now takes Escape
  wherever focus is, and focus stays on the picked option.

## v0.4.10 — 2026-11-06

- **Escape in an open `b-select` / `b-multi-select` list closes the list, not the modal around it** — Birko TASK-819,
  found by Symbio TASK-1068 through v0.4.9's `CountrySelectPO`. Neither prevented nor stopped the key, so a `b-modal`'s
  `<dialog>` took it as `cancel` and closed, discarding its form. `b-multi-select` now also closes on Escape from its
  search field and options (it handled only its box) and returns focus to the box. With no list open, Escape still
  closes the dialog.

## v0.4.9 — 2026-11-06

- **`birko-web-testing`: `CountrySelectPO` and the `country` fixture** — Birko TASK-818, asked for by Symbio TASK-1068.
  `FormPO.fill()` typed into `b-country-select`'s search box and chose nothing, and `SelectPO` cannot reach its unnamed
  inner control. `country.pick(field, ...codes)` picks through the UI (one, or several with `multiple`, leaving the
  dropdown closed); `country.value(field)`; `field` is a b-form field path or a locator. A code the picker does not
  offer fails with "does not offer". Proven by the Playground's `country-select-po-check.mjs` (real Playwright).

## v0.4.8 — 2026-11-05

- **`b-country-select`**: a country picker whose value is ISO 3166-1 alpha-2 codes. Birko TASK-817, asked for by Symbio,
  whose country fields were typed by hand. One or several (`multiple`); each country shown as flag, name (from
  `Intl.DisplayNames` in the i18n locale) and code; search by name or code; `countries`, `preferred`, and group
  shortcuts with an EU default (`registerCountryGroup`). `b-form` `type: 'country'`; helpers `countryName`,
  `countryLabel`, `countryFlag`, `COUNTRY_CODES`.
- **`b-multi-select`**: `setQuickPicks([{ id, label, values }])` (shortcut buttons above the options), and its search
  ignores accents, as `b-select`'s already did.


## v0.4.7 — 2026-11-05

- **`b-ribbon` keeps the panel of a tab whose one command is a split button** — Birko TASK-816, found by the user in
  Symbio (Administrácia, Služby). A tab whose only command is a link has no panel; a module with pages, which also has a
  ▾ menu, counted as one, so hovering its category tab did nothing and its pages menu was out of reach.

## v0.4.6 — 2026-11-04

- **`b-multi-select` clears its search box when the list closes** — Birko TASK-814, found by the user in Symbio (the platform
  settings page's modules picker). Closing reset the filter but left the typed text, so the list reopened unfiltered under
  the old query.

## v0.4.5 — 2026-11-04

- **`b-ribbon`'s key tips stay over the menu, flyout or gallery grid a key tip opened** — Birko TASK-813, found by the
  user in Symbio (Alt+Win, a category tab, Hotel's ▾: the choices' badges sat under the menu). The top layer stacks in
  show order; the badge layer is now re-shown for every level.

## v0.4.4 — 2026-11-04

- **`BAppShell` turns on the ribbon's Quick Access Toolbar** — Birko TASK-812, asked for by Symbio (TASK-1026).
  `protected get ribbonQuickAccessKey(): string | null` (default `null`: no toolbar, as before) and
  `ribbonQuickAccessDefaults` (default `[]`). With a key the shell renders `qat-key` — setting it only from script did
  not survive the next re-render, whose morph removes attributes the template lacks — and `refreshRibbon()` turns the
  toolbar on and keeps the key current, so a changed key loads that key's own saved choice.
  The shell reads on/off from the ribbon (new `BRibbon.quickAccessEnabled`), not from a flag of its own: a re-mount of
  the shell (its brand link to the dashboard) builds a new `<b-ribbon>`, which the flag took for "already on", so the
  toolbar vanished until a reload.

## v0.4.3 — 2026-11-03

- **A Shell page raises a contextual ribbon tab for its record** — Birko TASK-804, asked for by Symbio (TASK-1028).
  `BaseSplitPage` and `BaseDetailPage` take `getContextualRibbon(entity)` (a `ContextualRibbon`: a `b-ribbon`
  contextual set and its tabs) and `onContextualAction(itemId, entity)`; `refreshContextualRibbon()` re-builds it.
  `BAppShell` shows it while the record is selected, opens it for a new record (`open: false` keeps Office's "show,
  don't open"), keeps it through `refreshRibbon()`, sends its commands to the page, and hides it on deselect and when
  the page is left, back on the module's tab, without calling `onTabChange` and without collapsing the ribbon. New
  exports: `ContextualRibbon`, `ContextualRibbonLink`, `CONTEXTUAL_RIBBON_EVENT`, `ContextualRibbonHandle`,
  `ContextualRibbonRequest`. The `ribbon-actions` event still works and is deprecated.
- `b-ribbon`: `hideContextual()` goes back to the normal tab the app set, not the first tab: `active` set by the app
  now counts as the last normal tab, as a click did.

## v0.4.2 — 2026-11-03

- `b-ribbon`: an active split button is tinted as a whole tile (Birko TASK-808, seen in Symbio). In a large group
  the ▾ part carries the label, and only the icon above it was lit; under the pointer the hover grey replaced the
  tint. Both parts now take the active tint, also on hover, as an active plain command does. Since v0.4.1 every
  multi-page module in `buildCategoryRibbon` is a split button, so this showed on the active module.
- `b-ribbon`: no tooltip over an open menu, flyout or gallery (Birko TASK-806, found by Symbio). The tooltip was
  hidden when a menu opened, but hovering another command, or a re-render under a still pointer (a shell's
  navigation), showed one over the menu's choices. A command inside an open flyout keeps its tooltip.
- `birko-web-testing`: `runSmoke`'s `mustSee` and `expectSelector`, and `runManifestSmoke`'s `expectSelector`, pass on
  the first **visible** match (Birko TASK-809, found by Symbio). Since v0.4.1 the ▾ menus keep every page label in
  the DOM, hidden, so a `mustSee` naming a page matched the hidden menu label first and failed. Same Playwright floor.

## v0.4.1 — 2026-11-02

- **Every page of a category one pick away** — Birko TASK-803, asked for by Symbio (TASK-1027). In
  `buildCategoryRibbon`, a module with two or more pages is now a split button: its name still goes to the first
  page, and its ▾ menu lists every page (with separators between `ModuleOption.group`s), so another module's page
  no longer takes two clicks. The active module's pages group stays. New options `moduleMenus` and `activePagesGroup`
  (both default true). `ModuleManifest` and `ModuleOption` take `description` / `descriptionKey`, shown as the
  command's tooltip line.
- `b-ribbon`: `RibbonMenuItem.href` makes a menu choice a link (middle-click opens a new tab; Enter and Space follow
  it; `item-click` still fires). A split button's main part with `href` and no `action` is now a link, as a plain
  command is; it was always a `<button>`, so a module button lost middle-click once it became a split button.

## v0.4.0 — 2026-10-30

- **A sortable tree reorders by drag and keyboard** — Birko TASK-789, asked for by Symbio (TASK-1012). `b-tree-menu`
  with `sortable: true` shows a grip per node. Drag a row (or only the grip, `handleOnly: true`) before, after or into
  another node, with a touch hold on phones; or Tab to a grip and use Space, the arrows (→ / ← change the parent),
  Space, Escape. Every step is announced (`bwc.treeMenu.*`). `reorder` keeps its detail shape and now fires once per
  completed move, by keyboard too. A node can no longer be dropped into its own subtree. The tree no longer reorders
  anything in your arrays; it shows the move in its own copy until you `setItems()`.
  **BREAKING:** the ▲ / order number / ▼ controls no longer show on a sortable tree by default. A page that relies on
  them, or on the `sort` / `sort-order` events, sets `sortControls: true` (the events still fire, now deprecated), or
  moves to `reorder`.
- b-sortable-list's pointer drag moved into a shared helper used by both; its behaviour is unchanged.

## v0.3.0 — 2026-10-30

- **Shell pages relabel on a locale switch** — Birko TASK-801, asked for by Symbio (TASK-966). `entityLabel` was a plain
  property on `BaseCrudPage` (and so `BaseListPage` and `BaseSplitPage`), `BaseDetailPage` and `BaseFormModal`. Set as
  a field with `t()`, it was read once, so the page heading, the modal titles and `{entity}` in toasts stayed in the
  language the page was created in. It is now an accessor: override it as a getter,
  `protected override get entityLabel() { return t('…'); }`. **Also fixed:** the create / edit modal's title was set
  once when it opened, and the page's re-render on a locale switch set it back to empty. It is now rendered from
  state (`modalTitle`), so it follows the locale and stays.
  **BREAKING:** a subclass that declares `entityLabel` as a field (`protected entityLabel = 'Device'`) no longer
  compiles (TS2610, a property overriding an accessor). **Migration:** write it as a getter, or delete it if it is
  `'Item'` (the default).

## v0.2.1 — 2026-10-30

- **A locale switch keeps every field's value** — Birko TASK-802, found by Symbio (TASK-1010). In v0.2.0 a switch with
  an open `b-form` cleared a select with a placeholder, an option group, a checkbox, a switch, a date and a time, with a
  factory schema or a plain one: those fields keep their value in an attribute (`value`, `checked`) that b-form's
  markup does not carry, and the switch's re-render removed it. A required select then blocked saving; an optional one
  saved `""`. b-form now puts back each value the re-render changed, and leaves the field being typed in alone.

## v0.2.0 — 2026-10-30

- **A form relabels on a locale switch** — Birko TASK-797, found by Symbio (TASK-1010). An open `b-form` kept its field
  labels in the old language, because its schema is data built once with `t()`. Two ways in, decided by the user:
  - `setSchema(() => buildSchema())`: b-form calls the factory again on every switch, keeping the values, focus,
    collapsed groups and shown errors, with no `change` event.
  - For a schema kept as data, any text in it may be an i18n key, `{ key, fallback?, params? }`, translated each time
    the form draws.

  Errors from b-form's own rules are worded again in the new language; one set with `setFieldError()` stays as given.
  `base-crud-page`, `base-detail-page` and `base-form-modal` now pass their `formSchema` getters as factories, so
  Shell pages relabel with no change of yours, provided your getter builds the schema when called.
  **BREAKING (types only):** a schema's text properties (`label`, `placeholder`, `hint`, `description`, option and
  preset `label`, a group's `label`, rule `message`) are now `FormText` instead of `string`. Writing a string
  still works. Code that **reads** one as a string does not compile: read it with `formText(field.label)` (exported
  with `FormText` from `birko-web-components`). Symbio compiles unchanged. The Core README's `onI18nChange` →
  `getValues` / `setSchema` / `setValues` recipe from v0.1.23 is replaced by the factory.

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
