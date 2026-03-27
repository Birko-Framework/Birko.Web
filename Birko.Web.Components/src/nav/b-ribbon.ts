import { BaseComponent, define } from 'birko-web-core';

// ── Interfaces ───────────────────────────────────────────────────────────────

export interface RibbonTab {
  id: string;
  label: string;
  icon?: string;
  badge?: number;
  disabled?: boolean;
  groups: RibbonGroup[];
}

export interface RibbonGroup {
  id: string;
  label: string;
  items: RibbonItem[];
}

export interface RibbonItem {
  id: string;
  label: string;
  icon?: string;
  href?: string;
  action?: boolean;
  badge?: number;
  disabled?: boolean;
  variant?: 'primary' | 'danger';
}

// ── Component ────────────────────────────────────────────────────────────────

export class BRibbon extends BaseComponent {
  static get observedAttributes() { return ['active', 'expanded', 'pinned',
    'label-ribbon', 'label-open-nav', 'label-expand', 'label-collapse',
    'label-pin', 'label-unpin', 'label-navigation', 'label-actions', 'label-close']; }

  private _tabs: RibbonTab[] = [];
  private _contextActions: RibbonItem[] = [];
  private _expandTimer: ReturnType<typeof setTimeout> | null = null;
  private _collapseTimer: ReturnType<typeof setTimeout> | null = null;
  private _mobileOpen = false;

  static get styles() {
    return `
      :host { display: block; flex-shrink: 0; z-index: var(--b-z-sticky, 200); position: relative; }

      /* ── Tab Row ── */
      .ribbon-tab-row {
        display: flex; align-items: center;
        height: var(--b-ribbon-tab-height, 2.75rem);
        background: var(--b-bg-elevated);
        border-bottom: 1px solid var(--b-border);
        padding: 0;
      }
      .ribbon-before { display: flex; align-items: center; height: 100%; flex-shrink: 0; }
      .ribbon-tabs {
        display: flex; align-items: stretch; height: 100%;
        flex: 1; min-width: 0; overflow-x: auto;
        scrollbar-width: none;
        gap: 0;
        scroll-behavior: smooth;
      }
      .ribbon-tabs::-webkit-scrollbar { display: none; }

      .ribbon-scroll-btn {
        display: none; background: var(--b-bg-elevated); border: none; cursor: pointer;
        color: var(--b-text-muted); padding: 0 var(--b-space-xs, 0.25rem);
        font-size: 0.75rem; flex-shrink: 0; align-items: center; justify-content: center;
        z-index: 1;
      }
      .ribbon-scroll-btn:hover { color: var(--b-text); background: var(--b-bg-tertiary); }
      .ribbon-scroll-btn.visible { display: flex; }

      .ribbon-tab {
        display: flex; align-items: center; gap: var(--b-space-xs, 0.25rem);
        padding: 0 var(--b-space-lg, 1rem);
        background: none; border: none; cursor: pointer;
        font-size: var(--b-text-sm, 0.8125rem); font-weight: var(--b-font-weight-medium, 500);
        color: var(--b-text-muted); white-space: nowrap;
        border-bottom: 2px solid transparent;
        margin-bottom: -1px;
        transition: color var(--b-transition, 150ms ease), border-color var(--b-transition, 150ms ease);
      }
      .ribbon-tab:hover { color: var(--b-text); }
      .ribbon-tab:focus-visible { outline: none; box-shadow: var(--b-focus-ring); }
      .ribbon-tab[aria-selected="true"] {
        color: var(--b-color-primary); border-bottom-color: var(--b-color-primary);
      }
      .ribbon-tab[aria-disabled="true"] {
        opacity: var(--b-disabled-opacity, 0.5); pointer-events: none;
      }
      .ribbon-tab-icon { font-size: var(--b-icon-base, 1rem); }
      .ribbon-tab-badge {
        min-width: 1.125rem; height: 1.125rem; padding: 0 0.25rem;
        border-radius: var(--b-radius-full, 9999px);
        background: var(--b-color-danger); color: #fff;
        font-size: 0.625rem; font-weight: var(--b-font-weight-bold, 700);
        display: inline-flex; align-items: center; justify-content: center; line-height: 1;
      }

      .ribbon-after { display: flex; align-items: center; height: 100%; flex-shrink: 0; }

      .ribbon-ctrl {
        background: none; border: none; cursor: pointer;
        color: var(--b-text-muted); padding: var(--b-space-xs, 0.25rem) var(--b-space-sm, 0.5rem);
        border-radius: var(--b-radius, 0.375rem); font-size: 0.875rem;
        display: flex; align-items: center;
      }
      .ribbon-ctrl:hover { color: var(--b-text); background: var(--b-bg-tertiary); }
      .ribbon-ctrl:focus-visible { outline: none; box-shadow: var(--b-focus-ring); }
      .ribbon-ctrl[aria-pressed="true"] { color: var(--b-color-primary); }

      /* ── Panel Row ── */
      .ribbon-panel {
        max-height: 0; overflow: hidden;
        background: var(--b-bg-elevated);
        border-bottom: 1px solid var(--b-border);
        transition: max-height var(--b-transition-slow, 300ms ease);
      }
      :host([expanded]) .ribbon-panel {
        max-height: var(--b-ribbon-panel-height, 4.5rem);
      }
      /* Unpinned: overlay content instead of pushing it down */
      :host(:not([pinned])) .ribbon-panel {
        position: absolute; left: 0; right: 0; top: 100%;
        z-index: var(--b-z-dropdown, 300);
        box-shadow: var(--b-shadow-md, 0 4px 6px -1px rgba(0,0,0,.1));
      }
      .ribbon-panel-inner {
        display: flex; align-items: flex-start;
        gap: var(--b-ribbon-group-gap, var(--b-space-xl, 1.5rem));
        padding: var(--b-space-sm, 0.5rem) var(--b-space-lg, 1rem);
        height: var(--b-ribbon-panel-height, 4.5rem);
        overflow-x: auto;
        scrollbar-width: none;
      }
      .ribbon-panel-inner::-webkit-scrollbar { display: none; }

      /* ── Groups ── */
      .ribbon-group {
        display: flex; flex-direction: column; gap: var(--b-space-xs, 0.25rem);
        flex-shrink: 0; min-width: 0;
      }
      .ribbon-group-label {
        font-size: var(--b-text-xs, 0.6875rem);
        color: var(--b-text-muted);
        text-transform: uppercase;
        letter-spacing: var(--b-letter-spacing-caps, 0.03125rem);
        font-weight: var(--b-font-weight-semibold, 600);
        line-height: 1;
        padding: 0 var(--b-space-xs, 0.25rem);
      }
      .ribbon-group-items {
        display: flex; align-items: center;
        gap: var(--b-ribbon-item-gap, var(--b-space-xs, 0.25rem));
      }

      /* ── Items ── */
      .ribbon-item {
        display: inline-flex; align-items: center; gap: var(--b-space-xs, 0.25rem);
        padding: var(--b-space-xs, 0.25rem) var(--b-space-sm, 0.5rem);
        border-radius: var(--b-radius, 0.375rem);
        font-size: var(--b-text-sm, 0.8125rem); font-weight: var(--b-font-weight-medium, 500);
        color: var(--b-text-secondary); text-decoration: none;
        border: none; background: none; cursor: pointer;
        white-space: nowrap;
        transition: all var(--b-transition, 150ms ease);
      }
      .ribbon-item:hover { background: var(--b-bg-tertiary); color: var(--b-text); }
      .ribbon-item:focus-visible { outline: none; box-shadow: var(--b-focus-ring); }
      .ribbon-item.active { background: var(--b-color-primary-light); color: var(--b-color-primary); }
      .ribbon-item[aria-disabled="true"] {
        opacity: var(--b-disabled-opacity, 0.5); pointer-events: none;
      }
      .ribbon-item.variant-primary { color: var(--b-color-primary); font-weight: var(--b-font-weight-semibold, 600); }
      .ribbon-item.variant-danger { color: var(--b-color-danger); }
      .ribbon-item-icon { font-size: var(--b-icon-base, 1rem); }
      .ribbon-item-badge {
        min-width: 1rem; height: 1rem; padding: 0 0.2rem;
        border-radius: var(--b-radius-full, 9999px);
        background: var(--b-color-danger); color: #fff;
        font-size: 0.5625rem; font-weight: var(--b-font-weight-bold, 700);
        display: inline-flex; align-items: center; justify-content: center; line-height: 1;
      }

      /* ── Group separator ── */
      .ribbon-group + .ribbon-group {
        border-left: 1px solid var(--b-border);
        padding-left: var(--b-ribbon-group-gap, var(--b-space-xl, 1.5rem));
      }

      /* ── Mobile ── */
      .mobile-hamburger {
        display: none; background: none; border: none; cursor: pointer;
        color: var(--b-text-secondary); font-size: 1.25rem;
        padding: var(--b-space-xs, 0.25rem); border-radius: var(--b-radius, 0.375rem);
        align-items: center; justify-content: center;
      }
      .mobile-hamburger:hover { background: var(--b-bg-tertiary); }
      .mobile-active-label {
        display: none; font-size: var(--b-text-sm, 0.8125rem);
        font-weight: var(--b-font-weight-semibold, 600); color: var(--b-text);
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }

      .mobile-dialog {
        position: fixed; inset: 0; z-index: var(--b-z-modal, 400);
        background: var(--b-bg); border: none; padding: 0; margin: 0;
        width: 100%; max-width: 100%; height: 100%; max-height: 100%;
      }
      .mobile-dialog::backdrop { background: var(--b-backdrop-bg); }
      .mobile-dialog-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: var(--b-space-md, 0.75rem) var(--b-space-lg, 1rem);
        border-bottom: 1px solid var(--b-border);
        font-weight: var(--b-font-weight-bold, 700);
        font-size: var(--b-text-lg, 1rem);
      }
      .mobile-dialog-close {
        background: none; border: none; cursor: pointer;
        font-size: 1.25rem; color: var(--b-text-muted); padding: var(--b-space-xs, 0.25rem);
        border-radius: var(--b-radius, 0.375rem);
      }
      .mobile-dialog-close:hover { background: var(--b-bg-tertiary); color: var(--b-text); }
      .mobile-dialog-body { padding: var(--b-space-sm, 0.5rem); overflow-y: auto; height: calc(100% - 3rem); }
      .mobile-tab-section { margin-bottom: var(--b-space-sm, 0.5rem); }
      .mobile-tab-header {
        display: flex; align-items: center; gap: var(--b-space-sm, 0.5rem);
        padding: var(--b-space-sm, 0.5rem) var(--b-space-md, 0.75rem);
        font-weight: var(--b-font-weight-semibold, 600);
        color: var(--b-text); cursor: pointer; border-radius: var(--b-radius, 0.375rem);
        border: none; background: none; width: 100%; text-align: left;
        font-size: var(--b-text-base, 0.875rem);
      }
      .mobile-tab-header:hover { background: var(--b-bg-tertiary); }
      .mobile-tab-header.active { color: var(--b-color-primary); background: var(--b-color-primary-light); }
      .mobile-group { padding-left: var(--b-space-lg, 1rem); }
      .mobile-group-label {
        font-size: var(--b-text-xs, 0.6875rem); color: var(--b-text-muted);
        text-transform: uppercase; letter-spacing: var(--b-letter-spacing-caps, 0.03125rem);
        padding: var(--b-space-xs, 0.25rem) var(--b-space-md, 0.75rem);
        font-weight: var(--b-font-weight-semibold, 600);
      }
      .mobile-item {
        display: flex; align-items: center; gap: var(--b-space-sm, 0.5rem);
        padding: var(--b-space-sm, 0.5rem) var(--b-space-md, 0.75rem);
        color: var(--b-text-secondary); text-decoration: none; border-radius: var(--b-radius, 0.375rem);
        font-size: var(--b-text-sm, 0.8125rem); border: none; background: none; cursor: pointer;
        width: 100%; text-align: left; min-height: 2.75rem;
      }
      .mobile-item:hover { background: var(--b-bg-tertiary); color: var(--b-text); }

      @media (max-width: 768px) {
        .ribbon-tabs { display: none; }
        .ribbon-panel { display: none; }
        .ribbon-ctrl { display: none; }
        .ribbon-scroll-btn { display: none !important; }
        .mobile-hamburger { display: flex; }
        .mobile-active-label { display: block; flex: 1; min-width: 0; }
      }
      @media (max-width: 1024px) {
        .ribbon-tab-icon + .ribbon-tab-label { display: none; }
      }
    `;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  setTabs(tabs: RibbonTab[]) {
    this._tabs = tabs;
    if (!this.attr('active') && tabs.length > 0) {
      this.setAttribute('active', tabs[0].id);
    }
    this.update();
  }

  setContextActions(items: RibbonItem[]) {
    this._contextActions = items;
    this.update();
  }

  expand()  { this.setAttribute('expanded', ''); this.emit('expand', { expanded: true }); }
  collapse() { this.removeAttribute('expanded'); this.emit('expand', { expanded: false }); }

  toggleExpand() {
    if (this.boolAttr('expanded')) this.collapse(); else this.expand();
  }

  pin()   { this.setAttribute('pinned', ''); this.expand(); this.emit('pin', { pinned: true }); }
  unpin() { this.removeAttribute('pinned'); this.emit('pin', { pinned: false }); }

  togglePin() {
    if (this.boolAttr('pinned')) this.unpin(); else this.pin();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  render() {
    const active = this.attr('active');
    const expanded = this.boolAttr('expanded');
    const pinned = this.boolAttr('pinned');
    const activeTab = this._tabs.find(t => t.id === active);
    const activeLabel = activeTab?.label ?? '';

    return `
      <div class="ribbon" role="toolbar" aria-label="${this.attr('label-ribbon', 'Module ribbon')}">
        <div class="ribbon-tab-row">
          <div class="ribbon-before"><slot name="before-tabs"></slot></div>

          <button class="mobile-hamburger" id="mobile-hamburger" aria-label="${this.attr('label-open-nav', 'Open navigation menu')}">&#9776;</button>
          <span class="mobile-active-label">${activeLabel}</span>

          <button class="ribbon-scroll-btn" id="scroll-left" aria-label="Scroll left">&#9666;</button>
          <div class="ribbon-tabs" role="tablist">
            ${this._tabs.map(tab => {
              const isActive = tab.id === active;
              const badge = tab.badge ? `<span class="ribbon-tab-badge">${tab.badge > 99 ? '99+' : tab.badge}</span>` : '';
              const icon = tab.icon ? `<span class="ribbon-tab-icon" aria-hidden="true">${tab.icon}</span>` : '';
              const disabled = tab.disabled ? 'aria-disabled="true"' : '';
              return `<button class="ribbon-tab" role="tab"
                aria-selected="${isActive}" aria-controls="ribbon-panel-${tab.id}"
                id="ribbon-tab-${tab.id}" tabindex="${isActive ? '0' : '-1'}"
                data-tab="${tab.id}" ${disabled}>
                ${icon}<span class="ribbon-tab-label">${tab.label}</span>${badge}
              </button>`;
            }).join('')}
          </div>
          <button class="ribbon-scroll-btn" id="scroll-right" aria-label="Scroll right">&#9656;</button>

          <div class="ribbon-after"><slot name="after-tabs"></slot></div>

          <button class="ribbon-ctrl" id="ribbon-toggle"
            aria-label="${expanded ? this.attr('label-collapse', 'Collapse ribbon') : this.attr('label-expand', 'Expand ribbon')}"
            aria-expanded="${expanded}"
            title="${expanded ? this.attr('label-collapse', 'Collapse ribbon') : this.attr('label-expand', 'Expand ribbon')}">
            ${expanded ? '&#9650;' : '&#9660;'}
          </button>
          <button class="ribbon-ctrl" id="ribbon-pin"
            aria-label="${pinned ? this.attr('label-unpin', 'Unpin ribbon') : this.attr('label-pin', 'Pin ribbon open')}"
            aria-pressed="${pinned}"
            title="${pinned ? this.attr('label-unpin', 'Unpin ribbon') : this.attr('label-pin', 'Pin ribbon open')}">
            ${pinned ? '&#128204;' : '&#128205;'}
          </button>
        </div>

        ${this._renderPanel(active, activeTab)}

        <dialog class="mobile-dialog" id="mobile-dialog">
          <div class="mobile-dialog-header">
            <span>${this.attr('label-navigation', 'Navigation')}</span>
            <button class="mobile-dialog-close" id="mobile-dialog-close" aria-label="${this.attr('label-close', 'Close')}">&#10005;</button>
          </div>
          <div class="mobile-dialog-body">
            ${this._tabs.map(tab => `
              <div class="mobile-tab-section">
                <button class="mobile-tab-header ${tab.id === active ? 'active' : ''}" data-mobile-tab="${tab.id}">
                  ${tab.icon ? `<span aria-hidden="true">${tab.icon}</span>` : ''}
                  ${tab.label}
                </button>
                <div class="mobile-group" data-mobile-group="${tab.id}" ${tab.id !== active ? 'hidden' : ''}>
                  ${tab.groups.map(group => `
                    <div class="mobile-group-label">${group.label}</div>
                    ${group.items.map(item => {
                      const tag = item.href ? 'a' : 'button';
                      const href = item.href ? `href="${item.href}"` : '';
                      return `<${tag} class="mobile-item" ${href}
                        data-tab="${tab.id}" data-group="${group.id}" data-item="${item.id}">
                        ${item.icon ? `<span aria-hidden="true">${item.icon}</span>` : ''}
                        ${item.label}
                      </${tag}>`;
                    }).join('')}
                  `).join('')}
                </div>
              </div>
            `).join('')}
          </div>
        </dialog>
      </div>
    `;
  }

  private _renderPanel(active: string, activeTab: RibbonTab | undefined): string {
    if (!activeTab) return `<div class="ribbon-panel" role="tabpanel" id="ribbon-panel-${active}"></div>`;

    const groups = activeTab.groups;
    const hasContext = this._contextActions.length > 0;

    return `
      <div class="ribbon-panel" role="tabpanel" id="ribbon-panel-${active}" aria-labelledby="ribbon-tab-${active}">
        <div class="ribbon-panel-inner">
          ${groups.map(group => `
            <div class="ribbon-group" role="group" aria-label="${group.label}">
              <span class="ribbon-group-label">${group.label}</span>
              <div class="ribbon-group-items">
                ${group.items.map(item => this._renderItem(activeTab.id, group.id, item)).join('')}
              </div>
            </div>
          `).join('')}
          ${hasContext ? `
            <div class="ribbon-group" role="group" aria-label="${this.attr('label-actions', 'Actions')}">
              <span class="ribbon-group-label">${this.attr('label-actions', 'Actions')}</span>
              <div class="ribbon-group-items">
                ${this._contextActions.map(item => this._renderItem(activeTab.id, '_context', item)).join('')}
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  private _renderItem(tabId: string, groupId: string, item: RibbonItem): string {
    const cls = [
      'ribbon-item',
      item.variant ? `variant-${item.variant}` : '',
    ].filter(Boolean).join(' ');
    const icon = item.icon ? `<span class="ribbon-item-icon" aria-hidden="true">${item.icon}</span>` : '';
    const badge = item.badge ? `<span class="ribbon-item-badge">${item.badge > 99 ? '99+' : item.badge}</span>` : '';
    const disabled = item.disabled ? 'aria-disabled="true"' : '';
    const data = `data-tab="${tabId}" data-group="${groupId}" data-item="${item.id}"`;

    if (item.href && !item.action) {
      return `<a class="${cls}" href="${item.href}" ${disabled} ${data}>${icon}${item.label}${badge}</a>`;
    }
    return `<button class="${cls}" ${disabled} ${data}>${icon}${item.label}${badge}</button>`;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  protected onUpdated() {
    // Scroll buttons for overflowing tabs
    this._setupTabScroll();

    // Tab clicks
    this.$$<HTMLElement>('.ribbon-tab').forEach(btn => {
      btn.addEventListener('click', () => this._selectTab(btn.dataset.tab!));
    });

    // Tab keyboard navigation
    this.$('.ribbon-tabs')?.addEventListener('keydown', (e: Event) => {
      const ke = e as KeyboardEvent;
      const tabs = this.$$<HTMLElement>('.ribbon-tab');
      const current = Array.from(tabs).findIndex(t => t.dataset.tab === this.attr('active'));
      let next = -1;

      if (ke.key === 'ArrowRight' || ke.key === 'ArrowLeft') {
        ke.preventDefault();
        next = ke.key === 'ArrowRight'
          ? (current + 1) % tabs.length
          : (current - 1 + tabs.length) % tabs.length;
      } else if (ke.key === 'Home') {
        ke.preventDefault(); next = 0;
      } else if (ke.key === 'End') {
        ke.preventDefault(); next = tabs.length - 1;
      } else if (ke.key === 'ArrowDown') {
        ke.preventDefault();
        // Move focus into panel first item
        const firstItem = this.$<HTMLElement>('.ribbon-panel .ribbon-item');
        firstItem?.focus();
        return;
      }

      if (next >= 0) {
        this._selectTab(tabs[next].dataset.tab!);
        tabs[next].focus();
      }
    });

    // Panel keyboard: Escape returns to tab row
    this.$('.ribbon-panel')?.addEventListener('keydown', (e: Event) => {
      const ke = e as KeyboardEvent;
      if (ke.key === 'Escape') {
        ke.preventDefault();
        const active = this.attr('active');
        this.$<HTMLElement>(`#ribbon-tab-${active}`)?.focus();
      }
      // Left/Right between items
      if (ke.key === 'ArrowRight' || ke.key === 'ArrowLeft') {
        ke.preventDefault();
        const items = this.$$<HTMLElement>('.ribbon-panel .ribbon-item');
        const idx = Array.from(items).indexOf(ke.target as HTMLElement);
        if (idx < 0) return;
        const next = ke.key === 'ArrowRight'
          ? (idx + 1) % items.length
          : (idx - 1 + items.length) % items.length;
        items[next]?.focus();
      }
    });

    // Panel item clicks
    this.$$<HTMLElement>('.ribbon-panel .ribbon-item').forEach(el => {
      el.addEventListener('click', (e: Event) => {
        const target = e.currentTarget as HTMLElement;
        this.emit('item-click', {
          tabId: target.dataset.tab,
          groupId: target.dataset.group,
          itemId: target.dataset.item,
        });
        // Auto-collapse if not pinned
        if (!this.boolAttr('pinned')) this.collapse();
      });
    });

    // Expand/collapse toggle
    this.$('#ribbon-toggle')?.addEventListener('click', () => this.toggleExpand());
    this.$('#ribbon-pin')?.addEventListener('click', () => this.togglePin());

    // Hover expand/collapse (desktop only) — only on tabs and panel, not other ribbon elements
    let overTabs = false;
    let overPanel = false;

    const maybeExpand = () => {
      this._clearTimers();
      if (!this.boolAttr('pinned') && !this.boolAttr('expanded')) {
        this._expandTimer = setTimeout(() => this.expand(), 100);
      }
    };

    const maybeCollapse = () => {
      this._clearTimers();
      if (!overTabs && !overPanel && !this.boolAttr('pinned') && this.boolAttr('expanded')) {
        this._collapseTimer = setTimeout(() => this.collapse(), 300);
      }
    };

    const tabs = this.$<HTMLElement>('.ribbon-tabs');
    const panel = this.$<HTMLElement>('.ribbon-panel');

    tabs?.addEventListener('mouseenter', () => { overTabs = true; maybeExpand(); });
    tabs?.addEventListener('mouseleave', () => { overTabs = false; maybeCollapse(); });
    panel?.addEventListener('mouseenter', () => { overPanel = true; this._clearTimers(); });
    panel?.addEventListener('mouseleave', () => { overPanel = false; maybeCollapse(); });

    // Mobile dialog
    this.$('#mobile-hamburger')?.addEventListener('click', () => this._openMobileMenu());
    this.$('#mobile-dialog-close')?.addEventListener('click', () => this._closeMobileMenu());

    // Mobile tab headers (toggle group visibility)
    this.$$<HTMLElement>('.mobile-tab-header').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.dataset.mobileTab!;
        // Select tab
        this._selectTab(tabId);
        // Toggle visibility of groups
        this.$$<HTMLElement>('[data-mobile-group]').forEach(g => {
          g.hidden = g.dataset.mobileGroup !== tabId;
        });
        this.$$<HTMLElement>('.mobile-tab-header').forEach(h => {
          h.classList.toggle('active', h.dataset.mobileTab === tabId);
        });
      });
    });

    // Mobile item clicks
    this.$$<HTMLElement>('.mobile-item').forEach(el => {
      el.addEventListener('click', () => {
        this.emit('item-click', {
          tabId: el.dataset.tab,
          groupId: el.dataset.group,
          itemId: el.dataset.item,
        });
        this._closeMobileMenu();
      });
    });
  }

  protected onUnmount() {
    this._clearTimers();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _selectTab(tabId: string) {
    const tab = this._tabs.find(t => t.id === tabId);
    if (!tab || tab.disabled) return;

    const changed = tabId !== this.attr('active');
    if (changed) {
      this.setAttribute('active', tabId);
      this.emit('tab-change', { tab: tabId });
    }
    // Always expand panel so sub-pages are visible
    this.expand();
  }

  private _setupTabScroll() {
    const tabs = this.$<HTMLElement>('.ribbon-tabs');
    const leftBtn = this.$<HTMLElement>('#scroll-left');
    const rightBtn = this.$<HTMLElement>('#scroll-right');
    if (!tabs || !leftBtn || !rightBtn) return;

    const updateArrows = () => {
      const canLeft = tabs.scrollLeft > 1;
      const canRight = tabs.scrollLeft + tabs.clientWidth < tabs.scrollWidth - 1;
      leftBtn.classList.toggle('visible', canLeft);
      rightBtn.classList.toggle('visible', canRight);
    };

    tabs.addEventListener('scroll', updateArrows, { passive: true });
    leftBtn.addEventListener('click', () => { tabs.scrollLeft -= tabs.clientWidth * 0.5; });
    rightBtn.addEventListener('click', () => { tabs.scrollLeft += tabs.clientWidth * 0.5; });

    // Check on next frame (layout may not be ready yet)
    requestAnimationFrame(updateArrows);
  }

  private _clearTimers() {
    if (this._expandTimer) { clearTimeout(this._expandTimer); this._expandTimer = null; }
    if (this._collapseTimer) { clearTimeout(this._collapseTimer); this._collapseTimer = null; }
  }

  private _openMobileMenu() {
    const dialog = this.$<HTMLDialogElement>('#mobile-dialog');
    dialog?.showModal();
    this._mobileOpen = true;
  }

  private _closeMobileMenu() {
    const dialog = this.$<HTMLDialogElement>('#mobile-dialog');
    dialog?.close();
    this._mobileOpen = false;
  }
}

define('b-ribbon', BRibbon);
