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
      .tab.active { color: var(--b-color-primary); border-bottom-color: var(--b-color-primary); }
      .tab-content { padding: var(--b-space-lg, 1rem) 0; }
    `;
  }

  setTabs(tabs: { id: string; label: string }[]) {
    this._tabs = tabs;
    if (!this.attr('active') && tabs.length > 0) {
      this.setAttribute('active', tabs[0].id);
    }
    this.update();
  }

  render() {
    const active = this.attr('active');
    return `
      <div class="tab-bar">
        ${this._tabs.map(t =>
          `<button class="tab ${t.id === active ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`
        ).join('')}
      </div>
      <div class="tab-content"><slot name="${active}"></slot></div>
    `;
  }

  protected onUpdated() {
    this.$$('.tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.setAttribute('active', btn.dataset.tab!);
        this.emit('tab-change', { tab: btn.dataset.tab });
      });
    });
  }
}

define('b-tabs', BTabs);
