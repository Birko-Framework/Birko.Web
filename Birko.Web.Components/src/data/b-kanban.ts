import { BaseComponent, define } from 'birko-web-core';

export interface KanbanColumn {
  id: string;
  label: string;
  color?: string;
  collapsed?: boolean;
  maxCards?: number;
}

export interface KanbanCard {
  id: string;
  columnId: string;
  title: string;
  order?: number;
  color?: string;
  metadata?: Record<string, unknown>;
}

export interface KanbanConfig {
  columns: KanbanColumn[];
  cards: KanbanCard[];
  renderCard?: (card: KanbanCard) => string;
  emptyText?: string;
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
      .column-body.drag-over { background: var(--b-bg-tertiary); }

      .card-title { font-weight: var(--b-font-weight-medium, 500); }

      .empty-placeholder {
        padding: var(--b-space-lg, 1rem);
        text-align: center;
        color: var(--b-text-muted);
        font-size: var(--b-text-xs, 0.6875rem);
        font-style: italic;
      }

      /* Screen reader only */
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
    `;
  }

  private _columns: KanbanColumn[] = [];
  private _cards: KanbanCard[] = [];
  private _config: KanbanConfig | null = null;
  private _renderCardFn: ((card: KanbanCard) => string) | null = null;

  // Drag state
  private _dragCardId: string | null = null;
  private _dragSourceColumnId: string | null = null;
  private _dragSourceIndex = -1;

  // Keyboard drag state
  private _keyboardDragging = false;
  private _keyboardDragCardId: string | null = null;
  private _keyboardDragColumnId: string | null = null;
  private _keyboardDragIndex = -1;

  // Live region text
  private _liveText = '';

  render() {
    if (!this._columns.length) {
      return '<div class="empty-placeholder">No columns configured</div>';
    }

    const emptyText = this.attr('empty-text', 'No cards');

    const columnsHtml = this._columns.map(col => {
      const cards = this._getOrderedCards(col.id);
      const cardsHtml = cards.length
        ? cards.map((card, idx) => `
            <div class="card"
                 draggable="true"
                 tabindex="-1"
                 data-card-id="${this._escapeAttr(card.id)}"
                 data-column-id="${this._escapeAttr(col.id)}"
                 data-index="${idx}"
                 role="listitem"
                 aria-label="${this._escapeAttr(card.title)}"
                 ${card.color ? `style="border-left: 3px solid ${card.color}"` : ''}>
              ${this._renderCardContent(card)}
            </div>
          `).join('')
        : `<div class="empty-placeholder">${this._escapeHtml(emptyText)}</div>`;

      const accent = col.color ? `border-left: 3px solid ${col.color};` : '';
      return `
        <div class="column" data-column-id="${this._escapeAttr(col.id)}">
          <div class="column-header" style="${accent}">
            <span class="column-title">${this._escapeHtml(col.label)}</span>
            <span class="column-count">${cards.length}</span>
          </div>
          <div class="column-body" data-column-id="${this._escapeAttr(col.id)}" role="list" aria-label="${this._escapeAttr(col.label)}">
            ${cardsHtml}
          </div>
          <div class="column-footer">${cards.length} card${cards.length !== 1 ? 's' : ''}</div>
        </div>
      `;
    }).join('');

    return `
      <div class="board" role="group" aria-label="Kanban board" tabindex="0">
        ${columnsHtml}
      </div>
      <div class="sr-only" aria-live="polite">${this._escapeHtml(this._liveText)}</div>
    `;
  }

  protected onUpdated() {
    const disabled = this.boolAttr('disabled');
    if (disabled) return;

    // Mouse drag-and-drop
    this.$$<HTMLElement>('.card').forEach(card => {
      this.listen(card, 'dragstart', (e: Event) => this._onDragStart(e as DragEvent, card));
      this.listen(card, 'dragend', () => this._onDragEnd());
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
    }
  }

  // ── Public API ──

  setConfig(config: KanbanConfig): void {
    this._config = config;
    this._columns = [...config.columns];
    this._cards = [...config.cards];
    this._liveText = '';
    this.update();
  }

  setCards(cards: KanbanCard[]): void {
    this._cards = [...cards];
    this.update();
  }

  addCard(card: KanbanCard): void {
    this._cards.push({ ...card });
    this.update();
  }

  removeCard(cardId: string): void {
    this._cards = this._cards.filter(c => c.id !== cardId);
    this.update();
  }

  moveCard(cardId: string, targetColumnId: string, targetIndex?: number): void {
    const cardIndex = this._cards.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return;

    const card = this._cards[cardIndex];
    const fromColumnId = card.columnId;
    const orderedSource = this._getOrderedCards(fromColumnId);
    const fromIndex = orderedSource.findIndex(c => c.id === cardId);

    // Remove from current position
    this._cards.splice(cardIndex, 1);

    // Update column
    card.columnId = targetColumnId;

    // Re-insert at target position
    const targetCards = this._getOrderedCards(targetColumnId);
    if (targetIndex !== undefined && targetIndex < targetCards.length) {
      const insertBeforeId = targetCards[targetIndex].id;
      const insertBeforeGlobal = this._cards.findIndex(c => c.id === insertBeforeId);
      this._cards.splice(insertBeforeGlobal, 0, card);
    } else {
      this._cards.push(card);
    }

    // Re-order
    this._reorderColumn(targetColumnId);
    if (fromColumnId !== targetColumnId) this._reorderColumn(fromColumnId);

    this.update();

    const toIndex = targetIndex ?? this._getOrderedCards(targetColumnId).findIndex(c => c.id === cardId);

    if (fromColumnId !== targetColumnId) {
      this.emit('card-move', { card, fromColumn: fromColumnId, toColumn: targetColumnId, fromIndex, toIndex });
    } else {
      this.emit('card-reorder', { card, columnId: fromColumnId, fromIndex, toIndex });
    }
  }

  getCards(columnId?: string): KanbanCard[] {
    const cards = columnId ? this._cards.filter(c => c.columnId === columnId) : [...this._cards];
    return cards.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  getColumns(): KanbanColumn[] {
    return [...this._columns];
  }

  get renderCard(): ((card: KanbanCard) => string) | null { return this._renderCardFn; }
  set renderCard(fn: ((card: KanbanCard) => string) | null) {
    this._renderCardFn = fn;
    this.update();
  }

  // ── Drag Handlers ──

  private _onDragStart(e: DragEvent, card: HTMLElement): void {
    const cardId = card.dataset.cardId!;
    const columnId = card.dataset.columnId!;
    const cards = this._getOrderedCards(columnId);
    const idx = cards.findIndex(c => c.id === cardId);

    this._dragCardId = cardId;
    this._dragSourceColumnId = columnId;
    this._dragSourceIndex = idx;

    card.classList.add('dragging');
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', cardId);
    }
  }

  private _onDragEnd(): void {
    this._dragCardId = null;
    this._dragSourceColumnId = null;
    this._dragSourceIndex = -1;
    this._clearDropIndicators();
  }

  private _onDragOver(e: DragEvent, colBody: HTMLElement): void {
    if (!this._dragCardId) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

    this._clearDropIndicators();
    colBody.classList.add('drag-over');

    const cards = colBody.querySelectorAll<HTMLElement>('.card:not(.dragging)');
    const y = e.clientY;

    let targetCard: HTMLElement | null = null;
    let position: 'before' | 'after' = 'after';

    for (const cardEl of cards) {
      const rect = cardEl.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (y < midY) {
        targetCard = cardEl;
        position = 'before';
        break;
      }
      targetCard = cardEl;
      position = 'after';
    }

    if (targetCard) {
      targetCard.classList.add(position === 'before' ? 'drop-before' : 'drop-after');
    }
  }

  private _onDragLeave(e: DragEvent, colBody: HTMLElement): void {
    if (!colBody.contains(e.relatedTarget as Node)) {
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

    let targetIndex = this._getOrderedCards(targetColumnId).length;

    for (let i = 0; i < cards.length; i++) {
      const rect = cards[i].getBoundingClientRect();
      if (y < rect.top + rect.height / 2) {
        targetIndex = i;
        break;
      }
    }

    this.moveCard(this._dragCardId, targetColumnId, targetIndex);
  }

  // ── Keyboard Navigation ──

  private _handleKeyboard(e: KeyboardEvent): void {
    if (this._keyboardDragging) {
      this._handleKeyboardDrag(e);
      return;
    }

    const focused = this.shadowRoot?.activeElement as HTMLElement | null;
    if (!focused) return;

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
        this._moveFocusColumn(focused, -1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        this._moveFocusColumn(focused, 1);
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
        if (focused.classList.contains('card')) {
          e.preventDefault();
          this._startKeyboardDrag(focused);
        }
        break;
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
    const cards = this._getOrderedCards(columnId);
    const idx = cards.findIndex(c => c.id === cardId);

    this._keyboardDragging = true;
    this._keyboardDragCardId = cardId;
    this._keyboardDragColumnId = columnId;
    this._keyboardDragIndex = idx;

    const card = cards.find(c => c.id === cardId);
    this._liveText = `Picked up card: ${card?.title ?? cardId}. Use arrow keys to move, Enter to drop, Escape to cancel.`;

    cardEl.classList.add('keyboard-dragging');
  }

  private _keyboardMoveCard(direction: 1 | -1): void {
    const cards = this._getOrderedCards(this._keyboardDragColumnId!);
    const newIdx = Math.max(0, Math.min(cards.length - 1, this._keyboardDragIndex + direction));
    if (newIdx !== this._keyboardDragIndex) {
      this._keyboardDragIndex = newIdx;
      this._liveText = `Card position: ${newIdx + 1} of ${cards.length}`;
    }
  }

  private _keyboardMoveColumn(direction: 1 | -1): void {
    const colIdx = this._columns.findIndex(c => c.id === this._keyboardDragColumnId);
    const newColIdx = Math.max(0, Math.min(this._columns.length - 1, colIdx + direction));
    if (newColIdx !== colIdx) {
      this._keyboardDragColumnId = this._columns[newColIdx].id;
      this._keyboardDragIndex = Math.min(this._keyboardDragIndex, this._getOrderedCards(this._keyboardDragColumnId).length);
      this._liveText = `Column: ${this._columns[newColIdx].label}, position: ${this._keyboardDragIndex + 1}`;
    }
  }

  private _completeKeyboardDrag(): void {
    const cardId = this._keyboardDragCardId!;
    const targetColumnId = this._keyboardDragColumnId!;
    const targetIndex = this._keyboardDragIndex;

    this._keyboardDragging = false;
    this._keyboardDragCardId = null;
    this._keyboardDragColumnId = null;
    this._keyboardDragIndex = -1;

    this.moveCard(cardId, targetColumnId, targetIndex);
    this._liveText = 'Card dropped.';

    // Focus the moved card
    requestAnimationFrame(() => {
      const cardEl = this.$<HTMLElement>(`[data-card-id="${cardId}"]`);
      cardEl?.focus();
    });
  }

  private _cancelKeyboardDrag(): void {
    const cardId = this._keyboardDragCardId;
    this._keyboardDragging = false;
    this._keyboardDragCardId = null;
    this._keyboardDragColumnId = null;
    this._keyboardDragIndex = -1;
    this._liveText = 'Drag cancelled.';

    this.update();

    // Restore focus to the card
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

    const newColBody = this.$<HTMLElement>(`.column-body[data-column-id="${this._columns[newColIdx].id}"]`);
    if (!newColBody) return;
    const cards = newColBody.querySelectorAll<HTMLElement>('.card');
    if (cards.length) {
      const focusIdx = Math.min(cards.length - 1, 0);
      cards[focusIdx]?.focus();
    } else {
      newColBody.focus();
    }
  }

  private _focusFirstCard(focused: HTMLElement): void {
    const column = focused.closest('.column-body') as HTMLElement | null;
    if (!column) return;
    const cards = column.querySelectorAll<HTMLElement>('.card');
    cards[0]?.focus();
  }

  private _focusLastCard(focused: HTMLElement): void {
    const column = focused.closest('.column-body') as HTMLElement | null;
    if (!column) return;
    const cards = column.querySelectorAll<HTMLElement>('.card');
    cards[cards.length - 1]?.focus();
  }

  // ── Helpers ──

  private _getOrderedCards(columnId: string): KanbanCard[] {
    return this._cards
      .filter(c => c.columnId === columnId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  private _reorderColumn(columnId: string): void {
    const ordered = this._getOrderedCards(columnId);
    ordered.forEach((card, i) => { card.order = i; });
  }

  private _renderCardContent(card: KanbanCard): string {
    if (this._renderCardFn) return this._renderCardFn(card);
    if (this._config?.renderCard) return this._config.renderCard(card);
    return `<span class="card-title">${this._escapeHtml(card.title)}</span>`;
  }

  private _clearDropIndicators(): void {
    this.$$<HTMLElement>('.card').forEach(el => {
      el.classList.remove('drop-before', 'drop-after');
    });
    this.$$<HTMLElement>('.column-body').forEach(el => {
      el.classList.remove('drag-over');
    });
  }

  private _escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private _escapeAttr(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }
}

define('b-kanban', BKanban);
