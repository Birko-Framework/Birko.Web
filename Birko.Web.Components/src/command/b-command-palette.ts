import { BaseComponent, define } from 'birko-web-core';
import { getProviders, type CommandItem } from './command-provider.js';

// ── Store ────────────────────────────────────────────────────────────────────

let _isOpen = false;
const _listeners = new Set<(open: boolean) => void>();

function _notify() { _listeners.forEach(fn => fn(_isOpen)); }

export function openCommandPalette()  { _isOpen = true;  _notify(); }
export function closeCommandPalette() { _isOpen = false; _notify(); }
export function toggleCommandPalette() { _isOpen = !_isOpen; _notify(); }
export function onPaletteChange(fn: (open: boolean) => void) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

// ── Component ────────────────────────────────────────────────────────────────

interface PaletteState {
  query: string;
  results: CommandItem[];
  activeIdx: number;
  loading: boolean;
}

export class BCommandPalette extends BaseComponent {
  private _state: PaletteState = { query: '', results: [], activeIdx: -1, loading: false };
  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _unsub: (() => void) | null = null;
  private _kbHandler: ((e: KeyboardEvent) => void) | null = null;

  static get styles() {
    return `
      :host { display: contents; }

      /* Backdrop */
      .palette-backdrop {
        position: fixed; inset: 0;
        background: rgba(0, 0, 0, 0.45);
        z-index: 900;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding-top: 10vh;

        /* Animation */
        opacity: 0;
        transition: opacity var(--b-transition, 150ms ease);
      }
      .palette-backdrop.open { opacity: 1; }

      /* Panel */
      .palette-panel {
        width: min(640px, 92vw);
        background: var(--b-bg-elevated);
        border: 1px solid var(--b-border);
        border-radius: var(--b-radius-lg, 0.5rem);
        box-shadow: var(--b-shadow-xl, 0 20px 48px rgba(0,0,0,0.25));
        display: flex;
        flex-direction: column;
        max-height: 70vh;
        overflow: hidden;

        /* Scale animation */
        transform: scale(0.96);
        transition: transform var(--b-transition, 150ms ease);
      }
      .palette-backdrop.open .palette-panel { transform: scale(1); }

      /* Search row */
      .search-row {
        display: flex;
        align-items: center;
        gap: var(--b-space-sm, 0.5rem);
        padding: var(--b-space-md, 0.75rem) var(--b-space-lg, 1rem);
        border-bottom: 1px solid var(--b-border);
        flex-shrink: 0;
      }
      .search-icon {
        color: var(--b-text-muted);
        font-size: 1rem;
        flex-shrink: 0;
      }
      .search-input {
        flex: 1;
        border: none;
        background: transparent;
        font-size: var(--b-text-base, 0.9375rem);
        color: var(--b-text);
        outline: none;
      }
      .search-input::placeholder { color: var(--b-text-muted); }
      .search-hint {
        font-size: var(--b-text-xs, 0.6875rem);
        color: var(--b-text-muted);
        flex-shrink: 0;
      }
      kbd {
        display: inline-flex; align-items: center;
        padding: 0 0.3rem;
        background: var(--b-bg-tertiary);
        border: 1px solid var(--b-border);
        border-radius: var(--b-radius-sm, 0.25rem);
        font-size: 0.625rem;
        font-family: inherit;
        color: var(--b-text-muted);
      }

      /* Results */
      .results {
        flex: 1;
        overflow-y: auto;
        overscroll-behavior: contain;
      }

      /* Category header */
      .category-label {
        padding: var(--b-space-xs, 0.25rem) var(--b-space-lg, 1rem);
        font-size: var(--b-text-xs, 0.6875rem);
        font-weight: var(--b-font-weight-bold, 700);
        color: var(--b-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        background: var(--b-bg-secondary);
        position: sticky; top: 0; z-index: 1;
      }

      /* Result row */
      .result-row {
        display: flex;
        align-items: center;
        gap: var(--b-space-md, 0.75rem);
        padding: var(--b-space-sm, 0.5rem) var(--b-space-lg, 1rem);
        cursor: pointer;
        transition: background var(--b-transition, 150ms ease);
      }
      .result-row:hover,
      .result-row.active {
        background: var(--b-color-primary-light);
      }
      .result-icon {
        width: 1.75rem; height: 1.75rem;
        display: flex; align-items: center; justify-content: center;
        background: var(--b-bg-tertiary);
        border-radius: var(--b-radius, 0.375rem);
        font-size: 0.875rem;
        flex-shrink: 0;
        color: var(--b-text-muted);
      }
      .result-body { flex: 1; min-width: 0; }
      .result-label {
        font-size: var(--b-text-sm, 0.8125rem);
        font-weight: var(--b-font-weight-medium, 500);
        color: var(--b-text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .result-desc {
        font-size: var(--b-text-xs, 0.6875rem);
        color: var(--b-text-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .result-enter {
        font-size: var(--b-text-xs, 0.6875rem);
        color: var(--b-text-muted);
        flex-shrink: 0;
        opacity: 0;
        transition: opacity var(--b-transition, 150ms ease);
      }
      .result-row.active .result-enter { opacity: 1; }

      /* Empty / loading */
      .empty-state {
        padding: var(--b-space-xl, 2rem);
        text-align: center;
        color: var(--b-text-muted);
        font-size: var(--b-text-sm, 0.8125rem);
      }

      /* Footer */
      .palette-footer {
        display: flex;
        gap: var(--b-space-lg, 1rem);
        padding: var(--b-space-xs, 0.25rem) var(--b-space-lg, 1rem);
        border-top: 1px solid var(--b-border);
        flex-shrink: 0;
      }
      .footer-hint {
        display: flex;
        align-items: center;
        gap: var(--b-space-xs, 0.25rem);
        font-size: var(--b-text-xs, 0.6875rem);
        color: var(--b-text-muted);
      }
    `;
  }

  render() {
    if (!_isOpen) return `<div></div>`;

    const { query, results, activeIdx, loading } = this._state;
    const groups = this._groupResults(results);

    return `
      <div class="palette-backdrop open" id="backdrop">
        <div class="palette-panel" role="dialog" aria-modal="true" aria-label="Command palette">

          <div class="search-row">
            <span class="search-icon">\u2315</span>
            <input
              class="search-input"
              id="search-input"
              type="text"
              placeholder="${this.attr('placeholder', 'Search commands, pages, actions\u2026')}"
              value="${this._escAttr(query)}"
              autocomplete="off"
              spellcheck="false"
            />
            <span class="search-hint"><kbd>Esc</kbd> to close</span>
          </div>

          <div class="results" id="results" role="listbox">
            ${loading
              ? `<div class="empty-state"><b-spinner></b-spinner> Searching\u2026</div>`
              : groups.length === 0
                ? `<div class="empty-state">${query ? 'No results found' : 'Type to search\u2026'}</div>`
                : groups.map(g => `
                    <div class="category-label">${g.category}</div>
                    ${g.items.map(item => {
                      const globalIdx = results.indexOf(item);
                      return `
                        <div class="result-row ${globalIdx === activeIdx ? 'active' : ''}"
                             role="option"
                             aria-selected="${globalIdx === activeIdx}"
                             data-idx="${globalIdx}"
                             id="result-${globalIdx}">
                          <div class="result-icon">${item.icon ?? '\u25CB'}</div>
                          <div class="result-body">
                            <div class="result-label">${this._esc(item.label)}</div>
                            ${item.description ? `<div class="result-desc">${this._esc(item.description)}</div>` : ''}
                          </div>
                          <span class="result-enter"><kbd>\u21B5</kbd></span>
                        </div>
                      `;
                    }).join('')}
                  `).join('')
            }
          </div>

          <div class="palette-footer">
            <span class="footer-hint"><kbd>\u2191</kbd><kbd>\u2193</kbd> Navigate</span>
            <span class="footer-hint"><kbd>\u21B5</kbd> Select</span>
            <span class="footer-hint"><kbd>Esc</kbd> Close</span>
          </div>
        </div>
      </div>
    `;
  }

  protected onMount() {
    // Subscribe to open/close signal
    this._unsub = onPaletteChange(open => {
      if (open) {
        this._state = { query: '', results: [], activeIdx: -1, loading: false };
        this.update();
        // Focus input after render
        requestAnimationFrame(() => {
          this.$<HTMLInputElement>('#search-input')?.focus();
          // Load default (empty query) results
          this._runSearch('');
        });
      } else {
        this.update();
      }
    });

    // Global keyboard shortcut
    this._kbHandler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === 'k') {
        e.preventDefault();
        toggleCommandPalette();
      }
    };
    window.addEventListener('keydown', this._kbHandler);
  }

  protected onUpdated() {
    if (!_isOpen) return;

    // Wire search input
    const input = this.$<HTMLInputElement>('#search-input');
    if (input) {
      input.value = this._state.query;
      input.addEventListener('input', (e) => {
        const q = (e.target as HTMLInputElement).value;
        this._state.query = q;
        this._state.activeIdx = -1;
        this._scheduleSearch(q);
      });
      input.addEventListener('keydown', (e) => this._onInputKey(e));
    }

    // Backdrop click → close
    this.$('#backdrop')?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).id === 'backdrop') closeCommandPalette();
    });

    // Row clicks
    this.shadowRoot?.querySelectorAll('.result-row').forEach(row => {
      row.addEventListener('click', () => {
        const idx = parseInt((row as HTMLElement).dataset['idx'] ?? '-1', 10);
        this._execute(idx);
      });
    });
  }

  protected onUnmount() {
    this._unsub?.();
    if (this._kbHandler) window.removeEventListener('keydown', this._kbHandler);
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
  }

  // ── Private ──

  private _groupResults(items: CommandItem[]): { category: string; items: CommandItem[] }[] {
    const map = new Map<string, CommandItem[]>();
    for (const item of items) {
      if (!map.has(item.category)) map.set(item.category, []);
      map.get(item.category)!.push(item);
    }
    return Array.from(map.entries()).map(([category, items]) => ({ category, items }));
  }

  private _scheduleSearch(query: string) {
    if (this._debounceTimer) clearTimeout(this._debounceTimer);

    // Local providers run instantly, API providers are debounced
    const localResults = this._runLocalSearch(query);
    this._state.results = localResults;
    this._state.activeIdx = -1;
    this.update();

    // Debounce API providers
    this._debounceTimer = setTimeout(() => {
      this._runSearch(query);
    }, 200);
  }

  private _runLocalSearch(query: string): CommandItem[] {
    const items: CommandItem[] = [];
    for (const provider of getProviders()) {
      const result = provider.search(query);
      if (result instanceof Promise) continue; // skip async
      items.push(...result);
    }
    return items;
  }

  private async _runSearch(query: string): Promise<void> {
    this._state.loading = true;
    this.update();

    const allItems: CommandItem[] = [];
    const promises = getProviders().map(async (provider) => {
      try {
        const result = await provider.search(query);
        allItems.push(...result);
      } catch {
        // ignore provider errors
      }
    });

    await Promise.all(promises);

    // Deduplicate by id
    const seen = new Set<string>();
    const deduped = allItems.filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

    this._state.results = deduped;
    this._state.loading = false;
    this.update();
  }

  private _onInputKey(e: KeyboardEvent) {
    const { results, activeIdx } = this._state;

    if (e.key === 'Escape') {
      e.preventDefault();
      closeCommandPalette();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this._state.activeIdx = Math.min(activeIdx + 1, results.length - 1);
      this.update();
      this._scrollActiveIntoView();
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      this._state.activeIdx = Math.max(activeIdx - 1, 0);
      this.update();
      this._scrollActiveIntoView();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const idx = activeIdx >= 0 ? activeIdx : 0;
      this._execute(idx);
      return;
    }
  }

  private _execute(idx: number) {
    const item = this._state.results[idx];
    if (!item) return;

    closeCommandPalette();

    if (item.href) {
      const href = item.href.startsWith('#') ? item.href : `#${item.href}`;
      window.location.hash = href;
    } else if (item.action) {
      item.action();
    }
  }

  private _scrollActiveIntoView() {
    requestAnimationFrame(() => {
      const active = this.shadowRoot?.querySelector('.result-row.active');
      active?.scrollIntoView({ block: 'nearest' });
    });
  }

  private _esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private _escAttr(s: string): string {
    return s.replace(/"/g, '&quot;');
  }
}

define('b-command-palette', BCommandPalette);
