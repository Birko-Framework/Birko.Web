import { BaseComponent, define, escapeHtml } from 'birko-web-core';

const cssEscape = (v: string) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(v) : v.replace(/["\\]/g, '\\$&'));

/**
 * Tab strip with panels. With `reorderable`, tabs can be dragged into a new order, or moved with
 * Ctrl+Shift+ArrowLeft/Right (also Home/End) from the keyboard; each move emits `tab-reorder` with
 * `{ order, tab }` and `order` reads the current one (TASK-525). Save it with `captureLayout`.
 */
export class BTabs extends BaseComponent {
  static get observedAttributes() { return ['active', 'reorderable']; }

  private _tabs: { id: string; label: string }[] = [];
  private _dragId: string | null = null;
  private _announcement = '';

  /** The tab ids in display order. */
  get order(): string[] {
    return this._tabs.map((t) => t.id);
  }

  /**
   * Puts the tabs in this order. Unknown ids are ignored and tabs missing from it keep their relative
   * order after the listed ones, so a saved order survives tabs added or removed since. Emits nothing.
   */
  set order(ids: string[]) {
    const byId = new Map(this._tabs.map((t) => [t.id, t]));
    const seen = new Set<string>();
    const listed = ids.filter((id) => byId.has(id) && !seen.has(id) && seen.add(id)).map((id) => byId.get(id)!);
    this._tabs = [...listed, ...this._tabs.filter((t) => !seen.has(t.id))];
    this.update();
  }

  static get styles() {
    return `
      :host { display: block; overflow: visible; }
      .tab-bar {
        display: flex; border-bottom: 2px solid var(--b-border);
        gap: 0; overflow-x: auto; overflow-y: hidden;
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
      :host([reorderable]) .tab { cursor: grab; }
      .tab.dragging { opacity: 0.5; }
      .tab.drop-before { box-shadow: inset 2px 0 0 var(--b-color-primary); }
      .tab.drop-after { box-shadow: inset -2px 0 0 var(--b-color-primary); }
      .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
      .tab-panel { visibility: hidden; height: 0; overflow: hidden; padding: 0; }
      .tab-panel.active { visibility: visible; height: auto; overflow: visible; padding: var(--b-space-lg, 1rem) 0; }
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
    const reorderable = this.boolAttr('reorderable');
    return `
      <div class="sr-only" aria-live="polite">${escapeHtml(this._announcement)}</div>
      <div class="tab-bar" role="tablist">
        ${this._tabs.map(t => {
          // A label is text and an id is an attribute value (TASK-525, decided by the user): markup in a label is
          // shown, never parsed, as for b-modal's title (TASK-580) and b-toast's message (TASK-597).
          const isActive = t.id === active;
          const id = escapeHtml(t.id);
          const panelId = `tabpanel-${id}`;
          return `<button class="tab ${isActive ? 'active' : ''}"
            role="tab"
            id="tab-${id}"
            aria-selected="${isActive}"
            aria-controls="${panelId}"
            tabindex="${isActive ? '0' : '-1'}"
            ${reorderable ? 'draggable="true" aria-keyshortcuts="Control+Shift+ArrowLeft Control+Shift+ArrowRight"' : ''}
            data-tab="${id}">${escapeHtml(t.label)}</button>`;
        }).join('')}
      </div>
      ${this._tabs.map(t => {
        const isActive = t.id === active;
        const id = escapeHtml(t.id);
        return `<div class="tab-panel ${isActive ? 'active' : ''}" role="tabpanel" id="tabpanel-${id}" aria-labelledby="tab-${id}">
          <slot name="${id}"></slot>
        </div>`;
      }).join('')}
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

      // Ctrl+Shift+Arrow / Home / End moves the active tab instead of selecting another.
      if (this.boolAttr('reorderable') && ke.ctrlKey && ke.shiftKey && current >= 0) {
        const target = ke.key === 'ArrowRight' ? current + 1 : ke.key === 'ArrowLeft' ? current - 1
          : ke.key === 'Home' ? 0 : ke.key === 'End' ? tabs.length - 1 : -1;
        if (target === -1) return;
        ke.preventDefault();
        const id = tabs[current].dataset.tab!;
        if (this._move(id, Math.max(0, Math.min(tabs.length - 1, target)))) {
          this.$<HTMLElement>(`.tab[data-tab="${cssEscape(id)}"]`)?.focus();
        }
        return;
      }

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

    if (!this.boolAttr('reorderable')) return;

    const tabAt = (e: Event) => (e.target as HTMLElement).closest<HTMLElement>('.tab');
    const clearMarks = () => this.$$<HTMLElement>('.tab').forEach((t) => t.classList.remove('drop-before', 'drop-after'));
    const after = (e: DragEvent, tab: HTMLElement) => {
      const box = tab.getBoundingClientRect();
      return e.clientX > box.left + box.width / 2;
    };

    this.listen(tabBar, 'dragstart', (e: Event) => {
      const tab = tabAt(e);
      if (!tab?.dataset.tab) return;
      this._dragId = tab.dataset.tab;
      tab.classList.add('dragging');
      const dt = (e as DragEvent).dataTransfer;
      if (dt) { dt.effectAllowed = 'move'; dt.setData('text/plain', tab.dataset.tab); }
    });
    this.listen(tabBar, 'dragover', (e: Event) => {
      const tab = tabAt(e);
      if (!this._dragId || !tab) return;
      e.preventDefault();
      clearMarks();
      if (tab.dataset.tab !== this._dragId) tab.classList.add(after(e as DragEvent, tab) ? 'drop-after' : 'drop-before');
    });
    this.listen(tabBar, 'drop', (e: Event) => {
      const tab = tabAt(e);
      const id = this._dragId;
      clearMarks();
      if (!id || !tab?.dataset.tab || tab.dataset.tab === id) return;
      e.preventDefault();
      const order = this.order.filter((t) => t !== id);
      const index = order.indexOf(tab.dataset.tab) + (after(e as DragEvent, tab) ? 1 : 0);
      this._move(id, index);
    });
    this.listen(tabBar, 'dragend', () => {
      this._dragId = null;
      clearMarks();
      this.$$<HTMLElement>('.tab').forEach((t) => t.classList.remove('dragging'));
    });
  }

  /** Moves a tab to an index of the order; emits `tab-reorder` when the order changed. */
  private _move(id: string, index: number): boolean {
    const from = this._tabs.findIndex((t) => t.id === id);
    if (from < 0 || from === index) return false;
    const [tab] = this._tabs.splice(from, 1);
    this._tabs.splice(index, 0, tab);
    this._announcement = `${tab.label}, position ${index + 1} of ${this._tabs.length}`;
    this.update();
    this.emit('tab-reorder', { order: this.order, tab: id });
    return true;
  }

  private _selectTab(tabId: string) {
    this.setAttribute('active', tabId);
    this.emit('tab-change', { tab: tabId });
  }
}

define('b-tabs', BTabs);
