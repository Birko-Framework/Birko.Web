import type { BreadcrumbItem } from './shell-types.js';

/**
 * Emit a `'set-breadcrumbs'` event from the given element so that the
 * parent `BAppShell` can update its breadcrumb display.
 *
 * Call this from any page component's `onMount()` or whenever the breadcrumb
 * trail should change (e.g. after loading an entity's name).
 *
 * The event bubbles with `composed: true`, so it crosses shadow DOM boundaries
 * and reaches the shell regardless of nesting depth.
 *
 * @example — in a BaseDetailPage subclass
 * ```ts
 * protected onEntityLoaded(entity: Product) {
 *   setBreadcrumbs(this, [
 *     { label: 'Products', href: '#/products' },
 *     { label: entity.name },
 *   ]);
 * }
 * ```
 *
 * @example — in any page component
 * ```ts
 * protected onMount() {
 *   setBreadcrumbs(this, [
 *     { label: 'Settings' },
 *   ]);
 * }
 * ```
 *
 * @param source  The page element dispatching the event (usually `this`).
 * @param items   Breadcrumb trail. Last item is typically the current page (no `href`).
 */
export function setBreadcrumbs(source: EventTarget, items: BreadcrumbItem[]): void {
  source.dispatchEvent(new CustomEvent('set-breadcrumbs', {
    detail: { items },
    bubbles: true,
    composed: true,
  }));
}

export type { BreadcrumbItem };
