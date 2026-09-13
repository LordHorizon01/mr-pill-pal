import { CreateProfileInput, Profile, ProfileRole } from "./profile.types";

export type ProfileSetupStage =
  | "validate-form"
  | "obtain-authenticated-user"
  | "ensure-account-document"
  | "create-profile-document"
  | "persist-local-profile"
  | "mark-profile-setup-complete"
  | "select-profile";

type FirebaseLikeError = { code?: unknown; message?: unknown };

export class ProfileSetupError extends Error {
  readonly stage: ProfileSetupStage;
  readonly causeCode: string | null;
  readonly causeMessage: string | null;

  constructor(stage: ProfileSetupStage, cause: unknown) {
    super("Profile setup could not be completed.");
    this.name = "ProfileSetupError";
    this.stage = stage;
    this.causeCode = getErrorCode(cause);
    this.causeMessage = cause instanceof Error ? cause.message : null;
  }
}

export type AccountDocumentDraft = {
  uid: string;
  displayName: string | null;
  onboardingComplete: boolean;
  profileSetupComplete: boolean;
};

export type ProfileDocumentDraft = {
  ownerUid: string;
  fullName: string;
  dateOfBirth: string;
  relationship: Profile["relationship"];
  role: ProfileRole;
  isActive: boolean;
  nickname?: string;
  medicalDetails?: Profile["medicalDetails"];
};

export function buildAccountDocumentDraft(
  uid: string,
  displayName: string | null | undefined,
): AccountDocumentDraft {
  return {
    uid,
    displayName: displayName?.trim() || null,
    onboardingComplete: false,
    profileSetupComplete: false,
  };
}

/** Builds a Firestore-safe document shape and deliberately omits undefined fields. */
export function buildProfileDocumentDraft(
  ownerUid: string,
  input: CreateProfileInput,
): ProfileDocumentDraft {
  const document: ProfileDocumentDraft = {
    ownerUid,
    fullName: input.fullName,
    dateOfBirth: input.dateOfBirth,
    relationship: input.relationship,
    role: input.relationship === "Self" ? "SELF" : "DEPENDENT",
    isActive: true,
  };

  if (input.nickname) document.nickname = input.nickname;
  if (input.medicalDetails) document.medicalDetails = input.medicalDetails;

  return document;
}

export function createProfileId(now = Date.now(), random = Math.random()): string {
  return `profile-${now.toString(36)}-${Math.floor(random * 0x7fffffff).toString(36)}`;
}

/**
 * Gives every Firebase account one stable, non-PII identifier for its first
 * profile. encodeURIComponent keeps this valid as a Firestore document ID even
 * if a Firebase provider ever returns an unusual UID character.
 */
export function createPrimaryProfileId(accountUid: string): string {
  const normalizedUid = accountUid.trim();
  if (!normalizedUid) throw new Error("A signed-in account is required to create the first profile.");
  return `primary-${encodeURIComponent(normalizedUid)}`;
}

export function resolveProfileCreationId({
  accountUid,
  isFirstProfile,
  pendingProfileId,
  now,
  random,
}: {
  accountUid: string;
  isFirstProfile: boolean;
  pendingProfileId?: string | null;
  now?: number;
  random?: number;
}): string {
  // Preserve a prior pending ID so a retry after a partial local/cloud failure
  // targets the same document. New first profiles always use the stable ID.
  if (pendingProfileId?.trim()) return pendingProfileId;
  return isFirstProfile
    ? createPrimaryProfileId(accountUid)
    : createProfileId(now, random);
}

export function getErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const code = (error as FirebaseLikeError).code;
  return typeof code === "string" && code.trim() ? code : null;
}

export function getProfileSetupDiagnostic(error: unknown): {
  stage: ProfileSetupStage | "unknown";
  code: string | null;
} {
  if (error instanceof ProfileSetupError) {
    return { stage: error.stage, code: error.causeCode };
  }
  return { stage: "unknown", code: getErrorCode(error) };
}

export function getProfileSetupMessage(
  error: unknown,
  fallback = "We couldn't save your profile. Please try again.",
): string {
  if (error instanceof ProfileSetupError && error.stage === "validate-form" && error.causeMessage) {
    return error.causeMessage;
  }
  if (error instanceof Error && /full name|nickname|date of birth|relationship/i.test(error.message)) {
    return error.message;
  }

  const code = getErrorCode(error) ?? (error instanceof ProfileSetupError ? error.causeCode : null);
  if (code === "firestore/permission-denied" || code === "permission-denied" || code === "auth/user-token-expired") {
    return "We couldn't save your profile. Please sign in again and try once more.";
  }
  if (code === "firestore/unavailable" || code === "unavailable" || code === "auth/network-request-failed") {
    return "You're offline. Connect to the internet to finish account setup.";
  }
  if (code === "firestore/invalid-argument" || code === "invalid-argument") {
    return "Some profile information is invalid. Please review it and try again.";
  }
  if (error instanceof Error && /sign in|session/i.test(error.message)) return error.message;
  return fallback;
}
