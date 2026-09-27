import { getCurrentAuthenticatedUser } from "@/features/auth/auth.service";
import {
  assertCanAcceptCaregiverAccess,
  assertCanRevokeCaregiverAccess,
  calculateCaregiverInviteExpiry,
} from "./caregiver-access.domain";
import {
  acceptPendingCaregiverAccessRecord,
  createPendingCaregiverAccessRecord,
  getCaregiverAccessByExactId,
  listActiveCaregiverAccessFor,
  listCaregiverAccessOwnedBy,
  revokeCaregiverAccessRecord,
} from "./caregiver-access-cloud.repository";
import { CaregiverAccess, CaregiverAccessError } from "./caregiver-access.types";

function nowIso(now?: Date): string {
  return (now ?? new Date()).toISOString();
}

function firebaseErrorCode(error: unknown): string {
  return typeof error === "object" && error ? String((error as { code?: string }).code ?? "") : "";
}

/** Service callers receive a safe domain error rather than a raw Firebase error. */
async function safelyRunCaregiverAccessOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof CaregiverAccessError) throw error;
    const code = firebaseErrorCode(error);
    if (code === "firestore/not-found" || code === "not-found") throw new CaregiverAccessError("INVALID_INVITATION");
    if (code === "firestore/permission-denied" || code === "permission-denied") throw new CaregiverAccessError("UNAUTHORIZED_ACTION");
    throw new CaregiverAccessError("CAREGIVER_ACCESS_UNAVAILABLE");
  }
}

export async function createCaregiverInvitation(profileId: string, now?: Date): Promise<{ accessId: string; expiresAt: string }> {
  const user = getCurrentAuthenticatedUser();
  if (!profileId.trim()) throw new CaregiverAccessError("UNAVAILABLE_PROFILE");
  const createdAt = nowIso(now);
  const expiresAt = calculateCaregiverInviteExpiry(createdAt);
  const accessId = await safelyRunCaregiverAccessOperation(() => createPendingCaregiverAccessRecord({
    ownerUid: user.uid,
    profileId,
    expiresAt: new Date(expiresAt),
  }));
  return { accessId, expiresAt };
}

export async function inspectCaregiverInvitation(accessId: string): Promise<CaregiverAccess> {
  const user = getCurrentAuthenticatedUser();
  const access = await safelyRunCaregiverAccessOperation(() => getCaregiverAccessByExactId(user.uid, accessId));
  if (!access) throw new CaregiverAccessError("INVALID_INVITATION");
  return access;
}

export async function acceptCaregiverInvitation(accessId: string, now?: Date): Promise<void> {
  const user = getCurrentAuthenticatedUser();
  const access = await safelyRunCaregiverAccessOperation(() => getCaregiverAccessByExactId(user.uid, accessId));
  if (!access) throw new CaregiverAccessError("INVALID_INVITATION");
  assertCanAcceptCaregiverAccess(access, user.uid, nowIso(now));
  await safelyRunCaregiverAccessOperation(() => acceptPendingCaregiverAccessRecord(user.uid, accessId));
}

export async function revokeCaregiverAccess(accessId: string): Promise<void> {
  const user = getCurrentAuthenticatedUser();
  const access = await safelyRunCaregiverAccessOperation(() => getCaregiverAccessByExactId(user.uid, accessId));
  if (!access) throw new CaregiverAccessError("INVALID_INVITATION");
  assertCanRevokeCaregiverAccess(access, user.uid);
  await safelyRunCaregiverAccessOperation(() => revokeCaregiverAccessRecord(user.uid, accessId));
}

export async function listOwnedCaregiverAccess(): Promise<CaregiverAccess[]> {
  const user = getCurrentAuthenticatedUser();
  return safelyRunCaregiverAccessOperation(() => listCaregiverAccessOwnedBy(user.uid));
}

export async function listMyActiveCaregiverAccess(): Promise<CaregiverAccess[]> {
  const user = getCurrentAuthenticatedUser();
  return safelyRunCaregiverAccessOperation(() => listActiveCaregiverAccessFor(user.uid));
}
