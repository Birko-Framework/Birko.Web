import { BaseComponent, define } from 'birko-web-core';

/**
 * The minimal reactive source `<b-sync-status>` binds to — a structural subset of
 * `ActionQueue` (from `birko-web-core`), so any outbox with a pending count works and the
 * component stays decoupled from the concrete queue.
 */
export interface SyncSource {
  /** Number of writes still queued (not yet synced). */
  readonly pendingCount: number;
  /**
   * Number of writes the sync layer stopped sending (`dead`), waiting for the user to retry or discard them.
   * Optional, so a source without it still binds; when present the chip adds a "not saved" button beside its other state.
   */
  readonly deadCount?: number;
  /** Subscribe to count changes (pending or dead); returns an unsubscribe. */
  onChange(fn: (count: number) => void): () => void;
}

/**
 * `<b-sync-status>` — a small status chip that reflects offline/sync state for an offline-first
 * app: it combines `navigator.onLine` with an outbox's pending-write count (an `ActionQueue`, or any
 * {@link SyncSource}) and shows "Offline · N unsynced" / "Syncing N…" — hiding itself when online
 * with nothing pending. The write outbox is otherwise headless; this is the missing UI for it.
 *
 * A write the sync layer gave up on (`deadCount`, online or offline) adds a red button beside the chip, reading
 * "N not saved", that dispatches a bubbling, composed **`b-sync-dead`** event
 * (`detail: { count }`). The app opens its own list of those writes from it (`SyncManager.getDead()`,
 * `retry()`, `discard()`): without this state the chip cleared the moment a write died, saying "saved" about a
 * write the server never got.
 *
 * Usage:
 * ```ts
 *   const chip = this.$<BSyncStatus>('#sync');
 *   chip?.bind(actionQueue);
 * ```
 *
 * Labels are localizable properties (English defaults) with a `{count}` placeholder — set them from
 * your i18n so the component carries no app-specific keys:
 *   `offlineLabel`, `offlinePendingLabel`, `syncingLabel`, `deadLabel`.
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
  /** Label when writes were given up on (`{count}` → dead count); the chip is then a button. */
  deadLabel = '{count} not saved';

  static get styles(): string {
    return `
      :host { display: inline-block; }
      :host([hidden]), [hidden] { display: none !important; }
      /* The dead state is its own element (a button), not a second .chip: a consumer that reads the chip by its class
         keeps finding exactly one. */
      .live { display: inline-flex; gap: var(--b-space-xs); align-items: center; }
      .chip, .dead {
        display: inline-flex;
        align-items: center;
        gap: var(--b-space-xs);
        padding: var(--b-space-xs) var(--b-space-sm);
        border-radius: var(--b-radius-pill, var(--b-radius));
        font-size: var(--b-text-sm);
        line-height: 1;
        white-space: nowrap;
      }
      .chip::before, .dead::before {
        content: "";
        width: 0.5em; height: 0.5em;
        border-radius: 50%;
        background: currentColor;
        flex-shrink: 0;
      }
      /* TASK-994: each state is painted exactly as the b-badge of the same meaning (offline = warning, syncing = info,
         not saved = danger), never a base colour on its tint: offline was 2.86:1 in light and 1.54:1 in finstat. */
      .chip.offline {
        color: var(--b-badge-warning-text, var(--b-color-warning-text, var(--b-color-warning)));
        background: var(--b-badge-warning-bg, var(--b-color-warning-light));
      }
      .chip.syncing {
        color: var(--b-color-info-text, var(--b-color-info, var(--b-color-primary)));
        background: var(--b-color-info-light);
      }
      button.dead {
        font: inherit;
        font-size: var(--b-text-sm);
        border: 1px solid var(--b-color-danger-alpha-border, rgba(220, 38, 38, 0.3));
        cursor: pointer;
        color: var(--b-badge-danger-text, var(--b-color-danger-text, var(--b-color-danger)));
        background: var(--b-badge-danger-bg, var(--b-color-danger-light));
      }
      /* A solid ring in the button's own text colour (TASK-982): the shared --b-focus-ring-danger is a 15% wash that
         all but vanishes on this pink chip. The text colour already has to read on the chip, so the ring does too, in
         every theme; the 2px offset keeps it clear of the chip's own border. */
      button.dead:focus-visible {
        outline: 2px solid currentColor;
        outline-offset: 2px;
      }
    `;
  }

  render(): string {
    // role=status + aria-live so assistive tech announces connectivity/sync transitions. The dead state is a real
    // button inside the same live region, so it is announced like the others and is focusable only while it exists.
    return `<span class="live" role="status" aria-live="polite"><span class="chip"></span><button class="dead" type="button" hidden></button></span>`;
  }

  protected onMount(): void {
    window.addEventListener('online', this._onConn);
    window.addEventListener('offline', this._onConn);
    this.paint();
  }

  protected onUpdated(): void {
    const button = this.$('button.dead');
    if (button) this.listen(button, 'click', () => this.emit('b-sync-dead', { count: this._queue?.deadCount ?? 0 }));
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
    const button = this.$('button.dead');
    if (!el || !button) return;
    // The dead button stands beside the connection/pending chip, not instead of it: a device that is offline with
    // writes waiting says so even while one write is dead.
    const dead = this._queue?.deadCount ?? 0;
    button.toggleAttribute('hidden', dead === 0);
    if (dead > 0) button.textContent = this.format(this.deadLabel, dead);
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
    el.toggleAttribute('hidden', state === 'online');
    this.toggleAttribute('hidden', state === 'online' && dead === 0);
  }

  private format(template: string, count: number): string {
    return template.replace('{count}', String(count));
  }
}

define('b-sync-status', BSyncStatus);
