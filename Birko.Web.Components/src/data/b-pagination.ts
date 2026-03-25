import { BaseComponent, define } from 'birko-web-core';

export class BPagination extends BaseComponent {
  static get observedAttributes() { return ['page', 'total-pages', 'total-count']; }

  static get styles() {
    return `
      :host { display: block; }
      .pagination {
        display: flex; align-items: center; justify-content: space-between;
        padding: var(--b-space-sm, 0.5rem) 0; font-size: var(--b-text-sm, 0.8125rem);
      }
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
    `;
  }

  render() {
    const page = this.numAttr('page', 1);
    const totalPages = this.numAttr('total-pages', 1);
    const totalCount = this.attr('total-count');
    const pages = this._getPageNumbers(page, totalPages);

    return `
      <div class="pagination">
        <span class="info">${totalCount ? `${totalCount} items` : `Page ${page} of ${totalPages}`}</span>
        <div class="pages">
          <button class="page-btn" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>&lsaquo;</button>
          ${pages.map(p =>
            p === '...'
              ? '<span class="ellipsis">...</span>'
              : `<button class="page-btn ${p === page ? 'active' : ''}" data-page="${p}">${p}</button>`
          ).join('')}
          <button class="page-btn" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>&rsaquo;</button>
        </div>
      </div>
    `;
  }

  protected onUpdated() {
    this.$$<HTMLButtonElement>('.page-btn:not(:disabled)').forEach(btn => {
      btn.addEventListener('click', () => {
        const page = Number(btn.dataset.page);
        if (page > 0) {
          this.setAttribute('page', String(page));
          this.emit('page-change', { page });
        }
      });
    });
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
