import type { SidebarItem, BSidebar } from 'birko-web-components';
import { BCoreAppShell } from './b-core-app-shell.js';

/**
 * Abstract sidebar-aware shell extending {@link BCoreAppShell}.
 *
 * Adds opt-in **left and/or right sidebars** using the `<b-sidebar>` component.
 * Both sidebars can be enabled simultaneously (e.g. left = navigation, right = properties/inspector).
 *
 * Default: both sidebars hidden. Override `showLeftSidebar` / `showRightSidebar`
 * to opt in. Provide items via `getLeftSidebarItems()` / `getRightSidebarItems()`.
 *
 * Collapse state of each sidebar is persisted independently in localStorage
 * (`${storagePrefix}-left-sidebar-collapsed`, `${storagePrefix}-right-sidebar-collapsed`).
 *
 * `BSidebarAppShell` overrides `renderContent()` to wrap the base content with
 * sidebars on either side. The rest of the layout (header, footer) stays as
 * defined by `BCoreAppShell`. Subclasses like `BAppShell` that override `render()`
 * entirely can still call `${this.renderContent()}` to get the sidebar layout.
 */
export abstract class BSidebarAppShell extends BCoreAppShell {
  private _sidebarEventsBound = false;

  // ── LEFT SIDEBAR — opt-in ─────────────────────────────────────────────────

  /** Show the left sidebar (default: false). */
  protected get showLeftSidebar(): boolean { return false; }

  /** Whether the left sidebar can be collapsed (default: true). */
  protected get leftSidebarCollapsible(): boolean { return true; }

  /** Items to display in the left sidebar. */
  protected getLeftSidebarItems(): SidebarItem[] { return []; }

  /** ID of the active item in the left sidebar (highlighted). */
  protected getActiveLeftSidebarItem(): string { return ''; }

  /** Called when user toggles the left sidebar collapse state. */
  protected onLeftSidebarToggle(_collapsed: boolean): void {}

  // ── RIGHT SIDEBAR — opt-in ────────────────────────────────────────────────

  /** Show the right sidebar (default: false). */
  protected get showRightSidebar(): boolean { return false; }

  /** Whether the right sidebar can be collapsed (default: true). */
  protected get rightSidebarCollapsible(): boolean { return true; }

  /** Items to display in the right sidebar. */
  protected getRightSidebarItems(): SidebarItem[] { return []; }

  /** ID of the active item in the right sidebar (highlighted). */
  protected getActiveRightSidebarItem(): string { return ''; }

  /** Called when user toggles the right sidebar collapse state. */
  protected onRightSidebarToggle(_collapsed: boolean): void {}

  // ── PUBLIC REFRESH API ────────────────────────────────────────────────────

  refreshLeftSidebar(): void {
    const sidebar = this.$<BSidebar>('#left-sidebar');
    if (!sidebar) return;
    sidebar.setItems(this.getLeftSidebarItems());
    sidebar.setAttribute('active', this.getActiveLeftSidebarItem());
  }

  refreshRightSidebar(): void {
    const sidebar = this.$<BSidebar>('#right-sidebar');
    if (!sidebar) return;
    sidebar.setItems(this.getRightSidebarItems());
    sidebar.setAttribute('active', this.getActiveRightSidebarItem());
  }

  // ── RENDER — wraps base content with sidebars ─────────────────────────────

  protected renderContent(): string {
    if (!this.showLeftSidebar && !this.showRightSidebar) {
      return super.renderContent();
    }

    const left = this.showLeftSidebar ? `
      <b-sidebar id="left-sidebar" class="app-sidebar app-sidebar-left"
                 ${this.leftSidebarCollapsible ? '' : 'data-no-toggle'}></b-sidebar>
    ` : '';

    const right = this.showRightSidebar ? `
      <b-sidebar id="right-sidebar" class="app-sidebar app-sidebar-right"
                 ${this.rightSidebarCollapsible ? '' : 'data-no-toggle'}></b-sidebar>
    ` : '';

    return `
      <div class="app-body">
        ${left}
        ${super.renderContent()}
        ${right}
      </div>
    `;
  }

  // ── LIFECYCLE ──────────────────────────────────────────────────────────────

  protected onMount() {
    super.onMount();

    const prefix = this.storagePrefix;

    // Restore left sidebar collapse state
    if (this.showLeftSidebar && this.leftSidebarCollapsible) {
      const collapsed = localStorage.getItem(`${prefix}-left-sidebar-collapsed`) === 'true';
      if (collapsed) this.$<BSidebar>('#left-sidebar')?.setAttribute('collapsed', '');
    }

    // Restore right sidebar collapse state
    if (this.showRightSidebar && this.rightSidebarCollapsible) {
      const collapsed = localStorage.getItem(`${prefix}-right-sidebar-collapsed`) === 'true';
      if (collapsed) this.$<BSidebar>('#right-sidebar')?.setAttribute('collapsed', '');
    }
  }

  protected onUpdated() {
    super.onUpdated();

    if (this.showLeftSidebar) this.refreshLeftSidebar();
    if (this.showRightSidebar) this.refreshRightSidebar();

    if (this._sidebarEventsBound) return;
    this._sidebarEventsBound = true;

    this._setupSidebarToggleEvents();
  }

  // ── PRIVATE ────────────────────────────────────────────────────────────────

  private _setupSidebarToggleEvents(): void {
    const prefix = this.storagePrefix;

    if (this.showLeftSidebar) {
      this.$<BSidebar>('#left-sidebar')?.addEventListener('toggle', ((e: CustomEvent<{ collapsed: boolean }>) => {
        localStorage.setItem(`${prefix}-left-sidebar-collapsed`, String(e.detail.collapsed));
        this.onLeftSidebarToggle(e.detail.collapsed);
      }) as EventListener);
    }

    if (this.showRightSidebar) {
      this.$<BSidebar>('#right-sidebar')?.addEventListener('toggle', ((e: CustomEvent<{ collapsed: boolean }>) => {
        localStorage.setItem(`${prefix}-right-sidebar-collapsed`, String(e.detail.collapsed));
        this.onRightSidebarToggle(e.detail.collapsed);
      }) as EventListener);
    }
  }

  // ── STYLES — extends base with sidebar layout ─────────────────────────────

  static get styles() {
    return super.styles + `
      .app-body {
        flex: 1; min-height: 0;
        display: flex; align-items: stretch;
        overflow: hidden;
      }
      .app-sidebar {
        flex-shrink: 0;
        height: 100%;
      }
      .app-sidebar-left {
        border-right: 1px solid var(--b-border);
      }
      .app-sidebar-right {
        border-left: 1px solid var(--b-border);
      }
      /* Hide the b-sidebar's internal brand area — the shell has its own brand in the ribbon/header */
      .app-sidebar::part(brand) { display: none; }
    `;
  }
}
