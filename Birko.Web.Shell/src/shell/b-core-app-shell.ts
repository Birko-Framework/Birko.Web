import { BaseComponent } from 'birko-web-core';
import type { BDropdownMenu } from 'birko-web-components';
import type { MenuItem, ShellRoutes, BreadcrumbItem } from './shell-types.js';

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
  private _isOnline = navigator.onLine;
  private _onlineHandler  = () => { this._isOnline = true;  this.onOnlineChanged(); };
  private _offlineHandler = () => { this._isOnline = false; this.onOnlineChanged(); };

  // ── REQUIRED — subclass must implement ─────────────────────────────────────

  /** Application brand name displayed in the header. */
  protected abstract get brandName(): string;

  /** Current user's display name. */
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

  /** Render the user dropdown menu with avatar. */
  protected renderUserDropdown(): string {
    const userName = this.getUserName() ?? 'User';
    const initials = this.getUserInitials();
    return `
      <b-dropdown-menu id="user-dropdown" align="right">
        <div class="user-trigger" slot="trigger">
          <div class="user-avatar">${initials}</div>
          <span class="user-name">${userName}</span>
        </div>
      </b-dropdown-menu>
    `;
  }

  // ── PROTECTED STATE ────────────────────────────────────────────────────────

  /** Whether the browser is currently online. Updated from window online/offline events. */
  protected get isOnline(): boolean { return this._isOnline; }

  // ── PUBLIC REFRESH API ─────────────────────────────────────────────────────

  /** Re-populate the user dropdown items. Call after language change or route changes. */
  refreshUserMenu(): void {
    const dropdown = this.$<BDropdownMenu>('#user-dropdown');
    if (!dropdown) return;
    dropdown.setItems(this.getUserMenuItems());
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
      <header class="app-header">
        <div class="app-brand">${this.renderBrand()}</div>
        <div class="app-header-spacer"></div>
        <div class="app-actions">${this.renderUserDropdown()}</div>
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
    if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);

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

    if (this._baseEventsBound) return;
    this._baseEventsBound = true;

    this._setupBrandLink();
    this._setupUserDropdown();
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

  // ── STYLES — base tokens shared by all shells ─────────────────────────────

  static get styles() {
    return `
      :host {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100vh;
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

      .user-trigger {
        display: flex; align-items: center; gap: var(--b-space-sm, 0.5rem);
        font-size: var(--b-text-sm, 0.8125rem); color: var(--b-text-secondary);
        padding: var(--b-space-xs, 0.25rem) var(--b-space-sm, 0.5rem);
        border-radius: var(--b-radius, 0.375rem); cursor: pointer; white-space: nowrap;
      }
      .user-trigger:hover { background: var(--b-bg-tertiary); color: var(--b-text); }
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
        background: var(--b-bg-secondary); min-width: 0;
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

      @media (max-width: 768px) {
        .user-name { display: none; }
        .app-content-inner { padding: var(--b-space-lg, 1rem); }
      }
    `;
  }
}
