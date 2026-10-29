import { BaseComponent, define } from 'birko-web-core';
import { escapeHtml, escapeAttr } from '../dom-utils';

/**
 * A ready-made row for `b-sortable-list`: an optional image, a label and an optional meta line. The list sets
 * `layout` on it, so it is a line in `list`, a tile in `grid` (a placeholder with the label's initial stands in for a
 * missing image, so tiles stay one shape) and a chip label in `inline`. Any other element can be a row instead.
 */
export class BSortableItem extends BaseComponent {
  static get observedAttributes() { return ['label', 'meta', 'image']; }

  static get styles() {
    return `
      :host { display: flex; align-items: center; gap: var(--b-space-sm, 0.5rem); min-width: 0; }
      .img {
        flex: none; width: 2.5rem; height: 2.5rem; object-fit: cover;
        border-radius: var(--b-radius-sm, 0.25rem); background: var(--b-bg-tertiary);
      }
      .placeholder { display: none; }
      .text { display: grid; min-width: 0; }
      .label, .meta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .label { color: var(--b-text); font-weight: var(--b-font-weight-medium, 500); }
      .meta { color: var(--b-text-muted); font-size: var(--b-text-xs, 0.6875rem); }

      :host([layout="grid"]) { flex-direction: column; align-items: stretch; gap: 0; }
      :host([layout="grid"]) .img { width: 100%; height: auto; aspect-ratio: var(--b-sortable-tile-ratio, 4 / 3); border-radius: 0; }
      :host([layout="grid"]) .placeholder {
        display: grid; place-items: center;
        color: var(--b-text-muted); font-size: var(--b-text-xl, 1.25rem); font-weight: var(--b-font-weight-semibold, 600);
      }
      :host([layout="grid"]) .text { padding: var(--b-space-xs, 0.25rem) var(--b-space-sm, 0.5rem) var(--b-space-sm, 0.5rem); }

      :host([layout="inline"]) .img, :host([layout="inline"]) .meta { display: none; }
      :host([layout="inline"]) .label { font-size: var(--b-text-sm, 0.8125rem); font-weight: inherit; }
    `;
  }

  render() {
    const label = this.attr('label');
    const meta = this.attr('meta');
    const image = this.attr('image');
    // alt="": the label beside it already names the row.
    const picture = image
      ? `<img class="img" src="${escapeAttr(image)}" alt="" loading="lazy" draggable="false">`
      : `<span class="img placeholder" aria-hidden="true">${escapeHtml(label.trim().charAt(0).toUpperCase())}</span>`;
    return `
      ${picture}
      <span class="text">
        <span class="label">${escapeHtml(label)}</span>
        ${meta ? `<span class="meta">${escapeHtml(meta)}</span>` : ''}
      </span>
    `;
  }
}

define('b-sortable-item', BSortableItem);
