import {
  CreateProfileInput,
  ProfileAnswerField,
  ProfileAnswerStatus,
  ProfileGender,
  ProfileRelationshipKind,
  ProfileReminderPreference,
  Profile,
  ProfileRelationship,
  ProfileSetupDetails,
  ProfileType,
} from "./profile.types";
import { AccountProfileSetupDraft, createPrimaryProfileId, nextTemporaryProfileName } from "./profile-setup.domain";

export type AdditionalProfileStep = "name" | "gender" | "dateOfBirth" | "avatar" | "profileType" | "relationship" | "reminderPreference" | "review";

export type AdditionalProfileDraft = {
  fullName: string;
  nickname: string;
  dateOfBirth: string;
  gender: ProfileGender | null;
  genderOther: string;
  avatarUrl: string | null;
  profileType: ProfileType | null;
  relationshipKind: ProfileRelationshipKind | null;
  relationshipOther: string;
  reminderPreference: ProfileReminderPreference | null;
  answerStates: Record<ProfileAnswerField, ProfileAnswerStatus>;
};

export type ProfileEditDraft = {
  fullName: string;
  nickname: string;
  dateOfBirth: string;
  relationship: ProfileRelationship;
  avatarUrl: string | null;
  profileSetupDetails: ProfileSetupDetails;
};

/** Loads persisted fields only; missing setup metadata stays unanswered instead of being inferred. */
export function createProfileEditDraft(profile: Profile): ProfileEditDraft {
  const details = profile.profileSetupDetails;
  const profileSetupDetails: ProfileSetupDetails = details ? {
    ...details,
    ...(details.answerStates ? { answerStates: { ...details.answerStates } } : {}),
    ...(details.systemFallbacks ? { systemFallbacks: { ...details.systemFallbacks } } : {}),
  } : {};
  return {
    fullName: details?.systemFallbacks?.fullName === profile.fullName ? "" : profile.fullName,
    nickname: profile.nickname ?? "",
    dateOfBirth: profile.dateOfBirth ?? "",
    relationship: profile.relationship,
    avatarUrl: profile.avatarUrl ?? null,
    profileSetupDetails,
  };
}

/** Imports legacy account setup answers only for the stable first profile they were collected for. */
export function getLegacyPrimaryProfileSetupDetails(
  profile: Profile,
  draft: AccountProfileSetupDraft,
): ProfileSetupDetails | null {
  if (profile.profileSetupDetails || profile.id !== createPrimaryProfileId(profile.accountUid)) return null;

  const answerStates: NonNullable<ProfileSetupDetails["answerStates"]> = {};
  if (profile.dateOfBirth) answerStates.dateOfBirth = "answered";
  if (draft.gender) answerStates.gender = "answered";
  if (draft.profileType) answerStates.profileType = "answered";
  if (draft.profileType === "me") answerStates.relationship = "derived";
  else if (draft.profileType === "care_for" && draft.relationship) answerStates.relationship = "answered";
  if (draft.reminderPreference) answerStates.reminderPreference = "answered";

  return {
    gender: draft.gender,
    genderOther: draft.gender === "other" ? draft.genderOther : null,
    profileType: draft.profileType,
    relationshipKind: draft.profileType === "care_for" ? draft.relationship : null,
    relationshipOther: draft.profileType === "care_for" && draft.relationship === "other" ? draft.relationshipOther : null,
    reminderPreference: draft.reminderPreference,
    answerStates,
  };
}

export function createBlankAdditionalProfileDraft(): AdditionalProfileDraft {
  return {
    fullName: "",
    nickname: "",
    dateOfBirth: "",
    gender: null,
    genderOther: "",
    avatarUrl: null,
    profileType: null,
    relationshipKind: null,
    relationshipOther: "",
    reminderPreference: null,
    answerStates: {
      fullName: "unanswered",
      nickname: "unanswered",
      gender: "unanswered",
      dateOfBirth: "unanswered",
      avatar: "unanswered",
      profileType: "unanswered",
      relationship: "unanswered",
      reminderPreference: "unanswered",
    },
  };
}

/** Converts only answers from this creation flow; it never reads the account-level setup draft. */
export function buildAdditionalProfileInput(
  draft: AdditionalProfileDraft,
  existingNames: readonly string[],
): CreateProfileInput {
  const fullName = draft.fullName.trim().replace(/\s+/g, " ") || nextTemporaryProfileName(existingNames);
  const relationship = relationshipForDraft(draft.profileType, draft.relationshipKind);
  const fallbackRelationship = draft.profileType === "me" || (draft.profileType === "care_for" && draft.relationshipKind)
    ? undefined
    : relationship;

  return {
    fullName,
    nickname: draft.nickname.trim().replace(/\s+/g, " ") || undefined,
    dateOfBirth: draft.dateOfBirth || undefined,
    relationship,
    avatarUrl: draft.avatarUrl || undefined,
    profileSetupDetails: {
      gender: draft.gender,
      genderOther: draft.gender === "other" ? draft.genderOther.trim() || null : null,
      profileType: draft.profileType,
      relationshipKind: draft.relationshipKind,
      relationshipOther: draft.relationshipKind === "other" ? draft.relationshipOther.trim() || null : null,
      reminderPreference: draft.reminderPreference,
      answerStates: {
        ...draft.answerStates,
        fullName: draft.fullName.trim() ? "answered" : draft.answerStates.fullName,
        nickname: draft.nickname.trim() ? "answered" : draft.answerStates.nickname,
        dateOfBirth: draft.dateOfBirth ? "answered" : draft.answerStates.dateOfBirth,
        avatar: draft.avatarUrl ? "answered" : draft.answerStates.avatar,
        relationship: draft.profileType === "me" ? "derived" : draft.answerStates.relationship,
      },
      systemFallbacks: {
        ...(draft.fullName.trim() ? {} : { fullName }),
        ...(fallbackRelationship ? { relationship: fallbackRelationship } : {}),
      },
    },
  };
}

export function relationshipForDraft(
  profileType: ProfileType | null,
  relationshipKind: ProfileRelationshipKind | null,
): CreateProfileInput["relationship"] {
  if (profileType === "me") return "Self";
  switch (relationshipKind) {
    case "partner": return "Spouse";
    case "child": return "Child";
    case "friend":
    case "other": return "Other";
    case "parent":
    case "relative": return "Family member";
    default: return "Family member";
  }
}
