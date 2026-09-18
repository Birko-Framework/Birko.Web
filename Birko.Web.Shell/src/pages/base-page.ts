import { BaseComponent } from 'birko-web-core';

/**
 * Abstract base class for all module pages.
 *
 * Provides the minimal page shell: a header with title and optional action
 * buttons, plus a `renderContent()` hook for the page body.
 *
 * Use directly for pages that don't need CRUD, tables, or filters —
 * dashboards, settings screens, POS terminals, maps, etc.
 *
 * For data-driven pages, extend `BaseCrudPage` (or its children
 * `BaseListPage` / `BaseSplitPage`) instead.
 *
 * ## Minimal subclass
 * ```ts
 * class DashboardPage extends BasePage {
 *   protected pageTitle = 'Dashboard';
 *   protected renderContent() {
 *     return `<div class="stats-row">...</div>`;
 *   }
 * }
 * ```
 *
 * ## With custom header actions
 * ```ts
 * class SettingsPage extends BasePage {
 *   protected pageTitle = 'Settings';
 *   protected renderHeaderActions() {
 *     return `<b-button variant="primary" id="save-btn">Save</b-button>`;
 *   }
 *   protected renderContent() { return `<b-form id="form"></b-form>`; }
 * }
 * ```
 */
export abstract class BasePage extends BaseComponent {

  /** Page title shown in the header. Subclasses set via field or getter. */
  protected get pageTitle(): string { return ''; }
  protected set pageTitle(_v: string) {}

  // ── Content ───────────────────────────────────────────────────────────────

  /** Render the main page content. */
  protected renderContent(): string { return ''; }

  // ── Page header ───────────────────────────────────────────────────────────

  /**
   * Render action buttons for the header (right side).
   * Return empty string for no actions. Override to add custom buttons.
   */
  protected renderHeaderActions(): string { return ''; }

  /**
   * Render the full page header.
   * Override for completely custom headers.
   */
  protected renderPageHeader(): string {
    const actions = this.renderHeaderActions();
    return `
      <header class="page-header">
        <h1 class="page-title">${this.pageTitle ?? ''}</h1>
        ${actions ? `<div class="header-actions">${actions}</div>` : ''}
      </header>
    `;
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  static get styles(): string {
    return `
      :host { display: block; height: 100%; }
      /* hidden means hidden — an invariant, not a default.

         The user-agent's [hidden] { display: none } and a class selector have IDENTICAL specificity (0,1,0),
         and a page's own styles are concatenated AFTER these, so \`.field { display: flex }\` silently wins and
         the element stays on screen while the code believes it is gone. That is not theoretical: it shipped a
         four-week absence recorded as a single day, with a success message, because an end-date field was
         visible while the form thought it was not — and every automated test stayed green, since they set the
         value directly and never asked whether the field should have been on screen at all.

         !important rather than a specificity bump, because a bump only outranks what exists today: :host
         [hidden] (0,2,0) beats \`.field\` but loses again to \`.field.active\`. A page that genuinely needs to
         animate something away should drive that from its own class or from visibility, not by out-ranking
         the attribute that says the thing is gone. */
      [hidden] { display: none !important; }
      .page-header {
        display: flex; align-items: center; justify-content: space-between;
        flex-wrap: wrap; gap: var(--b-space-sm, 0.5rem);
      }
      .page-title {
        font-size: var(--b-text-2xl, 1.5rem);
        font-weight: var(--b-font-weight-bold, 700);
        color: var(--b-text); margin: 0;
      }
      .header-actions { display: flex; gap: var(--b-space-sm, 0.5rem); }
    `;
  }

  // ── Template ──────────────────────────────────────────────────────────────

  render(): string {
    return `
      <div class="base-page">
        ${this.renderPageHeader()}
        ${this.renderContent()}
      </div>
    `;
  }
}
