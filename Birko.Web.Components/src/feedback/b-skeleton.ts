import { BaseComponent, define } from 'birko-web-core';

export class BSkeleton extends BaseComponent {
  static get observedAttributes() {
    return ['type', 'width', 'height', 'rows', 'columns'];
  }

  static get styles() {
    return `
      :host { display: block; }
      @keyframes skeleton-pulse {
        0%, 100% { opacity: 0.4; }
        50% { opacity: 1; }
      }
      .bone {
        background: var(--b-bg-tertiary);
        border-radius: var(--b-radius, 0.375rem);
        animation: skeleton-pulse 1.5s ease-in-out infinite;
      }
      .bone.circle { border-radius: var(--b-radius-full, 9999px); }

      /* Table skeleton */
      .table-skeleton {
        display: flex;
        flex-direction: column;
        gap: var(--b-space-xs, 0.25rem);
        padding: var(--b-space-sm, 0.5rem) var(--b-space-md, 0.75rem);
      }
      .table-row {
        display: flex;
        gap: var(--b-space-md, 0.75rem);
      }
      .table-row .bone { height: 0.875rem; flex: 1; }
      .table-row.header .bone {
        height: 0.625rem;
        opacity: 0.7;
      }
      .table-row + .table-row { margin-top: var(--b-space-xs, 0.25rem); }

      /* Form skeleton */
      .form-skeleton {
        display: flex;
        flex-direction: column;
        gap: var(--b-space-lg, 1rem);
      }
      .form-field {
        display: flex;
        flex-direction: column;
        gap: var(--b-space-xs, 0.25rem);
      }
      .form-label { height: 0.8125rem; width: 30%; }
      .form-input { height: 2.25rem; width: 100%; }
    `;
  }

  render() {
    const type = this.attr('type', 'text');

    switch (type) {
      case 'circle':
        return this._renderCircle();
      case 'table':
        return this._renderTable();
      case 'form':
        return this._renderForm();
      default:
        return this._renderText();
    }
  }

  private _renderText(): string {
    const width = this.attr('width', '100%');
    const height = this.attr('height', '0.875rem');
    return `<div class="bone" style="width:${width};height:${height}"></div>`;
  }

  private _renderCircle(): string {
    const size = this.attr('width', '3rem');
    return `<div class="bone circle" style="width:${size};height:${size}"></div>`;
  }

  private _renderTable(): string {
    const rows = this.numAttr('rows', 3);
    const columns = this.numAttr('columns', 4);

    const cols = Array.from({ length: columns }, () => '<div class="bone"></div>').join('');
    const header = `<div class="table-row header">${cols}</div>`;
    const body = Array.from({ length: rows }, () =>
      `<div class="table-row">${cols}</div>`
    ).join('');

    return `<div class="table-skeleton">${header}${body}</div>`;
  }

  private _renderForm(): string {
    const fields = this.numAttr('rows', 4);
    const rows = Array.from({ length: fields }, () => `
      <div class="form-field">
        <div class="bone form-label"></div>
        <div class="bone form-input"></div>
      </div>
    `).join('');

    return `<div class="form-skeleton">${rows}</div>`;
  }
}

define('b-skeleton', BSkeleton);
