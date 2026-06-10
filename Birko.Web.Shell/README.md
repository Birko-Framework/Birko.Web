# Birko.Web.Shell

Reusable application shell framework for Birko.Web apps. Three-level shell hierarchy:

- **`BCoreAppShell`** — shared infrastructure (theme/layout persistence, online/offline tracking, user dropdown, brand link, breadcrumbs, base CSS, default minimal layout). 4 abstract methods. Use directly for minimal shells (login pages, error pages, kiosks, custom layouts).
- **`BSidebarAppShell extends BCoreAppShell`** — adds opt-in left and/or right sidebars via `<b-sidebar>` (both can be enabled simultaneously, e.g. navigation left + properties right). No new abstract methods — sidebar is fully opt-in.
- **`BAppShell extends BSidebarAppShell`** — full Office-style ribbon shell adding navigation tabs, notification bell, status bar, tenant switcher, command palette. Inherits sidebar capability — a ribbon shell can also have left/right panels (Outlook-style). 7 abstract methods (4 from `BCoreAppShell` + 3 ribbon-specific).

Plus factory functions for auth, modules, tenants, notifications, routing, and command palette providers.

Your app extends `BAppShell` (most common), `BSidebarAppShell` (sidebar + custom top), or `BCoreAppShell` (minimal layouts), implements the abstract methods, and gets a fully functional shell with all layout, CSS, and behavior built in.

## Packages

```
birko-web-shell                # main (re-exports everything)
birko-web-shell/shell          # BCoreAppShell, BSidebarAppShell, BAppShell, createShellWrapper, setBreadcrumbs, types
birko-web-shell/auth           # createAuthStore, createAuthGuard, createModuleGuard
birko-web-shell/modules        # createModuleStore, buildRibbon, permissions
birko-web-shell/tenants        # TenantInfo, TenantState, applyBranding
birko-web-shell/notifications  # createNotificationStore
birko-web-shell/connection     # createConnectionStateManager
birko-web-shell/commands       # createModuleNavProvider, createEntitySearchProvider
birko-web-shell/feedback       # Re-exports BStaleBanner from birko-web-components
birko-web-shell/pages          # BaseListPage, BaseSplitPage, BaseDetailPage, BaseFormModal
birko-web-shell/dashboard      # BaseDashboardWidget
```

## Dependencies

- `birko-web-core` — BaseComponent, Store, Signal, Router, ApiClient, unified `i18n` singleton
- `birko-web-components` — BRibbon, BDropdownMenu, BCommandPalette (type imports + custom element tags)

---

## Internationalization

The shell uses the same global i18n singleton as the rest of the ecosystem. Bootstrap once with `useI18n(myI18n)` (from `birko-web-core`) and every shell surface — ribbon, status bar, user menu, notifications, command palette, page bases — picks up the active locale automatically.

**Canonical key namespace:** `bws.*` (Birko Web Shell). Examples: `bws.common.new`, `bws.common.edit`, `bws.common.delete`, `bws.common.cancel`, `bws.common.save`, `bws.common.confirmDelete`, `bws.pagination.items`, `bws.ribbon.selectModule`.

**`{entity}` placeholder.** The shell's `t()` helper (and `BaseCrudPage.t()` etc.) automatically interpolate `{entity}` with the page's `entityLabel`. A single bundle entry produces entity-specific strings across every CRUD page:

```jsonc
// locales/sk.json
{
  "bws.common.new":           "Nový {entity}",
  "bws.common.confirmDelete": "Naozaj zmazať {entity}?"
}
```

```typescript
class DevicesPage extends BaseListPage<Device> {
  entityLabel = 'zariadenie';   // → "Nový zariadenie", "Naozaj zmazať zariadenie?"
}
```

Per-page overrides remain possible — override `t(key)` in your shell or page class to short-circuit the global lookup. The shell's `base-crud-page.t(key)` default returns English so apps with zero i18n bundle still render readable text.

---

## Themes

Themes are **opt-in per app**. The base/light tokens live in `birko-web-components/css/tokens.css`; every alternate theme is a separate CSS file under `birko-web-components/css/themes/`. A project pulls in only the themes it wants, in two coordinated steps:

**1. Link/bundle the theme CSS** (only what you use):
```html
<link rel="stylesheet" href=".../birko-web-components/css/tokens.css" />     <!-- required -->
<link rel="stylesheet" href=".../birko-web-components/css/themes/dark.css" />
<link rel="stylesheet" href=".../birko-web-components/css/themes/finstat.css" />
```

**2. Register the matching switcher entries** in your app bootstrap:
```typescript
import { registerThemes, BUILTIN_THEMES } from 'birko-web-shell';

registerThemes([BUILTIN_THEMES.dark, BUILTIN_THEMES.finstat]);
```

`getAvailableThemes()` on the shell returns the registry by default, so the header switcher lists exactly what you registered. `'light'` (the `:root` base) is always present; the switcher **auto-hides** when fewer than 2 themes are registered. No need to override `getAvailableThemes()` unless you want a hard-coded list or localized labels.

**Registry API** (`birko-web-shell`):
- `BUILTIN_THEMES` — ready-made `{ id, label, icon }` for `light` / `dark` / `neon` / `finstat` (metadata only; the CSS is still opt-in)
- `registerTheme(opt)` / `registerThemes(opts)` — add/replace switcher entries
- `unregisterTheme(id)` — remove one (`'light'` is kept)
- `getRegisteredThemes()` — current list (`light` first)

**Project-private theme:** add a `[data-theme="my-brand"]` block in your app's own CSS and `registerTheme({ id: 'my-brand', label: 'My Brand', icon: '…' })` — no framework change.

### Region accents (dark top bar / footer)

To give a *region* of the shell a different look from the page (e.g. Finstat's dark top menu + footer on a light page) without switching the whole theme, override the per-region accent hooks. The shell applies the accent as inline custom properties on that region only, so the rest of the app keeps the active theme:

```typescript
class FinstatShell extends BAppShell {
  protected get ribbonAccent() { return 'inverse'; }  // dark ribbon, brand accent kept
  protected get footerAccent() { return 'inverse'; }
}
// BCoreAppShell / BSidebarAppShell use headerAccent for their header bar.
```

- **`headerAccent`** → core/sidebar header bar · **`ribbonAccent`** → ribbon · **`footerAccent`** → status bar/footer. Default `''` (no accent).
- Built-in accent `'inverse'` = dark charcoal chrome that **keeps the brand color** (mirrors `birko-web-components/css/themes/inverse.css`). You can also return a raw `--b-x:…;` custom-property string for an ad-hoc accent.

> **Migration (pre-2026-06-10):** the switcher used to hard-code `light`/`dark`/`neon`/`finstat`. It now shows only registered themes. Add a one-line `registerThemes([...])` in bootstrap (and link the theme CSS) to restore the entries you want.

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
  'birko-web-shell/pages':          'C:/Source/Birko.Web.Shell/src/pages/index.ts',
  'birko-web-shell/dashboard':      'C:/Source/Birko.Web.Shell/src/dashboard/index.ts',
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

## Sidebars (BSidebarAppShell, also in BAppShell)

Both `BSidebarAppShell` and `BAppShell` support opt-in **left and/or right sidebars** via the `<b-sidebar>` component. Both can be enabled simultaneously — useful for Outlook-style layouts (folder list left + reading pane right) or VS Code-style (Explorer left + Outline right).

```typescript
class MyShell extends BAppShell {
  // existing 7 abstract methods...

  // ── Enable LEFT sidebar (e.g. secondary navigation) ──
  protected get showLeftSidebar() { return true; }

  protected getLeftSidebarItems(): SidebarItem[] {
    return moduleStore.get('options').map(o => ({
      id: o.id,
      label: o.label,
      icon: o.icon,
      href: '#' + o.route,
    }));
  }

  protected getActiveLeftSidebarItem() {
    return moduleStore.get('activeOptionId') ?? '';
  }

  // ── Also enable RIGHT sidebar (e.g. properties/inspector) ──
  protected get showRightSidebar() { return inspectorStore.get('open'); }

  protected getRightSidebarItems(): SidebarItem[] {
    return inspectorStore.get('properties').map(p => ({ id: p.key, label: p.label }));
  }

  protected onMount() {
    super.onMount();
    this._unsubs.push(
      moduleStore.onChange('options',        () => this.refreshLeftSidebar()),
      moduleStore.onChange('activeOptionId', () => this.refreshLeftSidebar()),
      inspectorStore.onChange('properties',  () => this.refreshRightSidebar()),
      inspectorStore.onChange('open',        () => this.softUpdate()),
    );
  }
}
```

**Sidebar API (available on `BSidebarAppShell` and `BAppShell`):**

| Method/Getter | Default | Purpose |
|---------------|---------|---------|
| `showLeftSidebar` / `showRightSidebar` | `false` | Show/hide each sidebar |
| `leftSidebarCollapsible` / `rightSidebarCollapsible` | `true` | Show collapse toggle |
| `getLeftSidebarItems()` / `getRightSidebarItems()` | `[]` | `SidebarItem[]` from `birko-web-components` |
| `getActiveLeftSidebarItem()` / `getActiveRightSidebarItem()` | `''` | ID of active item (highlighted) |
| `onLeftSidebarToggle(collapsed)` / `onRightSidebarToggle(collapsed)` | noop | Called on user toggle |
| `refreshLeftSidebar()` / `refreshRightSidebar()` | — | Re-populate items + active state |

Collapsed state persists in `localStorage` under `${storagePrefix}-left-sidebar-collapsed` and `${storagePrefix}-right-sidebar-collapsed`.

The sidebar's internal "brand" area is hidden via Shadow DOM `::part(brand)` — your shell already has a brand in the ribbon/header. Sidebar items navigate via `<a href>` links, so existing hash routing works automatically.

---

## BCoreAppShell — for custom layouts

If you don't want a ribbon-based shell, extend `BCoreAppShell` directly. Common scenarios:

- **Sidebar navigation** instead of ribbon
- **Login / error pages** that need brand + user dropdown but no navigation
- **Kiosk / mobile** apps with minimal chrome
- **Embedded** shells inside other UIs

```typescript
import { BCoreAppShell } from 'birko-web-shell';
import { define } from 'birko-web-core';

class MySidebarShell extends BCoreAppShell {
  // Required (4 methods inherited from BCoreAppShell)
  protected get brandName() { return 'My App'; }
  protected getUserName()   { return authStore.get('userName') ?? 'User'; }
  protected t(key: string)  { return i18n.t(key); }
  protected onSignOut()     { clearAuth(); window.location.hash = '#/login'; }

  // Override render() entirely with your layout
  render() {
    return `
      <aside class="shell-sidebar">
        <div class="brand">${this.renderBrand()}</div>          <!-- helper from base -->
        <b-sidebar id="sidebar"></b-sidebar>
        <div class="user">${this.renderUserDropdown()}</div>    <!-- helper from base -->
      </aside>
      <main class="shell-content"><slot></slot></main>
    `;
  }

  static get styles() {
    return super.styles + `
      :host { display: grid; grid-template-columns: 16rem 1fr; }
      .shell-sidebar { /* ... */ }
      .shell-content { /* ... */ }
    `;
  }

  protected onMount() {
    super.onMount();   // theme, online/offline, breadcrumbs — always call super
    // your sidebar-specific setup
  }
}

define('my-sidebar-shell', MySidebarShell);
```

**Render helpers provided by `BCoreAppShell`:** `renderBrand()`, `renderUserDropdown()`, `renderHeaderActions()`. You can also override the granular hooks `renderHeader()`, `renderContent()`, `renderFooter()` of the default minimal layout instead of replacing `render()` entirely.

`renderUserDropdown()` hides itself when `getUserName()` returns `''` (anonymous apps — kiosks, public dashboards) and degrades to a static avatar + name badge (no dropdown) when `getUserMenuItems()` returns `[]`, so the trigger never opens an empty menu.

`renderHeaderActions()` is the seam for app-specific header controls (buttons, pickers, status chips). It returns `''` by default and renders left of the theme switcher and user area in every layout (core/minimal, sidebar, ribbon). Override it instead of `renderThemeDropdown()` — the latter is only for restyling the theme switcher itself. The header isn't re-rendered by `refresh*()`, so wire returned controls once in `onMount()`:

```typescript
protected override renderHeaderActions(): string {
  return `<b-button id="reload-btn" variant="danger" size="sm">Reload</b-button>`;
}
protected override onMount(): void {
  super.onMount();
  this.$('#reload-btn')?.addEventListener('click', () => this.reload());
}
```

**State exposed:** `protected get isOnline(): boolean` (auto-tracked from window online/offline events).

**Refresh API:** `refreshUserMenu()` — re-populates the user dropdown items.

---

## BAppShell API

### Required abstract methods

| Method | Source | Returns | Purpose |
|--------|--------|---------|---------|
| `brandName` | base | `string` | Brand displayed in ribbon header |
| `getUserName()` | base | `string` | Current user's display name; return `''` for anonymous apps (hides the user area) |
| `t(key, params?)` | base | `string` | Translation function |
| `onSignOut()` | base | `void` | Handle sign-out action (noop for anonymous apps) |
| `getRibbonTabs()` | BAppShell | `RibbonTab[]` | Ribbon tabs from module state |
| `getActiveTabId()` | BAppShell | `string` | Active tab ID for highlighting |
| `onTabChange(tabId)` | BAppShell | `void` | Navigate when user clicks a tab |

### Optional overrides (with defaults)

| Method | Default | Purpose |
|--------|---------|---------|
| `brandHref` | `'#/'` | Brand link target |
| `version` | `''` (hidden) | Version in status bar |
| `storagePrefix` | `'app'` | localStorage key prefix for theme/layout/pin |
| `getUserInitials()` | First 2 chars | Avatar initials |
| `getRoutes()` | `{ dashboard, profile, settings, login }` | Shell route paths |
| `getUserMenuItems()` | Profile, Settings, Sign out | User dropdown items; return `[]` for a static avatar badge with no dropdown |
| `onUserMenuSelect(id)` | Navigate to routes | User menu handler |
| `onItemClick(tab, group, item)` | noop | Ribbon item click |
| `onBreadcrumbsChange(items)` | noop | Called when a page fires `setBreadcrumbs()` |

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

## Page base classes

Abstract base classes that eliminate boilerplate across list, detail, and modal pages. Import from `birko-web-shell/pages`.

### BaseListPage\<T\>

Provides a full CRUD list page: auto-fetching data table, search, toolbar actions, create/edit modal, delete confirmation, permission checks.

```typescript
import { BaseListPage } from 'birko-web-shell/pages';
import { define } from 'birko-web-core';

class DevicesPage extends BaseListPage<Device> {
  // ── Required ──
  endpoint = 'api/devices';

  get api() { return appApi; }

  get columns(): TableColumn[] {
    return [
      { key: 'name',   label: 'Name',   sortable: true },
      { key: 'status', label: 'Status', render: v => `<b-badge>${v}</b-badge>` },
    ];
  }

  get formSchema(): FormSchema {
    return {
      name: 'root',
      children: [
        { name: 'name',   type: 'text',  label: 'Name',   required: true },
        { name: 'status', type: 'select', label: 'Status' },
      ],
    };
  }

  // ── Optional ──
  entityLabel = 'Device';               // used in toast messages
  idField     = 'id';                   // default: 'id'
  searchable  = true;
  pageSize    = 25;

  createPermission = 'device:create';   // hides Create button if not held
  editPermission   = 'device:edit';
  deletePermission = 'device:delete';

  hasPermission(perm: string) { return hasModulePerm(perm); }

  // Map API row → form values (runs before opening create/edit modal)
  mapToForm(row: Device) {
    return { name: row.name, status: row.status };
  }

  // Row click → navigate instead of opening modal (optional)
  onRowClick(row: Device) {
    window.location.hash = `#/devices/${row.id}`;
  }
}

define('devices-page', DevicesPage);
```

**Extension points:**

| Method | Default | Description |
|--------|---------|-------------|
| `entityLabel` | `'Item'` | Used in toast messages |
| `idField` | `'id'` | Primary key field for row identification |
| `searchable` | `true` | Show search bar |
| `pageSize` | `20` | Rows per page |
| `editEnabled` | `true` | Set `false` to hide Edit row action entirely |
| `deleteEnabled` | `true` | Set `false` to hide Delete row action entirely |
| `modalSize` | `undefined` (md) | Modal size: `'sm'`, `'lg'`, `'xl'`, `'xxl'` |
| `createPermission` | `undefined` (always shown) | Permission key controlling Create button visibility |
| `editPermission` | `undefined` | Permission key controlling Edit row action |
| `deletePermission` | `undefined` | Permission key controlling Delete row action |
| `hasPermission(perm)` | `() => true` | Resolve a permission key → boolean |
| `mapToForm(row)` | identity | Transform API row to form initial values |
| `mapFromForm(data, isEdit)` | identity | Transform form values to request body |
| `editFormSchema` | `formSchema` | Separate form schema for edit mode |
| `t(key, params?)` | `() => key` | i18n translation function |
| `onRowClick(row)` | noop | Handle row click |
| `onToolbarAction(id)` | noop | Handle extra toolbar action buttons |
| `onRowAction(actionId, row)` | noop | Handle extra per-row action buttons |
| `extraToolbarActions` | `[]` | Additional toolbar buttons (getter) |
| `extraRowActions` | `[]` | Additional per-row actions (getter) |
| `renderModalBody()` | `<b-form>` | Override to add custom content inside the modal |
| `onFormReady(form, entity)` | noop | Called after modal opens — wire cascading selects here |
| `afterSave(entity, isEdit)` | noop | Post-save side effects (e.g. tag association, file upload) |
| `reload()` | re-fetches data | Public — call to refresh from outside |

**Cascading selects example:**

```typescript
class PricesPage extends BaseListPage<Price> {
  endpoint = 'api/prices';
  get api() { return appApi; }
  get columns() { return [...]; }
  get formSchema() { return { name: 'root', children: [...] }; }

  protected async onFormReady(form: BForm, entity: Price | null) {
    // Load initial options
    const products = await loadOptions(this.api, 'api/products');
    form.setFieldOptions('productId', products);

    // When product changes, load variants
    const unsub = wireSearchableSelect(form, 'variantId', this.api, 'api/variants', {
      params: { productId: entity?.productId ?? '' },
    });

    // Re-wire when product changes
    form.onFieldChange('productId', async (value) => {
      const variants = await loadOptions(this.api, 'api/variants', { params: { productId: value } });
      form.setFieldOptions('variantId', variants);
    });
  }
}
```

**Custom modal body example:**

```typescript
class TerminalsPage extends BaseListPage<Terminal> {
  protected renderModalBody(): string {
    return `
      <b-form id="form"></b-form>
      <s-connection-builder id="conn-builder"></s-connection-builder>
    `;
  }
}
```

---

### BaseSplitPage\<T\>

Provides a master-detail split-panel page: data table on the left, entity detail on the right. Supports optional create/edit modal and delete confirmation — same CRUD model as BaseListPage but with an integrated detail panel.

```typescript
import { BaseSplitPage } from 'birko-web-shell/pages';
import { define } from 'birko-web-core';

class DepartmentsPage extends BaseSplitPage<Department> {
  // ── Required ──
  endpoint = 'api/departments';

  get api() { return appApi; }

  get columns(): TableColumn[] {
    return [
      { key: 'name', label: 'Name', sortable: true },
      { key: 'employeeCount', label: 'Employees' },
    ];
  }

  // Return null to disable CRUD (read-only split page)
  get formSchema(): FormSchema {
    return departmentFormSchema();
  }

  renderDetail(d: Department): string {
    return `
      <div class="info-grid">
        <span class="info-label">Code</span>
        <span class="info-value">${d.code ?? '—'}</span>
        <span class="info-label">Manager</span>
        <span class="info-value">${d.managerName ?? '—'}</span>
      </div>
    `;
  }

  // ── Optional ──
  entityLabel = 'Department';
  masterWidth = '2fr';
  detailWidth = '1fr';

  renderDetailHeader(d: Department) {
    return { title: d.name, subtitle: `${d.employeeCount} employees` };
  }

  // Wire custom buttons inside the detail panel
  protected onDetailUpdated(d: Department) {
    this.$('#btn-assign')?.addEventListener('click', () => this._openAssign(d));
  }
}

define('departments-page', DepartmentsPage);
```

**Read-only split page** (no CRUD modal — e.g. payment records):

```typescript
class PaymentsPage extends BaseSplitPage<Payment> {
  endpoint = 'api/payments';
  get api() { return appApi; }
  get columns() { return [...]; }
  get formSchema() { return null; }  // disables create/edit/delete
  renderDetail(p: Payment) { return `<div class="info-grid">...</div>`; }
}
```

**Extension points (same as BaseListPage plus):**

| Method/Property | Default | Description |
|----------------|---------|-------------|
| `renderDetail(entity)` | **required** | Detail panel body HTML |
| `renderDetailHeader(entity)` | `{ title: entity.name }` | Detail card header |
| `formSchema` | `null` (read-only) | Return schema to enable CRUD |
| `masterWidth` | `'2fr'` | Left panel CSS width |
| `detailWidth` | `'1fr'` | Right panel CSS width |
| `collapseAt` | `'768'` | Responsive collapse breakpoint (px) |
| `emptyDetailMessage` | `''` | Message when no entity selected |
| `detailEndpoint(id)` | `${endpoint}/${id}` | Override for nested resources |
| `onDetailUpdated(entity)` | noop | Wire event listeners inside detail |
| `afterSave(entity, isEdit)` | noop | Post-save side effects |
| `selectedEntity` | getter | Currently selected entity |
| `deselectEntity()` | — | Clear selection, hide detail |
| `reloadDetail()` | — | Re-fetch current entity |
| `renderPageHeader(canCreate)` | title + New button | Override for custom header |

All BaseListPage hooks also available: `onFormReady`, `renderModalBody`, `editEnabled`/`deleteEnabled`, `extraRowActions`/`extraToolbarActions`, `mapToForm`/`mapFromForm`, `modalSize`, permissions.

Built-in CSS classes for detail content: `.info-grid`, `.info-label`, `.info-value`, `.detail-subtitle`, `.detail-actions`.

---

### BaseDetailPage\<T\>

Provides a detail/edit page: loads entity by ID from URL, populates a form, handles save and cancel navigation.

```typescript
import { BaseDetailPage } from 'birko-web-shell/pages';
import { define } from 'birko-web-core';

class DeviceDetailPage extends BaseDetailPage<Device> {
  // ── Required ──
  endpoint = 'api/devices';   // entity is loaded from: {endpoint}/{id}

  get api() { return appApi; }

  get formSchema(): FormSchema {
    return {
      name: 'root',
      children: [
        { name: 'name',   type: 'text',   label: 'Name',   required: true },
        { name: 'status', type: 'select', label: 'Status' },
      ],
    };
  }

  // ── Optional ──
  entityLabel = 'Device';
  backHash    = '#/devices';  // null = history.back()
  readonly    = false;        // true = hides Save button, adds readonly attr to form

  // Runs after entity is loaded — use to populate cascading selects, etc.
  protected async onEntityLoaded(entity: Device) {
    const warehouseOptions = await loadOptions(appApi, `api/warehouses?zoneId=${entity.zoneId}`);
    this.child<BForm>('#form')?.setFieldOptions('warehouseId', warehouseOptions);
  }

  // Custom save handler (default: PUT {endpoint}/{id})
  protected async onSave(data: Record<string, unknown>) {
    await appApi.put(`api/devices/${this._id}`, data);
    toast.success('Device saved');
    window.location.hash = this.backHash ?? '#/devices';
  }
}

define('device-detail-page', DeviceDetailPage);
```

**Extension points:**

| Property/Method | Default | Description |
|----------------|---------|-------------|
| `entityLabel` | `'Item'` | Toast messages |
| `backHash` | `null` | Cancel destination (`null` = `history.back()`) |
| `readonly` | `false` | Disables form + hides Save |
| `onEntityLoaded(entity)` | noop | Hook after entity is fetched |
| `onSave(data)` | PUT to endpoint | Override to customize save |
| `t(key, params?)` | `() => key` | i18n |

ID is extracted from the URL automatically: tries named router param `/:id` first, then the last segment of the hash path (`#/devices/abc123` → `abc123`).

---

### BaseFormModal\<T\>

A modal containing a form that handles both create and edit modes.

```typescript
import { BaseFormModal } from 'birko-web-shell/pages';
import { define } from 'birko-web-core';

class DeviceFormModal extends BaseFormModal<Device> {
  // ── Required ──
  endpoint = 'api/devices';

  get api() { return appApi; }

  get formSchema(): FormSchema {
    return {
      name: 'root',
      children: [
        { name: 'name', type: 'text', label: 'Name', required: true },
      ],
    };
  }

  // ── Optional ──
  entityLabel = 'Device';

  // Called after successful create or edit
  protected onSuccess(item: Device, isEdit: boolean) {
    toast.success(isEdit ? 'Device updated' : 'Device created');
    this.emit('form-success', item);  // default behavior
    devicesPage.reload();             // refresh the list
  }
}

define('device-form-modal', DeviceFormModal);
```

```html
<device-form-modal id="modal"></device-form-modal>
```

```typescript
// Open in create mode:
modal.open();

// Open in edit mode (fetches entity by id):
modal.open(device.id);
```

`onSuccess` receives the created/updated item and `isEdit` flag. The default implementation emits `form-success` with the item as detail.

**Additional overrides:** `modalSize`, `renderModalBody()`, `onFormReady(form, entity)`, `mapToForm(item)`, `mapFromForm(data)` — same API as BaseListPage.

---

## Dashboard widgets

### BaseDashboardWidget\<TConfig\>

Abstract base for dashboard widgets with auto-refresh and API access.

```typescript
import { BaseDashboardWidget, type WidgetConfig } from 'birko-web-shell/dashboard';
import { define } from 'birko-web-core';

interface DeviceCountConfig extends WidgetConfig {
  zoneId?: string;
}

class DeviceCountWidget extends BaseDashboardWidget<DeviceCountConfig> {
  private _count = 0;

  static get styles() {
    return `
      :host { display: block; }
      .count { font-size: 2rem; font-weight: bold; }
    `;
  }

  render() {
    return `
      ${this.renderHeader('Online Devices')}
      <div class="count">${this._count}</div>
    `;
  }

  protected async refresh() {
    const resp = await this.api.get<{ count: number }>('api/devices/count', {
      zone: this._config?.zoneId,
    });
    if (resp.ok && resp.data) {
      this._count = resp.data.count;
      this.update();
    }
  }
}

define('device-count-widget', DeviceCountWidget);
```

```typescript
// Mount the widget:
const widget = document.createElement('device-count-widget') as DeviceCountWidget;
widget.setConfig({
  apiClient: appApi,
  refreshInterval: 30000,  // auto-refresh every 30 s (0 = manual only)
  zoneId: 'zone-1',
});
container.appendChild(widget);
```

**API:**

| Member | Description |
|--------|-------------|
| `setConfig(config)` | Initialize widget, start auto-refresh timer |
| `protected get api()` | Returns `ApiClient`; throws if not yet configured |
| `protected abstract refresh()` | Override to fetch data and call `this.update()` |
| `protected renderHeader(title)` | Renders a header row with title + manual refresh button |
| `onUnmount()` | Stops auto-refresh timer automatically |

**WidgetConfig:**

```typescript
interface WidgetConfig {
  apiClient: ApiClient;
  refreshInterval?: number;  // ms, 0 or omit = no auto-refresh
  [key: string]: unknown;    // extend with your own config properties
}
```

---

## Breadcrumbs

Pages can update the shell's breadcrumb trail by dispatching a `set-breadcrumbs` event that bubbles up to `BAppShell`. The shell calls `onBreadcrumbsChange()` which you override to update your `<b-breadcrumb>` component.

### From a page

```typescript
import { setBreadcrumbs } from 'birko-web-shell/shell';

// Call from onMount() or after loading the entity:
setBreadcrumbs(this, [
  { label: 'Devices', href: '#/devices' },
  { label: device.name },
]);
```

`setBreadcrumbs(source, items)` dispatches a `set-breadcrumbs` CustomEvent with `bubbles: true, composed: true` — it will reach the shell even from inside a shadow DOM.

### In your shell

```typescript
class AppShell extends BAppShell {
  protected onBreadcrumbsChange(items: BreadcrumbItem[]) {
    this.child<BBreadcrumb>('#breadcrumb')?.setItems(items);
  }
}
```

```typescript
interface BreadcrumbItem {
  label: string;
  href?: string;  // omit for the current (last) item
}
```

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
