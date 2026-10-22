# Birko.Web.Core

Lightweight Web Component framework. No dependencies, no virtual DOM, no build-time magic. Shadow DOM, reactive state, HTTP client, SSE, hash router, and unified i18n — everything needed to build a modern SPA.

## Packages

```
birko-web-core           # main (exports i18n singleton, t, useI18n, onI18nChange, BaseComponent.label)
birko-web-core/state     # Signal, Store, persistSet/Get/Remove (local), sessionSet/Get/Remove (session)
birko-web-core/http      # ApiClient, SseClient, unwrapList, apiErrorMessage, PagedResult
birko-web-core/router    # Router, link
birko-web-core/storage   # IndexedDbStore, CacheStore + low-level IDB helpers (openDatabase, idbRequest, …)
birko-web-core/diff      # diffJson, matchJsonPath, formatJsonPath, xmlToTree, xmlToLines — structural JSON / XML comparison
```

## Quick start

```typescript
import { BaseComponent, define } from 'birko-web-core';

export class MyWidget extends BaseComponent {
  private _count = 0;

  static get styles() {
    return `:host { display: block; } button { cursor: pointer; }`;
  }

  render() {
    return `
      <section>
        <p>Count: ${this._count}</p>
        <button id="inc">+1</button>
      </section>
    `;
  }

  protected onMount() {
    this.$('#inc')?.addEventListener('click', () => {
      this._count++;
      this.update();
    });
  }
}

define('my-widget', MyWidget);
```

```html
<my-widget></my-widget>
```

---

## BaseComponent

```typescript
class BaseComponent extends HTMLElement
```

### Lifecycle

| Method | When | Use for |
|--------|------|---------|
| `onMount()` | After first render | Setup: fetch data, subscribe to stores, attach global listeners |
| `onUpdated()` | After every `update()` | Re-bind event listeners (DOM is replaced on re-render) |
| `onUnmount()` | On disconnect | Teardown: unsubscribe, disconnect observers, remove global listeners |

### Rendering

```typescript
abstract render(): string       // return HTML string
protected update(): void        // re-render + call onUpdated()
```

### Querying

```typescript
protected $<T>(selector: string): T | null                     // querySelector inside shadow root
protected $$<T>(selector: string): T[]                         // querySelectorAll inside shadow root
protected child<T extends BaseComponent>(selector: string): T | null  // typed child component access
```

`child<T>()` provides typed access to child web components — use it instead of `this.$() as any`:

```typescript
// ❌ untyped — no autocomplete, error-prone
const table = this.$('#table') as any;
table?.setColumns([...]);

// ✅ typed — autocomplete, compile-time safety
const table = this.child<BTable>('#table');
table?.setColumns([...]);

const form = this.child<BForm>('#form');
const { valid, data } = form?.validate() ?? { valid: false, data: {} };

const modal = this.child<BModal>('#modal');
modal?.open();
```

### Events

```typescript
protected emit<T>(name: string, detail?: T): void  // CustomEvent (bubbles, composed)
```

### Attributes

```typescript
protected attr(name: string, fallback = ''): string
protected boolAttr(name: string): boolean
protected numAttr(name: string, fallback = 0): number
static get observedAttributes(): string[]   // triggers re-render on change
```

### Styles

```typescript
static get styles(): string                   // component CSS string
static get sharedStyles(): CSSStyleSheet[]    // pre-parsed shared sheets (from Birko.Web.Components)
```

### Helper

```typescript
function define(tag: string, ctor: CustomElementConstructor): void
// Registers only if not already defined — safe to call multiple times
```

### `label()` — i18n-aware string resolution

`BaseComponent` exposes a single helper for every user-facing string in a component template. Resolution order is **explicit attribute > global i18n key > English fallback**, so per-instance overrides keep working while every component automatically picks up app-wide locale changes.

```typescript
class BPagination extends BaseComponent {
  render() {
    return `
      <button aria-label="${this.label('label-prev', 'bwc.pagination.prev', 'Previous page')}">‹</button>
      <button aria-label="${this.label('label-next', 'bwc.pagination.next', 'Next page')}">›</button>
    `;
  }
}
```

```html
<!-- App-wide locale: shows whatever 'bwc.pagination.prev' resolves to -->
<b-pagination></b-pagination>

<!-- Per-instance override (wins over global i18n): -->
<b-pagination label-prev="Späť" label-next="Ďalej"></b-pagination>
```

```typescript
protected label(
  attrName: string,
  i18nKey: string,
  fallback: string,
  params?: Record<string, string>,
): string
```

`BaseComponent` auto-subscribes to `onI18nChange` and re-renders affected instances when the global locale changes — no per-component plumbing.

---

## Internationalization

A single global `I18n` singleton drives every `BaseComponent.label()` call across `birko-web-core`, `birko-web-components`, and `birko-web-shell`. Swap the singleton at app bootstrap, load locale bundles, and every subscribed component re-renders automatically.

```typescript
import { i18n, t, useI18n, onI18nChange, I18n } from 'birko-web-core';

// 1. Quick: use the default instance and load bundles into it
await i18n.loadBundle('en', enBundle);
await i18n.loadBundle('sk', skBundle);
i18n.setLocale('sk');

// 2. Or replace it with an app-owned instance (subscribers auto re-wire)
const myI18n = new I18n('sk');
await myI18n.loadBundle('sk', skBundle);
useI18n(myI18n);

// Render-side
const label = t('bwc.common.close');             // 'Zavrieť'
const greeting = t('bws.hello', { name: 'Alice' }, 'Hello {name}');  // interpolation + fallback

// Subscribe outside a component (rarely needed)
const unsub = onI18nChange(() => console.log('locale changed'));
unsub();
```

**API surface:**

| Export | Purpose |
|--------|---------|
| `i18n` | The default `I18n` instance — preloaded with English fallback. |
| `t(key, params?, fallback?)` | Resolve against the current singleton; interpolates `{param}` placeholders in one pass (an inserted value is never re-scanned). |
| `interpolate(template, params?)` | The placeholder filler every `t()` path uses — for a string that is not a translation key. |
| `useI18n(instance)` | Replace the active singleton with an app-owned one. All subscribers auto re-wire. |
| `onI18nChange(fn)` | Subscribe to locale or singleton changes (auto-called from `BaseComponent`). |
| `I18n` | Class — instantiate to own a separate i18n scope (tests, isolated micro-apps). |
| `createFormatter(locale)` / `getFormatter(locale)` | Cached `Intl.NumberFormat` / `Intl.DateTimeFormat` factories. |

**Key namespaces in the ecosystem:**

- `bwc.*` — Birko.Web.Components (shipped at `birko-web-components/locales/en.json`)
- `bws.*` — Birko.Web.Shell (e.g. `bws.common.new`, `bws.pagination.items`); `t()` from the shell auto-interpolates `{entity}` with the page's `entityLabel`
- `common.*` — `BForm` validation messages (`common.required`, `common.minLength`)

---

## Parsing user-typed numbers

`parseDecimal(raw: string): number | null` — the inverse of the Formatter, and here for the same reason:
locales disagree about the decimal separator.

```ts
import { parseDecimal } from 'birko-web-core';

parseDecimal('81,8');   // 81.8  — a comma keypad
parseDecimal('81.8');   // 81.8
parseDecimal('12abc');  // null  — parseFloat would return 12
parseDecimal('1.2.3');  // null
parseDecimal('  ');     // null  — blank is not 0
```

**Why this is not `parseFloat`.** A field that accepts decimals must not be `<input type="number">`: the HTML
"valid floating-point number" grammar accepts only `.`, so on a comma keyboard (Slovak, Czech, German,
French…) WebKit refuses to insert the separator at all and `81,8` silently becomes `818`. And `parseFloat`
does not save you — `parseFloat('81,8')` is `81`, a wrong number that looks right. Both failure modes are
silent, which is why this refuses instead of guessing.

Group separators (`1 234,5`) are deliberately **not** accepted: `1.234` is a thousand in German and
one-point-two-three-four in English, so there is no locale-free reading. Strip them with knowledge of your
own locale first.

Most callers should reach for **`b-input type="decimal"`** in `Birko.Web.Components`, which renders the right
attributes and enforces `min`/`max`/`step` on top of this. Use `parseDecimal` directly for hand-rolled
controls that cannot use a shadow-DOM component.

## Comparing JSON (diffJson)

`diffJson(a, b, options?)` compares two JSON values structurally. Side A is the "old" value, side B the "new"
one. It has no DOM, so it runs in tests and workers too. `b-json-diff` in Birko.Web.Components renders its
result.

```ts
import { diffJson } from 'birko-web-core';

const r = diffJson(production, localhost, {
  ignore: ['**.Url', 'Items[*].Ref'],
  normalize: [{ path: '**.Link', normalize: (v) => typeof v === 'string' ? v.replace(/[?&]ref=[^&]*/, '') : v }],
  arrays: [{ path: 'Items', key: 'Id' }, { path: 'Tags', match: 'unordered' }],
});

r.equal;     // false
r.summary;   // { added: 1, removed: 0, changed: 2, total: 3 }
r.changes;   // [{ kind: 'changed', path: 'Items[1].Price', segments: ['Items', 1, 'Price'], oldValue: 10, newValue: 12, oldPath: 'Items[0].Price' }, …]
r.tree;      // JsonDiffNode: the union of both values, each node 'equal' | 'added' | 'removed' | 'changed' | 'modified' | 'ignored'
```

**Paths** read like property access: `Items[2].Ref`. A key that is not an identifier is quoted (`["a.b"]`) and the
root is `''`. **Patterns** (in `ignore`, `normalize` and `arrays`) add wildcards: `*` is any one segment, `[*]` any
one index, `**` any number of segments. A pattern matches the **whole** path, so `*.Url` is a `Url` one level down
and `**.Url` is one at any depth. A malformed pattern throws.

- `ignore`: these paths are not compared. They stay in the tree as `ignored` and are never counted.
- `normalize`: each `{ path, normalize(value, path) }` maps a value on both sides before the comparison. Several
  matching normalizers chain in order. A change still reports the values as received.
- `arrays`: by default item *n* is compared with item *n*. `match: 'unordered'` pairs each item of B with an equal
  item of A. `key: 'Id'` (or a function) pairs items by that value, so a reordered list diffs record by record.
  Items without a key fall back to unordered. A pair is reported at its side-B index, with `oldPath` /
  `oldSegments` giving its side-A position. A removed item is listed under its side-A index.
- `summary` counts an added or removed object once, not per key. `matchJsonPath(pattern, segments)` and
  `formatJsonPath(segments)` are exported for callers that build their own rules.

### Comparing XML (xmlToTree)

`xmlToTree(text, options?)` reads an XML body as a JSON-like tree, so `diffJson` compares XML too. It returns
`null` when the text is not XML. It uses `DOMParser`, so unlike `diffJson` it needs a browser (or a DOM).

```ts
import { diffJson, xmlToTree } from 'birko-web-core';

xmlToTree('<R xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Ico>1</Ico><Nil xsi:nil="true"/>'
  + '<Contacts><Contact><Type>Phone</Type></Contact></Contacts><Price currency="EUR">10</Price></R>');
// { Ico: '1', Nil: null, Contacts: [{ Type: 'Phone' }], Price: { '@currency': 'EUR', '#text': '10' } }

diffJson(xmlToTree(a), xmlToTree(b));
```

- The result is the **root element's content**: a JSON body has no root name.
- A text-only element is a string, an empty one `''`, `xsi:nil="true"` is `null`. Attributes are `@name`, and
  namespace declarations and `xsi:*` attributes are dropped. Text beside attributes or child elements is kept under
  `#text`, never dropped.
- **A list** is an element whose children all share one name, and either there are several of them, or the child has
  element children, or its name is a simple-array item name. So `<Contacts><Contact>…</Contact></Contacts>` is a list
  with one item too, and `<TurnoverCategory><Year>2024</Year></TurnoverCategory>` stays an object. A name repeated
  among other fields keeps every occurrence, as an array.
- Options: `simpleItemNames` (default XmlSerializer's `string`, `int`, `long`, `decimal`, `double`, `boolean`,
  `dateTime`), `nilAsNull` (default `true`), `attributePrefix` (default `'@'`), `textKey` (default `'#text'`).
- **Every value is a string**, so the tree of an XML body does not equal the JSON body of the same data (`"3"` vs
  `3`). Compare XML with XML.

`xmlToLines(text, options?)` pretty-prints the same body, one element per line, and gives each line the tree paths
it shows. That is how `b-json-diff format="xml"` marks the original XML.

## State

### Signal\<T\>

Reactive value holder.

```typescript
import { signal, computed } from 'birko-web-core/state';

const count = signal(0);

count.subscribe(v => console.log('value:', v));   // immediate emit
count.onChange(v => console.log('changed:', v));  // only on change

count.value = 5;
count.update(n => n + 1);

const double = computed(() => count.value * 2, [count]);
```

### localStorage helpers

```typescript
import { persistSet, persistGet, persistRemove } from 'birko-web-core/state';

// Store any JSON-serializable value:
persistSet('app.theme', 'dark');
persistSet('app.filters', { status: 'active', page: 1 });

// Retrieve (typed), returns null if missing or parse fails:
const theme = persistGet<string>('app.theme');
const filters = persistGet<{ status: string; page: number }>('app.filters');

// Remove:
persistRemove('app.theme');
```

Use these instead of `localStorage.getItem/setItem` directly — they handle `JSON.stringify/parse` and swallow parse errors gracefully.

### sessionStorage helpers

Same API, backed by `sessionStorage` (per-tab, cleared when the tab closes) — for transient state that shouldn't outlive the session, like a multi-step wizard's progress:

```typescript
import { sessionSet, sessionGet, sessionRemove } from 'birko-web-core/state';

sessionSet('wizard.step', 2);
const step = sessionGet<number>('wizard.step') ?? 0;
sessionRemove('wizard.step');
```

Reactive persistence (`Signal({ persist })` / `Store({ persist })`) is localStorage-backed; for reactive session-scoped state, read/write these helpers yourself.

### Store\<T\>

Key-value store where every key is a Signal.

```typescript
import { Store } from 'birko-web-core/state';

interface AppState {
  user: User | null;
  theme: 'light' | 'dark';
}

const appStore = new Store<AppState>({ user: null, theme: 'light' });

appStore.set('theme', 'dark');
const theme = appStore.get('theme');

const unsub = appStore.onChange('user', user => { /* ... */ });
// Call unsub() in onUnmount()
```

---

## Storage (IndexedDB + Cache API)

### IndexedDbStore

For keyed collections too large or too structured for `localStorage` — cached
read data, large app state, anything you'd scan or query — use `IndexedDbStore`.
It's a generic, promisified wrapper over a single IndexedDB object store with
zero dependencies. (For small flags / preferences, stick with
`Signal({ persist })` or `persistSet`/`persistGet` — IndexedDB is overkill there.)

```typescript
import { IndexedDbStore } from 'birko-web-core/storage';

interface Product { id: string; name: string; price: number; }

const products = new IndexedDbStore<Product>({
  storeName: 'products',         // db defaults to `birko_products`
  keyPath: 'id',                 // in-line key; omit for out-of-line keys passed to set()
  indexes: [{ name: 'price', keyPath: 'price' }],
});

await products.set({ id: 'p1', name: 'Widget', price: 9.99 });
await products.setMany([{ value: a }, { value: b }]);   // one transaction

const p = await products.get('p1');
const all = await products.getAll();
const cheap = await products.getAllByIndex('price', IDBKeyRange.upperBound(10));
const n = await products.count();

await products.update('p1', cur => cur ? { ...cur, price: 8.99 } : undefined); // atomic RMW
await products.delete('p1');

// Reactive: size signal + change notifications
console.log(products.size);
const unsub = products.onChange(({ type, key }) => { /* 'set' | 'delete' | 'clear' */ });
```

**Model:** one `IndexedDbStore` = one database with one object store. Each
logical store gets its own database by default (`birko_${storeName}`), which
sidesteps the multi-store version gotcha. Pass an explicit `dbName` only when
you deliberately want several object stores sharing one database.

**Out-of-line keys:** omit `keyPath` and pass the key explicitly —
`store.set(value, key)`. With `autoIncrement: true` the key is generated.

**Scanning large stores:** `forEach((value, key) => …)` walks a cursor without
loading everything into memory. The callback is synchronous (the read
transaction auto-commits between microtasks) — collect keys in it, act after.

**Escape hatch / lifecycle:** `transaction(mode, store => …)` for operations
not covered above; `close()` releases the connection (reopens lazily);
`destroy()` deletes the whole database.

Low-level helpers (`openDatabase`, `idbRequest`, `txComplete`, `deleteDatabase`)
are exported too — the same promisified IDB primitives the offline `ActionQueue`
is built on, for hand-rolling a custom store.

## Offline writes (ActionQueue + SyncManager)

`ApiClient` queues a write it cannot send into an `ActionQueue` (IndexedDB). `SyncManager` drains the queue, oldest
first, on the `online` event and every `syncInterval` (30 s).

```typescript
import { ActionQueue, SyncManager } from 'birko-web-core';

const queue = new ActionQueue();
const sync = new SyncManager(queue, api, {
  retryBaseMs: 5_000,   // first retry after 5 s, doubling…
  retryMaxMs: 900_000,  // …up to 15 min between attempts
  maxRetries: 10,       // then the action is dead
});

sync.onDead((action) => showFailedWrite(action));       // build a failed-action UI on these
const dead = await sync.getDead();
await sync.retry(dead[0].id);    // back in line, full retry budget
await sync.discard(dead[0].id);  // gone for good
```

| Status | Meaning |
|---|---|
| `pending` | Not tried yet |
| `syncing` | Being sent, since `syncingSince` |
| `failed` | Tried; sent again at `nextAttemptAt` (persisted, so a reload keeps the schedule) |
| `dead` | Gave up: a 4xx a retry cannot change (anything but 401, 408, 409, 429), or `maxRetries` attempts. Never re-sent until `retry(id)` |
| `conflict` | The conflict status (409); see `onConflict` |

A `DELETE` answered 404 is *already applied* and drains (`deleteMissingIsApplied`, default `true`); an `idPinned`
`POST` answered 409 likewise. **Order is kept per entity** (`metadata.entityType` + `entityId`, or the `path` when no
`entityId` is set): while one write to an entity backs off or is dead, later writes to it wait, and writes to other
entities go ahead. `pendingCount` counts `pending`, `failed` and `syncing`, not `dead`.

**A tab closed mid-send** leaves its action `syncing`, and it may or may not have reached the server. The next sync
recovers it: a `PUT`, a `DELETE` or an `idPinned` `POST` is sent again with its retry count kept (a replay that already
landed reads as applied); a plain `POST` or a `PATCH` becomes `dead` with *"it may have been applied"*, because
sending it again could apply it twice, and the user decides through `retry` / `discard`. **One tab drains at a time**:
`sync()` holds a Web Lock named after the queue, and another tab's `sync()` sends nothing while it is held. Where Web
Locks is missing (`locks: null`, or a non-secure context), a `syncing` action counts as abandoned once it is older
than `syncLeaseMs` (5 min): keep that above your longest request.

## Offline reads (MirrorStore)

`ActionQueue` makes *writes* durable offline. `MirrorStore` is the read-side
counterpart: a local IndexedDB copy of a server-owned collection, plus
network-first-with-fallback helpers over it. Without one, an offline GET returns
nothing and any screen that reads before it can write is dead with no signal.

```typescript
import { MirrorStore, readThrough, readAllThrough } from 'birko-web-core';

const productMirror = new MirrorStore<Product>({
  dbName: 'shop', storeName: 'products', keyPath: 'id',
});

// one entity — refreshes the mirror; evicts on a "gone" status (404/410 by default)
const product = await readThrough({
  key: id, fetch: () => api.get<Product>(`products/${id}`), mirror: productMirror,
});

// a whole collection — refreshes with replaceAll, so rows deleted server-side disappear
const all = await readAllThrough({
  fetch: () => api.get<Product[]>('products'), mirror: productMirror,
});
```

Store methods: `readAll`, `get`, `upsert`, **`upsertMany`** (many rows in *one*
transaction — the merge counterpart to `replaceAll`, and what makes a windowed
refresh cost 1 IndexedDB transaction instead of one per row), `replaceAll`
(clear + bulk put, for a whole-collection refresh), `evict`, `clear`.

### Classified collection reads — telling "nothing yet" from "never synced"

`readAllThrough` returns `T[]`. So a device that has never synced and an account
that genuinely has nothing both answer `[]` — and any surface that *says something
to the user about emptiness* then tells one of them something false. "You have
logged nothing" and "this device has never connected" are opposite claims.

**Reach for the classified read when a screen reports emptiness in words.** Where
an empty list just renders as an empty list, `readAllThrough` is simpler and stays
correct — this is not a blanket replacement.

```typescript
import { createListMirror, readAllClassifiedThrough, peekList } from 'birko-web-core';

const historyMirror = createListMirror<Entry>({ dbName: 'app_history', storeName: 'entries' });

const read = await readAllClassifiedThrough({
  fetch:  () => api.get<Entry[]>('history'),
  mirror: historyMirror,
});

if (read.state === 'unavailable') showConnectOnce();
else render(read.items, { stale: read.source === 'mirror' });
```

The mirror factory is not a convenience — it is **half of the primitive**. An
entity-keyed `MirrorStore` has nowhere to record that a fetch succeeded and
returned nothing, so an empty store and an absent one are indistinguishable and
`unavailable` cannot be detected at all. `createListMirror` therefore caches the
list as **one wrapper row under a fixed key**: a missing row means "never synced",
a present row holding `[]` means "synced, nothing there". Callers never name that
key; `readAllClassifiedThrough` is the only thing that writes it.

Two more things worth knowing:

- **`peekList(mirror)`** reads the cached list without touching the network, or
  `undefined` when nothing was ever cached. For a *second* reader that fetches its
  own narrower query but wants the cached whole as an offline fallback — it exists
  so that reader does not have to know the row key either.
- **A transient failure is not "never synced".** A 500, or a thrown fetch, with a
  cached row present returns `loaded` from the mirror. `unavailable` means
  precisely "nothing has ever been cached here", and nothing else.
- **`key` on `createListMirror` is for adopting an existing cache only.** Pointing
  a new mirror at a different key is how you keep a store that already holds a row
  under another name; changing it on a live store would make every device that had
  synced read as one that never had.

### Windowed reads — a dated collection behind a range switch

`readAllThrough` is **wrong** for a history read one rolling range at a time (a
30 / 90 / all switch). It refreshes with `replaceAll`, so reading 30 days replaces
the mirror with 30 days and destroys the 90-day history the next range tap needs
— offline, the wider range would then hold *less* data than the narrower one.

`readWindowThrough` refreshes with a **window-scoped replace** instead: upsert what
came back, evict what vanished from *inside* the fetched window, leave everything
outside it alone. The mirror accumulates into the union of every window ever read.

```typescript
import { readWindowThrough, inWindow, syncWindow } from 'birko-web-core';

const { rows, source, primed } = await readWindowThrough({
  fetch:  () => api.get<Reading[]>(`readings?from=${from}&to=${to}`),
  mirror: readingMirror,
  keyOf:  r => r.guid,   // identity
  dateOf: r => r.date,   // the day it falls on — separate from identity, see below
  from, to,              // omit both for "all"
});
```

Three things the return value carries, each deliberate:

- **`source`** (`'server' | 'mirror'`) — so the surface can show a "last synced"
  banner instead of silently presenting a cache as live.
- **`primed`** — the one that prevents a lie. An empty `rows` is ambiguous: it can
  mean "nothing recorded in this range" (true, fine) or "this device has never
  synced" (not the same thing). Rendering the second as an empty chart tells the
  user they never did anything. `primed: false` means the mirror holds nothing at
  all → show a "connect once" state, not an empty result.
- **oldest-first ordering**, sorted explicitly on the mirror path because IndexedDB
  returns rows in key order, which is arbitrary for anything not keyed by its date.

`keyOf` and `dateOf` are separate because they coincide for a one-row-per-day
collection (keyed by the day) and differ for one permitting several rows a day
(keyed by id, dated by a field). Collapsing them breaks whichever case it wasn't
written for.

> **Dates are `yyyy-MM-dd` strings compared lexicographically — a precondition, not
> an accident.** Zero-padded ISO days sort chronologically as text, so no `Date` is
> constructed and no timezone can shift a boundary day. Passing a `Date` or an
> instant breaks the comparison; serialize the day first (a .NET `DateOnly` already
> arrives in exactly this shape).

`inWindow(date, from?, to?)` and `syncWindow(mirror, fresh, keyOf, dateOf, from?, to?)`
are exported too, for a caller that fetches on its own but still wants the
window-scoped merge (or that filters a cached series to a range).

### CacheStore (Cache API)

For caching HTTP responses and assets — `Request`/`Response` pairs — use
`CacheStore`, a wrapper over the Cache API. Its headline feature is a cache-first
`fetch` with a freshness window; it also exposes the raw cache ops and JSON
convenience methods. Requires a secure context (https / localhost).

```typescript
import { CacheStore } from 'birko-web-core/storage';

const cache = new CacheStore('api-v1');

// Cache-first fetch — serve from cache if younger than 5 min, else network (and re-cache):
const res = await cache.fetch('/api/config', { maxAgeMs: 5 * 60_000 });
const config = await res.json();
await cache.fetch('/api/config', { forceRefresh: true }); // bypass cache, still re-cache

// Store / read a value as JSON directly:
await cache.putJson('/api/profile', { name: 'Alice' });
const profile = await cache.matchJson<{ name: string }>('/api/profile');

// Raw ops + lifecycle:
await cache.add('/assets/logo.svg');                 // fetch + store
await cache.addAll(['/a.js', '/b.css']);
const hit = await cache.has('/api/config');
await cache.delete('/api/config');
await cache.clear();                                  // empty the cache
await cache.destroy();                                // delete the named cache
if (!CacheStore.isSupported()) { /* fall back to network-only */ }
```

`Cache.put` only accepts GET requests, so `fetch()` skips caching non-GET
responses. Use distinct cache names (`api-v1`, `assets`) and bump the suffix to
invalidate a whole generation at once.

---

## ApiClient

```typescript
import { ApiClient } from 'birko-web-core/http';

const api = new ApiClient({
  baseUrl: '/api',
  getToken: () => localStorage.getItem('token'),
  getTenant: () => localStorage.getItem('tenantId'),
  onUnauthorized: () => { window.location.hash = '#/login'; },
});

const resp = await api.get<User[]>('users', { role: 'admin' });
if (resp.ok) {
  console.log(resp.data);  // User[]
}

const created = await api.post<User>('users', { name: 'Alice' }, {
  moduleId: 'users',
  description: 'Create user Alice',   // shown in offline queue UI
});

// Partial update — queueable offline like post/put.
await api.patch<User>('users/7', { name: 'Alice Smith' });
```

**Custom per-request headers** — for a same-origin BFF that requires antiforgery on unsafe methods:

```typescript
const bff = new ApiClient({
  baseUrl: '/bff',
  getHeaders: () => ({ 'X-CSRF-TOKEN': readCookie('csrf') }),  // may also be async
});
await bff.post('/cart/items', { sku, qty });  // carries X-CSRF-TOKEN
```

`getHeaders` runs once per request, after the method's own `Content-Type` and **before** `Authorization` /
`X-Tenant-Id`, so a custom header cannot override the framework's auth or tenant headers. It is applied on
the retry after a token refresh as well as the first attempt.

**File upload (`multipart/form-data`)** — `postForm`:

```typescript
const form = new FormData();
form.append('file', file);
form.append('altText', 'Front view');

const resp = await api.postForm<Image>(`products/${id}/images/upload`, form, { timeoutMs: 120_000 });
if (!resp.ok) toast.error(resp.status === 0 ? 'Upload failed — check your connection' : apiErrorMessage(resp.data));
```

- **No `Content-Type` is set** — the browser adds `multipart/form-data` with its boundary. Auth, tenant and
  `getHeaders` apply as usual, so `getHeaders` must not return a `Content-Type`.
- **Never queued.** A file cannot go into the JSON outbox, so `postForm` never calls `onQueueAction` and its
  result is never `queued`. Offline, a network error or a timeout is the plain `{ ok: false, status: 0 }`
  envelope — the caller tells the user.
- A 401 refreshes through the client's shared refresh and resends the same form.
- `timeoutMs` overrides the client's timeout for this call only; pass a longer one for large files — the
  20 s default is too short for a slow uplink. `<= 0` disables it.

**ApiResponse\<T\>:**

| Field | Type | Description |
|-------|------|-------------|
| `ok` | `boolean` | HTTP 2xx |
| `status` | `number` | HTTP status code |
| `data` | `T` | Parsed JSON or null |
| `headers` | `Headers` | Response headers |
| `queued` | `boolean?` | Action was queued (offline) |
| `fromCache` | `boolean?` | Service worker cache hit |

### HTTP utilities

```typescript
import { unwrapList, apiErrorMessage, type PagedResult } from 'birko-web-core/http';
```

**PagedResult\<T\>** — the standard server envelope returned by paginated endpoints:

```typescript
interface PagedResult<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
}
```

**unwrapList\<T\>** — extract an item array from any API response shape without boilerplate:

```typescript
// Handles: { items: T[] }, { data: T[] }, { [dataKey]: T[] }, or raw T[]
const items = unwrapList<Device>(response);

// Custom key (e.g. response.devices):
const items = unwrapList<Device>(response, 'devices');
```

Returns `[]` when the response is not ok or has no matching data.

**apiErrorMessage** — extract a human-readable error from ASP.NET ProblemDetails or ModelState responses:

```typescript
// Returns the first validation message, detail, or title it finds:
const msg = apiErrorMessage(resp.data);

// With custom fallback:
const msg = apiErrorMessage(resp.data, 'Could not save device');
```

Order: `detail`, then the first entry of `errors` (`{ field: ['msg'] }` or `{ field: [{ errorCode, message }] }`), then `title`, then a plain string. `ApiClient` parses any JSON media type, `application/problem+json` included, so a validation refusal arrives here as an object (TASK-554).

---

## WsClient

A WebSocket with reconnect (exponential backoff), heartbeat and typed dispatch: `on(type, handler)` receives a
message's `data`; `on('message', …)` receives every message. `connected` / `state` report the socket.

```typescript
import { WsClient } from 'birko-web-core/http';

const ws = new WsClient({ url: 'wss://host/ws', getToken: () => auth.token });
ws.connect();
ws.on('kobold-status', (data) => render(data));      // unsolicited messages

// Request/response: sends { type, id, data }; resolves with the data of the reply carrying the same id.
const stats = await ws.request<Stats>('get_stats', { range: 24 }, { timeoutMs: 10_000 });
```

`request()` rejects when the reply's `type` is in `errorTypes` (default `['error']`; message from `error` or
`message`), on timeout (default 30 s), when the socket closes or `disconnect()` is called, and at once when the socket
is not open. The correlation field is `requestIdField` (default `'id'`), at the envelope's top level both ways. For
another envelope shape, `requestMessage(body)` sends any object with the id added. A correlated reply is consumed;
everything else reaches the handlers as before.

## Runtime configuration (RuntimeConfig)

Settings from three layers, each overriding the one before: built-in defaults, the server, then the user's local
choices. Only keys the defaults declare, with the default's type, are taken from the server or from storage.

```typescript
import { RuntimeConfig } from 'birko-web-core/state';

const config = new RuntimeConfig({
  defaults: { serverUrl: 'ws://localhost:5000', refreshMs: 5000, authToken: '' },
  serverUrl: '/api/config',     // or fetchServer: () => Promise<Partial<T> | null>
  storageKey: 'myapp-config',   // the local layer persists here (memory only without it)
  secretKeys: ['authToken'],    // never written to storage
});
await config.load();             // false (values kept) when the server cannot be read; call again to retry
config.set({ serverUrl: 'wss://other' });   // a local choice outlives later server loads
config.reset(['serverUrl']);                // …until reset
config.onChange((c) => reconnect(c.serverUrl));
```

Only the local layer is persisted — never the server's values, so a later server change still reaches a user who once
saved. A `secretKeys` value lives in memory only, and a copy an older build stored is ignored and removed on load.

## SseClient

```typescript
import { SseClient } from 'birko-web-core/http';

const sse = new SseClient({
  url: '/api/events/stream',
  getToken: () => localStorage.getItem('token'),
  reconnectMs: 5000,
});

sse.connect();

const unsub = sse.on('device-update', (data: unknown) => {
  console.log(data);
});

// In onUnmount:
unsub();
sse.disconnect();
```

Token is appended as `?token=...` query param (SSE cannot send headers).

**Reconnecting.** On an error the client closes the native `EventSource` and retries on its own schedule — one retry
loop, so a server `retry:` field is not used. By default the delay grows per consecutive failure and resets when a
connection opens:

```typescript
const sse = new SseClient({
  url: '/sse/sessions/abc',
  reconnectDelays: [5000, 10000, 30000, 60000], // default; the last value repeats; a 0 stops retrying
  failingAfter: 5,                              // default; 0 = never fire _failing
});
// or: reconnectMs: 5000 — one fixed delay (0 = never reconnect). Passing both options throws a TypeError.

sse.on('_failing', (d) => showHint((d as SseFailing).failures, (d as SseFailing).nextDelayMs)); // once per outage
sse.on('_reconnect', () => hideHint());                                                         // recovered
```

Internal events: `_open`, `_error`, `_reconnect` (an open after an earlier one), `_failing` (`{ failures, nextDelayMs }`,
once when `failingAfter` consecutive failures are reached). `sse.failures` is the current count; `sse.state` reads
`'connecting'` while a retry is pending. `disconnect()` cancels a pending retry, and `connect()` starts the schedule fresh.

**Testing the hint.** Chrome DevTools' Network → *Offline* does not break an `EventSource` that is already open, so
it never produces `_failing`. Stop the server, or put a real device in airplane mode; with the default schedule the
hint appears after about 2¾ minutes (5 failures) and clears on the next open. Measured in Presenter, 2026-10-11.

---

## Router

```typescript
import { Router, link } from 'birko-web-core/router';

const router = new Router([
  { path: '/',         component: () => new HomePage() },
  { path: '/login',    component: () => new LoginPage() },
  { path: '/devices',  component: () => new DevicesPage(), guard: () => !!getToken() || '/login' },
  { path: '/devices/:id', component: () => new DeviceDetailPage() },
], '#outlet');

router.onNavigate(match => {
  if (match) console.log('params:', match.params);  // { id: '...' }
});

router.navigate('/devices/123');

// In templates:
link('/devices', 'All Devices', 'nav-link');
// → <a href="#/devices" class="nav-link">All Devices</a>
```

**Route:**

```typescript
interface Route {
  path: string;
  component: () => HTMLElement | Promise<HTMLElement>;
  guard?: () => boolean | string;   // true = allow, string = redirect path
  children?: Route[];
}
```
