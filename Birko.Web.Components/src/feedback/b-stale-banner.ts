import { BaseComponent, define } from 'birko-web-core';

/**
 * `<b-stale-banner>` — shows a warning when displayed data is from cache.
 *
 * Usage:
 *   const banner = this.$<BStaleBanner>('#stale');
 *   if (resp.fromCache) banner?.show(resp.cachedAt);
 *
 * Attributes:
 *   message   — custom message (default: "Data from {time} ago")
 *   hidden    — starts hidden, show() removes it
 */
export class BStaleBanner extends BaseComponent {
  private _timeAgo = '';

  static get observedAttributes() { return ['message']; }

  static get styles() {
    return `
      :host { display: block; }
      :host([hidden]) { display: none; }
      .stale-banner {
        display: flex;
        align-items: center;
        gap: var(--b-space-sm);
        padding: var(--b-space-sm) var(--b-space-md);
        background: var(--b-color-warning-light, rgba(245, 158, 11, 0.1));
        border: 1px solid var(--b-color-warning, #f59e0b);
        border-radius: var(--b-radius);
        font-size: var(--b-text-sm);
        color: var(--b-text);
        margin-bottom: var(--b-space-md);
      }
      .stale-icon { flex-shrink: 0; }
      .stale-dismiss {
        margin-left: auto;
        background: none; border: none; cursor: pointer;
        color: var(--b-text-muted); font-size: var(--b-text-sm);
        padding: var(--b-space-xs);
        border-radius: var(--b-radius);
      }
      .stale-dismiss:hover { background: var(--b-bg-tertiary); }
    `;
  }

  render() {
    const message = this.attr('message') || `Data from ${this._timeAgo} ago`;

    return `
      <div class="stale-banner">
        <span class="stale-icon">&#9888;</span>
        <span>${message}</span>
        <button class="stale-dismiss" id="dismiss">&times;</button>
      </div>
    `;
  }

  protected onMount() {
    this.$('#dismiss')?.addEventListener('click', () => this.hide());
  }

  /** Show the banner with a cache timestamp. */
  show(cachedAt?: number | Date): void {
    if (cachedAt) {
      this._timeAgo = this._formatTimeAgo(cachedAt instanceof Date ? cachedAt.getTime() : cachedAt);
    } else {
      this._timeAgo = '?';
    }
    this.hidden = false;
    this.update();
  }

  /** Hide the banner. */
  hide(): void {
    this.hidden = true;
  }

  private _formatTimeAgo(timestamp: number): string {
    const diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
  }
}

define('b-stale-banner', BStaleBanner);
