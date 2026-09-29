export const CAREGIVER_ACCESS_ROLE = "READ_ONLY_CAREGIVER" as const;
export const CAREGIVER_INVITE_EXPIRY_DAYS = 7;

export type CaregiverAccessRole = typeof CAREGIVER_ACCESS_ROLE;
export type CaregiverAccessStatus = "PENDING" | "ACTIVE" | "REVOKED";

/**
 * Authorization metadata only. This document must never contain medication,
 * intake, refill, condition, allergy, or profile-detail data.
 */
export interface CaregiverAccess {
  id: string;
  ownerUid: string;
  profileId: string;
  caregiverUid: string | null;
  role: CaregiverAccessRole;
  status: CaregiverAccessStatus;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  updatedAt: string;
}

export type CaregiverAccessErrorCode =
  | "INVALID_INVITATION"
  | "INVITATION_EXPIRED"
  | "INVITATION_ALREADY_USED"
  | "ACCESS_REVOKED"
  | "UNAUTHORIZED_ACTION"
  | "SELF_CAREGIVER_NOT_ALLOWED"
  | "UNAVAILABLE_PROFILE"
  | "CAREGIVER_ACCESS_UNAVAILABLE";

export class CaregiverAccessError extends Error {
  constructor(readonly code: CaregiverAccessErrorCode) {
    super(code);
    this.name = "CaregiverAccessError";
  }
}
