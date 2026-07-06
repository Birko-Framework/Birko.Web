import { BaseComponent, define } from 'birko-web-core';

/**
 * The minimal reactive source `<b-sync-status>` binds to — a structural subset of
 * `ActionQueue` (from `birko-web-core`), so any outbox with a pending count works and the
 * component stays decoupled from the concrete queue.
 */
export interface SyncSource {
  /** Number of writes still queued (not yet synced). */
  readonly pendingCount: number;
  /** Subscribe to pending-count changes; returns an unsubscribe. */
  onChange(fn: (count: number) => void): () => void;
}

/**
 * `<b-sync-status>` — a small status chip that reflects offline/sync state for an offline-first
 * app: it combines `navigator.onLine` with an outbox's pending-write count (an `ActionQueue`, or any
 * {@link SyncSource}) and shows "Offline · N unsynced" / "Syncing N…" — hiding itself when online
 * with nothing pending. The write outbox is otherwise headless; this is the missing UI for it.
 *
 * Usage:
 * ```ts
 *   const chip = this.$<BSyncStatus>('#sync');
 *   chip?.bind(actionQueue);
 * ```
 *
 * Labels are localizable properties (English defaults) with a `{count}` placeholder — set them from
 * your i18n so the component carries no app-specific keys:
 *   `offlineLabel`, `offlinePendingLabel`, `syncingLabel`.
 */
export class BSyncStatus extends BaseComponent {
  private _queue: SyncSource | null = null;
  private _unsub: (() => void) | null = null;
  private readonly _onConn = (): void => this.paint();

  /** Label when offline with no pending writes. */
  offlineLabel = 'Offline';
  /** Label when offline with pending writes (`{count}` → pending count). */
  offlinePendingLabel = 'Offline · {count} unsynced';
  /** Label when online with pending writes draining (`{count}` → pending count). */
  syncingLabel = 'Syncing {count}…';

  static get styles(): string {
    return `
      :host { display: inline-block; }
      :host([hidden]) { display: none; }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: var(--b-space-xs);
        padding: var(--b-space-xs) var(--b-space-sm);
        border-radius: var(--b-radius-pill, var(--b-radius));
        font-size: var(--b-text-sm);
        line-height: 1;
        white-space: nowrap;
      }
      .chip::before {
        content: "";
        width: 0.5em; height: 0.5em;
        border-radius: 50%;
        background: currentColor;
        flex-shrink: 0;
      }
      .chip.offline {
        color: var(--b-color-warning, #f59e0b);
        background: var(--b-color-warning-light, rgba(245, 158, 11, 0.12));
      }
      .chip.syncing {
        color: var(--b-color-info, var(--b-color-primary));
        background: var(--b-color-info-light, rgba(59, 130, 246, 0.12));
      }
    `;
  }

  render(): string {
    // role=status + aria-live so assistive tech announces connectivity/sync transitions.
    return `<span class="chip" role="status" aria-live="polite"></span>`;
  }

  protected onMount(): void {
    window.addEventListener('online', this._onConn);
    window.addEventListener('offline', this._onConn);
    this.paint();
  }

  protected onUnmount(): void {
    window.removeEventListener('online', this._onConn);
    window.removeEventListener('offline', this._onConn);
    this._unsub?.();
    this._unsub = null;
  }

  /** Bind to a sync source (e.g. an `ActionQueue`); re-bindable, and unbinds the previous source. */
  bind(queue: SyncSource): void {
    this._unsub?.();
    this._queue = queue;
    this._unsub = queue.onChange(() => this.paint());
    this.paint();
  }

  private paint(): void {
    const el = this.$('.chip');
    if (!el) return;
    const pending = this._queue?.pendingCount ?? 0;
    let state: 'offline' | 'syncing' | 'online';
    let text: string;
    if (!navigator.onLine) {
      state = 'offline';
      text = pending > 0 ? this.format(this.offlinePendingLabel, pending) : this.offlineLabel;
    } else if (pending > 0) {
      state = 'syncing';
      text = this.format(this.syncingLabel, pending);
    } else {
      state = 'online';
      text = '';
    }
    el.textContent = text;
    el.className = `chip ${state}`;
    this.toggleAttribute('hidden', state === 'online');
  }

  private format(template: string, count: number): string {
    return template.replace('{count}', String(count));
  }
}

define('b-sync-status', BSyncStatus);
