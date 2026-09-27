import {
  CAREGIVER_ACCESS_ROLE,
  CAREGIVER_INVITE_EXPIRY_DAYS,
  CaregiverAccess,
  CaregiverAccessError,
  CaregiverAccessErrorCode,
  CaregiverAccessRole,
  CaregiverAccessStatus,
} from "./caregiver-access.types";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function parseTimestamp(value: string): number {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new CaregiverAccessError("INVALID_INVITATION");
  return parsed;
}

function requireActorUid(actorUid: string): void {
  if (!actorUid.trim()) throw new CaregiverAccessError("UNAUTHORIZED_ACTION");
}

export function calculateCaregiverInviteExpiry(createdAt: string): string {
  return new Date(parseTimestamp(createdAt) + CAREGIVER_INVITE_EXPIRY_DAYS * MILLISECONDS_PER_DAY).toISOString();
}

export function isReadOnlyCaregiverRole(role: string): role is CaregiverAccessRole {
  return role === CAREGIVER_ACCESS_ROLE;
}

export function isCaregiverInviteExpired(access: Pick<CaregiverAccess, "expiresAt">, now: string): boolean {
  return parseTimestamp(access.expiresAt) <= parseTimestamp(now);
}

export function isValidCaregiverAccessTransition(from: CaregiverAccessStatus, to: CaregiverAccessStatus): boolean {
  return (from === "PENDING" && (to === "ACTIVE" || to === "REVOKED"))
    || (from === "ACTIVE" && to === "REVOKED");
}

export function getCaregiverAccessAcceptanceError(access: CaregiverAccess, actorUid: string, now: string): CaregiverAccessErrorCode | null {
  requireActorUid(actorUid);
  if (!isReadOnlyCaregiverRole(access.role)) return "INVALID_INVITATION";
  if (access.status === "REVOKED") return "ACCESS_REVOKED";
  if (access.status === "ACTIVE") return "INVITATION_ALREADY_USED";
  if (access.status !== "PENDING") return "INVALID_INVITATION";
  if (actorUid === access.ownerUid) return "SELF_CAREGIVER_NOT_ALLOWED";
  if (isCaregiverInviteExpired(access, now)) return "INVITATION_EXPIRED";
  return null;
}

export function assertCanAcceptCaregiverAccess(access: CaregiverAccess, actorUid: string, now: string): void {
  const errorCode = getCaregiverAccessAcceptanceError(access, actorUid, now);
  if (errorCode) throw new CaregiverAccessError(errorCode);
}

export function getCaregiverAccessRevocationError(access: CaregiverAccess, actorUid: string): CaregiverAccessErrorCode | null {
  requireActorUid(actorUid);
  if (access.status === "REVOKED") return "ACCESS_REVOKED";
  if (access.status === "PENDING") return actorUid === access.ownerUid ? null : "UNAUTHORIZED_ACTION";
  if (access.status === "ACTIVE") {
    return actorUid === access.ownerUid || actorUid === access.caregiverUid ? null : "UNAUTHORIZED_ACTION";
  }
  return "INVALID_INVITATION";
}

export function assertCanRevokeCaregiverAccess(access: CaregiverAccess, actorUid: string): void {
  const errorCode = getCaregiverAccessRevocationError(access, actorUid);
  if (errorCode) throw new CaregiverAccessError(errorCode);
}

export function toCaregiverAccessMessage(error: unknown): string {
  const code = error instanceof CaregiverAccessError ? error.code : "UNAUTHORIZED_ACTION";
  switch (code) {
    case "INVITATION_EXPIRED": return "This caregiver invitation has expired.";
    case "INVITATION_ALREADY_USED": return "This caregiver invitation has already been accepted.";
    case "ACCESS_REVOKED": return "This caregiver access has been revoked.";
    case "SELF_CAREGIVER_NOT_ALLOWED": return "You cannot accept your own caregiver invitation.";
    case "UNAVAILABLE_PROFILE": return "This profile is not available for caregiver access.";
    case "CAREGIVER_ACCESS_UNAVAILABLE": return "Caregiver access is unavailable right now. Please try again.";
    case "INVALID_INVITATION": return "This caregiver invitation is invalid.";
    default: return "You are not allowed to perform this caregiver access action.";
  }
}
