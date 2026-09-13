export type ProfileRole = "SELF" | "DEPENDENT" | "FAMILY_MEMBER" | "CAREGIVER" | "READ_ONLY_CAREGIVER";
export type ProfileAccessLevel = "OWNER" | "EDITOR_CAREGIVER" | "READ_ONLY_CAREGIVER";
export type ProfileRelationship = "Self" | "Mother" | "Father" | "Child" | "Spouse" | "Family member" | "Other";

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
  avatarUrl?: string;
  medicalDetails?: MedicalProfileDetails;
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
  dateOfBirth: string;
  relationship: ProfileRelationship;
  medicalDetails?: MedicalProfileDetails;
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
