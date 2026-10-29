import { BaseComponent, define } from 'birko-web-core';
import { srOnlySheet } from '../shared-styles';
import { announce, escapeAttr, escapeHtml } from '../dom-utils';
import './b-sortable-item.js';

/** One row for {@link BSortableList.setItems}, rendered as a `b-sortable-item`. */
export interface SortableItemData {
  id: string;
  label: string;
  meta?: string;
  image?: string;
}

/** `change` detail. `to` is -1 for a removal. */
export interface SortableChangeDetail {
  order: string[];
  id: string;
  from: number;
  to: number;
  removed?: boolean;
}

export type SortableLayout = 'list' | 'grid' | 'inline';

const GRIP = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="6" cy="3.5" r="1.2"/><circle cx="10" cy="3.5" r="1.2"/><circle cx="6" cy="8" r="1.2"/><circle cx="10" cy="8" r="1.2"/><circle cx="6" cy="12.5" r="1.2"/><circle cx="10" cy="12.5" r="1.2"/></svg>';
/** A press on one of these inside a row is the row's own control, never the start of a drag. */
const INTERACTIVE = 'a[href], button, input, select, textarea, label, [contenteditable=""], [contenteditable="true"], [role="button"]';
/** On touch, a row (not its handle) drags after a still press this long, so a swipe still scrolls the page. */
const HOLD_MS = 350;
/** Distance from the scroller's edge at which a drag scrolls it. */
const EDGE_PX = 48;

interface Drag {
  li: HTMLLIElement;
  id: string;
  pointerId: number;
  x0: number; y0: number; x: number; y: number;
  from: number;
  to: number | null;
  armed: boolean;
  started: boolean;
  timer?: ReturnType<typeof setTimeout>;
  raf?: number;
  bar?: HTMLElement;
  scroller?: Element;
  scroll0: number;
}

/**
 * An ordered list the user reorders by drag and drop (mouse, pen, touch) or by keyboard, in a `list`, `grid` or
 * `inline` layout. The rows are the element's own children, each with a `data-id`; the list wraps each in a row with
 * a handle (and a Remove button with `removable`), keeps the children in the shown order, and emits one `change` with
 * the new order. The consumer owns the data. `setItems()` fills it with `b-sortable-item` rows for plain data.
 */
export class BSortableList extends BaseComponent {
  static get observedAttributes() {
    return ['label', 'layout', 'limit', 'max-height', 'item-min-width', 'label-empty', 'label-limit'];
  }

  static get sharedStyles() { return [srOnlySheet]; }

  private static _seq = 0;
  private _rows = new Map<Element, HTMLLIElement>();
  private _keys = new WeakMap<Element, string>();
  private _limitLine: HTMLLIElement | null = null;
  private _observer: MutationObserver | null = null;
  private _grabbed: { id: string; from: number } | null = null;
  private _drag: Drag | null = null;
  private _quiet = false;

  static get styles() {
    return `
      :host {
        display: block; position: relative;
        --_gap: var(--b-space-sm, 0.5rem);
        --_pad: var(--b-space-sm, 0.5rem) var(--b-space-md, 0.75rem);
      }
      :host([size="sm"]) { --_gap: var(--b-space-xs, 0.25rem); --_pad: var(--b-space-xs, 0.25rem) var(--b-space-sm, 0.5rem); }
      /* Padding plus a matching negative margin, so a capped (scrolling) list does not clip the rows' focus ring. */
      .scroll {
        position: relative; padding: var(--b-space-xs, 0.25rem); margin: calc(-1 * var(--b-space-xs, 0.25rem));
        max-height: var(--_max-height, none); overflow: auto; overscroll-behavior: contain;
      }
      .items { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--_gap); }

      .row {
        position: relative; display: flex; align-items: center; gap: var(--b-space-sm, 0.5rem); min-width: 0;
        padding: var(--_pad);
        background: var(--b-bg-elevated); color: var(--b-text);
        border: var(--b-border-width, 1px) solid var(--b-border); border-radius: var(--b-radius, 0.375rem);
        user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;
        transition: border-color var(--b-transition), box-shadow var(--b-transition), background var(--b-transition);
      }
      :host(:not([handle-only])) .row { cursor: grab; }
      .row:hover { border-color: var(--b-border-hover); box-shadow: var(--b-shadow-sm); }
      .row.pressing { box-shadow: var(--b-shadow-lg); }
      .row.dragging {
        z-index: 2; cursor: grabbing; transition: none;
        border-color: var(--b-border-focus); box-shadow: var(--b-shadow-lg);
      }
      .row.grabbed {
        z-index: 1; border-color: var(--b-border-focus); box-shadow: var(--b-shadow-lg);
        background: color-mix(in srgb, var(--b-color-primary) 8%, var(--b-bg-elevated));
      }
      .row.flash { animation: b-sortable-flash 1.2s var(--b-ease); }
      @keyframes b-sortable-flash {
        0%, 40% {
          background: color-mix(in srgb, var(--b-color-warning) 16%, var(--b-bg-elevated));
          border-color: var(--b-color-warning);
        }
      }
      .row.beyond { opacity: 0.55; border-style: dashed; }

      .handle, .remove {
        flex: none; display: grid; place-items: center; width: 1.75rem; height: 1.75rem; padding: 0;
        border: 0; border-radius: var(--b-radius-sm, 0.25rem); background: none; color: var(--b-text-muted); font: inherit;
      }
      .handle { cursor: grab; touch-action: none; }
      .handle svg { width: 1rem; height: 1rem; }
      .handle:hover { background: var(--b-bg-tertiary); color: var(--b-text); }
      .grabbed .handle { color: var(--b-color-primary); }
      .remove { cursor: pointer; font-size: var(--b-text-lg, 1rem); line-height: 1; }
      .remove:hover { background: color-mix(in srgb, var(--b-color-danger) 12%, transparent); color: var(--b-color-danger); }
      :host(:not([removable])) .remove { display: none; }
      .handle:focus-visible, .remove:focus-visible { outline: none; box-shadow: var(--b-focus-ring); }
      :host([size="sm"]) .handle, :host([size="sm"]) .remove { width: 1.5rem; height: 1.5rem; }

      .pos {
        flex: none; min-width: 1.25rem; text-align: right;
        color: var(--b-text-muted); font-size: var(--b-text-xs, 0.6875rem); font-variant-numeric: tabular-nums;
      }
      :host(:not([numbered])) .pos { display: none; }
      .content { flex: 1; min-width: 0; }

      /* grid: tiles that reflow to the width; handle, remove and number float on the tile */
      :host([layout="grid"]) .items { display: grid; grid-template-columns: repeat(auto-fill, minmax(var(--_tile, 9rem), 1fr)); }
      :host([layout="grid"]) .row { display: block; padding: 0; overflow: hidden; }
      :host([layout="grid"]) .handle, :host([layout="grid"]) .remove {
        position: absolute; z-index: 1; top: var(--b-space-xs, 0.25rem);
        background: var(--b-bg-elevated); color: var(--b-text-secondary); box-shadow: var(--b-shadow);
      }
      :host([layout="grid"]) .handle { left: var(--b-space-xs, 0.25rem); }
      :host([layout="grid"]) .remove { right: var(--b-space-xs, 0.25rem); }
      :host([layout="grid"]) .pos {
        position: absolute; z-index: 1; top: calc(var(--b-space-xs, 0.25rem) + 0.3rem); left: 2.4rem; min-width: 0;
        padding: 0 0.4rem; border-radius: var(--b-radius-full, 9999px); background: var(--b-bg-elevated); box-shadow: var(--b-shadow-sm);
      }

      /* inline: chips that wrap */
      :host([layout="inline"]) .items { flex-direction: row; flex-wrap: wrap; }
      :host([layout="inline"]) .row { gap: 0.125rem; padding: 0.125rem 0.25rem 0.125rem 0.125rem; border-radius: var(--b-radius-full, 9999px); }
      :host([layout="inline"]) .handle, :host([layout="inline"]) .remove { width: 1.5rem; height: 1.5rem; border-radius: var(--b-radius-full, 9999px); }
      :host([layout="inline"]) .pos { display: none; }

      /* the line before the first row past "limit" */
      .limit {
        display: flex; align-items: center; gap: var(--b-space-sm, 0.5rem);
        color: var(--b-color-warning); font-size: var(--b-text-xs, 0.6875rem); font-weight: var(--b-font-weight-semibold, 600);
        text-transform: uppercase; letter-spacing: 0.05em;
      }
      .limit::before, .limit::after { content: ""; flex: 1; border-top: 1px dashed currentColor; opacity: 0.5; }
      :host([layout="grid"]) .limit { grid-column: 1 / -1; }
      :host([layout="inline"]) .limit { flex-basis: 100%; }

      /* drop indicator: a bar in the gap where the row will land */
      .drop {
        position: absolute; z-index: 3; pointer-events: none;
        background: var(--b-color-primary); border-radius: var(--b-radius-full, 9999px);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--b-color-primary) 18%, transparent);
      }
      .drop::before, .drop::after { content: ""; position: absolute; width: 8px; height: 8px; border-radius: 50%; background: var(--b-color-primary); }
      .drop.h { height: 3px; }
      .drop.h::before { left: -4px; top: -2.5px; }
      .drop.h::after { right: -4px; top: -2.5px; }
      .drop.v { width: 3px; }
      .drop.v::before { top: -4px; left: -2.5px; }
      .drop.v::after { bottom: -4px; left: -2.5px; }

      .empty {
        padding: var(--b-space-xl, 1.5rem); text-align: center;
        color: var(--b-text-muted); font-size: var(--b-text-sm, 0.8125rem);
        border: 1px dashed var(--b-border-hover); border-radius: var(--b-radius, 0.375rem);
      }
      .scroll[hidden], .empty[hidden] { display: none; }
    `;
  }

  render() {
    const label = this.attr('label');
    const maxHeight = this.lengthAttr('max-height', '');
    const tile = this.lengthAttr('item-min-width', '');
    const vars = `${maxHeight ? `--_max-height:${maxHeight};` : ''}${tile ? `--_tile:${tile};` : ''}`;
    return `
      <div class="scroll" part="scroll"${vars ? ` style="${escapeAttr(vars)}"` : ''}>
        <ol class="items" part="items"${label ? ` aria-label="${escapeAttr(label)}"` : ''}></ol>
      </div>
      <div class="empty" part="empty" hidden><slot name="empty">${escapeHtml(this.label('label-empty', 'bwc.sortable.empty', 'Nothing here yet.'))}</slot></div>
      <span class="sr-only" id="${this.uid}-hint">${escapeHtml(this._t('hint', 'Press Space to pick up and reorder.'))}</span>
      <div class="sr-only live" role="status" aria-live="polite"></div>
    `;
  }

  /** `limit` and `layout` only re-sync the rows: a re-render would rebuild them and drop the focus. */
  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (name === 'limit' || name === 'layout') {
      if (oldValue !== newValue) this._sync();
      return;
    }
    super.attributeChangedCallback(name, oldValue, newValue);
  }

  protected onMount(): void {
    this._observer = new MutationObserver(() => { if (!this._quiet) this._sync(); });
    this._observer.observe(this, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-id', 'data-label', 'label'] });
  }

  protected onUnmount(): void {
    this._observer?.disconnect();
    this._observer = null;
    this._endDrag(true);
  }

  protected onUpdated(): void {
    // A re-render replaced the <ol>, so every row is rebuilt.
    this._rows.clear();
    this._limitLine = null;
    this._sync();
    const ol = this.$<HTMLOListElement>('.items');
    if (!ol) return;
    this.listen<PointerEvent>(ol, 'pointerdown', (e) => this._onPointerDown(e));
    this.listen<PointerEvent>(ol, 'pointermove', (e) => this._onPointerMove(e));
    this.listen<PointerEvent>(ol, 'pointerup', (e) => { if (e.pointerId === this._drag?.pointerId) this._endDrag(false); });
    this.listen<PointerEvent>(ol, 'pointercancel', (e) => { if (e.pointerId === this._drag?.pointerId) this._endDrag(true); });
    this.listen<KeyboardEvent>(ol, 'keydown', (e) => this._onKeyDown(e));
    this.listen<FocusEvent>(ol, 'focusout', () => this._onFocusOut());
    // A touch hold would otherwise open the browser's context menu (Android) mid-drag.
    this.listen<MouseEvent>(ol, 'contextmenu', (e) => { if (this._drag) e.preventDefault(); });
    this.listen<MouseEvent>(ol, 'click', (e) => {
      const btn = (e.target as Element).closest?.('.remove');
      const li = btn?.closest<HTMLLIElement>('li.row');
      if (li) this._remove(li);
    });
    // A row armed for a touch drag must not scroll the page under the finger.
    this.listen<TouchEvent>(this, 'touchmove', (e) => { if (this._drag?.armed) e.preventDefault(); }, { passive: false });
    this.listen<KeyboardEvent>(document, 'keydown', (e) => { if (e.key === 'Escape' && this._drag?.started) this._endDrag(true); });
  }

  // ── public API ──────────────────────────────────────────────────────────────────────────────────────

  /** The row ids, in the shown order. */
  getOrder(): string[] {
    return this._children().map((c) => this._idOf(c));
  }

  /** Replace the rows with `b-sortable-item`s for plain data. Children in `slot="empty"` are kept. */
  setItems(items: readonly SortableItemData[]): void {
    this._mutating(() => {
      for (const c of this._children()) c.remove();
      for (const item of items) {
        const el = document.createElement('b-sortable-item');
        el.dataset.id = item.id;
        el.setAttribute('label', item.label);
        if (item.meta) el.setAttribute('meta', item.meta);
        if (item.image) el.setAttribute('image', item.image);
        this.appendChild(el);
      }
    });
    this._sync();
  }

  /** Scroll the row into view and flash it, e.g. to point at a duplicate the user just tried to add. */
  highlight(id: string): void {
    const li = this._rowById(id);
    if (!li) return;
    li.classList.remove('flash');
    void li.offsetWidth; // restart the animation
    li.classList.add('flash');
    li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // ── rows ────────────────────────────────────────────────────────────────────────────────────────────

  private _t(key: string, fallback: string, params?: Record<string, string | number>): string {
    return this.label(`label-${key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}`, `bwc.sortable.${key}`, fallback, params);
  }

  private _layout(): SortableLayout {
    const l = this.attr('layout');
    return l === 'grid' || l === 'inline' ? l : 'list';
  }

  private _children(): Element[] {
    return Array.from(this.children).filter((c) => c.getAttribute('slot') !== 'empty' && c.localName !== 'template');
  }

  private _idOf(child: Element): string {
    return child.getAttribute('data-id') ?? this._keyOf(child);
  }

  private _labelOf(child: Element): string {
    const explicit = child.getAttribute('data-label') ?? (child.localName === 'b-sortable-item' ? child.getAttribute('label') : null);
    const text = explicit ?? child.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80);
    return text || this._idOf(child);
  }

  private _keyOf(child: Element): string {
    let key = this._keys.get(child);
    if (!key) {
      key = `row-${(BSortableList._seq++).toString(36)}`;
      this._keys.set(child, key);
    }
    return key;
  }

  private _childOf(li: Element): Element | undefined {
    for (const [child, row] of this._rows) if (row === li) return child;
    return undefined;
  }

  private _rowById(id: string): HTMLLIElement | undefined {
    for (const [child, row] of this._rows) if (this._idOf(child) === id) return row;
    return undefined;
  }

  private _makeRow(key: string): HTMLLIElement {
    const li = document.createElement('li');
    li.className = 'row';
    li.setAttribute('part', 'row');
    li.innerHTML = `
      <button type="button" class="handle" part="handle" aria-roledescription="${escapeAttr(this._t('roleDescription', 'sortable item'))}"
              aria-describedby="${this.uid}-hint">${GRIP}</button>
      <span class="pos" aria-hidden="true"></span>
      <div class="content"><slot name="${key}"></slot></div>
      <button type="button" class="remove" part="remove">&times;</button>`;
    return li;
  }

  /**
   * Bring the rows in line with the children: one row per child, in the children's order, with the positions in the
   * handles' names. Keeps focus on a handle the reorder moved.
   */
  private _sync(keepFocus = true): void {
    const ol = this.$<HTMLOListElement>('.items');
    if (!ol) return;
    const focused = keepFocus ? this.shadowRoot?.activeElement as HTMLElement | null : null;
    const kids = this._children();
    const n = kids.length;
    const layout = this._layout();
    const limit = this.numAttr('limit', 0);
    const showLimit = limit > 0 && n > limit;
    const seen = new Set<Element>();
    const cursor: { prev: Node | null } = { prev: null };
    const place = (node: Node) => {
      const want = cursor.prev ? cursor.prev.nextSibling : ol.firstChild;
      if (want !== node) ol.insertBefore(node, want);
      cursor.prev = node;
    };

    this._quiet = true;
    kids.forEach((child, i) => {
      seen.add(child);
      const key = this._keyOf(child);
      if (child.getAttribute('slot') !== key) child.setAttribute('slot', key);
      if (child.localName === 'b-sortable-item' && child.getAttribute('layout') !== layout) child.setAttribute('layout', layout);
      let li = this._rows.get(child);
      if (!li || li.parentNode !== ol) {
        li = this._makeRow(key);
        this._rows.set(child, li);
      }
      const id = this._idOf(child);
      const label = this._labelOf(child);
      li.dataset.id = id;
      li.classList.toggle('beyond', showLimit && i >= limit);
      li.classList.toggle('grabbed', this._grabbed?.id === id);
      const handle = li.querySelector<HTMLButtonElement>('.handle')!;
      handle.setAttribute('aria-label', this._t('handle', '{label}, position {position} of {count}', { label, position: i + 1, count: n }));
      handle.setAttribute('aria-pressed', String(this._grabbed?.id === id));
      li.querySelector('.remove')!.setAttribute('aria-label', this._t('remove', 'Remove {label}', { label }));
      li.querySelector('.pos')!.textContent = String(i + 1);
      if (showLimit && i === limit) {
        if (!this._limitLine) {
          this._limitLine = document.createElement('li');
          this._limitLine.className = 'limit';
          this._limitLine.setAttribute('aria-hidden', 'true');
        }
        this._limitLine.textContent = this._t('limit', 'Only the first {limit} are shown', { limit });
        place(this._limitLine);
      }
      place(li);
    });
    for (const [child, li] of this._rows) {
      if (seen.has(child)) continue;
      li.remove();
      this._rows.delete(child);
    }
    let extra = cursor.prev ? cursor.prev.nextSibling : ol.firstChild;
    while (extra) {
      const next: ChildNode | null = extra.nextSibling;
      extra.remove();
      extra = next;
    }
    this._quiet = false;

    if (focused?.isConnected && this.shadowRoot?.activeElement !== focused) focused.focus({ preventScroll: true });
    this.$('.scroll')!.hidden = n === 0;
    this.$('.empty')!.hidden = n !== 0;
  }

  /** Run a change to the children without the observer re-syncing in the middle of it. */
  private _mutating(fn: () => void): void {
    this._quiet = true;
    try { fn(); } finally {
      this._observer?.takeRecords();
      this._quiet = false;
    }
  }

  /** Move a row's child to index `to` among the rows. */
  private _place(id: string, to: number): void {
    const kids = this._children();
    const child = kids.find((c) => this._idOf(c) === id);
    if (!child) return;
    const rest = kids.filter((c) => c !== child);
    const clamped = Math.max(0, Math.min(rest.length, to));
    const ref = rest[clamped] ?? (rest.length ? rest[rest.length - 1].nextSibling : null);
    this._mutating(() => this.insertBefore(child, ref));
    this._sync();
  }

  private _indexOf(id: string): number {
    return this._children().findIndex((c) => this._idOf(c) === id);
  }

  private _labelById(id: string): string {
    const child = this._children().find((c) => this._idOf(c) === id);
    return child ? this._labelOf(child) : id;
  }

  private _say(text: string): void {
    const live = this.$('.live');
    if (live) live.textContent = '';
    announce(this, text, live);
  }

  private _emitChange(id: string, from: number, to: number, removed = false): void {
    const detail: SortableChangeDetail = { order: this.getOrder(), id, from, to };
    if (removed) detail.removed = true;
    this.emit('change', detail);
  }

  private _remove(li: HTMLLIElement): void {
    const child = this._childOf(li);
    if (!child) return;
    const id = this._idOf(child);
    const label = this._labelOf(child);
    const from = this._indexOf(id);
    const ev = new CustomEvent('remove', { detail: { id }, bubbles: true, composed: true, cancelable: true });
    if (!this.dispatchEvent(ev)) return;
    const kids = this._children();
    const next = kids[from + 1] ?? kids[from - 1];
    this._mutating(() => child.remove());
    this._sync();
    if (next) this._rows.get(next)?.querySelector<HTMLElement>('.handle')?.focus();
    const count = this._children().length;
    this._say(this._t('removed', 'Removed {label}. {count} left.', { label, count }));
    this._emitChange(id, from, -1, true);
  }

  // ── keyboard: pick up, move, drop ───────────────────────────────────────────────────────────────────

  private _onKeyDown(e: KeyboardEvent): void {
    const handle = (e.target as Element).closest?.('.handle');
    const li = handle?.closest<HTMLLIElement>('li.row');
    const id = li?.dataset.id;
    if (!li || !id) return;
    const n = this._children().length;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (this._grabbed?.id === id) { this._drop(); return; }
      if (this._grabbed) this._drop();
      this._grabbed = { id, from: this._indexOf(id) };
      this._sync();
      this._say(this._t('pickedUp', '{label} picked up, position {position} of {count}. Arrow keys move it, Space drops it, Escape cancels.',
        { label: this._labelById(id), position: this._indexOf(id) + 1, count: n }));
      return;
    }
    if (this._grabbed?.id !== id) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // a dialog around the list must not close
      const { from } = this._grabbed;
      this._grabbed = null;
      this._place(id, from);
      this._say(this._t('cancelled', 'Cancelled. {label} is back at position {position} of {count}.',
        { label: this._labelById(id), position: from + 1, count: n }));
      return;
    }
    const layout = this._layout();
    const i = this._indexOf(id);
    const step = layout === 'grid' ? this._columns() : 1;
    const delta: Record<string, number | undefined> = {
      ArrowUp: -step, ArrowDown: step,
      ArrowLeft: layout === 'list' ? undefined : -1, ArrowRight: layout === 'list' ? undefined : 1,
      Home: -i, End: n - 1 - i,
    };
    const d = delta[e.key];
    if (d === undefined) return;
    e.preventDefault();
    const to = Math.max(0, Math.min(n - 1, i + d));
    const label = this._labelById(id);
    if (to === i) {
      this._say(i === 0 ? this._t('first', '{label} is already first.', { label }) : this._t('last', '{label} is already last.', { label }));
      return;
    }
    this._place(id, to);
    this._rowById(id)?.scrollIntoView({ block: 'nearest' });
    this._say(this._t('position', '{label}, position {position} of {count}.', { label, position: to + 1, count: n }));
  }

  /** Tab away while a row is picked up drops it where it is. Our own moves blur the handle too; `_quiet` covers those. */
  private _onFocusOut(): void {
    if (this._quiet || !this._grabbed) return;
    this._drop();
  }

  /** Never moves focus: the row is already where it is dropped, and a Tab away must keep its new target. */
  private _drop(): void {
    const g = this._grabbed;
    if (!g) return;
    this._grabbed = null;
    this._sync(false);
    const to = this._indexOf(g.id);
    const n = this._children().length;
    const label = this._labelById(g.id);
    if (to === g.from) {
      this._say(this._t('unchanged', '{label} dropped, still at position {position} of {count}.', { label, position: to + 1, count: n }));
      return;
    }
    this._say(this._t('dropped', '{label} dropped at position {position} of {count}.', { label, position: to + 1, count: n }));
    this._emitChange(g.id, g.from, to);
  }

  /** Tiles per visual row in `grid`, measured. */
  private _columns(): number {
    const tops = this.$$('li.row').map((el) => Math.round(el.getBoundingClientRect().top));
    return Math.max(1, tops.filter((t) => t === tops[0]).length);
  }

  // ── pointer: mouse, pen, touch ──────────────────────────────────────────────────────────────────────

  private _onPointerDown(e: PointerEvent): void {
    if (e.button !== 0 || this._drag) return;
    const path = e.composedPath();
    const li = path.find((n): n is HTMLLIElement => n instanceof HTMLLIElement && n.classList.contains('row'));
    if (!li?.dataset.id) return;
    const inside = path.slice(0, path.indexOf(li)).filter((n): n is Element => n instanceof Element);
    const onHandle = inside.some((n) => n.classList.contains('handle'));
    if (!onHandle && (this.boolAttr('handle-only') || inside.some((n) => n.matches(INTERACTIVE)))) return;
    if (this._grabbed) this._drop();
    const id = li.dataset.id;
    const drag: Drag = {
      li, id, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY,
      from: this._indexOf(id), to: null, armed: onHandle || e.pointerType !== 'touch', started: false, scroll0: 0,
    };
    this._drag = drag;
    if (drag.armed) {
      e.preventDefault(); // no text selection, no native drag of an image in the row
      li.setPointerCapture(e.pointerId);
      return;
    }
    drag.timer = setTimeout(() => {
      if (this._drag !== drag) return;
      drag.armed = true;
      li.classList.add('pressing');
      try { li.setPointerCapture(drag.pointerId); } catch { /* the pointer is gone */ }
      navigator.vibrate?.(10);
    }, HOLD_MS);
  }

  private _onPointerMove(e: PointerEvent): void {
    const drag = this._drag;
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag.x = e.clientX;
    drag.y = e.clientY;
    const moved = Math.hypot(drag.x - drag.x0, drag.y - drag.y0);
    if (!drag.armed) {
      if (moved > 8) this._endDrag(true); // a swipe: the page scrolls
      return;
    }
    if (!drag.started) {
      if (moved < 4) return;
      drag.started = true;
      drag.li.classList.remove('pressing');
      drag.li.classList.add('dragging');
      drag.bar = document.createElement('div');
      this.$('.scroll')!.appendChild(drag.bar);
      drag.scroller = this._scrollTarget();
      drag.scroll0 = drag.scroller.scrollTop;
      drag.raf = requestAnimationFrame(() => this._autoScroll());
    }
    this._follow();
  }

  private _follow(): void {
    const drag = this._drag;
    if (!drag?.started) return;
    const scrolled = (drag.scroller?.scrollTop ?? 0) - drag.scroll0;
    drag.li.style.transform = `translate(${drag.x - drag.x0}px, ${drag.y - drag.y0 + scrolled}px) scale(1.02)`;
    this._target(drag.x, drag.y);
  }

  /** The list's own scroller when it is capped, else the nearest scrolling ancestor, else the page. */
  private _scrollTarget(): Element {
    const own = this.$('.scroll')!;
    if (own.scrollHeight > own.clientHeight + 1) return own;
    let node: Node | null = this;
    while (node) {
      node = node.parentNode instanceof ShadowRoot ? node.parentNode.host : node.parentNode;
      if (!(node instanceof Element)) break;
      const oy = getComputedStyle(node).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight + 1) return node;
    }
    return document.scrollingElement ?? document.documentElement;
  }

  private _autoScroll(): void {
    const drag = this._drag;
    if (!drag?.started || !drag.scroller) return;
    const sc = drag.scroller;
    const page = sc === document.scrollingElement || sc === document.documentElement;
    const top = page ? 0 : sc.getBoundingClientRect().top;
    const bottom = page ? window.innerHeight : sc.getBoundingClientRect().bottom;
    let v = 0;
    if (drag.y < top + EDGE_PX) v = -Math.ceil((top + EDGE_PX - drag.y) / 4);
    else if (drag.y > bottom - EDGE_PX) v = Math.ceil((drag.y - (bottom - EDGE_PX)) / 4);
    if (v) {
      const before = sc.scrollTop;
      sc.scrollTop += Math.max(-24, Math.min(24, v));
      if (sc.scrollTop !== before) this._follow();
    }
    drag.raf = requestAnimationFrame(() => this._autoScroll());
  }

  /** Where the dragged row would land: an index among the other rows, shown as a bar in the gap there. */
  private _target(x: number, y: number): void {
    const drag = this._drag;
    if (!drag?.bar) return;
    const others = this.$$<HTMLLIElement>('li.row').filter((el) => el !== drag.li).map((el) => el.getBoundingClientRect());
    if (!others.length) { drag.to = 0; drag.bar.className = ''; return; }
    const layout = this._layout();
    let idx: number;
    if (layout === 'list') {
      idx = others.filter((r) => r.top + r.height / 2 < y).length;
    } else {
      let best = 0;
      let bestDist = Infinity;
      others.forEach((r, i) => {
        const d = Math.hypot(r.left + r.width / 2 - x, r.top + r.height / 2 - y);
        if (d < bestDist) { bestDist = d; best = i; }
      });
      const r = others[best];
      idx = x < r.left + r.width / 2 ? best : best + 1;
    }
    drag.to = idx;
    const sc = this.$('.scroll')!;
    const box = sc.getBoundingClientRect();
    const ox = sc.scrollLeft - box.left;
    const oy = sc.scrollTop - box.top;
    const gap = parseFloat(getComputedStyle(this.$('.items')!).rowGap) || 8;
    const before = idx < others.length;
    const a = before ? others[idx] : others[others.length - 1];
    const bar = drag.bar;
    if (layout === 'list') {
      bar.className = 'drop h';
      const top = before ? a.top - gap / 2 : a.bottom + gap / 2;
      Object.assign(bar.style, { left: `${a.left + ox}px`, width: `${a.width}px`, top: `${top + oy - 1.5}px`, height: '' });
    } else {
      bar.className = 'drop v';
      const left = before ? a.left - gap / 2 : a.right + gap / 2;
      Object.assign(bar.style, { top: `${a.top + oy}px`, height: `${a.height}px`, left: `${left + ox - 1.5}px`, width: '' });
    }
  }

  private _endDrag(cancel: boolean): void {
    const drag = this._drag;
    if (!drag) return;
    this._drag = null;
    clearTimeout(drag.timer);
    if (drag.raf) cancelAnimationFrame(drag.raf);
    drag.li.classList.remove('pressing', 'dragging');
    drag.li.style.transform = '';
    drag.bar?.remove();
    if (!drag.started) return;
    // The press that ended the drag is not also a click on the row's content.
    const swallow = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
    this.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => this.removeEventListener('click', swallow, { capture: true }), 0);
    const label = this._labelById(drag.id);
    const n = this._children().length;
    if (cancel || drag.to === null) {
      this._say(this._t('dragCancelled', 'Move cancelled.'));
      return;
    }
    this._place(drag.id, drag.to);
    const to = this._indexOf(drag.id);
    if (to === drag.from) return;
    this._say(this._t('moved', '{label} moved to position {position} of {count}.', { label, position: to + 1, count: n }));
    this._emitChange(drag.id, drag.from, to);
  }
}

define('b-sortable-list', BSortableList);
