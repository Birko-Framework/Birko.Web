export interface AuthState {
  token: string | null;
  refreshToken: string | null;
  userId: string | null;
  userName: string | null;
  email: string | null;
  tenantId: string | null;
  permissions: string[];
  isAuthenticated: boolean;
  challengeId: string | null;
  twoFactorPending: boolean;
}

export interface AuthStoreConfig {
  /** localStorage key for persistence (default: 'app_auth') */
  storageKey?: string;
  /** JWT claim → store field mappings */
  claimMappings?: {
    /** Claim for userName (default: standard name claim or 'sub') */
    userName?: string;
    /** Claim for email (default: 'email') */
    email?: string;
    /** Claim for tenantId (default: 'tenant_id') */
    tenantId?: string;
    /** Claim for permissions array (default: 'permission') */
    permissions?: string;
  };
}
