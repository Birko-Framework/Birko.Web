# Changelog

One entry per tag, newest first. Versioning rules: [README.md § Versions](README.md#versions). Before 1.0 a
**MINOR** bump is a breaking change and its entry carries a **BREAKING** migration; PATCH versions of one MINOR are
interchangeable for consumers.

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
