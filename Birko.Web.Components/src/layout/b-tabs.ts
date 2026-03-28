import { BaseComponent, define } from 'birko-web-core';

export class BTabs extends BaseComponent {
  static get observedAttributes() { return ['active']; }

  private _tabs: { id: string; label: string }[] = [];

  static get styles() {
    return `
      :host { display: block; }
      .tab-bar {
        display: flex; border-bottom: 2px solid var(--b-border);
        gap: 0; overflow-x: auto;
      }
      .tab {
        padding: var(--b-space-sm, 0.5rem) var(--b-space-lg, 1rem);
        border: none; background: none; cursor: pointer;
        font-size: var(--b-text-sm, 0.8125rem); font-weight: var(--b-font-weight-medium, 500);
        color: var(--b-text-muted); border-bottom: 2px solid transparent;
        margin-bottom: -2px; transition: all var(--b-transition, 150ms ease); white-space: nowrap;
      }
      .tab:hover { color: var(--b-text); }
      .tab:focus-visible { outline: none; box-shadow: var(--b-focus-ring); }
      .tab.active { color: var(--b-color-primary); border-bottom-color: var(--b-color-primary); }
      .tab-content { padding: var(--b-space-lg, 1rem) 0; }
    `;
  }

  setTabs(tabs: { id: string; label: string }[], active?: string) {
    this._tabs = tabs;
    if (active) {
      this.setAttribute('active', active);
    } else if (!this.attr('active') && tabs.length > 0) {
      this.setAttribute('active', tabs[0].id);
    }
    this.update();
  }

  render() {
    const active = this.attr('active');
    return `
      <div class="tab-bar" role="tablist">
        ${this._tabs.map(t => {
          const isActive = t.id === active;
          const panelId = `tabpanel-${t.id}`;
          return `<button class="tab ${isActive ? 'active' : ''}"
            role="tab"
            aria-selected="${isActive}"
            aria-controls="${panelId}"
            tabindex="${isActive ? '0' : '-1'}"
            data-tab="${t.id}">${t.label}</button>`;
        }).join('')}
      </div>
      <div class="tab-content" role="tabpanel" id="tabpanel-${active}" aria-labelledby="${active}">
        <slot name="${active}"></slot>
      </div>
    `;
  }

  protected onUpdated() {
    const tabBar = this.$('.tab-bar');
    if (!tabBar) return;

    // Event delegation — this.listen() auto-cleans via AbortController
    this.listen(tabBar, 'click', (e: Event) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('.tab');
      if (btn?.dataset.tab) this._selectTab(btn.dataset.tab);
    });

    this.listen(tabBar, 'keydown', (e: Event) => {
      const ke = e as KeyboardEvent;
      const tabs = this.$$<HTMLElement>('.tab');
      const current = Array.from(tabs).findIndex(t => t.dataset.tab === this.attr('active'));
      let next = -1;

      if (ke.key === 'ArrowRight' || ke.key === 'ArrowLeft') {
        ke.preventDefault();
        next = ke.key === 'ArrowRight'
          ? (current + 1) % tabs.length
          : (current - 1 + tabs.length) % tabs.length;
      } else if (ke.key === 'Home') {
        ke.preventDefault();
        next = 0;
      } else if (ke.key === 'End') {
        ke.preventDefault();
        next = tabs.length - 1;
      }

      if (next >= 0) {
        this._selectTab(tabs[next].dataset.tab!);
        tabs[next].focus();
      }
    });
  }

  private _selectTab(tabId: string) {
    this.setAttribute('active', tabId);
    this.emit('tab-change', { tab: tabId });
  }
}

define('b-tabs', BTabs);
