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
  profileSetupState: AccountProfileSetupState;
  profileSetupDraft: AccountProfileSetupDraft;
};

export type AccountProfileSetupState = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
export type AccountProfileGender = "woman" | "man" | "nonbinary" | "prefer_not_to_say" | "other";
export type AccountProfileSetupStep = AccountProfileSetupDraft["activeStep"];
export type AccountProfileType = "me" | "care_for";
export type AccountProfileRelationship = "parent" | "partner" | "child" | "relative" | "friend" | "other";
export type AccountReminderPreference = "sound_vibration" | "sound" | "vibration" | "quiet";

export type AccountProfileSetupDraft = {
  displayName: string | null;
  gender: AccountProfileGender | null;
  genderOther: string | null;
  dateOfBirth: string | null;
  avatarUri: string | null;
  avatarPreset: string | null;
  profileType: AccountProfileType | null;
  relationship: AccountProfileRelationship | null;
  relationshipOther: string | null;
  reminderPreference: AccountReminderPreference | null;
  activeStep: "name" | "gender" | "dob" | "avatar" | "profileType" | "relationship" | "reminder" | "review" | "handoff";
};

export const DOB_MIN_YEAR = 1900;

/** Month uses the familiar 1-12 calendar convention. */
export function getDobDaysInMonth(year: number, month: number): number {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return 0;
  return new Date(year, month, 0).getDate();
}

export function clampDobDay(year: number, month: number, day: number): number {
  const lastDay = getDobDaysInMonth(year, month);
  if (!lastDay) return 1;
  return Math.min(Math.max(Math.trunc(day) || 1, 1), lastDay);
}

export function createDobValue(year: number, month: number, day: number): string {
  if (year < DOB_MIN_YEAR || month < 1 || month > 12 || day < 1 || day > getDobDaysInMonth(year, month)) {
    throw new Error("Enter a valid date of birth.");
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The existing avatarUrl field stores either the local photo URI or a stable bundled-asset key. */
export function getProfileSetupAvatarUrl(draft: Pick<AccountProfileSetupDraft, "avatarUri" | "avatarPreset" | "gender">): string {
  if (draft.avatarUri) return draft.avatarUri;
  if (/^avatar-preset-0[1-8]$/.test(draft.avatarPreset ?? "")) return `preset:${draft.avatarPreset}`;
  if (draft.gender === "man") return "default:male";
  if (draft.gender === "woman") return "default:female";
  return "default:neutral";
}

export type ProfileDocumentDraft = {
  ownerUid: string;
  fullName: string;
  dateOfBirth?: string;
  relationship: Profile["relationship"];
  role: ProfileRole;
  isActive: boolean;
  avatarUrl?: string;
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
    profileSetupState: "NOT_STARTED",
    profileSetupDraft: {
      displayName: displayName?.trim() || null,
      gender: null,
      genderOther: null,
      dateOfBirth: null,
      avatarUri: null,
      avatarPreset: null,
      profileType: null,
      relationship: null,
      relationshipOther: null,
      reminderPreference: null,
      activeStep: "name",
    },
  };
}

/** Names skipped profiles consistently without needing a device-only counter. */
export function nextTemporaryProfileName(existingNames: readonly string[]): string {
  const usedNumbers = new Set(
    existingNames
      .map((name) => /^User\s+(\d+)$/i.exec(name.trim())?.[1])
      .filter((value): value is string => Boolean(value))
      .map(Number),
  );
  let index = 1;
  while (usedNumbers.has(index)) index += 1;
  return `User ${index}`;
}

/** Builds a Firestore-safe document shape and deliberately omits undefined fields. */
export function buildProfileDocumentDraft(
  ownerUid: string,
  input: CreateProfileInput,
): ProfileDocumentDraft {
  const document: ProfileDocumentDraft = {
    ownerUid,
    fullName: input.fullName,
    relationship: input.relationship,
    role: input.relationship === "Self" ? "SELF" : "DEPENDENT",
    isActive: true,
  };

  if (input.nickname) document.nickname = input.nickname;
  if (input.avatarUrl) document.avatarUrl = input.avatarUrl;
  if (input.dateOfBirth) document.dateOfBirth = input.dateOfBirth;
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
