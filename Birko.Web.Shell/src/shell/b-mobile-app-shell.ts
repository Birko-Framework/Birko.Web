import { BCoreAppShell } from './b-core-app-shell.js';
import { activeSurface, type Surface } from './mobile-nav.js';

/**
 * Mobile-first app shell: a fixed top bar (brand + an `actions` slot), a scrolling content region,
 * and a fixed bottom navigation bar with safe-area inset — driven by a declarative {@link Surface}
 * list. The framework's other shells (`BAppShell` ribbon, `BSidebarAppShell`) are desktop-oriented;
 * this is the mobile counterpart.
 *
 * Only the chrome is generic — subclass and supply {@link surfaces} (plus the `BCoreAppShell`
 * requirements `brandName` / `getUserName` / `t` / `onSignOut`), then `define()` your tag:
 * ```ts
 *   class MyShell extends BMobileAppShell {
 *     protected get brandName() { return 'MyApp'; }
 *     protected get surfaces() { return MY_SURFACES; }
 *     // …getUserName / t / onSignOut
 *   }
 *   define('my-app', MyShell);
 * ```
 * Page content projects through the default `<slot>`; header actions (a sync chip, a language
 * toggle, …) project through `<slot name="actions">`. Nav items are plain anchors, so navigation
 * works without JS; active state is synced from the hash.
 */
export abstract class BMobileAppShell extends BCoreAppShell {
  /** The bottom-nav surfaces (the app's primary destinations). */
  protected abstract get surfaces(): readonly Surface[];

  /**
   * Optional top-bar actions rendered into the header's action region (right of the brand), inside the
   * shell's shadow DOM — e.g. a sync chip, language toggle, settings link. Default empty. Consumers
   * can also project light-DOM actions via the `actions` slot; both render side by side.
   */
  protected renderActions(): string {
    return '';
  }

  render(): string {
    return `
      <header class="mobile-topbar">
        ${this.renderBrand()}
        <div class="mobile-topbar-actions">${this.renderActions()}<slot name="actions"></slot></div>
      </header>

      <main class="mobile-content"><slot></slot></main>

      <nav class="mobile-bottomnav" aria-label="${this.brandName}">
        ${this.surfaces.map((s) => this.renderNavItem(s)).join('')}
      </nav>
    `;
  }

  private renderNavItem(s: Surface): string {
    // Active markup is applied by syncActive() (single source of truth), so render() omits it here.
    return `
      <a class="mobile-navitem" data-surface="${s.id}" href="#${s.route}">
        ${s.icon ? `<span class="mobile-navicon" aria-hidden="true">${s.icon}</span>` : ''}
        <span class="mobile-navlabel">${this.surfaceLabel(s)}</span>
      </a>`;
  }

  private surfaceLabel(s: Surface): string {
    if (s.titleKey) {
      const translated = this.t(s.titleKey);
      if (translated && translated !== s.titleKey) return translated;
    }
    return s.label;
  }

  protected onMount(): void {
    super.onMount();
    const onHash = (): void => this.syncActive();
    window.addEventListener('hashchange', onHash);
    this._unsubs.push(() => window.removeEventListener('hashchange', onHash));
    this.syncActive();
  }

  protected onUpdated(): void {
    super.onUpdated();
    this.syncActive();
  }

  /** Reflect the current route into the bottom-nav active state (no full re-render). */
  private syncActive(): void {
    const active = activeSurface(window.location.hash, this.surfaces);
    for (const el of this.$$('.mobile-navitem')) {
      const on = el.dataset.surface === active?.id;
      el.classList.toggle('active', on);
      if (on) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    }
  }

  static get styles(): string {
    return super.styles + `
      /* Mobile-first column: fixed top bar, scrolling content, fixed bottom nav.
         The column layout (:host display:flex + flex-direction:column + height:100vh +
         overflow:hidden) comes from BCoreAppShell — don't re-declare :host height here:
         overriding it with height:100% regresses to a percentage that only resolves when
         an ancestor has a definite height (a bare body with only min-height:100vh does
         not), which drops the bottom nav out of fixed position into normal flow. */

      .mobile-topbar {
        display: flex; align-items: center; justify-content: space-between;
        /* Grow by the top safe-area inset and pad the content down, so on a notch /
           Dynamic Island / camera-cutout phone (viewport-fit=cover + a translucent status
           bar in an installed PWA extend the view under the cutout) the bar's content sits
           BELOW it, not under it. box-sizing:border-box keeps the usable bar at header-height. */
        height: calc(var(--b-header-height, 3rem) + env(safe-area-inset-top, 0)); flex-shrink: 0;
        padding: env(safe-area-inset-top, 0) var(--b-space-lg, 1rem) 0;
        background: var(--b-bg-elevated); border-bottom: 1px solid var(--b-border);
      }
      .mobile-topbar-actions { display: flex; align-items: center; gap: var(--b-space-sm, 0.5rem); }

      .mobile-content {
        flex: 1; overflow-y: auto; min-width: 0;
        background: var(--b-bg-gradient, var(--b-bg-secondary));
        -webkit-overflow-scrolling: touch;
      }

      .mobile-bottomnav {
        display: flex; flex-shrink: 0;
        background: var(--b-bg-elevated); border-top: 1px solid var(--b-border);
        padding-bottom: env(safe-area-inset-bottom, 0);
      }
      .mobile-navitem {
        flex: 1 1 0; min-width: 0;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 0.125rem; padding: var(--b-space-sm, 0.5rem) 0; min-height: 3.25rem;
        text-decoration: none; color: var(--b-text-muted);
        font-size: var(--b-text-xs, 0.6875rem); font-weight: var(--b-font-weight-medium, 500);
        -webkit-tap-highlight-color: transparent;
      }
      .mobile-navitem:hover { color: var(--b-text-secondary); }
      .mobile-navitem.active { color: var(--b-color-primary); }
      .mobile-navicon { font-size: 1.375rem; line-height: 1; }
      .mobile-navlabel { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
    `;
  }
}
