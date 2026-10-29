import { FormControlComponent, define } from 'birko-web-core';
import { escapeAttr, escapeHtml, announce } from '../dom-utils';
import { formFieldSheet, formControlSheet, srOnlySheet } from '../shared-styles';
import { renderField, fieldAria } from './label-hint';
import '../data/b-sortable-list.js';
import type { BSortableList, SortableItemData, SortableChangeDetail, SortableLayout } from '../data/b-sortable-list.js';

/** The consumer's search: the items matching a query, usually from the server. */
export type SortablePickerSearch = (query: string) => Promise<readonly SortableItemData[]>;

/** `change` detail: the chosen items, in order. */
export interface SortablePickerChangeDetail {
  name: string;
  value: string[];
  items: SortableItemData[];
}

/** Wait after the last key before searching. */
const DEBOUNCE_MS = 200;

/**
 * Search, pick, reorder: a search box over the consumer's search, and a `b-sortable-list` of what is chosen. A pick
 * goes to the end; picking something already chosen points at it; at `max` a pick is refused with a notice. Its value
 * is the ordered id list, submitted as one form entry per id. Chosen items keep their labels whatever a later search
 * returns, so give the initial ones with labels: `setItems()`.
 */
export class BSortablePicker extends FormControlComponent {
  static get observedAttributes() {
    return ['label', 'name', 'placeholder', 'max', 'layout', 'size', 'max-height', 'error', 'disabled', 'required',
      'hint', 'description', 'bare', 'label-add'];
  }

  static get sharedStyles() { return [formFieldSheet, formControlSheet, srOnlySheet]; }

  private _items: SortableItemData[] = [];
  private _results: SortableItemData[] = [];
  private _active = -1;
  private _open = false;
  private _seq = 0;
  private _timer: ReturnType<typeof setTimeout> | null = null;
  private _search: SortablePickerSearch | null = null;
  /** A message about the last pick (duplicate, full); cleared by the next keystroke. */
  private _note = '';

  static get styles() {
    return `
      :host { display: block; position: relative; }
      .picker { display: grid; gap: var(--b-space-sm, 0.5rem); }
      .search { display: flex; gap: var(--b-space-sm, 0.5rem); }
      .search-box { position: relative; flex: 1; min-width: 0; }
      .search-box svg {
        position: absolute; left: 0.65rem; top: 50%; transform: translateY(-50%);
        width: 0.9rem; height: 0.9rem; color: var(--b-text-muted); pointer-events: none;
      }
      .search-box input { padding-left: 2rem; }

      /* Add: the same height as the search input beside it, at every size. */
      .add {
        flex: none; box-sizing: border-box; min-height: var(--b-control-min-height, 2.375rem);
        padding: 0 var(--b-space-lg, 1rem); border: var(--b-border-width, 1px) solid var(--b-color-primary);
        border-radius: var(--b-radius, 0.375rem); background: var(--b-color-primary);
        color: var(--b-text-on-primary, var(--b-text-inverse)); font: inherit; font-size: var(--b-text-sm, 0.8125rem);
        font-weight: var(--b-font-weight-medium, 500); cursor: pointer;
        transition: background var(--b-transition), opacity var(--b-transition);
      }
      .add:hover:not(:disabled) { background: var(--b-color-primary-hover); }
      .add:focus-visible { outline: none; box-shadow: var(--b-focus-ring); }
      .add:disabled { opacity: var(--b-disabled-opacity, 0.5); cursor: not-allowed; }
      :host([size="sm"]) .add { min-height: var(--b-control-min-height-sm, 1.75rem); padding: 0 var(--b-space-md, 0.75rem); font-size: var(--b-text-xs, 0.6875rem); }
      :host([size="lg"]) .add { min-height: var(--b-control-min-height-lg, 2.75rem); font-size: var(--b-text-base, 0.875rem); }

      .results {
        display: none; position: fixed; inset: auto; margin: 0; z-index: 9999; box-sizing: border-box;
        padding: var(--b-space-xs, 0.25rem); max-height: 16rem; overflow-y: auto;
        background: var(--b-bg-elevated); color: var(--b-text);
        border: var(--b-border-width, 1px) solid var(--b-border); border-radius: var(--b-radius, 0.375rem);
        box-shadow: var(--b-shadow-lg);
      }
      .results:popover-open { display: block; }
      .option {
        display: flex; align-items: center; gap: var(--b-space-sm, 0.5rem);
        padding: var(--b-space-xs, 0.25rem) var(--b-space-sm, 0.5rem); border-radius: var(--b-radius-sm, 0.25rem); cursor: pointer;
      }
      .option[aria-selected="true"] { background: color-mix(in srgb, var(--b-color-primary) 10%, transparent); }
      .option img { flex: none; width: 1.75rem; height: 1.75rem; object-fit: cover; border-radius: var(--b-radius-sm, 0.25rem); }
      .option .text { flex: 1; min-width: 0; display: grid; }
      .option .label, .option .meta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .option .meta { color: var(--b-text-muted); font-size: var(--b-text-xs, 0.6875rem); }
      .option .chosen { flex: none; color: var(--b-color-success); font-size: var(--b-text-xs, 0.6875rem); font-weight: var(--b-font-weight-semibold, 600); }
      .status { padding: var(--b-space-sm, 0.5rem); text-align: center; color: var(--b-text-muted); font-size: var(--b-text-sm, 0.8125rem); }

      .head { display: flex; justify-content: flex-end; }
      .count { color: var(--b-text-muted); font-size: var(--b-text-xs, 0.6875rem); font-variant-numeric: tabular-nums; }
      .count.full { color: var(--b-color-warning); font-weight: var(--b-font-weight-semibold, 600); }
      .notice {
        padding: var(--b-space-sm, 0.5rem) var(--b-space-md, 0.75rem); border-radius: var(--b-radius, 0.375rem);
        font-size: var(--b-text-sm, 0.8125rem); color: var(--b-text);
        background: color-mix(in srgb, var(--b-color-warning) 10%, var(--b-bg));
        border: var(--b-border-width, 1px) solid color-mix(in srgb, var(--b-color-warning) 40%, transparent);
      }
      .notice:empty { display: none; }
      :host([disabled]) b-sortable-list { opacity: var(--b-disabled-opacity, 0.5); }
    `;
  }

  render() {
    const label = this.attr('label');
    const error = this.attr('error');
    const description = this.attr('description');
    const required = this.boolAttr('required');
    const bare = this.boolAttr('bare');
    const disabled = this.boolAttr('disabled');
    const layout = this.attr('layout', 'list');
    const size = this.attr('size');
    const placeholder = this.attr('placeholder') || this._t('placeholder', 'Search to add…');
    const max = this._max();
    return renderField({
      bare, uid: this.uid, label, hint: this.attr('hint'), description, error, required,
      control: `
        <div class="picker">
          <div class="search">
            <div class="search-box">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/></svg>
              <input type="text" role="combobox" autocomplete="off" aria-autocomplete="list" aria-expanded="false"
                     aria-controls="${this.uid}-results" placeholder="${escapeAttr(placeholder)}" ${disabled ? 'disabled' : ''}
                     ${fieldAria({ uid: this.uid, error, description, required, bare, label })}>
            </div>
            <button type="button" class="add" disabled>${escapeHtml(this.label('label-add', 'bwc.sortablePicker.add', 'Add'))}</button>
            <div class="results" popover="manual" role="listbox" id="${this.uid}-results"
                 aria-label="${escapeAttr(this._t('results', 'Search results'))}"></div>
          </div>
          ${max ? '<div class="head"><span class="count" aria-hidden="true"></span></div>' : ''}
          <div class="notice" role="status" aria-live="polite"></div>
          <b-sortable-list removable numbered layout="${escapeAttr(layout)}"${size ? ` size="${escapeAttr(size)}"` : ''}
                           max-height="${escapeAttr(this.attr('max-height', '20rem'))}"
                           ${label ? `label="${escapeAttr(label)}"` : ''} ${disabled ? 'inert' : ''}></b-sortable-list>
          <div class="sr-only live" aria-live="polite"></div>
        </div>`,
    });
  }

  protected onUpdated(): void {
    const input = this.$<HTMLInputElement>('input');
    const add = this.$<HTMLButtonElement>('.add');
    const results = this.$<HTMLElement>('.results');
    const list = this._list();
    // A re-render rebuilt the list empty; give it the chosen items again.
    if (list && list.getOrder().join('\n') !== this._ids().join('\n')) list.setItems(this._items);
    this._refresh();
    this.syncFormState();
    if (!input || !add || !results || !list) return;

    this.listen(input, 'input', () => this._onInput(input.value));
    this.listen<KeyboardEvent>(input, 'keydown', (e) => this._onKeyDown(e));
    this.listen(input, 'focus', () => { if (input.value.trim() && this._results.length) this._openResults(); });
    this.listen(input, 'blur', () => this._closeResults());
    // Keep focus in the input while a result is clicked.
    this.listen(results, 'pointerdown', (e) => e.preventDefault());
    this.listen<MouseEvent>(results, 'click', (e) => {
      const opt = (e.target as Element).closest<HTMLElement>('.option');
      if (opt) this._pick(this._results[Number(opt.dataset.i)]);
    });
    this.listen(add, 'click', () => {
      if (this._active >= 0) this._pick(this._results[this._active]);
      input.focus();
    });
    // The list's own events stop here: this control reports one change, with its own detail.
    this.listen<CustomEvent<SortableChangeDetail>>(list, 'change', (e) => {
      e.stopPropagation();
      const byId = new Map(this._items.map((it) => [it.id, it]));
      this._items = e.detail.order.flatMap((id) => byId.get(id) ?? []);
      this._note = '';
      this._emitChange();
    });
    this.listen(list, 'remove', (e) => e.stopPropagation());
  }

  protected onUnmount(): void {
    if (this._timer) clearTimeout(this._timer);
    this._timer = null;
    this._seq++; // an answer still on its way is dropped
    this._closeResults();
  }

  // ── public API ──────────────────────────────────────────────────────────────────────────────────────

  /** The consumer's search. Called with the trimmed query after a short pause in typing. */
  setSearch(search: SortablePickerSearch | null): void {
    this._search = search;
  }

  /** Set the chosen items, with their labels. Emits no `change`. */
  setItems(items: readonly SortableItemData[]): void {
    const seen = new Set<string>();
    this._items = items.filter((it) => !seen.has(it.id) && seen.add(it.id)).map((it) => ({ ...it }));
    this._list()?.setItems(this._items);
    this._note = '';
    this._refresh();
    this.syncFormState();
  }

  /** The chosen items, in order. */
  getItems(): SortableItemData[] {
    return this._items.map((it) => ({ ...it }));
  }

  /** The chosen ids, comma-joined. Prefer `getItems()`; an id set here without `setItems()` shows as its own label. */
  get value(): string { return this._ids().join(','); }
  set value(v: string) {
    const byId = new Map(this._items.map((it) => [it.id, it]));
    this.setItems((v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []).map((id) => byId.get(id) ?? { id, label: id }));
  }

  // ── form association ────────────────────────────────────────────────────────────────────────────────

  /** One entry per chosen id, in order, like `b-tag-input`. */
  protected formValue(): FormData | null {
    return this.multiFormValue(this._ids());
  }

  protected captureInitialState(): unknown {
    return this.getItems();
  }

  protected restoreInitialState(state: unknown): void {
    this.setItems(Array.isArray(state) ? state as SortableItemData[] : []);
  }

  /** The inner input is the search query, not the value. */
  protected validationSource(): undefined {
    return undefined;
  }

  protected formAnchor(): HTMLElement | undefined {
    return this.$<HTMLElement>('.search-box') ?? undefined;
  }

  // ── internals ───────────────────────────────────────────────────────────────────────────────────────

  private _t(key: string, fallback: string, params?: Record<string, string | number>): string {
    return this.label(`label-${key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}`, `bwc.sortablePicker.${key}`, fallback, params);
  }

  private _list(): BSortableList | null {
    return this.$<HTMLElement>('b-sortable-list') as BSortableList | null;
  }

  private _ids(): string[] {
    return this._items.map((it) => it.id);
  }

  private _max(): number {
    const max = this.numAttr('max', 0);
    return Number.isFinite(max) && max > 0 ? Math.floor(max) : 0;
  }

  private _layout(): SortableLayout {
    const l = this.attr('layout');
    return l === 'grid' || l === 'inline' ? l : 'list';
  }

  /** Count, the over-limit line and notice, and the Add button. No re-render. */
  private _refresh(): void {
    const max = this._max();
    const n = this._items.length;
    const over = max > 0 && n > max;
    const count = this.$('.count');
    if (count) {
      count.textContent = this._t('count', '{count} of {max}', { count: n, max });
      count.classList.toggle('full', n >= max);
    }
    const list = this._list();
    if (list) {
      if (over) list.setAttribute('limit', String(max));
      else list.removeAttribute('limit');
      if (list.getAttribute('layout') !== this._layout()) list.setAttribute('layout', this._layout());
    }
    const notice = this.$('.notice');
    if (notice) {
      notice.textContent = this._note || (over
        ? this._t('over', 'Only the first {max} are used. Remove the rest, or drag the ones you want above the line.', { max, extra: n - max })
        : '');
    }
    const add = this.$<HTMLButtonElement>('.add');
    if (add) add.disabled = this.boolAttr('disabled') || this._active < 0;
  }

  private _say(text: string): void {
    const live = this.$('.live');
    if (live) live.textContent = '';
    announce(this, text, live);
  }

  private _onInput(raw: string): void {
    const query = raw.trim();
    const mine = ++this._seq;
    this._note = '';
    if (this._timer) clearTimeout(this._timer);
    // The results on screen answer the previous query: nothing is picked from them by Enter or Add meanwhile.
    this._active = -1;
    if (this._results.length) this._renderResults();
    this._refresh();
    if (!query) {
      this._results = [];
      this._closeResults();
      return;
    }
    this._timer = setTimeout(async () => {
      this._timer = null;
      if (!this._search || !this.isConnected) return;
      this._renderStatus(this._t('searching', 'Searching…'));
      this._openResults();
      let found: readonly SortableItemData[];
      try {
        found = await this._search(query);
      } catch (err) {
        if (mine !== this._seq) return;
        console.error('b-sortable-picker: search threw', err);
        this._results = [];
        this._active = -1;
        this._renderStatus(this._t('searchFailed', 'The search failed. Try again.'));
        this._refresh();
        return;
      }
      if (mine !== this._seq || !this.isConnected) return; // a newer query is on its way, or the control is gone
      this._results = [...found];
      this._active = this._results.length ? 0 : -1;
      this._renderResults(query);
      this._refresh();
    }, DEBOUNCE_MS);
  }

  private _onKeyDown(e: KeyboardEvent): void {
    const n = this._results.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!n) return;
      e.preventDefault();
      if (!this._open) this._openResults();
      this._active = (this._active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
      this._renderResults();
      this._refresh();
    } else if (e.key === 'Enter') {
      if (this._open && this._active >= 0) {
        e.preventDefault();
        this._pick(this._results[this._active]);
      }
    } else if (e.key === 'Escape' && this._open) {
      e.preventDefault();
      e.stopPropagation(); // close the results, not a dialog around the control
      this._closeResults();
    }
  }

  private _renderStatus(text: string): void {
    const results = this.$('.results');
    if (results) results.innerHTML = `<div class="status" role="option" aria-disabled="true">${escapeHtml(text)}</div>`;
    this.$('input')?.removeAttribute('aria-activedescendant');
  }

  private _renderResults(query = this.$<HTMLInputElement>('input')?.value.trim() ?? ''): void {
    const results = this.$('.results');
    const input = this.$('input');
    if (!results || !input) return;
    if (!this._results.length) {
      this._renderStatus(this._t('noResults', 'Nothing matches “{query}”.', { query }));
      return;
    }
    results.innerHTML = this._results.map((r, i) => {
      const at = this._items.findIndex((it) => it.id === r.id);
      return `<div class="option" role="option" id="${this.uid}-opt-${i}" data-i="${i}" aria-selected="${i === this._active}">
          ${r.image ? `<img src="${escapeAttr(r.image)}" alt="" draggable="false">` : ''}
          <span class="text"><span class="label">${escapeHtml(r.label)}</span>${r.meta ? `<span class="meta">${escapeHtml(r.meta)}</span>` : ''}</span>
          ${at >= 0 ? `<span class="chosen">${escapeHtml(this._t('inList', 'In the list, #{position}', { position: at + 1 }))}</span>` : ''}
        </div>`;
    }).join('');
    if (this._active >= 0) {
      input.setAttribute('aria-activedescendant', `${this.uid}-opt-${this._active}`);
      this.$(`#${this.uid}-opt-${this._active}`)?.scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  private _openResults(): void {
    const results = this.$<HTMLElement>('.results');
    const box = this.$<HTMLElement>('.search-box');
    const input = this.$('input');
    if (!results || !box || !input) return;
    const rect = box.getBoundingClientRect();
    const gap = 4;
    results.style.left = `${rect.left}px`;
    results.style.width = `${rect.width}px`;
    const below = window.innerHeight - rect.bottom;
    if (below < 200 && rect.top > below) {
      results.style.top = '';
      results.style.bottom = `${window.innerHeight - rect.top + gap}px`;
    } else {
      results.style.bottom = '';
      results.style.top = `${rect.bottom + gap}px`;
    }
    if (!results.matches(':popover-open')) results.showPopover();
    this._open = true;
    input.setAttribute('aria-expanded', 'true');
  }

  private _closeResults(): void {
    const results = this.$<HTMLElement>('.results');
    if (results?.matches(':popover-open')) results.hidePopover();
    this._open = false;
    const input = this.$('input');
    input?.setAttribute('aria-expanded', 'false');
    input?.removeAttribute('aria-activedescendant');
  }

  private _pick(item: SortableItemData | undefined): void {
    if (!item) return;
    const at = this._items.findIndex((it) => it.id === item.id);
    const max = this._max();
    if (at >= 0) {
      this._note = this._t('duplicate', '{label} is already in the list, at position {position}.', { label: this._items[at].label, position: at + 1 });
      this._list()?.highlight(item.id);
      this.emit('reject', { item, reason: 'duplicate' });
    } else if (max > 0 && this._items.length >= max) {
      this._note = this._t('full', 'The list holds {max}. Remove one to add {label}.', { max, label: item.label });
      this.emit('reject', { item, reason: 'max' });
    } else {
      this._note = '';
      this._items.push({ ...item });
      this._list()?.setItems(this._items);
      this._say(this._t('added', 'Added {label}, position {position} of {count}.',
        { label: item.label, position: this._items.length, count: this._items.length }));
      this._emitChange();
    }
    this._refresh();
    this._renderResults();
  }

  private _emitChange(): void {
    this._refresh();
    const detail: SortablePickerChangeDetail = { name: this.attr('name'), value: this._ids(), items: this.getItems() };
    this.emit('change', detail);
    this.syncFormState();
  }
}

define('b-sortable-picker', BSortablePicker);
