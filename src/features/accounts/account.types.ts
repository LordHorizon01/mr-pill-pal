export type IdentityVerificationStatus = "NOT_STARTED" | "PENDING" | "VERIFIED" | "REJECTED";

export interface AuthSession {
  accountId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
}

export interface AuthenticationProvider {
  restoreSession(): Promise<AuthSession | null>;
  signOut(): Promise<void>;
}

export interface AuthorizationDecision {
  allowed: boolean;
  reason?: string;
}

export interface AuthorizationProvider {
  canAccessProfile(accountId: string, profileId: string): Promise<AuthorizationDecision>;
}
