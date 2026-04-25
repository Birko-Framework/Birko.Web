import { BaseComponent, define } from 'birko-web-core';
import '../inputs/b-button.js';
import '../inputs/b-select.js';

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
      .page-btn-active { background: var(--b-color-primary); color: var(--b-text-inverse); border-color: var(--b-color-primary); }
      .info { color: var(--b-text-muted); }
      .ellipsis { padding: 0 var(--b-space-xs, 0.25rem); color: var(--b-text-muted); align-self: flex-end; }
      .page-size-wrapper { display: inline-flex; align-items: center; gap: var(--b-space-xs, 0.25rem); }
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

    // Translatable labels — attribute override > global i18n > English fallback
    const lItems = this.label('label-items', 'bwc.pagination.items', 'items');
    const lPage = this.label('label-page', 'bwc.pagination.page', 'Page');
    const lOf = this.label('label-of', 'bwc.pagination.of', 'of');
    const lPerPage = this.label('label-per-page', 'bwc.pagination.perPage', '/ page');
    const lPrev = this.label('label-prev', 'bwc.pagination.prev', 'Previous page');
    const lNext = this.label('label-next', 'bwc.pagination.next', 'Next page');
    const lPageSize = this.label('label-page-size', 'bwc.pagination.pageSize', 'Page size');

    return `
      <nav class="pagination" role="navigation" aria-label="${this.label('label-pagination', 'bwc.pagination.title', 'Pagination')}">
        <div class="pagination-left">
          <span class="info">${totalCount ? `${totalCount} ${lItems}` : `${lPage} ${page} ${lOf} ${totalPages}`}</span>
          ${showSizePicker ? `<b-select class="page-size-select" aria-label="${lPageSize}"></b-select>` : ''}
        </div>
        <div class="pages">
          <b-button variant="ghost" size="sm" class="page-btn-prev" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''} aria-label="${lPrev}">&lsaquo;</b-button>
          ${pages.map(p =>
            p === '...'
              ? '<span class="ellipsis">...</span>'
              : `<b-button variant="${p === page ? 'primary' : 'ghost'}" size="sm" class="page-btn" data-page="${p}" ${p === page ? 'aria-current="page"' : ''} aria-label="${lPage} ${p}">${p}</b-button>`
          ).join('')}
          <b-button variant="ghost" size="sm" class="page-btn-next" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''} aria-label="${lNext}">&rsaquo;</b-button>
        </div>
      </nav>
    `;
  }

  protected onUpdated() {
    // Page buttons (b-button)
    this.$$<HTMLElement>('.page-btn, .page-btn-prev, .page-btn-next').forEach(btn => {
      const page = Number(btn.dataset.page);
      // Listen on the internal button element
      const internalBtn = btn.querySelector('button');
      if (internalBtn && !internalBtn.disabled) {
        this.listen(internalBtn, 'click', () => {
          if (page > 0) {
            this.setAttribute('page', String(page));
            this.emit('page-change', { page });
          }
        });
      }
    });

    // Page size select (b-select)
    const sizeSelect = this.$<HTMLElement>('.page-size-select') as any;
    if (sizeSelect) {
      const pageSize = this.numAttr('page-size', 0);
      const pageSizes = this._getPageSizes();
      const lPerPage = this.label('label-per-page', 'bwc.pagination.perPage', '/ page');

      // Set options using the component's API
      const options = pageSizes.map(s => ({ value: String(s), label: `${s} ${lPerPage}` }));
      sizeSelect.setOptions(options);
      sizeSelect.inputValue = String(pageSize);

      // Listen for changes
      this.listen(sizeSelect, 'change', (e: Event) => {
        const size = Number((e as CustomEvent).detail.value);
        this.setAttribute('page-size', String(size));
        this.emit('page-size-change', { pageSize: size });
      });
    }
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
