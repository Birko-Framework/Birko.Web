import { BaseComponent } from 'birko-web-core';
import type { ApiClient } from 'birko-web-core/http';

/**
 * Configuration passed to `setConfig()` on every dashboard widget.
 * Subclasses may extend this with their own fields.
 */
export interface WidgetConfig {
  /** HTTP client used for data fetching. */
  apiClient: ApiClient;
  /**
   * Auto-refresh interval in milliseconds.
   * `0` or omitted = no auto-refresh.
   */
  refreshInterval?: number;
  /** Arbitrary extra options for the subclass. */
  [key: string]: unknown;
}

/**
 * Abstract base class for dashboard widgets.
 *
 * Provides a consistent lifecycle for widgets that fetch and display data:
 * - `setConfig()` accepts an `ApiClient` + `refreshInterval` + any custom options.
 * - `loadData()` is called automatically on first config and on every refresh tick.
 * - The base class renders a loading spinner while data is being fetched.
 * - Auto-refresh is started and stopped cleanly via the component lifecycle.
 *
 * ## Minimal subclass
 * ```ts
 * interface SalesConfig extends WidgetConfig { period: 'week' | 'month'; }
 *
 * class SalesWidget extends BaseDashboardWidget<SalesConfig> {
 *   private _total = 0;
 *
 *   protected async loadData(): Promise<void> {
 *     const resp = await this.api.get<{ total: number }>('api/sales/summary', {
 *       period: this.config!.period,
 *     });
 *     if (resp.ok) this._total = resp.data.total;
 *   }
 *
 *   protected renderContent(): string {
 *     return `<div class="stat">${this._total}</div>`;
 *   }
 * }
 * define('s-sales-widget', SalesWidget);
 * ```
 *
 * ## Usage in dashboard page
 * ```ts
 * const widget = this.$<SalesWidget>('s-sales-widget')!;
 * widget.setConfig({ apiClient: api, period: 'month', refreshInterval: 30_000 });
 * ```
 *
 * ## Cleanup (automatic)
 * The auto-refresh timer is cleared in `onUnmount()` — no manual cleanup needed.
 */
export abstract class BaseDashboardWidget<
  TConfig extends WidgetConfig = WidgetConfig,
> extends BaseComponent {
  protected config: TConfig | null = null;
  protected isLoading = false;
  protected loadError: string | null = null;

  private _timer: ReturnType<typeof setInterval> | null = null;
  private _configSet = false;

  // ── Required ──────────────────────────────────────────────────────────────

  /**
   * Fetch (or compute) the data needed to render this widget.
   * Called on initial load and on every auto-refresh tick.
   * Call `this.update()` at the end if you changed any state fields used in `renderContent()`.
   */
  protected abstract loadData(): Promise<void>;

  /**
   * Render the widget's content HTML.
   * Called by `render()` when `isLoading` is false and `loadError` is null.
   */
  protected abstract renderContent(): string;

  // ── Optional — override to customise ─────────────────────────────────────

  /** Widget title shown in the header (empty = no header). */
  get title(): string { return ''; }

  /** Text shown while data loads (empty = spinner only). */
  protected get loadingText(): string { return ''; }

  // ── Styles ────────────────────────────────────────────────────────────────

  static get styles(): string {
    return `
      :host { display: block; height: 100%; }
      .widget {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--b-bg-elevated);
        border: 1px solid var(--b-border);
        border-radius: var(--b-radius-lg, 0.625rem);
        overflow: hidden;
      }
      .widget-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--b-space-md, 0.75rem) var(--b-space-lg, 1rem);
        border-bottom: 1px solid var(--b-border);
        flex-shrink: 0;
      }
      .widget-title {
        font-size: var(--b-text-sm, 0.8125rem);
        font-weight: var(--b-font-weight-semibold, 600);
        color: var(--b-text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .widget-refresh {
        background: none;
        border: none;
        cursor: pointer;
        color: var(--b-text-tertiary);
        padding: 0;
        line-height: 1;
        font-size: 0.875rem;
        transition: color var(--b-transition, 150ms ease);
      }
      .widget-refresh:hover { color: var(--b-text); }
      .widget-body {
        flex: 1;
        min-height: 0;
        overflow: auto;
        padding: var(--b-space-lg, 1rem);
      }
      .widget-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        gap: var(--b-space-sm, 0.5rem);
        color: var(--b-text-secondary);
        font-size: var(--b-text-sm, 0.8125rem);
      }
      .widget-error { color: var(--b-color-danger); }
    `;
  }

  // ── Template ──────────────────────────────────────────────────────────────

  render(): string {
    const header = this.title
      ? `<div class="widget-header">
           <span class="widget-title">${this.title}</span>
           <button class="widget-refresh" id="btn-refresh" title="Refresh">&#8635;</button>
         </div>`
      : '';

    let body: string;
    if (this.isLoading) {
      body = `<div class="widget-state">
        <b-spinner></b-spinner>
        ${this.loadingText ? `<span>${this.loadingText}</span>` : ''}
      </div>`;
    } else if (this.loadError) {
      body = `<div class="widget-state widget-error">${this.loadError}</div>`;
    } else if (!this.config) {
      body = '';
    } else {
      body = this.renderContent();
    }

    return `<div class="widget">${header}<div class="widget-body">${body}</div></div>`;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  protected onUpdated(): void {
    const btn = this.$<HTMLButtonElement>('#btn-refresh');
    if (btn) this.listen(btn, 'click', () => this.refresh());
  }

  protected onUnmount(): void {
    this._stopTimer();
    super.onUnmount();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Configure the widget and trigger the initial data load.
   * Safe to call multiple times — re-configures and reloads on each call.
   */
  setConfig(config: TConfig): void {
    this.config = config;
    this._configSet = true;
    this._stopTimer();
    void this.refresh();
    this._startTimer();
  }

  /**
   * Shortcut for accessing the API client without typing `this.config!.apiClient`.
   * Only valid after `setConfig()` has been called.
   */
  protected get api(): ApiClient {
    if (!this.config) throw new Error('Widget not configured — call setConfig() first');
    return this.config.apiClient;
  }

  /** Manually trigger a data refresh outside of the auto-refresh cycle. */
  async refresh(): Promise<void> {
    if (!this._configSet) return;
    this.isLoading = true;
    this.loadError = null;
    this.update();

    try {
      await this.loadData();
    } catch (err) {
      this.loadError = err instanceof Error ? err.message : 'Failed to load widget data';
    } finally {
      this.isLoading = false;
      this.update();
    }
  }

  // ── Private timer helpers ─────────────────────────────────────────────────

  private _startTimer(): void {
    const interval = this.config?.refreshInterval ?? 0;
    if (interval <= 0) return;
    this._timer = setInterval(() => void this.refresh(), interval);
  }

  private _stopTimer(): void {
    if (this._timer !== null) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }
}
