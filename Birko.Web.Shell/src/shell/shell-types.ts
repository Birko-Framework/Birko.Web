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
