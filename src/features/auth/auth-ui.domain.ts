export type AuthOperation =
  | "email-login"
  | "email-signup"
  | "google"
  | "google-link"
  | "phone-send"
  | "phone-verify"
  | "resend-email"
  | "verify-email-refresh"
  | "leave-unverified-session"
  | "leave-profile-setup"
  | "profile-create"
  | null;

export type AuthBackBehavior = "normal" | "auth-cancel" | "authenticated-onboarding-exit";

export function authBackBehavior(screen: "create-account" | "verify-email" | "first-profile" | "additional-profile"): AuthBackBehavior {
  if (screen === "first-profile") return "authenticated-onboarding-exit";
  if (screen === "verify-email") return "auth-cancel";
  return screen === "create-account" ? "auth-cancel" : "normal";
}

export function hasProfileSetupDraft(input: { fullName: string; nickname: string; dateOfBirth: string; relationship: string }): boolean {
  return Boolean(input.fullName.trim() || input.nickname.trim() || input.dateOfBirth.trim() || input.relationship !== "Self");
}

export function isAuthOperationActive(current: AuthOperation, operation: Exclude<AuthOperation, null>): boolean {
  return current === operation;
}

export function canStartAuthOperation(current: AuthOperation): boolean {
  return current === null;
}

export function resendCooldownLabel(secondsRemaining: number): string {
  return secondsRemaining > 0 ? `Resend available in ${secondsRemaining}s` : "Resend verification email";
}
