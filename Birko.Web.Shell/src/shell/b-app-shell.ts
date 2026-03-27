import { BaseComponent } from 'birko-web-core';
import type { RibbonTab, BRibbon, BDropdownMenu } from 'birko-web-components';
import type { MenuItem, TenantItem, ShellRoutes, ConnectionState } from './shell-types.js';
import { openCommandPalette } from 'birko-web-components/command';

/**
 * Abstract base shell component for Birko.Web applications.
 *
 * Provides a full app layout with ribbon navigation, status bar, notification bell,
 * user dropdown, tenant switcher, and command palette integration.
 *
 * Subclasses implement abstract methods to provide app-specific data and actions.
 * Optional features (notifications, tenants, offline sync) are hidden when their
 * methods return default values (0, null, empty arrays).
 */
export abstract class BAppShell extends BaseComponent {
  protected _unsubs: (() => void)[] = [];
  private _eventsBound = false;
  private _onlineHandler  = () => { this._isOnline = true;  this.refreshStatusBar(); };
  private _offlineHandler = () => { this._isOnline = false; this.refreshStatusBar(); };

  private _isOnline = navigator.onLine;
  private _previewTimer: ReturnType<typeof setTimeout> | null = null;

  // ── REQUIRED — app must implement ──────────────────────────────────────────

  /** Application brand name displayed in the ribbon header. */
  protected abstract get brandName(): string;

  /** Current user's display name. */
  protected abstract getUserName(): string;

  /** Build ribbon tabs from the current module state. */
  protected abstract getRibbonTabs(): RibbonTab[];

  /** Get the active tab ID (module ID) for ribbon highlighting. */
  protected abstract getActiveTabId(): string;

  /** Translation function. */
  protected abstract t(key: string, params?: Record<string, string>): string;

  /** Called when user clicks a ribbon tab — navigate to the module. */
  protected abstract onTabChange(tabId: string): void;

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

  /** Called when a ribbon item is clicked (default: noop). */
  protected onItemClick(_tabId: string, _groupId: string, _itemId: string): void {}

  // ── Notifications (return null/0 to hide) ──────────────────────────────────

  /** Unread notification count for the bell badge. */
  protected getUnreadCount(): number { return 0; }

  /** Custom element tag for the notification preview popup (null = no bell). */
  protected getNotificationPreviewTag(): string | null { return null; }

  /** Custom element tag for the notification drawer (null = no drawer). */
  protected getNotificationDrawerTag(): string | null { return null; }

  /** Called when user clicks the bell icon. */
  protected onBellClick(): void {}

  // ── Tenants (return empty to hide) ─────────────────────────────────────────

  /** Available tenants for the switcher (empty = hidden). */
  protected getTenants(): TenantItem[] { return []; }

  /** Currently active tenant (null = none selected). */
  protected getCurrentTenant(): TenantItem | null { return null; }

  /** Called when user selects a different tenant. */
  protected onTenantSwitch(_id: string): void {}

  // ── Status bar ─────────────────────────────────────────────────────────────

  /** Whether to show the status bar (default: true). */
  protected get showStatusBar(): boolean { return true; }

  /** SSE/WebSocket connection state (null = don't show indicator). */
  protected getConnectionState(): ConnectionState | null { return null; }

  /** Module-specific status text for the status bar. */
  protected getStatusText(): string { return ''; }

  /** Number of pending offline actions. */
  protected getPendingActions(): number { return 0; }

  /** Number of sync conflicts. */
  protected getConflicts(): number { return 0; }

  /** Called when user clicks the sync trigger. */
  protected onSyncClick(): void {}

  // ── Command palette ────────────────────────────────────────────────────────

  /** Whether to show the command palette search button (default: true). */
  protected get showCommandPalette(): boolean { return true; }

  // ── PUBLIC — subclass calls to trigger targeted updates ────────────────────

  refreshRibbon(): void {
    const ribbon = this.$<BRibbon>('#ribbon');
    if (!ribbon) return;
    ribbon.setTabs(this.getRibbonTabs());
    ribbon.setAttribute('active', this.getActiveTabId() ?? '');
  }

  refreshStatusBar(): void {
    const moduleEl = this.$<HTMLElement>('#status-module');
    const connEl   = this.$<HTMLElement>('#status-connection');
    const syncEl   = this.$<HTMLElement>('#status-sync');
    if (!moduleEl || !connEl || !syncEl) return;

    moduleEl.textContent = this.getStatusText();

    const connState = this.getConnectionState();
    if (connState === null) {
      connEl.innerHTML = '';
    } else {
      let dotClass: string;
      let connText: string;
      if (!this._isOnline) {
        dotClass = 'offline';
        connText = this.t('status.offline');
      } else if (connState === 'reconnecting') {
        dotClass = 'reconnecting';
        connText = this.t('status.reconnecting');
      } else if (this.getConflicts() > 0) {
        dotClass = 'conflict';
        connText = this.t('status.online');
      } else {
        dotClass = '';
        connText = this.t('status.online');
      }
      connEl.innerHTML = `<span class="status-dot ${dotClass}"></span>${connText}`;
    }

    const pending = this.getPendingActions();
    const conflicts = this.getConflicts();

    if (conflicts > 0) {
      syncEl.textContent = this.t('status.conflicts', { count: String(conflicts) });
    } else if (pending > 0) {
      syncEl.innerHTML = `<span class="status-sync" id="sync-trigger">&#8635; ${this.t('status.pending', { count: String(pending) })}</span>`;
      this.$('#sync-trigger')?.addEventListener('click', () => this.onSyncClick());
    } else {
      syncEl.textContent = '';
    }
  }

  refreshBellBadge(): void {
    const bell = this.$<HTMLElement>('#bell-btn');
    if (!bell) return;
    bell.querySelector('.bell-badge')?.remove();
    const badge = this._renderBadge();
    if (badge) bell.insertAdjacentHTML('beforeend', badge);
  }

  refreshTenantSwitcher(): void {
    const wrap     = this.$<HTMLElement>('#tenant-wrap');
    const dropdown = this.$<BDropdownMenu>('#tenant-switcher');
    const nameEl   = this.$<HTMLElement>('#tenant-current-name');
    if (!wrap || !dropdown || !nameEl) return;

    const tenants = this.getTenants();
    const current = this.getCurrentTenant();

    if (tenants.length < 2) { wrap.hidden = true; return; }

    wrap.hidden = false;
    nameEl.textContent = current?.name ?? '';

    dropdown.setItems(
      tenants.map(t => ({
        id:    t.id,
        label: `${t.id === current?.id ? '&#10003; ' : ''}${t.name}${t.isDefault ? ' &#9881;' : ''} <span style="color:var(--b-text-muted);font-size:var(--b-text-xs,0.6875rem)">(${t.role ?? ''})</span>`,
      })),
    );
  }

  refreshUserMenu(): void {
    const dropdown = this.$<BDropdownMenu>('#user-dropdown');
    if (!dropdown) return;
    dropdown.setItems(this.getUserMenuItems());
  }

  // ── STYLES ─────────────────────────────────────────────────────────────────

  static get styles() {
    return `
      :host {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100vh;
        overflow: hidden;
      }

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

      .tenant-switcher-wrap {
        display: flex; align-items: center;
        border-right: 1px solid var(--b-border);
        padding-right: var(--b-space-md, 0.75rem);
        margin-right: var(--b-space-xs, 0.25rem);
      }
      .tenant-switcher-wrap[hidden] { display: none; }
      .tenant-trigger {
        display: flex; align-items: center; gap: var(--b-space-xs, 0.25rem);
        background: none; border: none; cursor: pointer;
        font-size: var(--b-text-xs, 0.6875rem); font-weight: var(--b-font-weight-medium, 500);
        color: var(--b-text-muted); padding: 0.125rem var(--b-space-xs, 0.25rem);
        border-radius: var(--b-radius-sm, 0.25rem); white-space: nowrap;
        max-width: 12rem; overflow: hidden; text-overflow: ellipsis;
      }
      .tenant-trigger:hover { background: var(--b-bg-tertiary); color: var(--b-text); }
      .tenant-icon { font-size: 0.75rem; flex-shrink: 0; }
      .tenant-arrow { font-size: 0.5rem; color: var(--b-text-muted); flex-shrink: 0; }

      .app-actions {
        display: flex; align-items: center; gap: var(--b-space-xs, 0.25rem);
        padding: 0 var(--b-space-md, 0.75rem);
        height: 100%;
      }
      .search-btn {
        display: flex; align-items: center; gap: var(--b-space-xs, 0.25rem);
        background: var(--b-bg-tertiary);
        border: 1px solid var(--b-border);
        border-radius: var(--b-radius, 0.375rem);
        color: var(--b-text-muted);
        padding: var(--b-space-xs, 0.25rem) var(--b-space-sm, 0.5rem);
        cursor: pointer;
        font-size: var(--b-text-sm, 0.8125rem);
        margin-right: var(--b-space-sm, 0.5rem);
      }
      .search-btn:hover { background: var(--b-bg-secondary); color: var(--b-text); border-color: var(--b-color-primary); }
      .search-btn-icon { font-size: 0.875rem; }
      .search-btn-hint {
        font-size: var(--b-text-xs, 0.6875rem);
        background: var(--b-bg-elevated);
        border: 1px solid var(--b-border);
        border-radius: var(--b-radius-sm, 0.25rem);
        padding: 0 0.25rem;
        line-height: 1.4;
      }
      @media (max-width: 768px) { .search-btn-hint { display: none; } }

      .bell-btn {
        background: none; border: none; cursor: pointer;
        color: var(--b-text-secondary);
        padding: var(--b-space-xs, 0.25rem) var(--b-space-sm, 0.5rem);
        border-radius: var(--b-radius, 0.375rem); font-size: 1.125rem; position: relative;
      }
      .bell-btn:hover { background: var(--b-bg-tertiary); color: var(--b-text); }
      .bell-badge {
        position: absolute; top: -0.25rem; right: -0.375rem;
        min-width: 1.125rem; height: 1.125rem; padding: 0 0.25rem;
        border-radius: var(--b-radius-full, 9999px);
        background: var(--b-color-danger, #ef4444); color: #fff;
        font-size: 0.625rem; font-weight: var(--b-font-weight-bold, 700);
        display: flex; align-items: center; justify-content: center; line-height: 1;
        animation: bell-pulse 2s ease infinite;
      }
      @keyframes bell-pulse {
        0%, 100% { transform: scale(1); }
        50%       { transform: scale(1.15); }
      }
      .user-trigger {
        display: flex; align-items: center; gap: var(--b-space-sm, 0.5rem);
        font-size: var(--b-text-sm, 0.8125rem); color: var(--b-text-secondary);
        padding: 0.25rem var(--b-space-sm, 0.5rem);
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
      .user-name { overflow: hidden; text-overflow: ellipsis; max-width: 8rem; }

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
        height: 1.75rem; flex-shrink: 0;
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
        background: var(--b-color-success, #22c55e);
        margin-right: 0.25rem; flex-shrink: 0;
      }
      .status-dot.offline  { background: var(--b-color-danger,  #ef4444); }
      .status-dot.reconnecting {
        background: var(--b-color-warning, #f59e0b);
        animation: status-pulse 1.5s ease-in-out infinite;
      }
      @keyframes status-pulse {
        0%, 100% { opacity: 1; }
        50%      { opacity: 0.4; }
      }
      .status-dot.conflict { background: var(--b-color-warning, #f59e0b); }
      .status-sync {
        cursor: pointer; display: flex; align-items: center; gap: 0.25rem;
      }
      .status-sync:hover { color: var(--b-text); }

      @media (max-width: 768px) {
        .user-name { display: none; }
        .app-content-inner { padding: var(--b-space-lg, 1rem); }
      }
    `;
  }

  // ── RENDER ─────────────────────────────────────────────────────────────────

  render() {
    const userName = this.getUserName() ?? 'User';
    const initials = this.getUserInitials();
    const previewTag = this.getNotificationPreviewTag();
    const drawerTag  = this.getNotificationDrawerTag();
    const showBell = previewTag !== null || drawerTag !== null;

    return `
      <b-ribbon id="ribbon"
        label-ribbon="${this.t('comp.ribbon.ribbon')}"
        label-open-nav="${this.t('comp.ribbon.openNav')}"
        label-expand="${this.t('comp.ribbon.expand')}"
        label-collapse="${this.t('comp.ribbon.collapse')}"
        label-pin="${this.t('comp.ribbon.pin')}"
        label-unpin="${this.t('comp.ribbon.unpin')}"
        label-navigation="${this.t('comp.ribbon.navigation')}"
        label-actions="${this.t('comp.ribbon.actions')}"
        label-close="${this.t('comp.ribbon.close')}">
        <div slot="before-tabs" class="app-brand">
          <a class="brand-name" href="${this.brandHref}" id="brand-link">${this.brandName}</a>
        </div>

        <div slot="after-tabs" class="app-actions">
          ${this.showCommandPalette ? `
            <button class="search-btn" id="search-btn" aria-label="Command palette (Ctrl+K)">
              <span class="search-btn-icon">&#9906;</span>
              <span class="search-btn-hint">Ctrl K</span>
            </button>
          ` : ''}
          ${showBell ? `
            <button class="bell-btn" id="bell-btn" aria-label="${this.t('nav.notifications')}">
              &#128276;${this._renderBadge()}
            </button>
          ` : ''}
          <b-dropdown-menu id="user-dropdown" align="right">
            <div class="user-trigger" slot="trigger">
              <div class="user-avatar">${initials}</div>
              <span class="user-name">${userName}</span>
            </div>
          </b-dropdown-menu>
        </div>
      </b-ribbon>

      <main class="app-content"><div class="app-content-inner"><slot></slot></div></main>

      ${previewTag ? `<${previewTag} id="notif-preview" hidden></${previewTag}>` : ''}
      ${drawerTag ? `<${drawerTag} id="notif-drawer"></${drawerTag}>` : ''}

      ${this.showCommandPalette ? `
        <b-command-palette
          placeholder="${this.t('comp.commandPalette.placeholder')}"
          label-esc-close="${this.t('comp.commandPalette.escClose')}"
          label-searching="${this.t('comp.commandPalette.searching')}"
          label-no-results="${this.t('comp.commandPalette.noResults')}"
          label-type-to-search="${this.t('comp.commandPalette.typeToSearch')}"
          label-navigate="${this.t('comp.commandPalette.navigate')}"
          label-select="${this.t('comp.commandPalette.select')}"
          label-close="${this.t('comp.commandPalette.close')}"
          label-palette="${this.t('comp.commandPalette.placeholder')}"></b-command-palette>
      ` : ''}

      ${this.showStatusBar ? `
        <footer class="app-status-bar">
          <div class="tenant-switcher-wrap" id="tenant-wrap" hidden>
            <b-dropdown-menu id="tenant-switcher" align="left" position="top">
              <button class="tenant-trigger" slot="trigger">
                <span class="tenant-icon">&#127970;</span>
                <span id="tenant-current-name"></span>
                <span class="tenant-arrow">&#9650;</span>
              </button>
            </b-dropdown-menu>
          </div>
          <span id="status-module"></span>
          <span class="status-spacer"></span>
          <span id="status-connection"></span>
          <span id="status-sync"></span>
          ${this.version ? `<span>${this.version}</span>` : ''}
        </footer>
      ` : ''}
    `;
  }

  // ── LIFECYCLE ──────────────────────────────────────────────────────────────

  protected onMount() {
    const prefix = this.storagePrefix;

    // Restore theme/layout
    const savedLayout = localStorage.getItem(`${prefix}-layout`);
    if (savedLayout) document.documentElement.setAttribute('data-layout', savedLayout);
    else document.documentElement.removeAttribute('data-layout');

    const savedTheme = localStorage.getItem(`${prefix}-theme`);
    if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);

    // Ribbon pin preference
    const pinned = localStorage.getItem(`${prefix}-ribbon-pinned`) === 'true';
    if (pinned) this.$<BRibbon>('#ribbon')?.pin();

    // Online/offline
    window.addEventListener('online',  this._onlineHandler);
    window.addEventListener('offline', this._offlineHandler);

    // Context actions from pages
    this.addEventListener('ribbon-actions', ((e: CustomEvent<{ items: unknown[] }>) => {
      this.$<BRibbon>('#ribbon')?.setContextActions(e.detail.items as any[]);
    }) as EventListener);
  }

  protected onUpdated() {
    // Idempotent UI refreshes
    this.refreshRibbon();
    this.refreshUserMenu();
    this.refreshTenantSwitcher();
    this.refreshStatusBar();

    // Bind event listeners only once
    if (this._eventsBound) return;
    this._eventsBound = true;

    this._setupBrandLink();
    this._setupRibbonEvents();
    this._setupUserDropdown();
    this._setupTenantSwitcher();
    this._setupSearchButton();
    this._setupBellEvents();
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

  private _setupRibbonEvents(): void {
    const ribbon = this.$<BRibbon>('#ribbon');
    const prefix = this.storagePrefix;

    ribbon?.addEventListener('tab-change', ((e: CustomEvent<{ tab: string }>) => {
      this.onTabChange(e.detail.tab);
    }) as EventListener);

    ribbon?.addEventListener('item-click', ((e: CustomEvent<{ tabId: string; groupId: string; itemId: string }>) => {
      this.onItemClick(e.detail.tabId, e.detail.groupId, e.detail.itemId);
    }) as EventListener);

    ribbon?.addEventListener('pin', ((e: CustomEvent<{ pinned: boolean }>) => {
      localStorage.setItem(`${prefix}-ribbon-pinned`, String(e.detail.pinned));
    }) as EventListener);
  }

  private _setupUserDropdown(): void {
    const dropdown = this.$<BDropdownMenu>('#user-dropdown');
    dropdown?.addEventListener('select', (e: Event) => {
      this.onUserMenuSelect((e as CustomEvent<{ id: string }>).detail.id);
    });
  }

  private _setupTenantSwitcher(): void {
    const dropdown = this.$<BDropdownMenu>('#tenant-switcher');
    if (!dropdown) return;
    dropdown.addEventListener('select', (e: Event) => {
      const tenantId = (e as CustomEvent<{ id: string }>).detail.id;
      const current = this.getCurrentTenant();
      if (tenantId !== current?.id) this.onTenantSwitch(tenantId);
    });
  }

  private _setupSearchButton(): void {
    this.$('#search-btn')?.addEventListener('click', () => openCommandPalette());
  }

  private _setupBellEvents(): void {
    const bell    = this.$<HTMLElement>('#bell-btn');
    const preview = this.$<HTMLElement>('#notif-preview');
    if (!bell) return;

    bell.addEventListener('mouseenter', () => {
      this._clearPreviewTimer();
      if (preview) preview.hidden = false;
    });
    bell.addEventListener('mouseleave', () => this._scheduleHidePreview());
    preview?.addEventListener('mouseenter', () => this._clearPreviewTimer());
    preview?.addEventListener('mouseleave', () => this._scheduleHidePreview());
    bell.addEventListener('click', () => {
      if (preview) preview.hidden = true;
      this.onBellClick();
    });
  }

  private _renderBadge(): string {
    const count = this.getUnreadCount();
    if (count === 0) return '';
    return `<span class="bell-badge">${count > 99 ? '99+' : count}</span>`;
  }

  private _scheduleHidePreview(): void {
    this._previewTimer = setTimeout(() => {
      const preview = this.$<HTMLElement>('#notif-preview');
      if (preview) preview.hidden = true;
    }, 200);
  }

  private _clearPreviewTimer(): void {
    if (this._previewTimer !== null) {
      clearTimeout(this._previewTimer);
      this._previewTimer = null;
    }
  }
}
