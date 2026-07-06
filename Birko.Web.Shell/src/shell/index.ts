export { BCoreAppShell } from './b-core-app-shell.js';
export { BSidebarAppShell } from './b-sidebar-app-shell.js';
export { BAppShell } from './b-app-shell.js';
export { BMobileAppShell } from './b-mobile-app-shell.js';
export { activeSurface, type Surface } from './mobile-nav.js';
export { createShellWrapper } from './shell-wrapper.js';
export { setBreadcrumbs } from './breadcrumbs.js';
export {
  BUILTIN_THEMES,
  registerTheme,
  registerThemes,
  unregisterTheme,
  getRegisteredThemes,
} from './theme-registry.js';
export type { MenuItem, TenantItem, ShellRoutes, ConnectionState, BreadcrumbItem, ThemeOption } from './shell-types.js';
