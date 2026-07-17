import { BaseComponent, define } from 'birko-web-core';
import { escapeHtml, escapeAttr } from '../dom-utils';
import { srOnlySheet } from '../shared-styles';

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
  parentId?: string;
  collapsed?: boolean;
  children?: KanbanCard[];
}

export interface KanbanConfig {
  columns: KanbanColumn[];
  cards: KanbanCard[];
  renderCard?: (card: KanbanCard, depth: number) => string;
  emptyText?: string;
  maxNestingDepth?: number;
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

  // Live region text
  private _liveText = '';

  render() {
    if (!this._columns.length) {
      return '<div class="empty-placeholder">No columns configured</div>';
    }

    const emptyText = this.attr('empty-text', 'No cards');

    const columnsHtml = this._columns.map(col => {
      const cards = this._getOrderedCards(col.id);
      const topLevelCards = cards.filter(c => !c.parentId);
      const totalCount = this._countAllCards(cards);
      const cardsHtml = topLevelCards.length
        ? topLevelCards.map((card, idx) => this._renderCard(card, col.id, idx, 0)).join('')
        : `<div class="empty-placeholder">${escapeHtml(emptyText)}</div>`;

      const accent = col.color ? `border-left: 3px solid ${col.color};` : '';
      return `
        <div class="column" data-column-id="${escapeAttr(col.id)}">
          <div class="column-header" style="${accent}">
            <span class="column-title">${escapeHtml(col.label)}</span>
            <span class="column-count">${totalCount}</span>
          </div>
          <div class="column-body" data-column-id="${escapeAttr(col.id)}" role="list" aria-label="${escapeAttr(col.label)}">
            ${cardsHtml}
          </div>
          <div class="column-footer">${totalCount} card${totalCount !== 1 ? 's' : ''}</div>
        </div>
      `;
    }).join('');

    return `
      <div class="board" role="group" aria-label="Kanban board" tabindex="0">
        ${columnsHtml}
      </div>
      <div class="sr-only" aria-live="polite">${escapeHtml(this._liveText)}</div>
    `;
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

    const colorStyle = card.color ? `border-left: 3px solid ${card.color};` : '';

    return `
      <div class="card"
           draggable="true"
           tabindex="-1"
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
      this.listen(card, 'dragstart', (e: Event) => this._onDragStart(e as DragEvent, card));
      this.listen(card, 'dragend', () => this._onDragEnd());
      this.listen(card, 'click', (e: Event) => {
        if (this._dragCardId || this._keyboardDragging) return;
        const tgt = e.target as HTMLElement;
        if (tgt.closest('.card-toggle')) return;
        const cardId = card.dataset.cardId!;
        const columnId = card.dataset.columnId!;
        const cardData = this._cards.find(c => c.id === cardId);
        this.emit('card-click', { cardId, columnId, card: cardData });
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
    }
  }

  // ── Public API ──

  setConfig(config: KanbanConfig): void {
    this._config = config;
    this._columns = [...config.columns];
    this._cards = this._flattenCards(config.cards);
    this._liveText = '';
    this._collectExpanded(config.cards);
    this.update();
  }

  setCards(cards: KanbanCard[]): void {
    this._cards = this._flattenCards(cards);
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

  moveCard(cardId: string, targetColumnId: string, targetIndex?: number, targetParentId?: string): void {
    const cardIndex = this._cards.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return;

    const card = this._cards[cardIndex];
    const fromColumnId = card.columnId;
    const fromParentId = card.parentId ?? '';
    const orderedSource = this._getOrderedCards(fromColumnId, fromParentId);
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

    // Re-insert at target position among siblings
    const siblings = this._getOrderedCards(targetColumnId, targetParentId ?? '');
    if (targetIndex !== undefined && targetIndex < siblings.length) {
      const insertBeforeId = siblings[targetIndex].id;
      const insertBeforeGlobal = this._cards.findIndex(c => c.id === insertBeforeId);
      this._cards.splice(insertBeforeGlobal, 0, card);
    } else {
      this._cards.push(card);
    }

    // Re-order
    this._reorderGroup(targetColumnId, targetParentId ?? '');
    if (fromColumnId !== targetColumnId || fromParentId !== (targetParentId ?? '')) {
      this._reorderGroup(fromColumnId, fromParentId);
    }

    this.update();

    const toIndex = targetIndex ?? this._getOrderedCards(targetColumnId, targetParentId ?? '').findIndex(c => c.id === cardId);

    const detail: Record<string, unknown> = {
      card,
      fromColumn: fromColumnId,
      toColumn: targetColumnId,
      fromIndex,
      toIndex: Math.max(0, toIndex),
    };
    if (targetParentId) detail.toParent = targetParentId;
    if (fromParentId) detail.fromParent = fromParentId;

    if (fromColumnId !== targetColumnId || fromParentId !== (targetParentId ?? '')) {
      this.emit('card-move', detail);
    } else {
      this.emit('card-reorder', detail);
    }
  }

  getCards(columnId?: string): KanbanCard[] {
    const cards = columnId ? this._cards.filter(c => c.columnId === columnId) : [...this._cards];
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
    const cards = this._getOrderedCards(columnId, parentId);
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

    this.moveCard(this._dragCardId, targetColumnId, targetIndex, targetParentId);
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

    if (!focused.classList.contains('card')) return;

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
    const parentId = cardEl.dataset.parentId ?? '';
    const cards = this._getOrderedCards(columnId, parentId);
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
    const cards = this._getOrderedCards(this._keyboardDragColumnId!, '');
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
      cards[0]?.focus();
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

  private _getOrderedCards(columnId: string, parentId: string = ''): KanbanCard[] {
    return this._cards
      .filter(c => c.columnId === columnId && (c.parentId ?? '') === parentId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  private _reorderGroup(columnId: string, parentId: string): void {
    const ordered = this._getOrderedCards(columnId, parentId);
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
