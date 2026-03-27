# Birko.Web.Shell

Reusable application shell framework for Birko.Web apps. Provides an abstract `BAppShell` base class with ribbon navigation, status bar, notification bell, user dropdown, tenant switcher, and command palette — plus factory functions for auth, modules, tenants, notifications, and routing.

Your app extends `BAppShell`, implements 7 abstract methods, and gets a fully functional shell with ~600 lines of layout, CSS, and behavior built in.

## Packages

```
birko-web-shell                # main (re-exports everything)
birko-web-shell/shell          # BAppShell, createShellWrapper, types
birko-web-shell/auth           # createAuthStore, createAuthGuard, createModuleGuard
birko-web-shell/modules        # createModuleStore, buildRibbon, permissions
birko-web-shell/tenants        # TenantInfo, TenantState, applyBranding
birko-web-shell/notifications  # createNotificationStore
birko-web-shell/connection     # createConnectionStateManager
birko-web-shell/commands       # createModuleNavProvider, createEntitySearchProvider
birko-web-shell/feedback       # Re-exports BStaleBanner from birko-web-components
```

## Dependencies

- `birko-web-core` — BaseComponent, Store, Signal, Router, ApiClient
- `birko-web-components` — BRibbon, BDropdownMenu, BCommandPalette (type imports + custom element tags)

---

## Quick start

### 1. Set up build aliases

**tsconfig.json:**
```json
{
  "compilerOptions": {
    "paths": {
      "birko-web-shell": ["path/to/Birko.Web.Shell/src/index.ts"],
      "birko-web-shell/*": ["path/to/Birko.Web.Shell/src/*/index.ts"]
    }
  }
}
```

**esbuild aliases:**
```js
const aliases = {
  'birko-web-shell':                'C:/Source/Birko.Web.Shell/src/index.ts',
  'birko-web-shell/shell':          'C:/Source/Birko.Web.Shell/src/shell/index.ts',
  'birko-web-shell/auth':           'C:/Source/Birko.Web.Shell/src/auth/index.ts',
  'birko-web-shell/modules':        'C:/Source/Birko.Web.Shell/src/modules/index.ts',
  'birko-web-shell/tenants':        'C:/Source/Birko.Web.Shell/src/tenants/index.ts',
  'birko-web-shell/notifications':  'C:/Source/Birko.Web.Shell/src/notifications/index.ts',
  'birko-web-shell/connection':     'C:/Source/Birko.Web.Shell/src/connection/index.ts',
  'birko-web-shell/commands':       'C:/Source/Birko.Web.Shell/src/commands/index.ts',
  'birko-web-shell/feedback':       'C:/Source/Birko.Web.Shell/src/feedback/index.ts',
};
```

### 2. Create your auth store

```typescript
// auth-store.ts
import { createAuthStore } from 'birko-web-shell/auth';

const auth = createAuthStore({
  storageKey: 'myapp_auth',       // localStorage key
  claimMappings: {                // JWT claim names
    userName: 'name',             // default: standard WS-Federation name claim
    email: 'email',
    tenantId: 'tenant_id',
    permissions: 'permission',
  },
});

export const authStore = auth.store;
export const setAuth   = auth.setAuth;
export const clearAuth = auth.clearAuth;
```

### 3. Create your module store

```typescript
// module-store.ts
import { createModuleStore, buildRibbon, type ModuleManifest } from 'birko-web-shell/modules';

const mod = createModuleStore();
export const moduleStore        = mod.store;
export const hasPermission      = mod.hasPermission;
export const resolveModuleFromHash = mod.resolveModuleFromHash;

// App-specific: load modules from your API
export async function loadModules() {
  return api.get<ModuleManifest[]>('api/modules');
}

// Wrap buildRibbon with your i18n
export function buildAppRibbon(modules: ModuleManifest[]) {
  return buildRibbon(modules, (key, fallback) => {
    if (key) { const t = i18n.t(key); if (t !== key) return t; }
    return fallback;
  });
}
```

### 4. Set up the router

```typescript
// router.ts
import { createShellWrapper, createAuthGuard, createModuleGuard } from 'birko-web-shell';
import { Router } from 'birko-web-core/router';

const wrap        = createShellWrapper('my-app-shell');
const authGuard   = createAuthGuard(authStore);
const moduleGuard = createModuleGuard(authStore, hasModulePermission);

export const router = new Router([
  { path: '/login', component: () => document.createElement('my-login-page') },
  { path: '/dashboard', component: () => wrap('my-dashboard'), guard: authGuard },
  // ...
], '#app');
```

### 5. Extend BAppShell

```typescript
// app-shell.ts
import { define } from 'birko-web-core';
import { BAppShell } from 'birko-web-shell/shell';
import { authStore, clearAuth } from './auth-store.js';
import { moduleStore, buildAppRibbon, resolveModuleFromHash } from './module-store.js';

class AppShell extends BAppShell {
  // ── Required (7 methods) ──
  protected get brandName() { return 'My App'; }
  protected getUserName()   { return authStore.get('userName') ?? 'User'; }
  protected getRibbonTabs() { return buildAppRibbon(moduleStore.get('modules')); }
  protected getActiveTabId(){ return moduleStore.get('activeModuleId') ?? ''; }
  protected t(key: string)  { return i18n.t(key); }

  protected onTabChange(tabId: string) {
    const mod = moduleStore.get('modules').find(m => m.id === tabId);
    if (mod?.options[0]) window.location.hash = `#${mod.options[0].route}`;
  }

  protected onSignOut() {
    clearAuth();
    window.location.hash = '#/login';
  }

  // ── Store subscriptions ──
  protected onMount() {
    super.onMount();
    this._unsubs.push(
      moduleStore.onChange('modules', () => this.refreshRibbon()),
      moduleStore.onChange('activeModuleId', () => this.refreshRibbon()),
      authStore.onChange('userName', () => this.softUpdate()),
    );
    window.addEventListener('hashchange', () =>
      resolveModuleFromHash(window.location.hash.slice(1))
    );
  }
}

define('my-app-shell', AppShell);
```

That's it. You now have a fully functional app shell with ribbon, user menu, status bar, and command palette.

---

## BAppShell API

### Required abstract methods

| Method | Returns | Purpose |
|--------|---------|---------|
| `brandName` | `string` | Brand displayed in ribbon header |
| `getUserName()` | `string` | Current user's display name |
| `getRibbonTabs()` | `RibbonTab[]` | Ribbon tabs from module state |
| `getActiveTabId()` | `string` | Active tab ID for highlighting |
| `t(key, params?)` | `string` | Translation function |
| `onTabChange(tabId)` | `void` | Navigate when user clicks a tab |
| `onSignOut()` | `void` | Handle sign-out action |

### Optional overrides (with defaults)

| Method | Default | Purpose |
|--------|---------|---------|
| `brandHref` | `'#/'` | Brand link target |
| `version` | `''` (hidden) | Version in status bar |
| `storagePrefix` | `'app'` | localStorage key prefix for theme/layout/pin |
| `getUserInitials()` | First 2 chars | Avatar initials |
| `getRoutes()` | `{ dashboard, profile, settings, login }` | Shell route paths |
| `getUserMenuItems()` | Profile, Settings, Sign out | User dropdown items |
| `onUserMenuSelect(id)` | Navigate to routes | User menu handler |
| `onItemClick(tab, group, item)` | noop | Ribbon item click |

### Notifications (return `null`/`0` to hide bell)

| Method | Default | Purpose |
|--------|---------|---------|
| `getUnreadCount()` | `0` | Badge count |
| `getNotificationPreviewTag()` | `null` | Custom element tag for hover preview |
| `getNotificationDrawerTag()` | `null` | Custom element tag for full drawer |
| `onBellClick()` | noop | Bell click handler |

### Tenants (return empty to hide switcher)

| Method | Default | Purpose |
|--------|---------|---------|
| `getTenants()` | `[]` | Available tenants |
| `getCurrentTenant()` | `null` | Active tenant |
| `onTenantSwitch(id)` | noop | Tenant switch handler |

### Status bar

| Method | Default | Purpose |
|--------|---------|---------|
| `showStatusBar` | `true` | Show/hide footer |
| `getConnectionState()` | `null` | `'connected'` / `'reconnecting'` / `'offline'` (null = hidden) |
| `getStatusText()` | `''` | Module-specific status text |
| `getPendingActions()` | `0` | Offline queue count |
| `getConflicts()` | `0` | Sync conflict count |
| `onSyncClick()` | noop | Manual sync trigger |

### Command palette

| Method | Default | Purpose |
|--------|---------|---------|
| `showCommandPalette` | `true` | Show/hide search button |

### Public refresh methods

Call these from store subscriptions to trigger targeted DOM updates without full re-renders:

```typescript
this.refreshRibbon();          // Rebuild tabs + sync active
this.refreshStatusBar();       // Update connection/sync indicators
this.refreshBellBadge();       // Update notification count
this.refreshTenantSwitcher();  // Update tenant dropdown
this.refreshUserMenu();        // Update user dropdown items
```

### Subscription cleanup

`BAppShell` exposes `_unsubs: (() => void)[]`. Push store subscriptions here — they're automatically cleaned up in `onUnmount()`:

```typescript
protected onMount() {
  super.onMount();  // always call super!
  this._unsubs.push(
    myStore.onChange('key', () => this.refreshRibbon()),
  );
}
```

---

## Auth Store

```typescript
import { createAuthStore } from 'birko-web-shell/auth';

const { store, setAuth, clearAuth, setPendingChallenge, clearChallenge }
  = createAuthStore({
    storageKey: 'myapp_auth',
    claimMappings: { userName: 'name', email: 'email', tenantId: 'tenant_id', permissions: 'permission' },
  });
```

**AuthState fields:** `token`, `refreshToken`, `userId`, `userName`, `email`, `tenantId`, `permissions`, `isAuthenticated`, `challengeId`, `twoFactorPending`

- `setAuth({ accessToken, refreshToken, userId })` — decodes JWT, extracts claims, persists to localStorage
- `clearAuth()` — resets all fields, removes from localStorage
- `setPendingChallenge(id)` / `clearChallenge()` — 2FA flow support

---

## Module Store

```typescript
import { createModuleStore } from 'birko-web-shell/modules';

const { store, hasPermission, hasModulePermission, getVisibleOptions, resolveModuleFromHash }
  = createModuleStore();
```

- `hasPermission(perm)` — checks against the currently active module
- `hasModulePermission(moduleId, perm)` — checks against any module
- `getVisibleOptions(mod)` — filters options by user's permissions (wildcard `*` = all)
- `resolveModuleFromHash(hash)` — parses `'/iot/devices/123'` → `{ moduleId, optionId, entityId }`, updates store

### Ribbon builder

```typescript
import { buildRibbon, type LabelResolver } from 'birko-web-shell/modules';

// Without i18n (labels used as-is)
const tabs = buildRibbon(modules);

// With i18n
const resolve: LabelResolver = (key, fallback) => key ? i18n.t(key) : fallback;
const tabs = buildRibbon(modules, resolve);
```

---

## Route Guards

```typescript
import { createAuthGuard, createModuleGuard } from 'birko-web-shell/auth';

// Simple auth check (redirects to /login if not authenticated)
const authGuard = createAuthGuard(authStore, '/login');

// Module-level guard (auth + permission check)
const moduleGuardFactory = createModuleGuard(authStore, hasModulePermission, '/login', '/no-access');
const iotGuard = moduleGuardFactory('iot', 'iot:device:view');
```

---

## Shell Wrapper

Creates a persistent shell element for hash-based routing. The shell stays in the DOM — only the inner page is swapped.

```typescript
import { createShellWrapper } from 'birko-web-shell/shell';

const wrap = createShellWrapper('my-app-shell');

// In route definitions:
{ path: '/dashboard', component: () => wrap('my-dashboard-page'), guard: authGuard }
```

---

## Connection State

Track SSE/WebSocket connection status for the status bar:

```typescript
import { createConnectionStateManager } from 'birko-web-shell/connection';

const connection = createConnectionStateManager();

// In SSE handlers:
sseClient.on('_open',  () => connection.setState('connected'));
sseClient.on('_error', () => connection.setState('reconnecting'));

// In shell:
protected getConnectionState() { return connection.getState(); }

// Subscribe to changes:
connection.onChange(state => this.refreshStatusBar());
```

---

## Notification Store

```typescript
import { createNotificationStore } from 'birko-web-shell/notifications';

const { store, handleNewNotification, openDrawer, closeDrawer }
  = createNotificationStore();

// In SSE handler:
sseClient.on('notification', data => handleNewNotification(data.notification));

// In shell:
protected getUnreadCount() { return store.get('unreadCount'); }
protected onBellClick() { openDrawer(); }
```

---

## Command Palette Providers

### Module navigation

Searches modules and their options by name:

```typescript
import { createModuleNavProvider } from 'birko-web-shell/commands';
import { registerProvider } from 'birko-web-components/command';

const navProvider = createModuleNavProvider({
  moduleStore,
  t: key => i18n.t(key),
});

registerProvider(navProvider);
```

### Entity search

Searches entities via your API with debounced async requests:

```typescript
import { createEntitySearchProvider } from 'birko-web-shell/commands';

const deviceSearch = createEntitySearchProvider({
  moduleId: 'iot',
  moduleLabel: 'IoT',
  icon: '📡',
  apiClient: api,
  endpoint: 'api/iot/search',  // optional, default: api/{moduleId}/search
});

registerProvider(deviceSearch);
```

---

## Stale Banner

Generic cache warning component. Shows when data is served from service worker cache:

```html
<b-stale-banner id="stale" hidden></b-stale-banner>
```

```typescript
import 'birko-web-components/feedback'; // registers <b-stale-banner>

const banner = this.$<BStaleBanner>('#stale');
if (resp.fromCache) banner?.show(resp.cachedAt);
```

Attributes: `message` (custom text), `hidden`.

---

## Tenant Branding

Apply tenant-specific primary color to the CSS custom property:

```typescript
import { applyBranding } from 'birko-web-shell/tenants';

applyBranding(tenant);  // sets --b-color-primary
applyBranding(null);    // removes override
```

---

## Feature toggle pattern

Optional features are controlled by what your abstract methods return — no explicit feature flags needed:

| Feature | How to disable |
|---------|----------------|
| Bell / notifications | Return `null` from `getNotificationPreviewTag()` and `getNotificationDrawerTag()` |
| Tenant switcher | Return `[]` from `getTenants()` |
| Status bar | Set `showStatusBar` to `false` |
| Connection indicator | Return `null` from `getConnectionState()` |
| Command palette | Set `showCommandPalette` to `false` |
| Version badge | Return `''` from `version` |

---

## Types reference

### ModuleManifest

```typescript
interface ModuleManifest {
  id: string;           // 'iot', 'users'
  label: string;        // 'IoT', 'Users'
  labelKey?: string;    // i18n key
  icon: string;         // HTML entity or icon ID
  order: number;        // sort order
  options: ModuleOption[];
  permissions: string[];
  status?: ModuleStatus;
  defaultWidgets?: PlacedWidget[];
}
```

### ModuleOption

```typescript
interface ModuleOption {
  id: string;           // 'devices', 'alarms'
  label: string;
  labelKey?: string;
  route: string;        // '/iot/devices'
  permission?: string;  // required permission
  badge?: number;
  icon?: string;
  group?: string;       // ribbon group ID
  groupLabel?: string;
  groupLabelKey?: string;
  actionOnly?: boolean; // true = action button, no navigation
}
```

### AuthState

```typescript
interface AuthState {
  token: string | null;
  refreshToken: string | null;
  userId: string | null;
  userName: string | null;
  email: string | null;
  tenantId: string | null;
  permissions: string[];
  isAuthenticated: boolean;
  challengeId: string | null;
  twoFactorPending: boolean;
}
```

### TenantInfo

```typescript
interface TenantInfo {
  id: string;
  name: string;
  logo?: string;
  primaryColor?: string;
  role: string;
  modules: string[];
  isDefault?: boolean;
}
```

### MenuItem / TenantItem / ShellRoutes

```typescript
interface MenuItem { id: string; label: string; icon?: string; variant?: 'danger'; divider?: boolean; }
interface TenantItem { id: string; name: string; role?: string; isDefault?: boolean; isCurrent?: boolean; }
interface ShellRoutes { dashboard: string; profile: string; settings: string; login: string; }
type ConnectionState = 'connected' | 'reconnecting' | 'offline';
```
