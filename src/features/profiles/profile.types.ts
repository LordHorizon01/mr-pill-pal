export type ProfileRole = "SELF" | "DEPENDENT" | "FAMILY_MEMBER" | "CAREGIVER" | "READ_ONLY_CAREGIVER";
export type ProfileAccessLevel = "OWNER" | "EDITOR_CAREGIVER" | "READ_ONLY_CAREGIVER";
export type ProfileRelationship = "Self" | "Mother" | "Father" | "Child" | "Spouse" | "Family member" | "Other";
export type ProfileGender = "woman" | "man" | "nonbinary" | "prefer_not_to_say" | "other";
export type ProfileType = "me" | "care_for";
export type ProfileRelationshipKind = "parent" | "partner" | "child" | "relative" | "friend" | "other";
export type ProfileReminderPreference = "sound_vibration" | "sound" | "vibration" | "quiet";
export type ProfileAnswerStatus = "unanswered" | "skipped" | "answered" | "derived";
export type ProfileAnswerField = "fullName" | "nickname" | "gender" | "dateOfBirth" | "avatar" | "profileType" | "relationship" | "reminderPreference";

/** Optional onboarding answers owned by one profile, never by the account setup draft. */
export interface ProfileSetupDetails {
  gender?: ProfileGender | null;
  genderOther?: string | null;
  profileType?: ProfileType | null;
  relationshipKind?: ProfileRelationshipKind | null;
  relationshipOther?: string | null;
  reminderPreference?: ProfileReminderPreference | null;
  answerStates?: Partial<Record<ProfileAnswerField, ProfileAnswerStatus>>;
  /** Values required by the existing core profile model when an optional answer was skipped. */
  systemFallbacks?: Partial<Record<"fullName" | "relationship", string>>;
}

export interface MedicalProfileDetails {
  allergies?: string;
  conditions?: string;
  generalNotes?: string;
}

export interface Profile {
  id: string;
  accountUid: string;
  fullName: string;
  nickname?: string;
  dateOfBirth: string;
  relationship: ProfileRelationship;
  avatarUrl?: string | null;
  medicalDetails?: MedicalProfileDetails;
  profileSetupDetails?: ProfileSetupDetails;
  role: ProfileRole;
  accessLevel: ProfileAccessLevel;
  isActive: boolean;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProfileInput {
  fullName: string;
  nickname?: string;
  dateOfBirth?: string;
  relationship: ProfileRelationship;
  avatarUrl?: string | null;
  medicalDetails?: MedicalProfileDetails;
  profileSetupDetails?: ProfileSetupDetails;
}

export interface UpdateProfileInput extends CreateProfileInput {
  isActive?: boolean;
}

export interface ProfilePolicy {
  maximumProfiles?: number;
}

export interface SelectedProfilePreference {
  profileId: string;
}
