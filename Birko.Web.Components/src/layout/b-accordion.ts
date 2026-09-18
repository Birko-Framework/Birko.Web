import { BaseComponent, define } from 'birko-web-core';
import { escapeHtml, escapeAttr, rovingIndex } from '../dom-utils';

export interface AccordionItem {
  /** Stable id — also the `slot` name for this section's body content. */
  id: string;
  /** Header text (visible label). Escaped before rendering. */
  header: string;
  /** Start expanded. In single mode (no `multiple`), only the first open item wins. */
  open?: boolean;
  /** Render the header disabled — not toggleable, skipped by keyboard navigation. */
  disabled?: boolean;
}

/**
 * Collapsible disclosure group. Each section has a button header and a slotted body
 * (`<div slot="{id}">…</div>`). Single-open by default; add `multiple` to allow several
 * open at once. Configure via `setItems()` (mirrors `b-tabs.setTabs`).
 *
 * Attributes: `multiple` (allow several open), `size` (sm|md|lg — header vertical footprint).
 * Methods: `setItems`, `open`, `close`, `toggle`, `openAll`, `closeAll`, `getOpen`.
 * Events: `toggle` → `{ id, open }`.
 */
export class BAccordion extends BaseComponent {
  private _items: AccordionItem[] = [];
  private _open = new Set<string>();

  static get styles() {
    return `
      :host { display: block; }
      .accordion {
        border: var(--b-border-width, 1px) solid var(--b-border);
        border-radius: var(--b-radius-md, 0.5rem);
        overflow: hidden;
        background: var(--b-bg);
      }
      .item + .item { border-top: var(--b-border-width, 1px) solid var(--b-border); }
      .acc-header {
        width: 100%;
        display: flex; align-items: center; gap: var(--b-space-sm, 0.5rem);
        min-height: var(--b-control-min-height, 2.375rem);
        box-sizing: border-box;
        padding: var(--b-space-sm, 0.5rem) var(--b-space-md, 0.75rem);
        margin: 0;
        background: none; border: none; cursor: pointer;
        font-family: inherit; font-size: var(--b-text-sm, 0.8125rem);
        font-weight: var(--b-font-weight-medium, 500);
        color: var(--b-text); text-align: left;
        transition: background var(--b-transition, 150ms ease);
      }
      .acc-header:hover:not([disabled]) { background: var(--b-bg-secondary); }
      .acc-header:focus-visible { outline: none; box-shadow: var(--b-focus-ring); }
      .acc-header[disabled] { color: var(--b-text-muted); cursor: not-allowed; }
      .acc-icon {
        flex: none; width: 0.75rem; height: 0.75rem;
        color: var(--b-text-muted);
        transition: transform var(--b-transition, 150ms ease);
      }
      .item.open .acc-icon { transform: rotate(90deg); }
      .acc-title { flex: 1 1 auto; min-width: 0; }
      .acc-panel {
        padding: var(--b-space-md, 0.75rem);
        border-top: var(--b-border-width, 1px) solid var(--b-border);
        color: var(--b-text); font-size: var(--b-text-sm, 0.8125rem);
      }
      .acc-panel[hidden] { display: none; }

      :host([size="sm"]) .acc-header { min-height: var(--b-control-min-height-sm, 1.75rem); font-size: var(--b-text-xs, 0.6875rem); }
      :host([size="lg"]) .acc-header { min-height: var(--b-control-min-height-lg, 3rem); font-size: var(--b-text-base, 0.875rem); }
    `;
  }

  /** Configure the sections. Open state is seeded from each item's `open` flag. */
  setItems(items: AccordionItem[]): void {
    this._items = items;
    this._open = new Set();
    for (const it of items) {
      if (!it.open || it.disabled) continue;
      this._open.add(it.id);
      if (!this._multiple) break; // single mode: only the first open item wins
    }
    this.update();
  }

  /** Currently expanded section ids. */
  getOpen(): string[] {
    return [...this._open];
  }

  open(id: string): void {
    if (this._open.has(id)) return;
    this._setOpen(id, true);
  }

  close(id: string): void {
    if (!this._open.has(id)) return;
    this._setOpen(id, false);
  }

  toggle(id: string): void {
    this._setOpen(id, !this._open.has(id));
  }

  /** Expand every (non-disabled) section. No-op in single mode beyond the first. */
  openAll(): void {
    for (const it of this._items) {
      if (it.disabled) continue;
      this._open.add(it.id);
      if (!this._multiple) break;
    }
    this.update();
  }

  closeAll(): void {
    this._open.clear();
    this.update();
  }

  private get _multiple(): boolean {
    return this.boolAttr('multiple');
  }

  private _setOpen(id: string, open: boolean): void {
    if (open) {
      if (!this._multiple) this._open.clear();
      this._open.add(id);
    } else {
      this._open.delete(id);
    }
    this.update();
    this.emit('toggle', { id, open });
  }

  render(): string {
    return `<div class="accordion">${this._items.map(it => {
      const open = this._open.has(it.id);
      const headerId = `${this.uid}-h-${it.id}`;
      const panelId = `${this.uid}-p-${it.id}`;
      return `
        <div class="item${open ? ' open' : ''}">
          <button class="acc-header" type="button" data-id="${escapeAttr(it.id)}"
            id="${headerId}" aria-expanded="${open}" aria-controls="${panelId}"
            ${it.disabled ? 'disabled' : ''}>
            <svg class="acc-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <span class="acc-title">${escapeHtml(it.header)}</span>
          </button>
          <section class="acc-panel" role="region" id="${panelId}"
            aria-labelledby="${headerId}"${open ? '' : ' hidden'}>
            <slot name="${escapeAttr(it.id)}"></slot>
          </section>
        </div>`;
    }).join('')}</div>`;
  }

  protected onUpdated(): void {
    const root = this.$('.accordion');
    if (!root) return;

    this.listen(root, 'click', (e: Event) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('.acc-header');
      const id = btn?.dataset.id;
      if (!id || btn!.hasAttribute('disabled')) return;
      this.toggle(id);
      // toggle() re-renders synchronously — restore focus to the (new) header element.
      this.$<HTMLElement>(`.acc-header[data-id="${CSS.escape(id)}"]`)?.focus();
    });

    this.listen<KeyboardEvent>(root, 'keydown', (e: KeyboardEvent) => {
      const headers = this.$$<HTMLElement>('.acc-header:not([disabled])');
      const current = headers.indexOf(e.target as HTMLElement);
      if (current < 0) return; // not on a header
      const next = rovingIndex(e, current, headers.length);
      if (next !== null) headers[next].focus();
    });
  }
}

define('b-accordion', BAccordion);
