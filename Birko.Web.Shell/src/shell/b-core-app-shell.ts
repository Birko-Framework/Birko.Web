import { BaseComponent } from 'birko-web-core';
import type { BDropdownMenu } from 'birko-web-components';
import type { MenuItem, ShellRoutes, BreadcrumbItem, ThemeOption } from './shell-types.js';
import { getRegisteredThemes } from './theme-registry.js';

/**
 * Built-in shell-region accents. A region (header / ribbon / footer) opts into
 * one of these via the headerAccent / ribbonAccent / footerAccent hooks; the
 * shell applies it as inline custom properties on that region element only, so
 * the rest of the app keeps the active page theme. `inverse` mirrors
 * birko-web-components/css/themes/inverse.css — dark chrome that keeps the brand
 * accent (Finstat-style dark top menu + footer). Consumers can also return a raw
 * `--b-x:…;` custom-property string for an ad-hoc accent.
 */
const SHELL_ACCENTS: Record<string, string> = {
  inverse:
    '--b-bg:#2b2929;--b-bg-secondary:#434040;--b-bg-tertiary:#4c4949;--b-bg-elevated:#434040;' +
    '--b-text:#ffffff;--b-text-secondary:#d5d0d0;--b-text-muted:#b0abab;' +
    '--b-border:#5a5656;--b-border-hover:#736f6f;' +
    '--b-overlay-subtle:rgba(255,255,255,.04);--b-overlay-light:rgba(255,255,255,.06);--b-overlay-medium:rgba(255,255,255,.12)',
};

/**
 * Core abstract app shell providing shared infrastructure for all Birko.Web shells.
 *
 * Responsibilities:
 * - Theme / layout persistence from localStorage (`data-theme`, `data-layout`)
 * - Online / offline tracking exposed as `isOnline`
 * - Default user dropdown menu (profile / settings / signout)
 * - Brand link with configurable target
 * - Breadcrumb event listener for pages using `setBreadcrumbs()`
 * - Default minimal layout (brand + user dropdown + content slot)
 * - Base CSS tokens shared by all shell layouts (`:host`, `.app-brand`,
 *   `.user-trigger`, `.user-avatar`, `.app-content`, `.app-status-bar`, status dots)
 *
 * Use directly for minimal shells (login, error pages, kiosks) or subclass to build
 * layout-specific shells like `BAppShell` (ribbon) or a sidebar-based shell.
 *
 * Subclasses typically override `render()` entirely with their own layout and
 * use `renderBrand()` / `renderUserDropdown()` as helpers.
 */
export abstract class BCoreAppShell extends BaseComponent {
  protected _unsubs: (() => void)[] = [];
  private _baseEventsBound = false;
  private _theme = 'light';
  private _isOnline = navigator.onLine;
  private _onlineHandler  = () => { this._isOnline = true;  this.onOnlineChanged(); };
  private _offlineHandler = () => { this._isOnline = false; this.onOnlineChanged(); };

  // ── REQUIRED — subclass must implement ─────────────────────────────────────

  /** Application brand name displayed in the header. */
  protected abstract get brandName(): string;

  /** Current user's display name. Return '' for anonymous apps — hides the user area entirely. */
  protected abstract getUserName(): string;

  /** Translation function. */
  protected abstract t(key: string, params?: Record<string, string>): string;

  /** Called when user clicks "Sign out" in the user menu. */
  protected abstract onSignOut(): void;

  // ── OPTIONAL — sensible defaults ───────────────────────────────────────────

  /** Brand link target (default: '#/'). */
  protected get brandHref(): string { return '#/'; }

  /** Version string for the status bar (default: '' = hidden). */
  protected get version(): string { return ''; }

  /** localStorage key prefix for theme/layout/pin persistence (default: 'app'). */
  protected get storagePrefix(): string { return 'app'; }

  /** Show the theme switcher in the header (default: true). */
  protected get showThemeSwitcher(): boolean { return true; }

  /**
   * Per-region accent (default: none). Return a built-in shell accent key
   * (currently `'inverse'` — dark chrome that keeps the brand color) or a raw
   * `--b-x:…;` custom-property string. Applied as inline custom properties on
   * that region only, so the rest of the app keeps the active theme:
   *   headerAccent → core/sidebar header bar (BCoreAppShell.renderHeader)
   *   ribbonAccent → ribbon bar              (BAppShell)
   *   footerAccent → status bar / footer     (BAppShell)
   */
  protected get headerAccent(): string { return ''; }
  protected get ribbonAccent(): string { return ''; }
  protected get footerAccent(): string { return ''; }

  /** Resolve a region accent to an inline `style="…"` attribute (or ''). */
  protected accentAttr(accent: string): string {
    if (!accent) return '';
    const css = SHELL_ACCENTS[accent] ?? (accent.includes(':') ? accent : '');
    return css ? ` style="${css}"` : '';
  }

  /** Accessible label for the theme switcher trigger. Override to localize. */
  protected get themeMenuLabel(): string { return 'Theme'; }

  /**
   * Selectable themes for the switcher. Defaults to whatever the app registered
   * via `registerThemes()` (from `birko-web-shell`) — only `'light'` (the base
   * `:root`) is present until the app opts in. Each non-light `id` must have a
   * matching `[data-theme="id"]` block linked/bundled (the per-theme files live
   * in `birko-web-components/css/themes/`).
   *
   * Override only if you want a hard-coded list instead of the registry, or to
   * localize labels. The switcher auto-hides when fewer than 2 themes exist.
   */
  protected getAvailableThemes(): ThemeOption[] {
    return getRegisteredThemes();
  }

  /** The currently applied theme id. */
  get currentTheme(): string { return this._theme; }

  /**
   * Apply a theme: set `data-theme` on `<html>` (removed for `'light'`),
   * persist to `{storagePrefix}-theme`, refresh the menu, emit `theme-change`.
   */
  setTheme(theme: string): void {
    this._theme = theme;
    if (theme && theme !== 'light') document.documentElement.setAttribute('data-theme', theme);
    else document.documentElement.removeAttribute('data-theme');
    localStorage.setItem(`${this.storagePrefix}-theme`, theme);
    this.refreshThemeMenu();
    this.emit('theme-change', { theme });
  }

  /** User initials for the avatar (default: first 2 chars of userName). */
  protected getUserInitials(): string {
    return (this.getUserName() ?? '??').slice(0, 2).toUpperCase();
  }

  /** Shell route paths. */
  protected getRoutes(): ShellRoutes {
    return { dashboard: '#/', profile: '#/profile', settings: '#/settings', login: '#/login' };
  }

  /** User dropdown menu items. */
  protected getUserMenuItems(): MenuItem[] {
    return [
      { id: 'profile',  label: this.t('nav.profile'),  icon: '&#128100;' },
      { id: 'settings', label: this.t('nav.settings'), icon: '&#9881;' },
      { id: 'signout',  label: this.t('auth.signOut'),  icon: '&#8594;', variant: 'danger', divider: true },
    ];
  }

  /** Handle user menu selection (default: navigate to routes or sign out). */
  protected onUserMenuSelect(id: string): void {
    const routes = this.getRoutes();
    switch (id) {
      case 'profile':  window.location.hash = routes.profile;  break;
      case 'settings': window.location.hash = routes.settings; break;
      case 'signout':  this.onSignOut(); break;
    }
  }

  /**
   * Called when a page emits a `'set-breadcrumbs'` event via `setBreadcrumbs()`.
   *
   * Override to update your app's `<b-breadcrumb>` element or any other UI.
   * Default: no-op — breadcrumb display is intentionally left to the subclass
   * so the shell layout stays flexible.
   */
  protected onBreadcrumbsChange(_items: BreadcrumbItem[]): void {}

  /** Called when online/offline status changes. Override to refresh UI. */
  protected onOnlineChanged(): void {}

  // ── RENDER HELPERS — subclass uses these in its render() ──────────────────

  /** Render the brand anchor (used by `renderHeader()` and by subclasses). */
  protected renderBrand(): string {
    return `<a class="brand-name" href="${this.brandHref}" id="brand-link">${this.brandName}</a>`;
  }

  /**
   * App-specific header actions (buttons, pickers, status chips), rendered at the
   * left edge of the header action cluster — before the theme switcher and user
   * area. Default: none.
   *
   * This is the seam for injecting custom header controls; do **not** override
   * `renderThemeDropdown()` for that. Wire any controls you return here in your
   * own `onMount()`/`onUpdated()` (the shell does not re-render the header on
   * `refresh*()`, so listeners bound once stay valid).
   */
  protected renderHeaderActions(): string { return ''; }

  /**
   * Render the theme switcher dropdown. Returns '' when `showThemeSwitcher` is
   * false or fewer than 2 themes are registered (a single-theme app has nothing
   * to switch between).
   */
  protected renderThemeDropdown(): string {
    if (!this.showThemeSwitcher || this.getAvailableThemes().length < 2) return '';
    return `
      <b-dropdown-menu id="theme-dropdown" align="right">
        <button class="theme-trigger" slot="trigger" aria-label="${this.themeMenuLabel}">
          <span id="theme-trigger-icon" aria-hidden="true"></span>
        </button>
      </b-dropdown-menu>
    `;
  }

  /**
   * Render the user dropdown menu with avatar.
   *
   * Hidden entirely when `getUserName()` returns ''/null (anonymous apps —
   * kiosks, public dashboards). When `getUserMenuItems()` returns `[]` the
   * avatar + name render as a static badge instead of a dropdown, so the
   * trigger never opens an empty menu.
   */
  protected renderUserDropdown(): string {
    const userName = this.getUserName();
    if (!userName) return '';
    const initials = this.getUserInitials();
    const trigger = `
      <div class="user-avatar">${initials}</div>
      <span class="user-name">${userName}</span>
    `;
    if (this.getUserMenuItems().length === 0) {
      return `<div class="user-trigger is-static">${trigger}</div>`;
    }
    return `
      <b-dropdown-menu id="user-dropdown" align="right">
        <div class="user-trigger" slot="trigger">${trigger}</div>
      </b-dropdown-menu>
    `;
  }

  // ── PROTECTED STATE ────────────────────────────────────────────────────────

  /** Whether the browser is currently online. Updated from window online/offline events. */
  protected get isOnline(): boolean { return this._isOnline; }

  // ── PUBLIC REFRESH API ─────────────────────────────────────────────────────

  /**
   * Re-populate the user dropdown items. Call after language change or route changes.
   * No-op when the user area rendered without a dropdown (anonymous app or empty
   * `getUserMenuItems()`) — switching between those states needs a full `update()`.
   */
  refreshUserMenu(): void {
    const dropdown = this.$<BDropdownMenu>('#user-dropdown');
    if (!dropdown) return;
    const items = this.getUserMenuItems();
    if (items.length === 0) return;
    dropdown.setItems(items);
  }

  /** Re-populate the theme menu (active theme gets a checkmark) and trigger glyph. */
  refreshThemeMenu(): void {
    const dropdown = this.$<BDropdownMenu>('#theme-dropdown');
    if (!dropdown) return;
    const themes = this.getAvailableThemes();
    const current = this._theme;
    dropdown.setItems(
      themes.map(th => ({
        id: th.id,
        label: `${th.id === current ? '&#10003; ' : ''}${th.label}`,
        icon: th.icon,
      })),
    );
    const active = themes.find(th => th.id === current) ?? themes[0];
    const icon = this.$<HTMLElement>('#theme-trigger-icon');
    if (icon && active) icon.innerHTML = active.icon;
  }

  // ── RENDER — default minimal layout ────────────────────────────────────────

  render() {
    return `
      ${this.renderHeader()}
      ${this.renderContent()}
      ${this.renderFooter()}
    `;
  }

  /** Default header: brand + spacer + user dropdown. Override or use helpers directly. */
  protected renderHeader(): string {
    return `
      <header class="app-header"${this.accentAttr(this.headerAccent)}>
        <div class="app-brand">${this.renderBrand()}</div>
        <div class="app-header-spacer"></div>
        <div class="app-actions">${this.renderHeaderActions()}${this.renderThemeDropdown()}${this.renderUserDropdown()}</div>
      </header>
    `;
  }

  /** Default content: `<main>` wrapping a content slot. */
  protected renderContent(): string {
    return `<main class="app-content"><div class="app-content-inner"><slot></slot></div></main>`;
  }

  /** Default footer: empty. Subclasses add status bar, toolbars, etc. */
  protected renderFooter(): string {
    return '';
  }

  // ── LIFECYCLE ──────────────────────────────────────────────────────────────

  protected onMount() {
    const prefix = this.storagePrefix;

    // Theme / layout restore
    const savedLayout = localStorage.getItem(`${prefix}-layout`);
    if (savedLayout) document.documentElement.setAttribute('data-layout', savedLayout);
    else document.documentElement.removeAttribute('data-layout');

    const savedTheme = localStorage.getItem(`${prefix}-theme`);
    this._theme = savedTheme || 'light';
    if (savedTheme && savedTheme !== 'light') document.documentElement.setAttribute('data-theme', savedTheme);
    else document.documentElement.removeAttribute('data-theme');

    // Online / offline
    window.addEventListener('online',  this._onlineHandler);
    window.addEventListener('offline', this._offlineHandler);

    // Breadcrumb updates from pages (emitted via setBreadcrumbs())
    this.addEventListener('set-breadcrumbs', ((e: CustomEvent<{ items: BreadcrumbItem[] }>) => {
      this.onBreadcrumbsChange(e.detail.items);
    }) as EventListener);
  }

  protected onUpdated() {
    this.refreshUserMenu();
    this.refreshThemeMenu();

    if (this._baseEventsBound) return;
    this._baseEventsBound = true;

    this._setupBrandLink();
    this._setupUserDropdown();
    this._setupThemeDropdown();
  }

  protected onUnmount() {
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
    window.removeEventListener('online',  this._onlineHandler);
    window.removeEventListener('offline', this._offlineHandler);
  }

  // ── PRIVATE ────────────────────────────────────────────────────────────────

  private _setupBrandLink(): void {
    this.$('#brand-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.hash = this.getRoutes().dashboard;
    });
  }

  private _setupUserDropdown(): void {
    const dropdown = this.$<BDropdownMenu>('#user-dropdown');
    dropdown?.addEventListener('select', (e: Event) => {
      this.onUserMenuSelect((e as CustomEvent<{ id: string }>).detail.id);
    });
  }

  private _setupThemeDropdown(): void {
    const dropdown = this.$<BDropdownMenu>('#theme-dropdown');
    dropdown?.addEventListener('select', (e: Event) => {
      this.setTheme((e as CustomEvent<{ id: string }>).detail.id);
    });
  }

  // ── STYLES — base tokens shared by all shells ─────────────────────────────

  static get styles() {
    return `
      :host {
        display: flex;
        flex-direction: column;
        width: 100%;
        /* Dynamic viewport height: on mobile Safari/Chrome the browser's URL/toolbar shrinks the
           visible area, but 100vh is the LARGE viewport (as if the toolbar were hidden), so a
           fixed bottom nav ends up occluded behind the toolbar. 100dvh tracks the currently
           visible height; keep 100vh first as the fallback for browsers without dvh. */
        height: 100vh;
        height: 100dvh;
        overflow: hidden;
      }

      .app-header {
        display: flex; align-items: center;
        height: var(--b-header-height, 3rem); flex-shrink: 0;
        background: var(--b-bg-elevated);
        border-bottom: 1px solid var(--b-border);
      }
      .app-header-spacer { flex: 1; }

      .app-brand {
        display: flex; align-items: center; gap: var(--b-space-sm, 0.5rem);
        padding: 0 var(--b-space-lg, 1rem);
        height: 100%;
        border-right: 1px solid var(--b-border);
      }
      .brand-name {
        font-size: var(--b-text-lg, 1rem);
        font-weight: var(--b-font-weight-bold, 700);
        color: var(--b-text);
        white-space: nowrap;
        text-decoration: none;
      }
      .brand-name:hover { color: var(--b-color-primary); }

      .app-actions {
        display: flex; align-items: center; gap: var(--b-space-xs, 0.25rem);
        padding: 0 var(--b-space-md, 0.75rem);
        height: 100%;
      }

      .theme-trigger {
        display: flex; align-items: center; justify-content: center;
        background: none; border: none; cursor: pointer;
        color: var(--b-text-secondary);
        padding: var(--b-space-xs, 0.25rem) var(--b-space-sm, 0.5rem);
        border-radius: var(--b-radius, 0.375rem);
        font-size: 1.125rem; line-height: 1;
      }
      .theme-trigger:hover { background: var(--b-bg-tertiary); color: var(--b-text); }

      .user-trigger {
        display: flex; align-items: center; gap: var(--b-space-sm, 0.5rem);
        font-size: var(--b-text-sm, 0.8125rem); color: var(--b-text-secondary);
        padding: var(--b-space-xs, 0.25rem) var(--b-space-sm, 0.5rem);
        border-radius: var(--b-radius, 0.375rem); cursor: pointer; white-space: nowrap;
      }
      .user-trigger:hover { background: var(--b-bg-tertiary); color: var(--b-text); }
      .user-trigger.is-static { cursor: default; }
      .user-trigger.is-static:hover { background: none; color: var(--b-text-secondary); }
      .user-avatar {
        width: 1.75rem; height: 1.75rem; border-radius: 50%;
        background: var(--b-color-primary-light); color: var(--b-color-primary);
        display: flex; align-items: center; justify-content: center;
        font-size: var(--b-text-xs, 0.6875rem); font-weight: var(--b-font-weight-bold, 700);
        flex-shrink: 0;
      }
      .user-name { overflow: hidden; text-overflow: ellipsis; max-width: var(--b-app-brand-max-width, 8rem); }

      .app-content {
        flex: 1; overflow-y: auto;
        background: var(--b-bg-gradient, var(--b-bg-secondary)); min-width: 0;
      }
      .app-content-inner {
        max-width: var(--b-content-max-width, 100rem);
        margin-inline: auto;
        padding: var(--b-space-xl, 1.5rem);
      }

      .app-status-bar {
        height: var(--b-status-bar-height, 1.75rem); flex-shrink: 0;
        display: flex; align-items: center;
        padding: 0 var(--b-space-xl, 1.5rem);
        background: var(--b-bg-elevated);
        border-top: 1px solid var(--b-border);
        font-size: var(--b-text-xs, 0.6875rem);
        color: var(--b-text-muted);
        gap: var(--b-space-md, 0.75rem);
        user-select: none;
      }
      .status-spacer { flex: 1; }
      .status-dot {
        display: inline-block;
        width: 0.5rem; height: 0.5rem; border-radius: 50%;
        background: var(--b-color-success);
        margin-right: var(--b-space-xs, 0.25rem); flex-shrink: 0;
      }
      .status-dot.offline  { background: var(--b-color-danger); }
      .status-dot.reconnecting {
        background: var(--b-color-warning);
        animation: status-pulse 1.5s ease-in-out infinite;
      }
      @keyframes status-pulse {
        0%, 100% { opacity: 1; }
        50%      { opacity: 0.4; }
      }
      .status-dot.conflict { background: var(--b-color-warning); }

      /* 48rem = the old 768px at a default 16px browser; rem in a media query tracks the
         reader's browser font size. Matches the ribbon's collapse point. */
      @media (max-width: 48rem) {
        .user-name { display: none; }
        .app-content-inner { padding: var(--b-space-lg, 1rem); }
      }
    `;
  }
}
