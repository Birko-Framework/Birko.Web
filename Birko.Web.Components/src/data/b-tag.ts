import { BaseComponent, define } from 'birko-web-core';

export class BTag extends BaseComponent {
  static get observedAttributes() { return ['color', 'removable', 'size']; }

  static get styles() {
    return `
      :host { display: inline-block; }
      .tag {
        display: inline-flex; align-items: center; gap: var(--b-space-xs, 0.25rem);
        padding: 0.125rem var(--b-space-sm, 0.5rem);
        border-radius: var(--b-radius-full, 9999px);
        background: var(--b-bg-tertiary);
        font-size: var(--b-text-xs, 0.6875rem);
        font-weight: var(--b-font-weight-medium, 500);
        color: var(--b-text-secondary);
        white-space: nowrap;
        line-height: 1.6;
      }
      :host([size="sm"]) .tag {
        font-size: 0.625rem;
        padding: 0 var(--b-space-xs, 0.25rem);
      }
      :host([size="lg"]) .tag {
        font-size: var(--b-text-sm, 0.8125rem);
        padding: var(--b-space-xs, 0.25rem) var(--b-space-md, 0.75rem);
      }
      .dot {
        width: 0.5rem; height: 0.5rem;
        border-radius: var(--b-radius-full, 9999px);
        flex-shrink: 0;
      }
      .remove {
        background: none; border: none; cursor: pointer; padding: 0;
        color: var(--b-text-muted); font-size: var(--b-text-xs, 0.6875rem);
        line-height: 1; margin-left: var(--b-space-xs, 0.25rem);
        display: inline-flex; align-items: center;
      }
      .remove:hover { color: var(--b-text); }
      .remove:focus-visible { box-shadow: var(--b-focus-ring); border-radius: var(--b-radius-sm, 0.25rem); outline: none; }
    `;
  }

  render() {
    const color = this.attr('color');
    const removable = this.boolAttr('removable');
    const dot = color ? `<span class="dot" style="background:${color}"></span>` : '';
    const removeBtn = removable ? `<button class="remove" type="button" aria-label="Remove">&times;</button>` : '';
    return `<span class="tag">${dot}<slot></slot>${removeBtn}</span>`;
  }

  protected onUpdated() {
    if (!this.boolAttr('removable')) return;
    const btn = this.$<HTMLElement>('.remove');
    if (btn) {
      this.listen(btn, 'click', (e) => {
        e.stopPropagation();
        this.emit('remove', {});
      });
    }
  }
}

define('b-tag', BTag);
