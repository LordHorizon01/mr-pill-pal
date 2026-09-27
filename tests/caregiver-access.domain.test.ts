import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCanAcceptCaregiverAccess,
  assertCanRevokeCaregiverAccess,
  calculateCaregiverInviteExpiry,
  getCaregiverAccessAcceptanceError,
  isCaregiverInviteExpired,
  isReadOnlyCaregiverRole,
  isValidCaregiverAccessTransition,
  toCaregiverAccessMessage,
} from "../src/features/caregivers/caregiver-access.domain";
import {
  CAREGIVER_ACCESS_ROLE,
  CAREGIVER_INVITE_EXPIRY_DAYS,
  CaregiverAccess,
  CaregiverAccessError,
} from "../src/features/caregivers/caregiver-access.types";

const createdAt = "2026-09-25T10:00:00.000Z";
const expiresAt = "2026-10-02T10:00:00.000Z";

function pendingAccess(overrides: Partial<CaregiverAccess> = {}): CaregiverAccess {
  return {
    id: "high-entropy-access-id",
    ownerUid: "owner-uid",
    profileId: "profile-uid",
    caregiverUid: null,
    role: CAREGIVER_ACCESS_ROLE,
    status: "PENDING",
    createdAt,
    expiresAt,
    acceptedAt: null,
    revokedAt: null,
    updatedAt: createdAt,
    ...overrides,
  };
}

test("caregiver invitations use a named seven-day expiry without mutating input", () => {
  const input = createdAt;
  assert.equal(CAREGIVER_INVITE_EXPIRY_DAYS, 7);
  assert.equal(calculateCaregiverInviteExpiry(input), expiresAt);
  assert.equal(input, createdAt);
  assert.equal(isCaregiverInviteExpired(pendingAccess(), "2026-10-02T09:59:59.999Z"), false);
  assert.equal(isCaregiverInviteExpired(pendingAccess(), expiresAt), true);
});

test("only the read-only caregiver role is accepted in this cycle", () => {
  assert.equal(isReadOnlyCaregiverRole("READ_ONLY_CAREGIVER"), true);
  assert.equal(isReadOnlyCaregiverRole("EDITOR_CAREGIVER"), false);
  assert.equal(isReadOnlyCaregiverRole("OWNER"), false);
});

test("only pending-to-active/pending-to-revoked/active-to-revoked transitions are valid", () => {
  assert.equal(isValidCaregiverAccessTransition("PENDING", "ACTIVE"), true);
  assert.equal(isValidCaregiverAccessTransition("PENDING", "REVOKED"), true);
  assert.equal(isValidCaregiverAccessTransition("ACTIVE", "REVOKED"), true);
  assert.equal(isValidCaregiverAccessTransition("REVOKED", "ACTIVE"), false);
  assert.equal(isValidCaregiverAccessTransition("ACTIVE", "PENDING"), false);
});

test("a different authenticated caregiver can accept only a valid unexpired pending invitation", () => {
  const access = pendingAccess();
  assert.equal(getCaregiverAccessAcceptanceError(access, "caregiver-uid", "2026-09-26T10:00:00.000Z"), null);
  assert.doesNotThrow(() => assertCanAcceptCaregiverAccess(access, "caregiver-uid", "2026-09-26T10:00:00.000Z"));
});

test("self-acceptance, expiry, double acceptance, revoked invitations, and non-read-only roles are rejected", () => {
  assert.equal(getCaregiverAccessAcceptanceError(pendingAccess(), "owner-uid", "2026-09-26T10:00:00.000Z"), "SELF_CAREGIVER_NOT_ALLOWED");
  assert.equal(getCaregiverAccessAcceptanceError(pendingAccess(), "caregiver-uid", expiresAt), "INVITATION_EXPIRED");
  assert.equal(getCaregiverAccessAcceptanceError(pendingAccess({ status: "ACTIVE", caregiverUid: "other-caregiver", acceptedAt: createdAt }), "caregiver-uid", "2026-09-26T10:00:00.000Z"), "INVITATION_ALREADY_USED");
  assert.equal(getCaregiverAccessAcceptanceError(pendingAccess({ status: "REVOKED", revokedAt: createdAt }), "caregiver-uid", "2026-09-26T10:00:00.000Z"), "ACCESS_REVOKED");
  assert.equal(getCaregiverAccessAcceptanceError(pendingAccess({ role: "EDITOR_CAREGIVER" as never }), "caregiver-uid", "2026-09-26T10:00:00.000Z"), "INVALID_INVITATION");
});

test("only the owner may cancel pending access, while owner or current caregiver can revoke active access", () => {
  const pending = pendingAccess();
  assert.doesNotThrow(() => assertCanRevokeCaregiverAccess(pending, "owner-uid"));
  assert.throws(() => assertCanRevokeCaregiverAccess(pending, "caregiver-uid"), CaregiverAccessError);

  const active = pendingAccess({ status: "ACTIVE", caregiverUid: "caregiver-uid", acceptedAt: createdAt });
  assert.doesNotThrow(() => assertCanRevokeCaregiverAccess(active, "owner-uid"));
  assert.doesNotThrow(() => assertCanRevokeCaregiverAccess(active, "caregiver-uid"));
  assert.throws(() => assertCanRevokeCaregiverAccess(active, "other-caregiver"), CaregiverAccessError);
  assert.throws(() => assertCanRevokeCaregiverAccess(active, ""), CaregiverAccessError);
});

test("safe error messages are deterministic and do not expose database details", () => {
  assert.equal(toCaregiverAccessMessage(new CaregiverAccessError("INVITATION_EXPIRED")), "This caregiver invitation has expired.");
  assert.equal(toCaregiverAccessMessage(new CaregiverAccessError("CAREGIVER_ACCESS_UNAVAILABLE")), "Caregiver access is unavailable right now. Please try again.");
  assert.equal(toCaregiverAccessMessage(new Error("firestore/permission-denied")), "You are not allowed to perform this caregiver access action.");
});
