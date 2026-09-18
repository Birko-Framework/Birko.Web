import type { RibbonTab, BRibbon, BDropdownMenu } from 'birko-web-components';
import type { TenantItem, ConnectionState } from './shell-types.js';
import { openCommandPalette } from 'birko-web-components/command';
import { BSidebarAppShell } from './b-sidebar-app-shell.js';

/**
 * Ribbon-based app shell component for Birko.Web applications.
 *
 * Extends `BSidebarAppShell` (which extends `BCoreAppShell`) with a full
 * Office-style layout:
 * - Ribbon navigation (tabs, context actions, pin/unpin)
 * - Notifications (bell icon with badge, preview popup, drawer)
 * - Tenant switcher (in status bar)
 * - Connection state indicator, pending sync count, conflicts
 * - Command palette trigger (Ctrl+K)
 *
 * Inherits from base classes:
 * - `BCoreAppShell` — theme persistence, online/offline tracking, user dropdown,
 *   brand link, breadcrumb listener, base CSS
 * - `BSidebarAppShell` — opt-in left/right sidebars (default hidden; override
 *   `showLeftSidebar`/`showRightSidebar` to enable)
 *
 * Optional features (sidebars, notifications, tenants, offline sync) are hidden
 * when their methods return default values (false, 0, null, empty arrays).
 */
export abstract class BAppShell extends BSidebarAppShell {
  private _ribbonEventsBound = false;
  /**
   * Ribbon pin preference, as STATE that render() emits — not an attribute set once after mount.
   *
   * It has to be state for the same reason `b-ribbon`'s own `_tabScroll` / `_hoverTabId` do:
   * `update()` morphs synchronously, so the template's attribute set overwrites anything applied
   * imperatively to the element. This used to be restored with a bare `ribbon.pin()` in `onMount`
   * while render() emitted no `pinned` attribute, so **every** re-render silently unpinned the ribbon —
   * a locale switch, a tenant switch, a notification-count change — and a reload appeared to "fix" it
   * because `onMount` ran again (TASK-310).
   *
   * `null` = not yet read from storage; resolved lazily because `storagePrefix` is a subclass getter.
   */
  private _ribbonPinned: boolean | null = null;
  /**
   * Whether the ribbon panel is open — STATE that render() emits, for the same morph reason as
   * `_ribbonPinned`. (`active` needs no field: render() reads `getActiveTabId()`, already the source of
   * truth, so emitting it there is enough.)
   *
   * `expanded` was the subtler half of TASK-310. It was never rendered, so a morph erased it, and the
   * repair in `refreshRibbon` could not work either: it read `prevActive` from the attribute that had
   * *just* been erased, so `prevActive === nextActive` ("we are on the same tab, keep the panel open")
   * was false on every re-render and the panel collapsed. Rendering both attributes makes the panel
   * survive a morph and removes the need for that comparison entirely.
   *
   * PERSISTED, like the pin. The first cut treated "which panel is open" as transient and dropped it on
   * reload; that was wrong — to a user who left the ribbon open, coming back to it closed is the same
   * lost-state complaint as the unpinning was, just one keystroke later (reported against Ctrl+F5).
   *
   * Only meaningful while pinned, in practice: on an UNPINNED ribbon the panel is a hover flyout, so a
   * restored-open panel closes again on the first mouse-out. Restoring it anyway is the honest reading of
   * "it was open when I left" and costs nothing, so the state is not conditioned on `pinned`.
   *
   * Hover expand/collapse updates this field without calling `update()`, so tracking it cannot cause a
   * render storm on mouse movement — but it DOES write localStorage per toggle, which is why the setter
   * below skips the write when the value has not actually changed.
   *
   * `null` = not yet read from storage; resolved lazily because `storagePrefix` is a subclass getter.
   */
  private _ribbonExpanded: boolean | null = null;
  private _previewTimer: ReturnType<typeof setTimeout> | null = null;

  // ── REQUIRED — subclass must implement (in addition to base 4) ────────────

  /** Build ribbon tabs from the current module state. */
  protected abstract getRibbonTabs(): RibbonTab[];

  /** Get the active tab ID (module ID) for ribbon highlighting. */
  protected abstract getActiveTabId(): string;

  /** Called when user clicks a ribbon tab — navigate to the module. */
  protected abstract onTabChange(tabId: string): void;

  // ── OPTIONAL — sensible defaults ──────────────────────────────────────────

  /** Called when a ribbon item is clicked (default: noop). */
  protected onItemClick(_tabId: string, _groupId: string, _itemId: string): void {}

  // ── Notifications (return null/0 to hide) ─────────────────────────────────

  /** Unread notification count for the bell badge. */
  protected getUnreadCount(): number { return 0; }

  /** Custom element tag for the notification preview popup (null = no bell). */
  protected getNotificationPreviewTag(): string | null { return null; }

  /** Custom element tag for the notification drawer (null = no drawer). */
  protected getNotificationDrawerTag(): string | null { return null; }

  /** Called when user clicks the bell icon. */
  protected onBellClick(): void {}

  // ── Tenants (return empty to hide) ────────────────────────────────────────

  /** Available tenants for the switcher (empty = hidden). */
  protected getTenants(): TenantItem[] { return []; }

  /** Currently active tenant (null = none selected). */
  protected getCurrentTenant(): TenantItem | null { return null; }

  /** Called when user selects a different tenant. */
  protected onTenantSwitch(_id: string): void {}

  // ── Status bar ────────────────────────────────────────────────────────────

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

  // ── Command palette ───────────────────────────────────────────────────────

  /** Whether to show the command palette search button (default: true). */
  protected get showCommandPalette(): boolean { return true; }

  // ── PUBLIC REFRESH API ────────────────────────────────────────────────────

  refreshRibbon(): void {
    const ribbon = this.$<BRibbon>('#ribbon');
    if (!ribbon) return;
    ribbon.setTabs(this.getRibbonTabs());
    // render() emits `active` too, so this is belt-and-braces for the setTabs() path rather than the
    // thing that keeps the attribute alive across a morph.
    ribbon.setAttribute('active', this.getActiveTabId() ?? '');
    // NOTE: there used to be a `prevActive === nextActive → ribbon.expand()` line here, to keep the
    // panel open when navigating within a category. It is gone because `expanded` is now rendered
    // (see `_ribbonExpanded`), which preserves the panel across a morph directly.
    //
    // Re-adding it would be actively harmful now: on a pinned ribbon the user can close the panel, and
    // this method runs on every re-render — so it would re-open the panel the user just closed.
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
      if (!this.isOnline) {
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

  // ── OVERRIDES ──────────────────────────────────────────────────────────────

  /** Online/offline changes refresh the connection dot in the status bar. */
  protected onOnlineChanged(): void {
    this.refreshStatusBar();
  }

  // ── RENDER ─────────────────────────────────────────────────────────────────

  render() {
    const previewTag = this.getNotificationPreviewTag();
    const drawerTag  = this.getNotificationDrawerTag();
    const showBell = previewTag !== null || drawerTag !== null;

    return `
      <b-ribbon id="ribbon"${this.accentAttr(this.ribbonAccent)}${this.ribbonGroupSize ? ` preferred-group-size="${this.ribbonGroupSize}"` : ''}${this.isRibbonPinned ? ' pinned' : ''}${this.isRibbonExpanded ? ' expanded' : ''} active="${this.getActiveTabId() ?? ''}">
        <div slot="before-tabs" class="app-brand">
          ${this.renderBrand()}
        </div>

        <div slot="empty" class="ribbon-empty">
          <span class="ribbon-empty-text">${this.t('bws.ribbon.selectModule')}</span>
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
          ${this.renderHeaderActions()}
          ${this.renderThemeDropdown()}
          ${this.renderUserDropdown()}
        </div>
      </b-ribbon>

      ${this.renderContent()}

      ${previewTag ? `<${previewTag} id="notif-preview" hidden></${previewTag}>` : ''}
      ${drawerTag ? `<${drawerTag} id="notif-drawer"></${drawerTag}>` : ''}

      ${this.showCommandPalette ? `<b-command-palette></b-command-palette>` : ''}

      ${this.showStatusBar ? `
        <footer class="app-status-bar"${this.accentAttr(this.footerAccent)}>
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
    super.onMount();

    // NOTE: the ribbon pin preference is deliberately NOT restored here with `ribbon.pin()`. It is
    // rendered from `isRibbonPinned` instead — see `_ribbonPinned` for why an imperative restore here
    // was erased by every subsequent re-render (TASK-310).

    // Context actions from pages
    this.addEventListener('ribbon-actions', ((e: CustomEvent<{ items: unknown[] }>) => {
      this.$<BRibbon>('#ribbon')?.setContextActions(e.detail.items as any[]);
    }) as EventListener);
  }

  protected onUpdated() {
    super.onUpdated();

    // Idempotent UI refreshes
    this.refreshRibbon();
    this.refreshTenantSwitcher();
    this.refreshStatusBar();

    // Bind ribbon-specific event listeners only once
    if (this._ribbonEventsBound) return;
    this._ribbonEventsBound = true;

    this._setupRibbonEvents();
    this._setupTenantSwitcher();
    this._setupSearchButton();
    this._setupBellEvents();
  }

  // ── PRIVATE ────────────────────────────────────────────────────────────────

  private _setupRibbonEvents(): void {
    const ribbon = this.$<BRibbon>('#ribbon');
    const prefix = this.storagePrefix;

    ribbon?.addEventListener('tab-change', ((e: CustomEvent<{ tab: string }>) => {
      this.onTabChange(e.detail.tab);
    }) as EventListener);

    ribbon?.addEventListener('item-click', ((e: CustomEvent<{ tabId: string; groupId: string; itemId: string }>) => {
      this.onItemClick(e.detail.tabId, e.detail.groupId, e.detail.itemId);
    }) as EventListener);

    // b-ribbon emits `expand` for BOTH directions (`{ expanded: true|false }`), including hover
    // expand/collapse on an unpinned ribbon. Store only — no update() — so this cannot cause a render
    // storm on mouse movement across the tab strip.
    ribbon?.addEventListener('expand', ((e: CustomEvent<{ expanded: boolean }>) => {
      if (this._ribbonExpanded === e.detail.expanded) return;   // hover fires this a lot
      this._ribbonExpanded = e.detail.expanded;
      localStorage.setItem(`${prefix}-ribbon-expanded`, String(e.detail.expanded));
    }) as EventListener);

    ribbon?.addEventListener('pin', ((e: CustomEvent<{ pinned: boolean }>) => {
      // Track state as well as storage: render() reads the state, so updating only localStorage would
      // leave the next morph re-asserting the stale value and fighting the user.
      this._ribbonPinned = e.detail.pinned;
      localStorage.setItem(`${prefix}-ribbon-pinned`, String(e.detail.pinned));
    }) as EventListener);
  }

  /**
   * Whether the ribbon panel is open. Read from storage on first use, then kept in sync by the ribbon's
   * `expand` event (which fires for both directions).
   */
  protected get isRibbonExpanded(): boolean {
    if (this._ribbonExpanded === null) {
      this._ribbonExpanded = localStorage.getItem(`${this.storagePrefix}-ribbon-expanded`) === 'true';
    }
    return this._ribbonExpanded;
  }

  /**
   * Whether the ribbon is pinned. Read from storage on first use, then kept in sync by the ribbon's
   * `pin` event. Exposed as protected so a subclass can seed or override the preference.
   */
  protected get isRibbonPinned(): boolean {
    if (this._ribbonPinned === null) {
      this._ribbonPinned = localStorage.getItem(`${this.storagePrefix}-ribbon-pinned`) === 'true';
    }
    return this._ribbonPinned;
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

  // ── STYLES — extends base with ribbon-specific tokens ─────────────────────

  static get styles() {
    return super.styles + `
      .ribbon-empty {
        display: flex; align-items: center; justify-content: center;
        padding: var(--b-space-md, 0.75rem) var(--b-space-lg, 1rem);
        color: var(--b-text-muted);
        font-size: var(--b-text-sm, 0.8125rem);
        font-style: italic;
      }

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
        color: var(--b-text-muted); padding: var(--b-space-2xs, 0.125rem) var(--b-space-xs, 0.25rem);
        border-radius: var(--b-radius-sm, 0.25rem); white-space: nowrap;
        max-width: var(--b-app-user-max-width, 12rem); overflow: hidden; text-overflow: ellipsis;
      }
      .tenant-trigger:hover { background: var(--b-bg-tertiary); color: var(--b-text); }
      .tenant-icon { font-size: 0.75rem; flex-shrink: 0; }
      .tenant-arrow { font-size: 0.5rem; color: var(--b-text-muted); flex-shrink: 0; }

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
      .search-btn-icon { font-size: var(--b-text-base, 0.875rem); }
      .search-btn-hint {
        font-size: var(--b-text-xs, 0.6875rem);
        background: var(--b-bg-elevated);
        border: 1px solid var(--b-border);
        border-radius: var(--b-radius-sm, 0.25rem);
        padding: 0 var(--b-space-xs, 0.25rem);
        line-height: 1.4;
      }
      /* 48rem = the old 768px at a default 16px browser (rem in a media query tracks the
         reader's browser font size). Matches the ribbon's collapse point. */
      @media (max-width: 48rem) { .search-btn-hint { display: none; } }

      .bell-btn {
        background: none; border: none; cursor: pointer;
        color: var(--b-text-secondary);
        padding: var(--b-space-xs, 0.25rem) var(--b-space-sm, 0.5rem);
        border-radius: var(--b-radius, 0.375rem); font-size: 1.125rem; position: relative;
      }
      .bell-btn:hover { background: var(--b-bg-tertiary); color: var(--b-text); }
      .bell-badge {
        position: absolute; top: -0.25rem; right: -0.375rem;
        min-width: 1.125rem; height: 1.125rem; padding: 0 var(--b-space-xs, 0.25rem);
        border-radius: var(--b-radius-full, 9999px);
        background: var(--b-color-danger); color: var(--b-text-inverse);
        font-size: 0.625rem; font-weight: var(--b-font-weight-bold, 700);
        display: flex; align-items: center; justify-content: center; line-height: 1;
        animation: bell-pulse 2s ease infinite;
      }
      @keyframes bell-pulse {
        0%, 100% { transform: scale(1); }
        50%       { transform: scale(1.15); }
      }

      .status-sync {
        cursor: pointer; display: flex; align-items: center; gap: var(--b-space-xs, 0.25rem);
      }
      .status-sync:hover { color: var(--b-text); }
    `;
  }
}
