import { BaseComponent, define } from 'birko-web-core';
import { escapeHtml, escapeAttr } from '../dom-utils';
import { srOnlySheet } from '../shared-styles';

/** A lane inside a column (TASK-948, FEATURE-022 D5). */
export interface KanbanLane {
  id: string;
  label: string;
  color?: string;
}

export interface KanbanColumn {
  id: string;
  label: string;
  color?: string;
  collapsed?: boolean;
  maxCards?: number;
  /**
   * A person cannot move a card into or out of this column, by mouse or keyboard (TASK-947). The app's own
   * `moveCard()` still can: locks govern people, not code.
   */
  locked?: boolean;
  /** Lanes stacked inside this column, each with its own label, count and drop area (TASK-948). */
  lanes?: KanbanLane[];
  /** Where a card with no lane, or a lane this column does not have, shows; else the first lane (D14). */
  defaultLane?: string;
  /**
   * `false` turns reordering off (TASK-949, D7): cards keep the app's `order`, a card dropped in takes its place by
   * its own `order`, and a drag within the same lane changes nothing. Default `true`.
   */
  sortable?: boolean;
}

export interface KanbanCard {
  id: string;
  columnId: string;
  title: string;
  order?: number;
  color?: string;
  metadata?: Record<string, unknown>;
  parentId?: string;
  collapsed?: boolean;
  children?: KanbanCard[];
  /** The lane this card is in, in a column with lanes (TASK-948). Sub-cards follow their parent's lane. */
  laneId?: string;
}

/** A move a person is making: what `canMove` is asked and what `card-move-request` carries (TASK-947). */
export interface KanbanMove {
  card: KanbanCard;
  fromColumn: string;
  toColumn: string;
  fromIndex: number;
  /** Position among the target siblings; omitted when the card goes to the end. */
  toIndex?: number;
  fromParent?: string;
  toParent?: string;
  /** Set when the column the card leaves has lanes (TASK-948). */
  fromLane?: string;
  /** Set when the column the card enters has lanes (TASK-948). */
  toLane?: string;
}

export interface KanbanConfig {
  columns: KanbanColumn[];
  cards: KanbanCard[];
  renderCard?: (card: KanbanCard, depth: number) => string;
  emptyText?: string;
  maxNestingDepth?: number;
  /**
   * Asked before every move a person makes, after the column locks. `false` refuses it; a string refuses it and is
   * the reason shown and announced. Not asked for the app's own `moveCard()` (TASK-947).
   */
  canMove?: (move: KanbanMove) => boolean | string;
  /**
   * Lanes for the whole board (TASK-956, D15): every column without its own `lanes` uses them; `lanes: []` on a
   * column opts it out. In rows mode they are the rows.
   */
  lanes?: KanbanLane[];
  /** The board's default lane, after a column's own `defaultLane` (D14). */
  defaultLane?: string;
  /** How lanes are shown (D16): `'sections'` inside each column (default), `'rows'` across the board, or `'tags'`. */
  laneLayout?: 'sections' | 'rows' | 'tags';
  /**
   * Stack the columns one under another, with no sideways scrolling, while the board's own width is below this CSS
   * length (TASK-950, D6/D20), e.g. `'44rem'`. Without it the board never stacks. A rows board shows sections while
   * stacked (D19).
   */
  stackBelow?: string;
}

export class BKanban extends BaseComponent {
  static get observedAttributes() {
    return ['empty-text', 'disabled'];
  }

  static get styles() {
    return `
      :host { display: block; }

      .board {
        display: flex;
        gap: var(--b-space-md, 0.75rem);
        overflow-x: auto;
        padding: var(--b-space-sm, 0.5rem) 0;
        align-items: flex-start;
      }

      .column {
        display: flex;
        flex-direction: column;
        min-width: var(--b-kanban-col-min-width, 16rem);
        max-width: var(--b-kanban-col-max-width, 22rem);
        flex: 1 0 var(--b-kanban-col-min-width, 16rem);
        background: var(--b-bg-secondary);
        border-radius: var(--b-radius, 0.375rem);
        border: var(--b-border-width, 1px) solid var(--b-border);
      }

      .column.drop-refused .column-body { cursor: not-allowed; outline: 2px dashed var(--b-color-danger-text); outline-offset: -2px; }
      :host([stacked]) .board { flex-direction: column; overflow-x: visible; align-items: stretch; }
      :host([stacked]) .board > .column { min-width: 0; max-width: none; flex: 0 0 auto; width: 100%; box-sizing: border-box; }
      .board.rows-board { display: grid; align-items: stretch; gap: var(--b-space-xs, 0.25rem); }
      .rows-board .column { min-width: 0; max-width: none; flex: none; }
      .rows-board .rows-colhead { border: var(--b-border-width, 1px) solid var(--b-border); border-radius: var(--b-radius, 0.375rem);
        background: var(--b-bg-secondary); }
      .rows-board .row-header { align-self: stretch; border: var(--b-border-width, 1px) solid var(--b-border);
        border-radius: var(--b-radius, 0.375rem); background: var(--b-bg-secondary); }
      .rows-board .column-body { min-height: 3rem; height: 100%; }
      .lanes { display: flex; flex-direction: column; gap: var(--b-space-xs, 0.25rem); padding: var(--b-space-xs, 0.25rem); }
      .lane { border: var(--b-border-width, 1px) solid var(--b-border); border-radius: var(--b-radius, 0.375rem); background: var(--b-bg); }
      .lane-header { display: flex; align-items: center; gap: var(--b-space-xs, 0.25rem); padding: var(--b-space-xs, 0.25rem) var(--b-space-sm, 0.5rem);
        font-size: var(--b-text-xs, 0.6875rem); font-weight: var(--b-font-weight-semibold, 600); color: var(--b-text-secondary); user-select: none; }
      .lane-dot { width: 0.5rem; height: 0.5rem; border-radius: 50%; background: var(--b-border); flex-shrink: 0; }
      .lane-title { flex: 1; }
      .lane-count { font-weight: var(--b-font-weight-medium, 500); color: var(--b-text-muted); }
      .lane .column-body { min-height: 2.5rem; }
      .lane-tag { display: inline-flex; align-items: center; gap: 0.25rem; margin-top: var(--b-space-xs, 0.25rem);
        padding: 0 var(--b-space-sm, 0.5rem); border: var(--b-border-width, 1px) solid var(--b-border); border-radius: 999px;
        background: var(--b-bg-secondary); color: var(--b-text-secondary); font: inherit; font-size: var(--b-text-xs, 0.6875rem); cursor: pointer; }
      .lane-tag:hover { border-color: var(--b-color-primary); }
      .lane-tag:focus-visible { box-shadow: var(--b-focus-ring); outline: none; }
      .lane-menu { position: fixed; z-index: 1000; display: flex; flex-direction: column; min-width: 9rem; padding: var(--b-space-xs, 0.25rem);
        background: var(--b-bg-elevated, var(--b-bg)); border: var(--b-border-width, 1px) solid var(--b-border);
        border-radius: var(--b-radius, 0.375rem); box-shadow: var(--b-shadow-md); }
      .lane-menu [role="menuitemradio"] { display: flex; align-items: center; gap: 0.375rem; padding: 0.25rem var(--b-space-sm, 0.5rem);
        border: 0; background: none; color: var(--b-text); font: inherit; font-size: var(--b-text-sm, 0.8125rem); text-align: left;
        border-radius: var(--b-radius-sm, 0.25rem); cursor: pointer; }
      .lane-menu [role="menuitemradio"]:hover, .lane-menu [role="menuitemradio"]:focus-visible { background: var(--b-bg-tertiary); outline: none; }
      .lane-menu [aria-checked="true"] { font-weight: var(--b-font-weight-semibold, 600); }
      .column-lock { display: inline-flex; align-items: center; gap: 0.25rem; font-weight: var(--b-font-weight-medium, 500);
        font-size: var(--b-text-xs, 0.6875rem); color: var(--b-text-muted); margin-left: auto; margin-right: var(--b-space-sm, 0.5rem); }
      .card[draggable="false"] { cursor: default; }
      .column-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--b-space-sm, 0.5rem) var(--b-space-md, 0.75rem);
        font-weight: var(--b-font-weight-semibold, 600);
        font-size: var(--b-text-sm, 0.8125rem);
        border-bottom: var(--b-border-width, 1px) solid var(--b-border);
        color: var(--b-text);
        user-select: none;
      }
      .column-count {
        font-size: var(--b-text-xs, 0.6875rem);
        font-weight: var(--b-font-weight-medium, 500);
        color: var(--b-text-muted);
        background: var(--b-bg-tertiary);
        padding: 0.0625rem var(--b-space-sm, 0.5rem);
        border-radius: var(--b-radius-full, 9999px);
        min-width: 1.25rem;
        text-align: center;
      }

      .column-body {
        flex: 1;
        padding: var(--b-space-xs, 0.25rem);
        min-height: 4rem;
        display: flex;
        flex-direction: column;
        gap: var(--b-space-xs, 0.25rem);
      }

      .column-footer {
        padding: var(--b-space-xs, 0.25rem) var(--b-space-sm, 0.5rem);
        border-top: var(--b-border-width, 1px) solid var(--b-border);
        font-size: var(--b-text-xs, 0.6875rem);
        color: var(--b-text-muted);
        text-align: center;
      }

      .card {
        padding: var(--b-space-sm, 0.5rem) var(--b-space-md, 0.75rem);
        background: var(--b-bg);
        border: var(--b-border-width, 1px) solid var(--b-border);
        border-radius: var(--b-radius, 0.375rem);
        cursor: grab;
        font-size: var(--b-text-sm, 0.8125rem);
        color: var(--b-text);
        transition: box-shadow var(--b-transition, 150ms ease), transform var(--b-transition, 150ms ease);
        user-select: none;
      }
      .card:hover { box-shadow: var(--b-shadow-md); }
      .card:focus-visible { box-shadow: var(--b-focus-ring); outline: none; }
      .card.dragging { opacity: 0.4; cursor: grabbing; }
      .card.keyboard-dragging {
        box-shadow: var(--b-focus-ring);
        outline: 2px dashed var(--b-color-primary);
        outline-offset: 2px;
      }
      .card.drop-before { border-top: 2px solid var(--b-color-primary); margin-top: -2px; }
      .card.drop-after { border-bottom: 2px solid var(--b-color-primary); margin-bottom: -2px; }
      .card.drop-inside {
        outline: 2px solid var(--b-color-primary);
        outline-offset: -2px;
        background: var(--b-color-primary-light);
      }
      .column-body.drag-over { background: var(--b-bg-tertiary); }

      .card-header {
        display: flex;
        align-items: center;
        gap: var(--b-space-xs, 0.25rem);
      }

      .card-title { font-weight: var(--b-font-weight-medium, 500); flex: 1; }

      .card-toggle {
        width: var(--b-icon-base, 1rem);
        height: var(--b-icon-base, 1rem);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: none;
        background: none;
        padding: 0;
        cursor: pointer;
        font-size: 0.5rem;
        color: var(--b-text-muted);
        transition: transform var(--b-transition, 150ms ease);
        border-radius: var(--b-radius-sm, 0.25rem);
        flex-shrink: 0;
      }
      .card-toggle:hover { color: var(--b-text); background: var(--b-bg-secondary); }
      .card-toggle.expanded { transform: rotate(90deg); }

      .card-toggle-spacer {
        width: var(--b-icon-base, 1rem);
        flex-shrink: 0;
      }

      .card-child-count {
        font-size: var(--b-text-xs, 0.6875rem);
        font-weight: var(--b-font-weight-medium, 500);
        color: var(--b-text-muted);
        background: var(--b-bg-tertiary);
        padding: 0 var(--b-space-xs, 0.25rem);
        border-radius: var(--b-radius-full, 9999px);
        min-width: 1.125rem;
        text-align: center;
        line-height: 1.25;
        margin-left: var(--b-space-xs, 0.25rem);
      }

      .card-children {
        margin: 0;
        padding: var(--b-space-xs, 0.25rem) 0 0 var(--b-space-md, 0.75rem);
        display: flex;
        flex-direction: column;
        gap: var(--b-space-xs, 0.25rem);
        border-left: var(--b-border-width, 1px) dashed var(--b-border);
        margin-left: var(--b-space-sm, 0.5rem);
        padding-left: var(--b-space-sm, 0.5rem);
      }
      .card-children.collapsed { display: none; }

      .empty-placeholder {
        padding: var(--b-space-lg, 1rem);
        text-align: center;
        color: var(--b-text-muted);
        font-size: var(--b-text-xs, 0.6875rem);
        font-style: italic;
      }
    `;
  }

  static get sharedStyles() {
    return [srOnlySheet];
  }

  private _columns: KanbanColumn[] = [];
  private _cards: KanbanCard[] = [];
  private _config: KanbanConfig | null = null;
  private _renderCardFn: ((card: KanbanCard, depth: number) => string) | null = null;
  private _expanded = new Set<string>();

  // Drag state
  private _dragCardId: string | null = null;
  private _dragSourceColumnId: string | null = null;
  private _dragSourceIndex = -1;

  // Keyboard drag state
  private _keyboardDragging = false;
  private _keyboardDragCardId: string | null = null;
  private _keyboardDragColumnId: string | null = null;
  private _keyboardDragIndex = -1;
  private _keyboardDragLaneId = '';

  // Live region text
  private _liveText = '';

  // Where each card's last move by a person took it from, for revertMove (TASK-947).
  private _lastMoves = new Map<string, { columnId: string; parentId: string; index: number; laneId: string }>();
  // The column a refusal was last announced for during the current drag, so dragover does not repeat it.
  private _refusedSaidFor: string | null = null;
  // Roving tabindex (TASK-955): the one card Tab lands on — the card last focused, else the first card.
  private _tabStopId: string | null = null;
  private _renderStop: string | null = null;
  // A pointer went down on a control inside a card: the drag that may follow from the card must not start (TASK-946).
  private _noDragFromControl = false;
  // Stacked layout (TASK-950): whether the board is below `stackBelow`, and what watches its width.
  private _stacked = false;
  private _resizeObserver: ResizeObserver | null = null;

  render() {
    if (!this._columns.length) {
      return '<div class="empty-placeholder">No columns configured</div>';
    }

    const emptyText = this.attr('empty-text', 'No cards');
    this._renderStop = this._currentTabStop();

    const columnsHtml = this._columns.map(col => {
      const cards = this._getOrderedCards(col.id);
      const topLevelCards = cards.filter(c => !c.parentId);
      const totalCount = this._countAllCards(cards);
      const cardsHtml = topLevelCards.length
        ? topLevelCards.map((card, idx) => this._renderCard(card, col.id, idx, 0)).join('')
        : `<div class="empty-placeholder">${escapeHtml(emptyText)}</div>`;

      const lanes = this._laneLayout() === 'tags' ? [] : this._lanesOf(col.id);
      const shown = this._laneLayout() === 'tags' ? this._cardsInDisplayOrder(col.id) : topLevelCards;
      const listHtml = shown.length
        ? shown.map((card, idx) => this._renderCard(card, col.id, idx, 0)).join('')
        : `<div class="empty-placeholder">${escapeHtml(emptyText)}</div>`;
      const bodyHtml = lanes.length
        ? `<div class="lanes">${lanes.map(lane => {
            const laneCards = this._getOrderedCards(col.id, '', lane.id);
            const laneCount = this._countAllCards(this._cards.filter(c => c.columnId === col.id && this._laneOf(c) === lane.id));
            const dot = lane.color ? ` style="background:${escapeAttr(lane.color)}"` : '';
            return `<div class="lane" data-lane-id="${escapeAttr(lane.id)}">
              <div class="lane-header"><span class="lane-dot" aria-hidden="true"${dot}></span><span class="lane-title">${escapeHtml(lane.label)}</span><span class="lane-count">${laneCount}</span></div>
              <div class="column-body" data-column-id="${escapeAttr(col.id)}" data-lane-id="${escapeAttr(lane.id)}" role="list" aria-label="${escapeAttr(`${col.label}: ${lane.label}`)}">
                ${laneCards.length ? laneCards.map((card, idx) => this._renderCard(card, col.id, idx, 0)).join('') : `<div class="empty-placeholder">${escapeHtml(emptyText)}</div>`}
              </div>
            </div>`;
          }).join('')}</div>`
        : `<div class="column-body" data-column-id="${escapeAttr(col.id)}" role="list" aria-label="${escapeAttr(col.label)}">
            ${listHtml}
          </div>`;

      const accent = col.color ? `border-left: 3px solid ${escapeAttr(col.color)};` : '';
      return `
        <div class="column${col.locked ? ' locked' : ''}" data-column-id="${escapeAttr(col.id)}">
          <div class="column-header" style="${accent}">
            <span class="column-title">${escapeHtml(col.label)}</span>
            ${col.locked ? `<span class="column-lock"><span aria-hidden="true">&#128274;</span>${escapeHtml(this.label('label-locked', 'bwc.kanban.locked', 'Locked'))}</span>` : ''}
            <span class="column-count">${totalCount}</span>
          </div>
          ${bodyHtml}
          <div class="column-footer">${totalCount} card${totalCount !== 1 ? 's' : ''}</div>
        </div>
      `;
    }).join('');

    const boardLanes = this._config?.lanes ?? [];
    if (this._laneLayout() === 'rows' && boardLanes.length) {
      return `
      <div class="board rows-board" role="group" aria-label="Kanban board"${this._renderStop ? '' : ' tabindex="0"'}
           style="grid-template-columns: minmax(6rem, max-content) repeat(${this._columns.length}, minmax(var(--b-kanban-col-min-width, 16rem), 1fr));">
        ${this._renderRows(boardLanes, emptyText)}
      </div>
      <div class="sr-only" aria-live="polite">${escapeHtml(this._liveText)}</div>
      ${this._controlsHint()}
    `;
    }

    return `
      <div class="board" role="group" aria-label="Kanban board"${this._renderStop ? '' : ' tabindex="0"'}>
        ${columnsHtml}
      </div>
      <div class="sr-only" aria-live="polite">${escapeHtml(this._liveText)}</div>
      ${this._controlsHint()}
    `;
  }

  /**
   * Rows mode (TASK-956, D5/D15): a header row of columns, then one row per board lane with a cell per column; a cell
   * is a `.column` wrapper around a `.column-body` drop target, so locks, refusals and the keyboard work as in columns.
   */
  private _renderRows(lanes: KanbanLane[], emptyText: string): string {
    const lock = this.label('label-locked', 'bwc.kanban.locked', 'Locked');
    const heads = this._columns.map((col, j) => {
      const total = this._countAllCards(this._getOrderedCards(col.id));
      const accent = col.color ? ` border-left: 3px solid ${escapeAttr(col.color)};` : '';
      return `<div class="column-header rows-colhead" data-column-id="${escapeAttr(col.id)}" style="grid-column: ${j + 2}; grid-row: 1;${accent}">
          <span class="column-title">${escapeHtml(col.label)}</span>
          ${col.locked ? `<span class="column-lock"><span aria-hidden="true">&#128274;</span>${escapeHtml(lock)}</span>` : ''}
          <span class="column-count">${total}</span>
        </div>`;
    }).join('');
    const body = (col: KanbanColumn, lane: KanbanLane | null, cards: KanbanCard[]) => `
        <div class="column-body" data-column-id="${escapeAttr(col.id)}"${lane ? ` data-lane-id="${escapeAttr(lane.id)}"` : ''} role="list"
             aria-label="${escapeAttr(lane ? `${col.label}: ${lane.label}` : col.label)}">
          ${cards.length ? cards.map((card, idx) => this._renderCard(card, col.id, idx, 0)).join('') : `<div class="empty-placeholder">${escapeHtml(emptyText)}</div>`}
        </div>`;
    const rows = lanes.map((lane, i) => {
      const count = this._countAllCards(this._cards.filter(c => this._laneOf(c) === lane.id));
      const dot = lane.color ? ` style="background:${escapeAttr(lane.color)}"` : '';
      const header = `<div class="row-header lane-header" data-lane-id="${escapeAttr(lane.id)}" style="grid-column: 1; grid-row: ${i + 2};">
          <span class="lane-dot" aria-hidden="true"${dot}></span><span class="lane-title">${escapeHtml(lane.label)}</span><span class="lane-count">${count}</span>
        </div>`;
      const cells = this._columns.map((col, j) => {
        const cls = `column rows-cell${col.locked ? ' locked' : ''}`;
        if (!this._lanesOf(col.id).length) {
          // An opted-out column is one cell beside all the rows.
          return i === 0
            ? `<div class="${cls}" data-column-id="${escapeAttr(col.id)}" style="grid-column: ${j + 2}; grid-row: 2 / span ${lanes.length};">${body(col, null, this._getOrderedCards(col.id).filter(c => !c.parentId))}</div>`
            : '';
        }
        return `<div class="${cls}" data-column-id="${escapeAttr(col.id)}" data-lane-id="${escapeAttr(lane.id)}" style="grid-column: ${j + 2}; grid-row: ${i + 2};">${body(col, lane, this._getOrderedCards(col.id, '', lane.id))}</div>`;
      }).join('');
      return header + cells;
    }).join('');
    return `<div class="rows-corner" style="grid-column: 1; grid-row: 1;"></div>${heads}${rows}`;
  }

  /**
   * Tags mode (TASK-957, D17): a top-level card in a laned column shows its lane as a small button that opens a lane
   * menu. `tabindex="-1"` keeps the board one tab stop; by keyboard the lane changes by moving the card (D9).
   */
  private _renderLaneTag(card: KanbanCard, columnId: string, depth: number): string {
    if (this._laneLayout() !== 'tags' || depth > 0 || card.parentId) return '';
    const lanes = this._lanesOf(columnId);
    if (!lanes.length) return '';
    const laneId = this._laneOf(card);
    const lane = lanes.find(l => l.id === laneId);
    if (!lane) return '';
    const dot = lane.color ? ` style="background:${escapeAttr(lane.color)}"` : '';
    const name = this.label('label-lane-tag', 'bwc.kanban.laneTag', 'Lane: {lane}. Change lane', { lane: lane.label });
    return `<button type="button" class="lane-tag" tabindex="-1" aria-haspopup="menu" aria-label="${escapeAttr(name)}" data-lane-tag="${escapeAttr(card.id)}"><span class="lane-dot" aria-hidden="true"${dot}></span>${escapeHtml(lane.label)}<span aria-hidden="true"> &#9662;</span></button>`;
  }

  /** The lane menu under a tag (D17): one checked radio item per lane; a pick goes through the person funnel. */
  private _openLaneMenu(cardId: string, anchor: HTMLElement): void {
    this._closeLaneMenu();
    const card = this._cards.find(c => c.id === cardId);
    if (!card || !this.shadowRoot) return;
    const current = this._laneOf(card);
    const menu = document.createElement('div');
    menu.className = 'lane-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', this.label('label-lane-menu', 'bwc.kanban.laneMenu', 'Change lane'));
    menu.innerHTML = this._lanesOf(card.columnId).map(l =>
      `<button type="button" role="menuitemradio" aria-checked="${l.id === current}" data-lane-id="${escapeAttr(l.id)}" tabindex="-1">
         <span class="lane-dot" aria-hidden="true"${l.color ? ` style="background:${escapeAttr(l.color)}"` : ''}></span>${escapeHtml(l.label)}</button>`).join('');
    const r = anchor.getBoundingClientRect();
    menu.style.left = `${Math.round(r.left)}px`;
    menu.style.top = `${Math.round(r.bottom + 2)}px`;
    this.shadowRoot.appendChild(menu);
    const items = [...menu.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
    (items.find(i => i.dataset.laneId === current) ?? items[0])?.focus();
    const close = (refocus: boolean) => {
      this._closeLaneMenu();
      if (refocus) this.$$<HTMLElement>('.card').find(c => c.dataset.cardId === cardId)?.focus();
    };
    menu.addEventListener('click', (e: Event) => {
      const item = (e.target as HTMLElement).closest<HTMLElement>('[role="menuitemradio"]');
      if (!item?.dataset.laneId) return;
      e.stopPropagation();
      close(true);
      if (item.dataset.laneId !== current) this._userMove(cardId, card.columnId, undefined, undefined, item.dataset.laneId);
    });
    menu.addEventListener('keydown', (e: Event) => {
      const k = (e as KeyboardEvent).key;
      const at = items.indexOf(this.shadowRoot!.activeElement as HTMLElement);
      if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
      else if (k === 'ArrowDown' || k === 'ArrowUp') {
        e.preventDefault();
        items[(at + (k === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
      }
    });
    // A press outside the menu closes it.
    const outside = (e: Event) => {
      if (e.composedPath().includes(menu)) return;
      document.removeEventListener('pointerdown', outside, true);
      if (menu.isConnected) close(false);
    };
    setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
  }

  private _closeLaneMenu(): void {
    this.shadowRoot?.querySelectorAll('.lane-menu').forEach(m => m.remove());
  }

  /**
   * Whether the event happened in one of the card's own controls (TASK-946, D8): a button, link, form field or label,
   * or anything inside an element marked `data-no-drag`. A press there is the control's: no drag and no card click.
   * The event's path is read up to the card, so a control inside a component's own shadow root (b-button's real
   * `<button>`) counts too.
   */
  private _inCardControl(e: Event, card: HTMLElement): boolean {
    for (const node of e.composedPath()) {
      if (node === card) return false;
      if (node instanceof Element && node.matches('button, a, input, select, textarea, label, [data-no-drag]')) return true;
    }
    return false;
  }

  private _renderCard(card: KanbanCard, columnId: string, index: number, depth: number): string {
    const hasChildren = !!(card.children?.length);
    const isExpanded = this._expanded.has(card.id);
    const maxDepth = this._config?.maxNestingDepth;
    const canNest = !maxDepth || depth < maxDepth;
    const showToggle = hasChildren || canNest;
    const childrenId = `${this.uid}-kc-${escapeAttr(card.id)}`;

    const toggleHtml = showToggle
      ? (hasChildren
        ? `<button class="card-toggle ${isExpanded ? 'expanded' : ''}"
                  data-toggle="${escapeAttr(card.id)}"
                  type="button" tabindex="-1"
                  aria-expanded="${isExpanded}"
                  aria-controls="${childrenId}"
                  aria-label="${isExpanded ? 'Collapse' : 'Expand'}">&#9654;</button>`
        : `<span class="card-toggle-spacer"></span>`)
      : '';

    const countBadge = hasChildren
      ? `<span class="card-child-count">${card.children!.length}</span>`
      : '';

    const contentHtml = this._renderCardContent(card, depth);

    const childrenHtml = hasChildren
      ? `<div class="card-children ${isExpanded ? '' : 'collapsed'}" id="${childrenId}" data-parent-card-id="${escapeAttr(card.id)}">
           ${card.children!.map((child, idx) => this._renderCard(child, columnId, idx, depth + 1)).join('')}
         </div>`
      : '';

    const colorStyle = card.color ? `border-left: 3px solid ${escapeAttr(card.color)};` : '';

    return `
      <div class="card"
           draggable="${this._isLocked(columnId) ? 'false' : 'true'}"
           tabindex="${card.id === this._renderStop ? '0' : '-1'}"
           data-card-id="${escapeAttr(card.id)}"
           data-column-id="${escapeAttr(columnId)}"
           data-parent-id="${card.parentId ? escapeAttr(card.parentId) : ''}"
           data-depth="${depth}"
           data-index="${index}"
           role="listitem"
           aria-label="${escapeAttr(card.title)}"
           ${colorStyle ? `style="${colorStyle}"` : ''}>
        <div class="card-header">
          ${toggleHtml}
          ${contentHtml}
          ${countBadge}
        </div>
        ${this._renderLaneTag(card, columnId, depth)}
      </div>
      ${childrenHtml}
    `;
  }

  protected onUpdated() {
    const disabled = this.boolAttr('disabled');
    if (disabled) return;

    // Toggle expand/collapse
    this.$$<HTMLElement>('[data-toggle]').forEach(btn => {
      this.listen(btn, 'click', (e: Event) => {
        e.stopPropagation();
        e.preventDefault();
        this._toggleCard(btn.dataset.toggle!);
      });
    });

    // Mouse drag-and-drop + click
    this.$$<HTMLElement>('.card').forEach(card => {
      // A press on a control in the card (TASK-946, D8) starts no drag: the card stops being draggable until the
      // pointer comes up, so a field's text can be selected, and a dragstart that still arrives is refused.
      this.listen(card, 'pointerdown', (e: Event) => {
        const onControl = this._inCardControl(e, card);
        this._noDragFromControl = onControl;
        if (!onControl || card.getAttribute('draggable') !== 'true') return;
        card.setAttribute('draggable', 'false');
        const restore = () => {
          document.removeEventListener('pointerup', restore, true);
          document.removeEventListener('pointercancel', restore, true);
          card.setAttribute('draggable', 'true');
        };
        document.addEventListener('pointerup', restore, true);
        document.addEventListener('pointercancel', restore, true);
      });
      this.listen(card, 'dragstart', (e: Event) => {
        if (this._noDragFromControl || this._inCardControl(e, card)) { e.preventDefault(); return; }
        this._onDragStart(e as DragEvent, card);
      });
      this.listen(card, 'click', (e: Event) => {
        if (this._dragCardId || this._keyboardDragging) return;
        if (this._inCardControl(e, card)) return;
        const cardId = card.dataset.cardId!;
        const columnId = card.dataset.columnId!;
        const cardData = this._cards.find(c => c.id === cardId);
        this.emit('card-click', { cardId, columnId, card: cardData });
      });
    });

    // Tags mode: the lane tag opens the lane menu; as a control on the card it starts no drag (TASK-957, TASK-946).
    this.$$<HTMLElement>('.lane-tag').forEach(tag => {
      this.listen(tag, 'click', (e: Event) => {
        e.stopPropagation();
        this._noDragFromControl = false;
        this._openLaneMenu(tag.dataset.laneTag!, tag);
      });
    });

    this.$$<HTMLElement>('.column-body').forEach(colBody => {
      this.listen(colBody, 'dragover', (e: Event) => this._onDragOver(e as DragEvent, colBody));
      this.listen(colBody, 'dragleave', (e: Event) => this._onDragLeave(e as DragEvent, colBody));
      this.listen(colBody, 'drop', (e: Event) => this._onDrop(e as DragEvent, colBody));
    });

    // Keyboard navigation
    const board = this.$<HTMLElement>('.board');
    if (board) {
      this.listen(board, 'keydown', (e: Event) => this._handleKeyboard(e as KeyboardEvent));
      // Roving tabindex: whichever card takes focus becomes the board's one tab stop, without a re-render (TASK-955).
      this.listen(board, 'focusin', (e: Event) => {
        const card = (e.target as HTMLElement).closest?.<HTMLElement>('.card');
        if (!card?.dataset.cardId || card.dataset.cardId === this._tabStopId && card.tabIndex === 0) return;
        this._tabStopId = card.dataset.cardId;
        this.$$<HTMLElement>('.card[tabindex="0"]').forEach(c => { if (c !== card) c.tabIndex = -1; });
        card.tabIndex = 0;
        this._syncCardControls();
      });
    }
    this._syncCardControls();
  }

  /** The hidden hint a card with controls points to (TASK-958, D21). */
  private _controlsHint(): string {
    const text = this.label('label-card-controls', 'bwc.kanban.cardControls', 'Press Tab to reach its buttons and fields.');
    return `<span id="${this.uid}-kc-hint" hidden>${escapeHtml(text)}</span>`;
  }

  /**
   * Only the Tab-stop card's own controls are in the Tab order (TASK-958, D21): every focusable element `renderCard`
   * put on another card gets `tabindex="-1"`, its own value kept in `data-kb-tab` and put back when its card becomes
   * the Tab stop. A custom element counts when its own shadow root holds a focusable control (b-button). The card's
   * toggle and lane tag are always out of the Tab order. A card with controls is described by the hint.
   */
  private _syncCardControls(): void {
    const focusable = 'a[href], button, input, select, textarea, [tabindex], [contenteditable=""], [contenteditable="true"]';
    const hintId = `${this.uid}-kc-hint`;
    this.$$<HTMLElement>('.card').forEach(card => {
      const isStop = card.tabIndex === 0;
      let hasControls = false;
      card.querySelectorAll<HTMLElement>('*').forEach(el => {
        if (el.matches('.card-toggle, .lane-tag')) return;
        const managed = el.hasAttribute('data-kb-tab');
        if (!managed) {
          const own = el.matches(focusable) && el.getAttribute('tabindex') !== '-1';
          if (!own && !el.shadowRoot?.querySelector(focusable)) return;
        }
        hasControls = true;
        if (isStop) {
          if (!managed) return;
          const was = el.getAttribute('data-kb-tab')!;
          if (was === '') el.removeAttribute('tabindex'); else el.setAttribute('tabindex', was);
          el.removeAttribute('data-kb-tab');
        } else if (!managed) {
          el.setAttribute('data-kb-tab', el.getAttribute('tabindex') ?? '');
          el.setAttribute('tabindex', '-1');
        }
      });
      if (hasControls) card.setAttribute('aria-describedby', hintId);
      else card.removeAttribute('aria-describedby');
    });
  }

  // ── Public API ──

  protected onMount(): void {
    super.onMount?.();
    this._resizeObserver = new ResizeObserver(() => this._checkStacked());
    this._resizeObserver.observe(this);
    this._checkStacked();
  }

  protected onUnmount(): void {
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    super.onUnmount?.();
  }

  /**
   * Compare the board's own width with `stackBelow` and set the `stacked` attribute; re-render only when that changes
   * (TASK-950). The length is resolved through a hidden probe, so rem, em, px and % all work.
   */
  private _checkStacked(): void {
    const below = this._config?.stackBelow;
    let stacked = false;
    if (below && this.shadowRoot && this.isConnected) {
      const probe = document.createElement('div');
      probe.style.cssText = `position:absolute;visibility:hidden;height:0;width:${below}`;
      this.shadowRoot.appendChild(probe);
      const limit = probe.getBoundingClientRect().width;
      probe.remove();
      stacked = limit > 0 && this.getBoundingClientRect().width < limit;
    }
    if (stacked === this._stacked) return;
    this._stacked = stacked;
    this.toggleAttribute('stacked', stacked);
    this.update();
  }

  setConfig(config: KanbanConfig): void {
    this._config = config;
    this._columns = [...config.columns];
    this._cards = this._flattenCards(config.cards);
    this._liveText = '';
    this._lastMoves.clear();
    this._collectExpanded(config.cards);
    this.update();
    this._checkStacked();
  }

  setCards(cards: KanbanCard[]): void {
    this._cards = this._flattenCards(cards);
    this._lastMoves.clear();
    this._collectExpanded(cards);
    this.update();
  }

  addCard(card: KanbanCard): void {
    this._cards.push({ ...card });
    this.update();
  }

  removeCard(cardId: string): void {
    const card = this._cards.find(c => c.id === cardId);
    if (!card) return;

    // Remove the card and all its descendants
    const descendantIds = this._getDescendantIds(cardId);
    const removeIds = new Set([cardId, ...descendantIds]);
    this._cards = this._cards.filter(c => !removeIds.has(c.id));

    // Remove from parent's children
    if (card.parentId) {
      const parent = this._cards.find(c => c.id === card.parentId);
      if (parent?.children) {
        parent.children = parent.children.filter(c => c.id !== cardId);
      }
    }

    this._expanded.delete(cardId);
    this.update();
  }

  /**
   * Move a card from code. Not limited by locks or `canMove`, which govern what a person can do; it forgets any move
   * `revertMove` could undo for this card.
   */
  moveCard(cardId: string, targetColumnId: string, targetIndex?: number, targetParentId?: string, targetLaneId?: string): void {
    this._lastMoves.delete(cardId);
    this._applyMove(cardId, targetColumnId, targetIndex, targetParentId, false, targetLaneId);
  }

  /**
   * Put a card back where the last move a person made took it from, for example when saving that move failed
   * (TASK-947). Fires no `card-move` / `card-reorder`. Returns `false` when there is nothing to undo.
   */
  revertMove(cardId: string): boolean {
    const origin = this._lastMoves.get(cardId);
    if (!origin || !this._cards.some(c => c.id === cardId)) return false;
    this._lastMoves.delete(cardId);
    this._applyMove(cardId, origin.columnId, origin.index, origin.parentId || undefined, true, origin.laneId || undefined);
    return true;
  }

  /** The card Tab should land on: the last focused one while it is still on the board, else the first card shown. */
  private _currentTabStop(): string | null {
    if (this._tabStopId && this._cards.some(c => c.id === this._tabStopId)) return this._tabStopId;
    for (const col of this._columns) {
      const first = this._getOrderedCards(col.id).find(c => !c.parentId);
      if (first) return first.id;
    }
    return null;
  }

  private _isLocked(columnId: string): boolean {
    return !!this._columns.find(c => c.id === columnId)?.locked;
  }

  private _columnLabel(columnId: string): string {
    return this._columns.find(c => c.id === columnId)?.label ?? columnId;
  }

  /** Why a person may not make this move, or null when they may: the locks first, then `canMove` (TASK-947). */
  private _refusal(cardId: string, toColumn: string, toIndex?: number, toParent?: string, toLane?: string): string | null {
    const card = this._cards.find(c => c.id === cardId);
    if (!card) return null;
    if (this._isLocked(card.columnId)) {
      return this.label('label-locked-out', 'bwc.kanban.lockedOut', '{column} is locked: its cards cannot be moved.', { column: this._columnLabel(card.columnId) });
    }
    if (toColumn !== card.columnId && this._isLocked(toColumn)) {
      return this.label('label-locked-in', 'bwc.kanban.lockedIn', '{column} is locked: cards cannot be moved into it.', { column: this._columnLabel(toColumn) });
    }
    const rule = this._config?.canMove;
    if (!rule) return null;
    const verdict = rule(this._moveOf(card, toColumn, toIndex, toParent, toLane));
    if (verdict === true) return null;
    if (typeof verdict === 'string' && verdict) return verdict;
    return this.label('label-refused', 'bwc.kanban.refused', 'This card cannot be moved there.');
  }

  private _moveOf(card: KanbanCard, toColumn: string, toIndex?: number, toParent?: string, toLane?: string): KanbanMove {
    const fromParent = card.parentId ?? '';
    const fromLane = this._laneOf(card);
    const lane = this._targetLane(card, toColumn, toLane);
    const move: KanbanMove = {
      card, fromColumn: card.columnId, toColumn,
      fromIndex: this._getOrderedCards(card.columnId, fromParent, fromLane || undefined).findIndex(c => c.id === card.id),
    };
    if (toIndex !== undefined) move.toIndex = toIndex;
    if (fromParent) move.fromParent = fromParent;
    if (toParent) move.toParent = toParent;
    if (fromLane) move.fromLane = fromLane;
    if (lane) move.toLane = lane;
    return move;
  }

  /**
   * The one way a person's move is applied (drop and keyboard): refused by a lock or `canMove`, or by a listener
   * cancelling `card-move-request`; otherwise applied and remembered for `revertMove`. Returns whether it moved.
   */
  private _userMove(cardId: string, toColumn: string, toIndex?: number, toParent?: string, toLane?: string): boolean {
    const card = this._cards.find(c => c.id === cardId);
    if (!card) return false;
    if (!this._isSortable(toColumn) && toColumn === card.columnId && !toParent && !card.parentId
        && this._targetLane(card, toColumn, toLane) === this._laneOf(card)) {
      return false; // reordering is off here: a drop in the card's own lane changes nothing (D7)
    }
    const reason = this._refusal(cardId, toColumn, toIndex, toParent, toLane);
    if (reason) { this._say(reason); return false; }
    const request = new CustomEvent<KanbanMove>('card-move-request', {
      detail: this._moveOf(card, toColumn, toIndex, toParent, toLane), bubbles: true, composed: true, cancelable: true,
    });
    if (!this.dispatchEvent(request)) return false;
    const fromParent = card.parentId ?? '';
    const fromLane = this._laneOf(card);
    const origin = {
      columnId: card.columnId, parentId: fromParent, laneId: fromLane,
      index: this._getOrderedCards(card.columnId, fromParent, fromLane || undefined).findIndex(c => c.id === cardId),
    };
    this._applyMove(cardId, toColumn, toIndex, toParent, false, toLane);
    this._lastMoves.set(cardId, origin);
    return true;
  }

  /** Write `text` to the live region now, not at the next render. */
  private _say(text: string): void {
    this._liveText = text;
    const live = this.$<HTMLElement>('[aria-live]');
    if (live) live.textContent = text;
  }

  private _applyMove(cardId: string, targetColumnId: string, targetIndex: number | undefined, targetParentId: string | undefined, silent: boolean, targetLaneId?: string): void {
    const cardIndex = this._cards.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return;

    const card = this._cards[cardIndex];
    const fromColumnId = card.columnId;
    const fromParentId = card.parentId ?? '';
    const fromLane = this._laneOf(card);
    const toLane = targetParentId ? '' : this._targetLane(card, targetColumnId, targetLaneId);
    const orderedSource = this._getOrderedCards(fromColumnId, fromParentId, fromLane || undefined);
    const fromIndex = orderedSource.findIndex(c => c.id === cardId);

    // Remove from current position
    this._cards.splice(cardIndex, 1);

    // Remove from old parent's children
    if (card.parentId) {
      const oldParent = this._cards.find(c => c.id === card.parentId);
      if (oldParent?.children) {
        oldParent.children = oldParent.children.filter(c => c.id !== cardId);
      }
    }

    // Update card
    card.columnId = targetColumnId;
    card.parentId = targetParentId || undefined;
    if (toLane) card.laneId = toLane;

    // Add to new parent's children
    if (targetParentId) {
      const newParent = this._cards.find(c => c.id === targetParentId);
      if (newParent) {
        if (!newParent.children) newParent.children = [];
        newParent.children.push(card);
        // Ensure parent is expanded
        this._expanded.add(targetParentId);
      }
    }

    // Re-insert at target position among siblings (within the target lane, TASK-948)
    const siblings = this._getOrderedCards(targetColumnId, targetParentId ?? '', toLane || undefined).filter(c => c.id !== cardId);
    // No position given, in a column the board orders: the end of the group, not wherever a stale `order` sorts it.
    if (this._isSortable(targetColumnId) && (targetIndex === undefined || targetIndex >= siblings.length)) {
      card.order = siblings.reduce((m, c) => Math.max(m, c.order ?? 0), -1) + 1;
    }
    // At a position, in a column the board orders: number the group in its new order. The group is sorted by `order`
    // afterwards, so a place in the card list alone was undone by the cards' old values (TASK-960).
    if (this._isSortable(targetColumnId) && targetIndex !== undefined && targetIndex < siblings.length) {
      const group = [...siblings];
      group.splice(targetIndex, 0, card);
      group.forEach((c, i) => { c.order = i; });
    }
    this._cards.push(card);

    // Re-order
    const moved = fromColumnId !== targetColumnId || fromParentId !== (targetParentId ?? '') || fromLane !== toLane;
    this._reorderGroup(targetColumnId, targetParentId ?? '', toLane);
    if (moved) this._reorderGroup(fromColumnId, fromParentId, fromLane);

    this.update();

    const toIndex = targetIndex ?? this._getOrderedCards(targetColumnId, targetParentId ?? '', toLane || undefined).findIndex(c => c.id === cardId);

    const detail: Record<string, unknown> = {
      card,
      fromColumn: fromColumnId,
      toColumn: targetColumnId,
      fromIndex,
      toIndex: Math.max(0, toIndex),
    };
    if (targetParentId) detail.toParent = targetParentId;
    if (fromParentId) detail.fromParent = fromParentId;
    if (fromLane) detail.fromLane = fromLane;
    if (toLane) detail.toLane = toLane;

    if (silent) return;
    // A lane change within a column is a move too, as a column change is (D13).
    if (moved) {
      this.emit('card-move', detail);
    } else {
      this.emit('card-reorder', detail);
    }
  }

  /** All cards, a column's, or one lane's of a column (TASK-948), in order. */
  getCards(columnId?: string, laneId?: string): KanbanCard[] {
    const cards = columnId
      ? this._cards.filter(c => c.columnId === columnId && (laneId === undefined || this._laneOf(c) === laneId))
      : [...this._cards];
    return cards.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  getColumns(): KanbanColumn[] {
    return [...this._columns];
  }

  getChildren(cardId: string): KanbanCard[] {
    return this._cards.filter(c => c.parentId === cardId);
  }

  addSubCard(parentId: string, card: KanbanCard): void {
    const parent = this._cards.find(c => c.id === parentId);
    if (!parent) return;

    const newCard: KanbanCard = { ...card, parentId, columnId: parent.columnId };
    if (!parent.children) parent.children = [];
    parent.children.push(newCard);
    this._cards.push(newCard);
    this._expanded.add(parentId);
    this.update();
  }

  get renderCard(): ((card: KanbanCard, depth: number) => string) | null { return this._renderCardFn; }
  set renderCard(fn: ((card: KanbanCard, depth: number) => string) | null) {
    this._renderCardFn = fn;
    this.update();
  }

  toggleCard(cardId: string): void {
    this._toggleCard(cardId);
  }

  expandCard(cardId: string): void {
    this._expanded.add(cardId);
    this.update();
  }

  collapseCard(cardId: string): void {
    this._expanded.delete(cardId);
    this.update();
  }

  expandAll(): void {
    this._walkCards(this._cards, card => {
      if (card.children?.length) this._expanded.add(card.id);
    });
    this.update();
  }

  collapseAll(): void {
    this._expanded.clear();
    this.update();
  }

  // ── Toggle ──

  private _toggleCard(cardId: string): void {
    const card = this._cards.find(c => c.id === cardId);
    if (!card) return;

    if (this._expanded.has(cardId)) {
      this._expanded.delete(cardId);
      this.emit('card-toggle', { cardId, expanded: false, card });
    } else {
      this._expanded.add(cardId);
      this.emit('card-toggle', { cardId, expanded: true, card });
    }
    this.update();
  }

  // ── Drag Handlers ──

  private _onDragStart(e: DragEvent, card: HTMLElement): void {
    // Don't start drag from toggle button
    const target = e.target as HTMLElement;
    if (target.closest('.card-toggle')) {
      e.preventDefault();
      return;
    }

    const cardId = card.dataset.cardId!;
    const columnId = card.dataset.columnId!;
    const parentId = card.dataset.parentId ?? '';
    if (this._isLocked(columnId)) {
      e.preventDefault();
      this._say(this._refusal(cardId, columnId) ?? '');
      return;
    }
    const cards = this._getOrderedCards(columnId, parentId);
    const idx = cards.findIndex(c => c.id === cardId);

    this._refusedSaidFor = null;
    this._dragCardId = cardId;
    this._dragSourceColumnId = columnId;
    this._dragSourceIndex = idx;

    card.classList.add('dragging');
    // The browser fires dragend at this element even when a drop has re-rendered the board, and a re-render drops
    // the listeners onUpdated added; this one is the element's own, once (TASK-959).
    card.addEventListener('dragend', () => this._onDragEnd(), { once: true });
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', cardId);
    }
  }

  private _onDragEnd(): void {
    // However the drag ended (dropped, refused, in place, outside the board), no card stays dimmed (TASK-959).
    this.$$<HTMLElement>('.card.dragging').forEach(c => c.classList.remove('dragging'));
    this._refusedSaidFor = null;
    this.$$<HTMLElement>('.column.drop-refused').forEach(c => c.classList.remove('drop-refused'));
    this._dragCardId = null;
    this._dragSourceColumnId = null;
    this._dragSourceIndex = -1;
    this._clearDropIndicators();
  }

  private _onDragOver(e: DragEvent, colBody: HTMLElement): void {
    if (!this._dragCardId) return;
    const toColumn = colBody.dataset.columnId!;
    const toLane = colBody.dataset.laneId;
    const reason = this._refusal(this._dragCardId, toColumn, undefined, undefined, toLane);
    if (reason) {
      // No preventDefault: the browser then shows no-drop and fires no drop here.
      this._clearDropIndicators();
      colBody.closest('.column')?.classList.add('drop-refused');
      const spot = `${toColumn}/${toLane ?? ''}`;
      if (this._refusedSaidFor !== spot) { this._refusedSaidFor = spot; this._say(reason); }
      return;
    }
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

    this._clearDropIndicators();
    colBody.classList.add('drag-over');
    if (!this._isSortable(toColumn) || this._laneLayout() === 'tags') return; // no position to show (D7, D18)

    const cards = colBody.querySelectorAll<HTMLElement>('.card:not(.dragging)');
    const y = e.clientY;

    let targetCard: HTMLElement | null = null;
    let position: 'before' | 'after' | 'inside' = 'after';

    for (const cardEl of cards) {
      const rect = cardEl.getBoundingClientRect();
      const relY = (y - rect.top) / rect.height;

      if (relY < 0.25) {
        targetCard = cardEl;
        position = 'before';
        break;
      }
      if (relY > 0.75) {
        targetCard = cardEl;
        position = 'after';
        break;
      }
      // Middle zone — drop inside
      targetCard = cardEl;
      position = 'inside';
      break;
    }

    if (targetCard) {
      // Prevent dropping into self or descendants
      if (position === 'inside' && this._isDescendant(this._dragCardId, targetCard.dataset.cardId!)) {
        return;
      }
      targetCard.classList.add(`drop-${position}`);
    }
  }

  private _onDragLeave(e: DragEvent, colBody: HTMLElement): void {
    if (!colBody.contains(e.relatedTarget as Node)) {
      colBody.closest('.column')?.classList.remove('drop-refused');
      colBody.classList.remove('drag-over');
      this._clearDropIndicators();
    }
  }

  private _onDrop(e: DragEvent, colBody: HTMLElement): void {
    e.preventDefault();
    colBody.classList.remove('drag-over');
    this._clearDropIndicators();

    if (!this._dragCardId) return;

    const targetColumnId = colBody.dataset.columnId!;
    const cards = colBody.querySelectorAll<HTMLElement>('.card:not(.dragging)');
    const y = e.clientY;

    let targetIndex: number | undefined;
    let targetParentId: string | undefined;
    let found = false;

    for (let i = 0; i < cards.length; i++) {
      const rect = cards[i].getBoundingClientRect();
      const relY = (y - rect.top) / rect.height;

      if (relY < 0.25) {
        // Drop before this card — same parent, same level
        targetIndex = i;
        targetParentId = cards[i].dataset.parentId || undefined;
        found = true;
        break;
      }
      if (relY > 0.75) {
        // Drop after this card — same parent, same level
        targetIndex = i + 1;
        targetParentId = cards[i].dataset.parentId || undefined;
        found = true;
        break;
      }
      // Middle zone — drop inside this card (nest)
      targetParentId = cards[i].dataset.cardId!;
      targetIndex = undefined;
      found = true;

      // Prevent dropping into self or descendants
      if (this._isDescendant(this._dragCardId, targetParentId)) {
        return;
      }
      break;
    }

    if (!found) {
      // Drop at end of column
      targetIndex = undefined;
      targetParentId = undefined;
    }

    if (!this._isSortable(targetColumnId) || this._laneLayout() === 'tags') {
      // No position: the app's order (D7), or the card's lane in the grouped list (D18), places the card.
      this._userMove(this._dragCardId, targetColumnId, undefined, undefined, colBody.dataset.laneId);
      return;
    }
    this._userMove(this._dragCardId, targetColumnId, targetIndex, targetParentId, colBody.dataset.laneId);
  }

  // ── Keyboard Navigation ──

  private _handleKeyboard(e: KeyboardEvent): void {
    if (this._keyboardDragging) {
      this._handleKeyboardDrag(e);
      return;
    }

    const focused = this.shadowRoot?.activeElement as HTMLElement | null;
    if (!focused) return;

    // Handle toggle button focus
    if (focused.classList.contains('card-toggle')) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const cardId = focused.dataset.toggle!;
        this._toggleCard(cardId);
      }
      return;
    }

    if (!focused.classList.contains('card')) {
      // Escape on a control in a card goes back to its card, unless the control used it (TASK-958, D21).
      const owner = focused.closest<HTMLElement>('.card');
      if (e.key === 'Escape' && owner && !e.defaultPrevented) {
        e.preventDefault();
        owner.focus();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        this._moveFocus(focused, -1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        this._moveFocus(focused, 1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        this._handleArrowLeft(focused);
        break;
      case 'ArrowRight':
        e.preventDefault();
        this._handleArrowRight(focused);
        break;
      case 'Home':
        e.preventDefault();
        this._focusFirstCard(focused);
        break;
      case 'End':
        e.preventDefault();
        this._focusLastCard(focused);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        this._startKeyboardDrag(focused);
        break;
    }
  }

  private _handleArrowRight(card: HTMLElement): void {
    const cardId = card.dataset.cardId!;
    const cardData = this._cards.find(c => c.id === cardId);
    if (!cardData) return;

    const hasChildren = !!(cardData.children?.length);

    // A card without sub-cards: → moves focus to the next column, as ← moves it to the previous one (TASK-955).
    if (!hasChildren) {
      this._moveFocusColumn(card, 1);
      return;
    }
    if (hasChildren) {
      if (!this._expanded.has(cardId)) {
        this._toggleCard(cardId);
      } else {
        // Focus first child
        const childrenContainer = card.nextElementSibling;
        if (childrenContainer?.classList.contains('card-children')) {
          const firstChild = childrenContainer.querySelector<HTMLElement>('.card');
          firstChild?.focus();
        }
      }
    }
  }

  private _handleArrowLeft(card: HTMLElement): void {
    const cardId = card.dataset.cardId!;
    const cardData = this._cards.find(c => c.id === cardId);
    if (!cardData) return;

    const hasChildren = !!(cardData.children?.length);

    if (hasChildren && this._expanded.has(cardId)) {
      this._toggleCard(cardId);
    } else if (cardData.parentId) {
      // Focus parent
      const parentEl = this.$<HTMLElement>(`[data-card-id="${cardData.parentId}"]`);
      parentEl?.focus();
    } else {
      // Move to previous column
      this._moveFocusColumn(card, -1);
    }
  }

  private _handleKeyboardDrag(e: KeyboardEvent): void {
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        this._keyboardMoveCard(-1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        this._keyboardMoveCard(1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        this._keyboardMoveColumn(-1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        this._keyboardMoveColumn(1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        this._completeKeyboardDrag();
        break;
      case 'Escape':
        e.preventDefault();
        this._cancelKeyboardDrag();
        break;
    }
  }

  private _startKeyboardDrag(cardEl: HTMLElement): void {
    const cardId = cardEl.dataset.cardId!;
    const columnId = cardEl.dataset.columnId!;
    if (this._isLocked(columnId)) {
      this._say(this._refusal(cardId, columnId) ?? '');
      return;
    }
    const parentId = cardEl.dataset.parentId ?? '';
    const startCard = this._cards.find(c => c.id === cardId);
    const startLane = startCard ? this._laneOf(startCard) : '';
    const cards = this._getOrderedCards(columnId, parentId, startLane || undefined);
    const idx = cards.findIndex(c => c.id === cardId);

    this._keyboardDragLaneId = startLane;
    this._keyboardDragging = true;
    this._keyboardDragCardId = cardId;
    this._keyboardDragColumnId = columnId;
    this._keyboardDragIndex = idx;

    const card = cards.find(c => c.id === cardId);
    this._liveText = `Picked up card: ${card?.title ?? cardId}. Use arrow keys to move, Enter to drop, Escape to cancel.`;

    cardEl.classList.add('keyboard-dragging');
    this._showKeyboardTarget();
  }

  /**
   * Show a keyboard move on screen: the picked-up card itself travels to where it would land, and the target column is
   * highlighted (TASK-955, the user's choice over a drop line). Only the DOM moves; the data changes on Enter, and the
   * re-render after Enter or Escape draws the real state again.
   */
  private _showKeyboardTarget(): void {
    this._clearDropIndicators();
    const columnId = this._keyboardDragColumnId;
    const cardId = this._keyboardDragCardId;
    if (!columnId || !cardId) return;
    const lane = this._keyboardDragLaneId;
    const tags = this._laneLayout() === 'tags';
    const body = this.$$<HTMLElement>('.column-body').find(b => b.dataset.columnId === columnId && (tags || (b.dataset.laneId ?? '') === lane));
    const cardEl = this.$$<HTMLElement>('.card').find(c => c.dataset.cardId === cardId);
    if (!body || !cardEl) return;
    body.classList.add('drag-over');
    const children = cardEl.nextElementSibling?.classList.contains('card-children') ? cardEl.nextElementSibling : null;
    const others = [...body.querySelectorAll<HTMLElement>(':scope > .card')].filter(c => c !== cardEl);
    const laneMates = tags && lane
      ? others.filter(el => { const c = this._cards.find(x => x.id === el.dataset.cardId); return !!c && this._laneOf(c) === lane; })
      : others;
    let position = this._keyboardDragIndex;
    if (!this._isSortable(columnId)) {
      const dragged = this._cards.find(c => c.id === cardId);
      const own = dragged?.order ?? 0;
      position = laneMates.filter(el => (this._cards.find(c => c.id === el.dataset.cardId)?.order ?? 0) <= own).length;
    }
    if (tags && lane) {
      // In the grouped list the lane's cards follow those of the lanes before it (D18).
      const laneIds = this._lanesOf(columnId).map(l => l.id);
      const before = others.filter(el => {
        const c = this._cards.find(x => x.id === el.dataset.cardId);
        return !!c && laneIds.indexOf(this._laneOf(c)) < laneIds.indexOf(lane);
      }).length;
      position = before + Math.min(position, laneMates.length);
    }
    const before = others[position] ?? null;
    if (before) body.insertBefore(cardEl, before);
    else {
      const last = others[others.length - 1];
      const after = last?.nextElementSibling?.classList.contains('card-children') ? last.nextElementSibling : last;
      if (after) after.after(cardEl);
      else body.prepend(cardEl);
    }
    if (children) cardEl.after(children);
    body.querySelector<HTMLElement>(':scope > .empty-placeholder')?.setAttribute('hidden', '');
    cardEl.focus({ preventScroll: true });
    cardEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  /** The position announcement: column, lane when it has one, position (D9). */
  private _whereText(columnId: string, laneId: string, index: number): string {
    return laneId
      ? this.label('label-in-lane', 'bwc.kanban.inLane', '{column}, {lane}, position {position}.', { column: this._columnLabel(columnId), lane: this._laneLabel(columnId, laneId), position: index + 1 })
      : `Column: ${this._columnLabel(columnId)}, position: ${index + 1}`;
  }

  private _keyboardMoveCard(direction: 1 | -1): void {
    const columnId = this._keyboardDragColumnId!;
    const cardId = this._keyboardDragCardId!;
    const lane = this._keyboardDragLaneId;
    const sortable = this._isSortable(columnId);
    const others = this._getOrderedCards(columnId, '', lane || undefined).filter(c => c.id !== cardId);
    // Within the lane first, when reordering is on.
    if (sortable) {
      const next = this._keyboardDragIndex + direction;
      if (next >= 0 && next <= others.length) {
        this._keyboardDragIndex = next;
        this._say(this._whereText(columnId, lane, next));
        this._showKeyboardTarget();
        return;
      }
    }
    // At the lane's edge, or straight away when reordering is off: on into the next lane (TASK-949, D9).
    const lanes = this._lanesOf(columnId);
    if (!lanes.length) {
      if (!sortable) this._say(this.label('label-reorder-off', 'bwc.kanban.reorderOff', 'Reordering is off in {column}.', { column: this._columnLabel(columnId) }));
      return;
    }
    const skipped: string[] = [];
    let li = lanes.findIndex(l => l.id === lane) + direction;
    for (; li >= 0 && li < lanes.length; li += direction) {
      const candidate = lanes[li];
      const count = this._getOrderedCards(columnId, '', candidate.id).filter(c => c.id !== cardId).length;
      const index = direction > 0 ? 0 : count;
      if (!this._refusal(cardId, columnId, index, undefined, candidate.id)) break;
      skipped.push(candidate.label);
    }
    if (li < 0 || li >= lanes.length) {
      if (skipped.length) {
        this._say(this.label('label-no-lane', 'bwc.kanban.noLane', 'No lane that way accepts this card ({lanes} cannot take it).', { lanes: skipped.join(', ') }));
      }
      return;
    }
    const target = lanes[li];
    const count = this._getOrderedCards(columnId, '', target.id).filter(c => c.id !== cardId).length;
    this._keyboardDragLaneId = target.id;
    this._keyboardDragIndex = sortable ? (direction > 0 ? 0 : count) : count;
    const where = this._whereText(columnId, target.id, this._keyboardDragIndex);
    this._say(skipped.length
      ? `${where} ${this.label('label-skipped', 'bwc.kanban.skipped', 'Skipped {columns}.', { columns: skipped.join(', ') })}`
      : where);
    this._showKeyboardTarget();
  }

  private _keyboardMoveColumn(direction: 1 | -1): void {
    const colIdx = this._columns.findIndex(c => c.id === this._keyboardDragColumnId);
    const cardId = this._keyboardDragCardId!;
    // Step over columns this card may not enter (a lock or canMove), and say which were skipped (TASK-947).
    const skipped: string[] = [];
    let newColIdx = colIdx + direction;
    const dragged = this._cards.find(c => c.id === cardId)!;
    for (; newColIdx >= 0 && newColIdx < this._columns.length; newColIdx += direction) {
      const col = this._columns[newColIdx];
      const lane = this._targetLane(dragged, col.id, this._keyboardDragLaneId || undefined);
      const index = Math.min(this._keyboardDragIndex, this._getOrderedCards(col.id, '', lane || undefined).length);
      if (!this._refusal(cardId, col.id, index, undefined, lane || undefined)) break;
      skipped.push(col.label);
    }
    if (newColIdx < 0 || newColIdx >= this._columns.length) {
      if (skipped.length) {
        this._say(this.label('label-no-column', 'bwc.kanban.noColumn', 'No column that way accepts this card ({columns} cannot take it).', { columns: skipped.join(', ') }));
      }
      return;
    }
    this._keyboardDragColumnId = this._columns[newColIdx].id;
    this._keyboardDragLaneId = this._targetLane(dragged, this._keyboardDragColumnId, this._keyboardDragLaneId || undefined);
    this._keyboardDragIndex = Math.min(this._keyboardDragIndex,
      this._getOrderedCards(this._keyboardDragColumnId, '', this._keyboardDragLaneId || undefined).filter(c => c.id !== cardId).length);
    const where = this._whereText(this._keyboardDragColumnId, this._keyboardDragLaneId, this._keyboardDragIndex);
    this._say(skipped.length
      ? `${where}. ${this.label('label-skipped', 'bwc.kanban.skipped', 'Skipped {columns}.', { columns: skipped.join(', ') })}`
      : where);
    this._showKeyboardTarget();
  }

  private _completeKeyboardDrag(): void {
    this._clearDropIndicators();
    const cardId = this._keyboardDragCardId!;
    const targetColumnId = this._keyboardDragColumnId!;
    const targetIndex = this._keyboardDragIndex;

    this._keyboardDragging = false;
    this._keyboardDragCardId = null;
    this._keyboardDragColumnId = null;
    this._keyboardDragIndex = -1;

    const card = this._cards.find(c => c.id === cardId);
    const sameSpot = card?.columnId === targetColumnId;
    // A drop where the card already is counts as a reorder; a refusal or a cancelled request leaves it put and says so.
    const moved = this._userMove(cardId, targetColumnId, targetIndex, sameSpot ? (card?.parentId || undefined) : undefined, this._keyboardDragLaneId || undefined);
    if (moved) this._liveText = 'Card dropped.';
    else this.update();

    requestAnimationFrame(() => {
      const cardEl = this.$<HTMLElement>(`[data-card-id="${cardId}"]`);
      cardEl?.focus();
    });
  }

  private _cancelKeyboardDrag(): void {
    this._clearDropIndicators();
    const cardId = this._keyboardDragCardId;
    this._keyboardDragging = false;
    this._keyboardDragCardId = null;
    this._keyboardDragColumnId = null;
    this._keyboardDragIndex = -1;
    this._liveText = 'Drag cancelled.';

    this.update();

    requestAnimationFrame(() => {
      if (cardId) {
        const cardEl = this.$<HTMLElement>(`[data-card-id="${cardId}"]`);
        cardEl?.focus();
      }
    });
  }

  private _moveFocus(focused: HTMLElement, direction: 1 | -1): void {
    const allCards = this.$$<HTMLElement>('.card');
    const idx = allCards.indexOf(focused);
    if (idx === -1) return;
    const next = direction > 0
      ? Math.min(allCards.length - 1, idx + 1)
      : Math.max(0, idx - 1);
    allCards[next]?.focus();
  }

  private _moveFocusColumn(focused: HTMLElement, direction: 1 | -1): void {
    const currentColumn = focused.closest('.column') as HTMLElement | null;
    if (!currentColumn) return;
    const columnId = currentColumn.dataset.columnId;
    const colIdx = this._columns.findIndex(c => c.id === columnId);
    const newColIdx = direction > 0
      ? Math.min(this._columns.length - 1, colIdx + 1)
      : Math.max(0, colIdx - 1);

    const row = currentColumn.dataset.laneId;
    const candidates = this.$$<HTMLElement>('.column').filter(c => c.dataset.columnId === this._columns[newColIdx].id);
    const newColumn = candidates.find(c => row && c.dataset.laneId === row) ?? candidates[0];
    const newColBody = newColumn?.querySelector<HTMLElement>('.column-body') ?? null;
    if (!newColumn || !newColBody) return;
    const cards = newColumn.querySelectorAll<HTMLElement>('.card');
    if (cards.length) {
      cards[0]?.focus();
    } else {
      newColBody.focus();
    }
  }

  private _focusFirstCard(focused: HTMLElement): void {
    const column = focused.closest('.column') as HTMLElement | null;
    if (!column) return;
    const cards = column.querySelectorAll<HTMLElement>('.card');
    cards[0]?.focus();
  }

  private _focusLastCard(focused: HTMLElement): void {
    const column = focused.closest('.column') as HTMLElement | null;
    if (!column) return;
    const cards = column.querySelectorAll<HTMLElement>('.card');
    cards[cards.length - 1]?.focus();
  }

  // ── Helpers ──

  /**
   * Cards of one group in order. In a column with lanes the top level is per lane: pass `laneId` to get one lane's
   * cards, or leave it out for the whole column (TASK-948).
   */
  private _getOrderedCards(columnId: string, parentId: string = '', laneId?: string): KanbanCard[] {
    return this._cards
      .filter(c => c.columnId === columnId && (c.parentId ?? '') === parentId
        && (laneId === undefined || parentId !== '' || this._laneOf(c) === laneId))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  /** A column's top-level cards as shown: grouped by lane in lane order when it has lanes (D18), else in order. */
  private _cardsInDisplayOrder(columnId: string): KanbanCard[] {
    const lanes = this._lanesOf(columnId);
    if (!lanes.length) return this._getOrderedCards(columnId).filter(c => !c.parentId);
    return lanes.flatMap(lane => this._getOrderedCards(columnId, '', lane.id));
  }

  private _isSortable(columnId: string): boolean {
    return this._columns.find(c => c.id === columnId)?.sortable !== false;
  }

  private _laneLabel(columnId: string, laneId: string): string {
    return this._lanesOf(columnId).find(l => l.id === laneId)?.label ?? laneId;
  }

  private _laneLayout(): 'sections' | 'rows' | 'tags' {
    const layout = this._config?.laneLayout ?? 'sections';
    return layout === 'rows' && this._stacked ? 'sections' : layout;
  }

  /**
   * A column's lanes: its own (`[]` = none), else the board's (TASK-956). In rows mode the rows are the board's lanes,
   * and only `lanes: []` opts a column out.
   */
  private _lanesOf(columnId: string): KanbanLane[] {
    const own = this._columns.find(c => c.id === columnId)?.lanes;
    const board = this._config?.lanes ?? [];
    // A rows board's columns take the board's lanes, also while it is stacked and shown as sections (D19).
    if ((this._config?.laneLayout ?? 'sections') === 'rows') return own && own.length === 0 ? [] : board;
    return own ?? board;
  }

  /** A laned column's default lane: `defaultLane` when it names one of its lanes, else the first (D14). */
  private _defaultLane(columnId: string): string {
    const col = this._columns.find(c => c.id === columnId);
    const lanes = this._lanesOf(columnId);
    if (!lanes.length) return '';
    for (const pick of [col?.defaultLane, this._config?.defaultLane]) {
      if (pick && lanes.some(l => l.id === pick)) return pick;
    }
    return lanes[0].id;
  }

  /** The lane a card shows in: '' in a column without lanes; a sub-card follows its top-level ancestor (TASK-948). */
  private _laneOf(card: KanbanCard): string {
    const lanes = this._lanesOf(card.columnId);
    if (!lanes.length) return '';
    let top = card;
    for (let guard = 0; top.parentId && guard < 100; guard++) {
      const parent = this._cards.find(c => c.id === top.parentId);
      if (!parent) break;
      top = parent;
    }
    return top.laneId && lanes.some(l => l.id === top.laneId) ? top.laneId : this._defaultLane(card.columnId);
  }

  /**
   * The lane a move lands in: '' for a column without lanes; the asked lane when the column has it; a move inside the
   * card's own column keeps its lane; otherwise the column's default lane (TASK-948).
   */
  private _targetLane(card: KanbanCard, toColumn: string, toLane?: string): string {
    const lanes = this._lanesOf(toColumn);
    if (!lanes.length) return '';
    if (toLane && lanes.some(l => l.id === toLane)) return toLane;
    const current = this._laneOf(card);
    if (toColumn === card.columnId) return current;
    // Into another column the card keeps its lane when that column has it (in rows mode, its row), else the default.
    if (current && lanes.some(l => l.id === current)) return current;
    return this._defaultLane(toColumn);
  }

  private _reorderGroup(columnId: string, parentId: string, laneId?: string): void {
    if (!this._isSortable(columnId)) return; // the app's order stands (D7)
    const ordered = this._getOrderedCards(columnId, parentId, laneId || undefined);
    ordered.forEach((card, i) => { card.order = i; });
  }

  private _reorderColumn(columnId: string): void {
    this._reorderGroup(columnId, '');
  }

  private _countAllCards(cards: KanbanCard[]): number {
    let count = 0;
    for (const card of cards) {
      count++;
      if (card.children?.length) count += this._countAllCards(card.children);
    }
    return count;
  }

  private _flattenCards(cards: KanbanCard[], parentId?: string): KanbanCard[] {
    const result: KanbanCard[] = [];
    for (const card of cards) {
      const flat: KanbanCard = { ...card, parentId: parentId || card.parentId };
      result.push(flat);
      if (card.children?.length) {
        result.push(...this._flattenCards(card.children, card.id));
        flat.children = card.children.map(c => ({ ...c, parentId: card.id }));
      }
    }
    return result;
  }

  private _collectExpanded(cards: KanbanCard[]): void {
    for (const card of cards) {
      if (card.collapsed === false && card.children?.length) this._expanded.add(card.id);
      if (card.children) this._collectExpanded(card.children);
    }
  }

  private _walkCards(cards: KanbanCard[], fn: (card: KanbanCard) => void): void {
    for (const card of cards) {
      fn(card);
      if (card.children) this._walkCards(card.children, fn);
    }
  }

  private _getDescendantIds(cardId: string): string[] {
    const ids: string[] = [];
    const children = this._cards.filter(c => c.parentId === cardId);
    for (const child of children) {
      ids.push(child.id);
      ids.push(...this._getDescendantIds(child.id));
    }
    return ids;
  }

  private _isDescendant(ancestorId: string, potentialDescendantId: string): boolean {
    if (ancestorId === potentialDescendantId) return true;
    const children = this._cards.filter(c => c.parentId === ancestorId);
    for (const child of children) {
      if (this._isDescendant(child.id, potentialDescendantId)) return true;
    }
    return false;
  }

  private _renderCardContent(card: KanbanCard, depth: number): string {
    if (this._renderCardFn) return this._renderCardFn(card, depth);
    if (this._config?.renderCard) return this._config.renderCard(card, depth);
    return `<span class="card-title">${escapeHtml(card.title)}</span>`;
  }

  private _clearDropIndicators(): void {
    this.$$<HTMLElement>('.card').forEach(el => {
      el.classList.remove('drop-before', 'drop-after', 'drop-inside');
    });
    this.$$<HTMLElement>('.column-body').forEach(el => {
      el.classList.remove('drag-over');
    });
  }
}

define('b-kanban', BKanban);
