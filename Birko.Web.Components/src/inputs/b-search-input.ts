import { BaseComponent, define } from 'birko-web-core';
import { formControlSheet } from '../shared-styles';

export class BSearchInput extends BaseComponent {
  static get observedAttributes() {
    return ['placeholder', 'value', 'debounce', 'label-clear'];
  }

  private _timer: ReturnType<typeof setTimeout> | null = null;

  static get sharedStyles() {
    return [formControlSheet];
  }

  static get styles() {
    return `
      :host { display: block; }
      .search-wrap {
        position: relative;
        display: flex;
        align-items: center;
      }
      .icon {
        position: absolute;
        left: var(--b-space-sm, 0.5rem);
        width: var(--b-icon-base, 1rem);
        height: var(--b-icon-base, 1rem);
        color: var(--b-text-muted);
        pointer-events: none;
      }
      .icon svg {
        width: 100%;
        height: 100%;
        fill: none;
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      input {
        padding-left: var(--b-space-xl, 1.5rem);
        padding-right: var(--b-space-xl, 1.5rem);
      }
      input[type="search"]::-webkit-search-cancel-button { display: none; }
      .clear {
        position: absolute;
        right: var(--b-space-xs, 0.25rem);
        background: none;
        border: none;
        cursor: pointer;
        padding: var(--b-space-xs, 0.25rem);
        border-radius: var(--b-radius, 0.375rem);
        color: var(--b-text-muted);
        font-size: var(--b-icon-base, 1rem);
        line-height: 1;
        display: none;
      }
      .clear:hover { background: var(--b-bg-tertiary); color: var(--b-text); }
      :host([value]:not([value=""])) .clear { display: block; }
    `;
  }

  render() {
    const value = this.attr('value');
    const placeholder = this.attr('placeholder', 'Search...');

    return `
      <div class="search-wrap">
        <span class="icon">
          <svg viewBox="0 0 16 16">
            <circle cx="6.5" cy="6.5" r="5"/>
            <line x1="10" y1="10" x2="14.5" y2="14.5"/>
          </svg>
        </span>
        <input type="search"
               value="${value}"
               placeholder="${placeholder}"
               aria-label="${placeholder}" />
        <button class="clear" aria-label="${this.attr('label-clear', 'Clear search')}">&times;</button>
      </div>
    `;
  }

  protected onUpdated() {
    const input = this.$<HTMLInputElement>('input');
    if (!input) return;

    input.addEventListener('input', () => {
      const value = input.value;
      this.setAttribute('value', value);
      this._debounceEmit(value);
    });

    this.$('.clear')?.addEventListener('click', () => {
      this.setAttribute('value', '');
      input.value = '';
      input.focus();
      this._debounceEmit('');
    });
  }

  protected onUnmount() {
    if (this._timer) clearTimeout(this._timer);
  }

  private _debounceEmit(value: string) {
    if (this._timer) clearTimeout(this._timer);
    const delay = this.numAttr('debounce', 300);
    this._timer = setTimeout(() => {
      this.emit('search', { value });
    }, delay);
  }

  get inputValue(): string {
    return this.$<HTMLInputElement>('input')?.value ?? '';
  }
}

define('b-search-input', BSearchInput);
