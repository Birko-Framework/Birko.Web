# Birko.Web.Shell — AI Instructions

## What this project is

Reusable application shell framework for Birko.Web apps. Three-level shell hierarchy:

- `BCoreAppShell` — abstract core (theme/layout persistence, online/offline tracking, user dropdown, brand link, breadcrumb listener, base CSS, default minimal layout). Usable directly for minimal shells (login pages, error pages, kiosks).
- `BSidebarAppShell extends BCoreAppShell` — adds opt-in left and/or right sidebars using `<b-sidebar>` (default hidden; both can be enabled simultaneously). Wraps base `renderContent()` with sidebar layout.
- `BAppShell extends BSidebarAppShell` — full Office-style ribbon shell adding navigation tabs, notifications, tenant switcher, status bar, command palette. Inherits sidebar capability so a ribbon shell can also have left/right panels (Outlook-style).

Plus factory functions for auth, modules, tenants, notifications, routing, and command palette providers. Apps extend `BAppShell` (most common), `BSidebarAppShell` (sidebar + custom layout), or `BCoreAppShell` (minimal layouts) and implement abstract methods — everything else is built in.

**Depends on:** `birko-web-core` (BaseComponent, Store, Router, ApiClient), `birko-web-components` (BRibbon, BDropdownMenu, BCommandPalette types + tags)

## Directory structure

```
src/
├── shell/
│   ├── b-core-app-shell.ts     # Abstract core shell — shared infra (theme, online/offline,
│   │                           #   user dropdown, brand, breadcrumbs, base CSS, default minimal layout)
│   ├── b-sidebar-app-shell.ts  # Adds opt-in left + right sidebars via <b-sidebar> (extends BCoreAppShell)
│   ├── b-app-shell.ts          # Ribbon shell extends BSidebarAppShell — adds ribbon nav,
│   │                           #   notifications, tenants, status bar, command palette
│   ├── shell-types.ts          # MenuItem, TenantItem, ShellRoutes, ConnectionState
│   ├── breadcrumbs.ts          # setBreadcrumbs() helper
│   └── shell-wrapper.ts        # createShellWrapper() for persistent shell in router
├── auth/
│   ├── auth-store.ts         # createAuthStore() — JWT parsing, localStorage persistence
│   ├── auth-types.ts         # AuthState, AuthStoreConfig
│   └── auth-guards.ts        # createAuthGuard(), createModuleGuard()
├── modules/
│   ├── module-types.ts       # ModuleManifest, ModuleOption, ModuleStatus, ModuleState, etc.
│   ├── module-store.ts       # createModuleStore() — store + bound permission helpers
│   ├── ribbon-builder.ts     # buildRibbon(modules, labelResolver?) — pure function
│   ├── route-builder.ts      # buildModuleRoutes(), resolveModuleFromHash()
│   └── permissions.ts        # hasPermission(), hasModulePermission(), getVisibleOptions()
├── tenants/
│   ├── tenant-types.ts       # TenantInfo, TenantState
│   └── branding.ts           # applyBranding() — sets --b-color-primary on <html>
├── notifications/
│   ├── notification-types.ts # Notification, NotificationType, NotificationState
│   └── notification-store.ts # createNotificationStore() — store + handleNewNotification()
├── connection/
│   └── connection-state.ts   # createConnectionStateManager() — SSE/WS state tracking
├── commands/
│   ├── module-nav-provider.ts   # createModuleNavProvider() — command palette search
│   └── entity-search-provider.ts # createEntitySearchProvider() — API-backed entity search
└── feedback/
    └── index.ts              # Re-exports BStaleBanner from birko-web-components
```

## Key design decisions

### Factory pattern, not singletons
All stores and managers are created via factory functions (`createAuthStore()`, `createModuleStore()`, etc.). This project exports **no singletons** — the consuming app creates instances and wires them together. This keeps the shell reusable across apps with different configurations.

### Three-level shell hierarchy
`BCoreAppShell` is the abstract core: 4 required methods (`brandName`, `getUserName`, `t`, `onSignOut`), shared infrastructure, default minimal `render()`. Use directly for ultra-minimal shells (login, error pages).

`BSidebarAppShell extends BCoreAppShell` adds opt-in left and/or right sidebars via `<b-sidebar>`. Both can be enabled simultaneously (Outlook-pattern: navigation left + properties right). It overrides only `renderContent()` to wrap base content with sidebar containers, leaving header/footer hooks intact. No new abstract methods — sidebars are entirely opt-in via getter overrides (`showLeftSidebar`, `showRightSidebar`).

`BAppShell extends BSidebarAppShell` adds 3 more required methods (`getRibbonTabs`, `getActiveTabId`, `onTabChange`) plus ~20 optional overrides for ribbon, notifications, tenants, status bar, command palette. Inherits sidebar opt-in from `BSidebarAppShell`, so a ribbon shell can also have left/right sidebars. Optional features are controlled by what the methods return — no explicit feature flags. Return `null`/`0`/`[]`/`false` and the feature hides itself.

### Pure functions for data transformation
`buildRibbon()`, `getVisibleOptions()`, `resolveModuleFromHash()`, `applyBranding()` are all pure functions. They take data and return results without side effects. This makes them easy to test and compose.

## Key rules

### Lifecycle (both BCoreAppShell and BAppShell)

```
connectedCallback → super applies styles → render() → onMount()
update()          →                      → render() → onUpdated()
disconnectedCallback                     →            onUnmount()
```

- **`BCoreAppShell.onMount()`** sets up theme/layout restore, online/offline listeners, breadcrumb event listener
- **`BAppShell.onMount()`** calls `super.onMount()` first, then adds ribbon pin restore + ribbon-actions event listener
- **Always call `super.onMount()` / `super.onUpdated()` / `super.onUnmount()`** when overriding in your concrete shell
- **`_unsubs` array** (defined in `BCoreAppShell`) — push store subscriptions here; `onUnmount()` auto-cleans them
- **`onUpdated()` is idempotent** — it calls all refresh methods + binds event listeners (once, via `_baseEventsBound` and `_ribbonEventsBound` guards)

### Required abstract methods

**BCoreAppShell (4):**
```typescript
protected abstract get brandName(): string;
protected abstract getUserName(): string;
protected abstract t(key: string, params?: Record<string, string>): string;
protected abstract onSignOut(): void;
```

**BSidebarAppShell adds (0):** No new abstracts — sidebar is fully opt-in via getter overrides.

**BAppShell adds (3 more):**
```typescript
protected abstract getRibbonTabs(): RibbonTab[];
protected abstract getActiveTabId(): string;
protected abstract onTabChange(tabId: string): void;
```

### Sidebar opt-in (BSidebarAppShell — also available in BAppShell)

```typescript
// Left sidebar
protected get showLeftSidebar(): boolean              // default false
protected get leftSidebarCollapsible(): boolean       // default true (collapse/expand toggle visible)
protected getLeftSidebarItems(): SidebarItem[]        // default []
protected getActiveLeftSidebarItem(): string          // default '' (no highlight)
protected onLeftSidebarToggle(collapsed: boolean): void

// Right sidebar — same shape with "Right" prefix
protected get showRightSidebar(): boolean             // default false
// ... etc.
```

Both sidebars can be enabled simultaneously. Collapsed state of each persists independently in `localStorage` under `${storagePrefix}-left-sidebar-collapsed` / `${storagePrefix}-right-sidebar-collapsed`. Refresh API: `refreshLeftSidebar()`, `refreshRightSidebar()` — call from store subscriptions.

### Render helpers (provided by BCoreAppShell)

Subclasses use these in their `render()`:
```typescript
protected renderBrand(): string          // <a id="brand-link" href="...">brandName</a>
protected renderUserDropdown(): string   // <b-dropdown-menu> with avatar; '' when getUserName() is empty;
                                         //   static badge (no dropdown) when getUserMenuItems() is []
protected renderHeaderActions(): string  // app-specific header controls, left of the theme switcher; '' by default
```

To add custom header controls (buttons, pickers, status chips), **override `renderHeaderActions()`** — not `renderThemeDropdown()`. The actions render left of the theme switcher and user area, in all three layouts (core/minimal, sidebar, ribbon). The header is not re-rendered by the `refresh*()` methods, so wire any controls you return once in `onMount()` (keep mutable state, e.g. enabled/disabled, in sync from your store subscriptions).

Subclasses can override `render()` entirely (BAppShell does this) or override the granular hooks `renderHeader()`, `renderContent()`, `renderFooter()` of the default minimal layout.

### Targeted refresh methods (call from store subscriptions)

```typescript
this.refreshRibbon();          // getRibbonTabs() → setTabs() + sync active tab
this.refreshStatusBar();       // getConnectionState/StatusText/PendingActions/Conflicts → DOM update
this.refreshBellBadge();       // getUnreadCount() → badge DOM update
this.refreshTenantSwitcher();  // getTenants()/getCurrentTenant() → dropdown update
this.refreshUserMenu();        // getUserMenuItems() → dropdown update
```

These are efficient — they update only their section of the DOM, not a full re-render.

### Feature toggle by return value

| To hide... | Return from... |
|------------|----------------|
| Notification bell | `null` from `getNotificationPreviewTag()` AND `getNotificationDrawerTag()` |
| Tenant switcher | `[]` from `getTenants()` |
| Status bar | `false` from `showStatusBar` |
| Connection dot | `null` from `getConnectionState()` |
| Search button | `false` from `showCommandPalette` |
| Version label | `''` from `version` |
| User area (avatar + dropdown) | `''` from `getUserName()` (anonymous apps — kiosks, public dashboards) |
| User dropdown only (static avatar + name badge instead) | `[]` from `getUserMenuItems()` |

### Auth store — JWT claim extraction

`createAuthStore()` accepts `claimMappings` to configure which JWT claims map to store fields:

```typescript
createAuthStore({
  storageKey: 'myapp_auth',
  claimMappings: {
    userName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name',
    email: 'email',
    tenantId: 'tenant_id',
    permissions: 'permission',  // can be string (single) or string[] (array)
  },
});
```

The `setAuth()` function:
1. Decodes the JWT payload (base64)
2. Extracts claims using the configured mapping
3. Stores token + extracted fields in the Store
4. Persists to localStorage (JSON serialization of entire snapshot)

### Ribbon builder — i18n integration

`buildRibbon()` accepts an optional `LabelResolver` function for i18n:

```typescript
type LabelResolver = (key: string | undefined, fallback: string) => string;
```

Without a resolver, labels are used as-is. With a resolver, it tries to translate `labelKey`/`groupLabelKey` and falls back to the string `label` if the key returns itself (no translation found).

### i18n — Shell-owned strings use `bws.*`

Shell base pages (`BaseCrudPage`, `BaseListPage`, `BaseSplitPage`, `BaseDetailPage`, `BaseFormModal`) resolve user-facing text via `this.t(key, params?)`, which delegates to the global `birko-web-core` singleton. Keys live under the `bws.*` namespace (distinct from `bwc.*` used by Components):

- `bws.common.new|edit|delete|save|cancel|close|saved|deleted|loading|loadError|confirmDelete`
- `bws.pagination.items|page|of|perPage|prev|next|pageSize`
- `bws.ribbon.selectModule`

`this.t()` auto-interpolates `{entity}` with `this.entityLabel`, so a bundle entry like `"bws.common.new": "Nový {entity}"` with `entityLabel = 'Account'` resolves to `"Nový Account"`. If a key is missing in the app's bundle, English defaults from the base class kick in.

`b-app-shell.ts` does **not** pass `label-*` attributes to `<b-ribbon>` / `<b-command-palette>` — those components read from the global `bwc.*` namespace directly.

### Shell wrapper — persistent shell pattern

`createShellWrapper('my-shell-tag')` returns a function `(pageTag) => HTMLElement` that:
1. Creates the shell element once (singleton)
2. On each call, clears inner content and inserts the new page element
3. Returns the same shell element — router replaces the outlet, shell persists

This is critical for ribbon/status bar persistence across page navigations.

### Module guard factory

`createModuleGuard()` returns a factory, not a guard directly:

```typescript
const factory = createModuleGuard(authStore, hasModulePermission);
const iotGuard = factory('iot', 'iot:device:view');  // this is the actual guard
```

### Connection state manager

Tracks SSE/WebSocket connection state for the status bar dot indicator. Not coupled to any specific transport — the app sets state from its SSE/WS event handlers:

```typescript
const conn = createConnectionStateManager();
sse.on('_open',  () => conn.setState('connected'));
sse.on('_error', () => conn.setState('reconnecting'));
```

### Permissions — wildcard `*`

`hasPermission()` and `getVisibleOptions()` treat the `'*'` permission as a superadmin wildcard — if the module's permissions array includes `'*'`, all checks return `true` and all options are visible.

## Styles rules

- All values via `--b-*` CSS custom properties — never hardcode `#hex`, `px`, or `rem`
- `BCoreAppShell.styles` contains base CSS (~100 lines): `:host` layout, `.app-brand`, `.brand-name`, `.user-trigger`, `.user-avatar`, `.user-name`, `.app-content`, `.app-content-inner`, `.app-status-bar` skeleton, `.status-dot` variants
- `BAppShell.styles` extends via `super.styles + ...` adding ribbon-specific CSS (~80 lines): `.ribbon-empty`, `.tenant-switcher-wrap`, `.tenant-trigger`, `.search-btn`, `.bell-btn`, `.bell-badge`, `.status-sync`
- Custom subclasses of `BCoreAppShell` (e.g. sidebar shells) follow the same `super.styles + ...` pattern
- The shell uses design tokens from the Birko.Web.Components token system
- Width media queries in `rem`, never `px` — `@media (max-width: 48rem)`. In a media query `rem` resolves
  against the browser default font size (not a `:root` override), so it tracks a reader who scaled their text
  up. Reuse the Components ladder (30 / 40 / 48 / 64rem); the shells sit at `48rem`, matching `b-ribbon`

## What NOT to do

- Do not override `render()` unless appending extra elements (always call `super.render()`)
- Do not create store singletons in this project — this is a library, not an app
- Do not add API calls — this project has no knowledge of any backend endpoints
- Do not import from specific apps (Symbio, etc.) — this project is app-agnostic
- Do not add app-specific i18n keys — the `t()` function is abstract, provided by the app
- Do not override `onUnmount()` without calling `super.onUnmount()`
- Do not override `onMount()` without calling `super.onMount()`

## Adding a new feature to the shell

1. Add a protected method with a sensible default to `BAppShell` (optional override pattern)
2. Use the method's return value in `render()` — hide the feature when the default is returned
3. If the feature needs targeted updates, add a public `refreshXxx()` method
4. Export any new types from the appropriate barrel (`index.ts`)
5. Update README.md with the new method documentation

## Adding a new utility module

1. Create `src/{module}/{name}.ts` — export a factory function, not a singleton
2. Create `src/{module}/index.ts` — barrel export
3. Add to `src/index.ts` — re-export
4. Add to `package.json` exports — `"./{module}": "./src/{module}/index.ts"`
5. Document in README.md

## Reference implementation

See `Symbio.UI/src/shell/app-shell.ts` for a complete implementation (~160 LOC) that:
- Extends `BAppShell` with all required methods
- Subscribes to 6 stores with targeted refreshes
- Adds notifications, tenants, offline sync, SSE connection state
- Appends a conflict modal via `render()` override
