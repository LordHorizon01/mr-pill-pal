import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAccountDocumentDraft,
  buildProfileDocumentDraft,
  createPrimaryProfileId,
  createProfileId,
  clampDobDay,
  createDobValue,
  getDobDaysInMonth,
  getProfileSetupAvatarUrl,
  getProfileSetupDiagnostic,
  getProfileSetupMessage,
  ProfileSetupError,
  nextTemporaryProfileName,
  resolveProfileCreationId,
} from "../src/features/profiles/profile-setup.domain";
import { normalizeProfileInput } from "../src/features/profiles/profile.domain";

test("account setup uses the authenticated Firebase UID as both path key and payload uid", () => {
  const account = buildAccountDocumentDraft("firebase-user-42", "  Asha Sharma  ");
  assert.equal(account.uid, "firebase-user-42");
  assert.equal(account.displayName, "Asha Sharma");
  assert.equal(account.profileSetupComplete, false);
  assert.equal(account.onboardingComplete, false);
});

test("profile setup payload uses ownerUid and omits undefined optional fields", () => {
  const profile = buildProfileDocumentDraft("firebase-user-42", normalizeProfileInput({
    fullName: "Asha Sharma", dateOfBirth: "2001-04-08", relationship: "Self",
  }));
  assert.equal(profile.ownerUid, "firebase-user-42");
  assert.equal(profile.role, "SELF");
  assert.equal("nickname" in profile, false);
  assert.equal("medicalDetails" in profile, false);
  assert.equal(Object.values(profile).some((value) => value === undefined), false);
});

test("nickname is stored only when provided and empty nicknames remain valid", () => {
  const input = normalizeProfileInput({ fullName: "Asha Sharma", nickname: "  Ashu ", dateOfBirth: "2001-04-08", relationship: "Self" });
  assert.equal(buildProfileDocumentDraft("firebase-user-42", input).nickname, "Ashu");
  assert.equal(normalizeProfileInput({ fullName: "Asha Sharma", nickname: "   ", dateOfBirth: "2001-04-08", relationship: "Self" }).nickname, undefined);
});

test("invalid calendar dates and future dates are blocked before a cloud write", () => {
  assert.throws(() => normalizeProfileInput({ fullName: "Asha Sharma", dateOfBirth: "2026-02-31", relationship: "Self" }), /valid date/i);
  assert.throws(() => normalizeProfileInput({ fullName: "Asha Sharma", dateOfBirth: "2999-01-01", relationship: "Self" }), /future/i);
});

test("DOB wheel day counts account for month lengths and leap years", () => {
  assert.equal(getDobDaysInMonth(2025, 2), 28);
  assert.equal(getDobDaysInMonth(2024, 2), 29);
  assert.equal(getDobDaysInMonth(2025, 4), 30);
  assert.equal(getDobDaysInMonth(2025, 1), 31);
  assert.equal(clampDobDay(2025, 4, 31), 30);
  assert.equal(clampDobDay(2024, 2, 31), 29);
  assert.equal(createDobValue(2006, 10, 6), "2006-10-06");
  assert.throws(() => createDobValue(2006, 2, 29), /valid date/i);
});

test("profile setup keeps custom photos and stable preset/default avatar references in avatarUrl", () => {
  const draft = {
    avatarUri: null,
    avatarPreset: "avatar-preset-04",
    gender: "woman" as const,
  };
  assert.equal(getProfileSetupAvatarUrl(draft), "preset:avatar-preset-04");
  assert.equal(getProfileSetupAvatarUrl({ ...draft, avatarUri: "file:///profile-avatars/asha.jpg" }), "file:///profile-avatars/asha.jpg");
  assert.equal(getProfileSetupAvatarUrl({ ...draft, avatarPreset: null }), "default:female");
  assert.equal(getProfileSetupAvatarUrl({ ...draft, avatarPreset: "unknown", gender: "nonbinary" }), "default:neutral");
  const profile = buildProfileDocumentDraft("firebase-user-42", normalizeProfileInput({
    fullName: "Asha Sharma",
    relationship: "Self",
    avatarUrl: getProfileSetupAvatarUrl(draft),
  }));
  assert.equal(profile.avatarUrl, "preset:avatar-preset-04");
});

test("form validation failures keep their safe message instead of becoming a generic profile error", () => {
  const validationError = new ProfileSetupError("validate-form", new Error("Enter the date of birth as a valid date."));
  assert.equal(getProfileSetupMessage(validationError), "Enter the date of birth as a valid date.");
});

test("retry uses a stable generated profile ID and diagnostics retain the failing stage", () => {
  assert.equal(createProfileId(12345, 0.5), createProfileId(12345, 0.5));
  const error = new ProfileSetupError("create-profile-document", { code: "firestore/permission-denied" });
  assert.deepEqual(getProfileSetupDiagnostic(error), { stage: "create-profile-document", code: "firestore/permission-denied" });
  assert.equal(getProfileSetupMessage(error), "We couldn't save your profile. Please sign in again and try once more.");
});

test("the first profile uses a stable UID-derived ID without putting personal fields in its ID", () => {
  assert.equal(createPrimaryProfileId("firebase-user-42"), "primary-firebase-user-42");
  assert.equal(createPrimaryProfileId("firebase/user"), "primary-firebase%2Fuser");
  assert.equal(
    resolveProfileCreationId({ accountUid: "firebase-user-42", isFirstProfile: true, now: 100, random: 0.1 }),
    resolveProfileCreationId({ accountUid: "firebase-user-42", isFirstProfile: true, now: 200, random: 0.9 }),
  );
});

test("a retry keeps its pending profile ID while later profiles keep generated IDs", () => {
  assert.equal(
    resolveProfileCreationId({ accountUid: "firebase-user-42", isFirstProfile: true, pendingProfileId: "profile-legacy-retry" }),
    "profile-legacy-retry",
  );
  assert.equal(
    resolveProfileCreationId({ accountUid: "firebase-user-42", isFirstProfile: false, now: 12345, random: 0.5 }),
    createProfileId(12345, 0.5),
  );
});

test("skipped names use the first available temporary User number", () => {
  assert.equal(nextTemporaryProfileName([]), "User 1");
  assert.equal(nextTemporaryProfileName(["User 1", "Asha", "User 3"]), "User 2");
});
