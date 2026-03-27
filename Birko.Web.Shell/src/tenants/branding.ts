import type { TenantInfo } from './tenant-types.js';

/** Apply tenant branding (primary color override) to the document root. */
export function applyBranding(tenant: TenantInfo | null): void {
  if (tenant?.primaryColor) {
    document.documentElement.style.setProperty('--b-color-primary', tenant.primaryColor);
  } else {
    document.documentElement.style.removeProperty('--b-color-primary');
  }
}
