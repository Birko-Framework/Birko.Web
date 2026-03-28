import { BaseComponent, define } from 'birko-web-core';

export const DEFAULT_PAGE_SIZES = [10, 20, 50, 100];

export class BPagination extends BaseComponent {
  static get observedAttributes() { return ['page', 'total-pages', 'total-count', 'page-size', 'page-sizes', 'label-items', 'label-page', 'label-of', 'label-per-page', 'label-prev', 'label-next', 'label-page-size']; }

  static get styles() {
    return `
      :host { display: block; }
      .pagination {
        display: flex; align-items: center; justify-content: space-between;
        padding: var(--b-space-sm, 0.5rem) 0; font-size: var(--b-text-sm, 0.8125rem);
      }
      .pagination-left { display: flex; align-items: center; gap: var(--b-space-sm, 0.5rem); }
      .pages { display: flex; gap: var(--b-space-xs, 0.25rem); }
      .page-btn {
        min-width: var(--b-page-btn-size, 2rem); height: var(--b-page-btn-size, 2rem);
        display: flex; align-items: center; justify-content: center;
        border: var(--b-border-width, 1px) solid var(--b-border); border-radius: var(--b-radius);
        background: var(--b-bg); cursor: pointer; font-size: var(--b-text-sm);
        transition: all var(--b-transition, 150ms ease);
      }
      .page-btn:hover:not(:disabled):not(.active) { background: var(--b-bg-tertiary); border-color: var(--b-border-hover); }
      .page-btn.active { background: var(--b-color-primary); color: var(--b-text-inverse); border-color: var(--b-color-primary); }
      .page-btn:disabled { opacity: var(--b-disabled-opacity, 0.5); cursor: not-allowed; }
      .info { color: var(--b-text-muted); }
      .ellipsis { padding: 0 var(--b-space-xs, 0.25rem); color: var(--b-text-muted); align-self: flex-end; }
      .page-size-select {
        padding: var(--b-space-xs, 0.25rem) var(--b-space-sm, 0.5rem);
        border: var(--b-border-width, 1px) solid var(--b-border);
        border-radius: var(--b-radius);
        font-size: var(--b-text-sm, 0.8125rem);
        background: var(--b-bg);
        color: var(--b-text);
        cursor: pointer;
      }
    `;
  }

  render() {
    const page = this.numAttr('page', 1);
    const totalPages = this.numAttr('total-pages', 1);
    const totalCount = this.attr('total-count');
    const pageSize = this.numAttr('page-size', 0);
    const pageSizes = this._getPageSizes();
    const pages = this._getPageNumbers(page, totalPages);

    const showSizePicker = pageSize > 0 && pageSizes.length > 0;

    // Translatable labels with English defaults
    const lItems = this.attr('label-items', 'items');
    const lPage = this.attr('label-page', 'Page');
    const lOf = this.attr('label-of', 'of');
    const lPerPage = this.attr('label-per-page', '/ page');
    const lPrev = this.attr('label-prev', 'Previous page');
    const lNext = this.attr('label-next', 'Next page');
    const lPageSize = this.attr('label-page-size', 'Page size');

    return `
      <nav class="pagination" role="navigation" aria-label="${this.attr('label-pagination', 'Pagination')}">
        <div class="pagination-left">
          <span class="info">${totalCount ? `${totalCount} ${lItems}` : `${lPage} ${page} ${lOf} ${totalPages}`}</span>
          ${showSizePicker ? `
            <select class="page-size-select" aria-label="${lPageSize}">
              ${pageSizes.map(s => `<option value="${s}" ${s === pageSize ? 'selected' : ''}>${s} ${lPerPage}</option>`).join('')}
            </select>
          ` : ''}
        </div>
        <div class="pages">
          <button class="page-btn" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''} aria-label="${lPrev}">&lsaquo;</button>
          ${pages.map(p =>
            p === '...'
              ? '<span class="ellipsis">...</span>'
              : `<button class="page-btn ${p === page ? 'active' : ''}" data-page="${p}" ${p === page ? 'aria-current="page"' : ''} aria-label="${lPage} ${p}">${p}</button>`
          ).join('')}
          <button class="page-btn" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''} aria-label="${lNext}">&rsaquo;</button>
        </div>
      </nav>
    `;
  }

  protected onUpdated() {
    this.$$<HTMLButtonElement>('.page-btn:not(:disabled)').forEach(btn => {
      this.listen(btn, 'click', () => {
        const page = Number(btn.dataset.page);
        if (page > 0) {
          this.setAttribute('page', String(page));
          this.emit('page-change', { page });
        }
      });
    });

    const sizeSelect = this.$<HTMLSelectElement>('.page-size-select');
    if (sizeSelect) this.listen(sizeSelect, 'change', (e: Event) => {
      const size = Number((e.target as HTMLSelectElement).value);
      this.setAttribute('page-size', String(size));
      this.emit('page-size-change', { pageSize: size });
    });
  }

  private _getPageSizes(): number[] {
    const raw = this.attr('page-sizes');
    if (raw) {
      return raw.split(',').map(s => Number(s.trim())).filter(n => n > 0);
    }
    return DEFAULT_PAGE_SIZES;
  }

  private _getPageNumbers(current: number, total: number): (number | string)[] {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages: (number | string)[] = [1];
    if (current > 3) pages.push('...');
    for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
      pages.push(i);
    }
    if (current < total - 2) pages.push('...');
    pages.push(total);
    return pages;
  }
}

define('b-pagination', BPagination);
