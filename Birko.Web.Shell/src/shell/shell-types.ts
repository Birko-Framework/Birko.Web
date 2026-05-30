/** A single item in a breadcrumb trail emitted by pages via `setBreadcrumbs()`. */
export interface BreadcrumbItem {
  label: string;
  /** Navigation hash — `undefined` for the last (current) item which is not clickable. */
  href?: string;
}

export interface MenuItem {
  id: string;
  label: string;
  icon?: string;
  variant?: 'danger';
  divider?: boolean;
}

export interface ThemeOption {
  /** Theme id written to `data-theme` and persisted (e.g. 'light', 'dark', 'neon'). */
  id: string;
  /** Display label shown in the theme switcher menu. */
  label: string;
  /** HTML entity / glyph shown as the menu icon and trigger glyph. */
  icon: string;
}

export interface TenantItem {
  id: string;
  name: string;
  role?: string;
  isDefault?: boolean;
  isCurrent?: boolean;
}

export interface ShellRoutes {
  dashboard: string;
  profile: string;
  settings: string;
  login: string;
}

export type ConnectionState = 'connected' | 'reconnecting' | 'offline';
