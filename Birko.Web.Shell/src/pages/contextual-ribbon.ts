import type { RibbonContextualSet, RibbonTab } from 'birko-web-components';

/**
 * A page's contextual ribbon tab for the record it shows (TASK-804): Office's "Table Design", for an order or an
 * invoice. `tabs` belong to `set`; their `contextualSet` is filled in by the shell.
 */
export interface ContextualRibbon {
  set: RibbonContextualSet;
  tabs: RibbonTab[];
  /**
   * Whether raising it for a new record also OPENS its first tab. Default true (Symbio's ruling, 2026-11-02); false is
   * Office's "show it, the user opens it".
   */
  open?: boolean;
}

/** What the shell hands back to the page that raised a contextual tab: the page keeps it to update and clear it. */
export interface ContextualRibbonHandle {
  update(ribbon: ContextualRibbon, select: boolean): void;
  clear(): void;
}

/** Detail of {@link CONTEXTUAL_RIBBON_EVENT}. The shell sets `handle` while the event is dispatched. */
export interface ContextualRibbonRequest {
  owner: HTMLElement;
  ribbon: ContextualRibbon;
  select: boolean;
  onAction(itemId: string): void;
  handle?: ContextualRibbonHandle;
}

/** Bubbles from a page to `b-app-shell`, which answers by setting `detail.handle`. */
export const CONTEXTUAL_RIBBON_EVENT = 'ribbon-contextual';

/**
 * Keeps one page's contextual tab in the shell, for BaseSplitPage and BaseDetailPage.
 *
 * The page talks to the shell once by event and then through the handle, because clearing must work when the page is
 * leaving: by `onUnmount` the page is out of the DOM and an event from it reaches nobody.
 */
export class ContextualRibbonLink<T> {
  private _handle: ContextualRibbonHandle | null = null;
  private _raisedFor: string | null = null;
  private _record: T | null = null;

  constructor(
    private readonly _owner: HTMLElement,
    private readonly _build: (record: T) => ContextualRibbon | null,
    private readonly _act: (itemId: string, record: T) => void,
  ) {}

  /** Raises (or updates) the tab for `record`, identified by `key`; a new key opens it unless the ribbon says not. */
  raise(record: T, key: string): void {
    const ribbon = this._build(record);
    if (!ribbon) { this.clear(); return; }
    const select = key !== this._raisedFor && (ribbon.open ?? true);
    this._record = record;
    this._raisedFor = key;
    if (this._handle) { this._handle.update(ribbon, select); return; }
    const detail: ContextualRibbonRequest = {
      owner: this._owner,
      ribbon,
      select,
      onAction: (itemId) => { if (this._record) this._act(itemId, this._record); },
    };
    this._owner.dispatchEvent(new CustomEvent(CONTEXTUAL_RIBBON_EVENT, { detail, bubbles: true, composed: true }));
    this._handle = detail.handle ?? null; // no shell with a ribbon above: nothing to keep
  }

  clear(): void {
    this._handle?.clear();
    this._handle = null;
    this._raisedFor = null;
    this._record = null;
  }
}
