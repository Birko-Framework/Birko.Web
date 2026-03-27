export interface TenantInfo {
  id: string;
  name: string;
  logo?: string;
  primaryColor?: string;
  role: string;
  modules: string[];
  isDefault?: boolean;
}

export interface TenantState {
  current: TenantInfo | null;
  available: TenantInfo[];
  multiTenantEnabled: boolean;
  allowMultiTenancy: boolean;
}
