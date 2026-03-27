# Birko.Web.Shell — AI Instructions

## What this project is

Reusable application shell framework for Birko.Web apps. Provides an abstract `BAppShell` base class (layout, CSS, behavior) and factory functions for auth, modules, tenants, notifications, routing, and command palette providers. Apps extend `BAppShell` and implement 7 abstract methods — everything else is built in.

**Depends on:** `birko-web-core` (BaseComponent, Store, Router, ApiClient), `birko-web-components` (BRibbon, BDropdownMenu, BCommandPalette types + tags)

## Directory structure

```
src/
├── shell/
│   ├── b-app-shell.ts       # Abstract base shell (~610 LOC) — THE core of this project
│   ├── shell-types.ts        # MenuItem, TenantItem, ShellRoutes, ConnectionState
│   └── shell-wrapper.ts      # createShellWrapper() for persistent shell in router
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

### Abstract base class pattern
`BAppShell` is an abstract class with 7 required methods and ~20 optional overrides. Optional features (notifications, tenants, offline sync) are controlled by what the methods return — no explicit feature flags. Return `null`/`0`/`[]` and the feature hides itself.

### Pure functions for data transformation
`buildRibbon()`, `getVisibleOptions()`, `resolveModuleFromHash()`, `applyBranding()` are all pure functions. They take data and return results without side effects. This makes them easy to test and compose.

## Key rules

### BAppShell lifecycle

```
connectedCallback → super applies styles → render() → onMount()
update()          →                      → render() → onUpdated()
disconnectedCallback                     →            onUnmount()
```

- **Always call `super.onMount()`** — it sets up online/offline listeners, ribbon pin restore, theme/layout restore, and ribbon-actions event listener
- **`_unsubs` array** — push store subscriptions here; `onUnmount()` auto-cleans them
- **`onUpdated()` is idempotent** — it calls all refresh methods + binds event listeners (once, via `_eventsBound` guard)
- **Never override `onUnmount()` without calling `super.onUnmount()`** — it cleans `_unsubs` and removes window listeners

### Required abstract methods (app MUST implement)

```typescript
protected abstract get brandName(): string;
protected abstract getUserName(): string;
protected abstract getRibbonTabs(): RibbonTab[];
protected abstract getActiveTabId(): string;
protected abstract t(key: string, params?: Record<string, string>): string;
protected abstract onTabChange(tabId: string): void;
protected abstract onSignOut(): void;
```

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
- `BAppShell.styles` contains the full shell CSS (~160 lines of CSS)
- Subclasses should NOT override `styles` unless adding app-specific CSS
- The shell uses design tokens from the Birko.Web.Components token system

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
