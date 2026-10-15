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
  buildAccountProfileSetupDetails,
  getProfileSetupDiagnostic,
  getProfileSetupMessage,
  ProfileSetupError,
  nextTemporaryProfileName,
  resolveProfileCreationId,
  toggleOptionalProfileChoice,
} from "../src/features/profiles/profile-setup.domain";
import { buildProfileUpdateInput, normalizeProfileInput } from "../src/features/profiles/profile.domain";
import { buildAdditionalProfileInput, createBlankAdditionalProfileDraft, createProfileEditDraft, getLegacyPrimaryProfileSetupDetails } from "../src/features/profiles/profile-creation.domain";
import { Profile } from "../src/features/profiles/profile.types";

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
  assert.equal(getProfileSetupAvatarUrl({ ...draft, avatarPreset: null }), "default:neutral");
  assert.equal(getProfileSetupAvatarUrl({ ...draft, avatarPreset: "unknown", gender: "nonbinary" }), "default:neutral");
  const profile = buildProfileDocumentDraft("firebase-user-42", normalizeProfileInput({
    fullName: "Asha Sharma",
    relationship: "Self",
    avatarUrl: getProfileSetupAvatarUrl(draft),
  }));
  assert.equal(profile.avatarUrl, "preset:avatar-preset-04");
});

test("profile edit payload retains the saved avatar and medical details unless explicit values replace them", () => {
  const savedProfile = {
    id: "profile-42",
    accountUid: "firebase-user-42",
    fullName: "Asha Sharma",
    dateOfBirth: "2001-04-08",
    relationship: "Self" as const,
    avatarUrl: "preset:avatar-preset-04",
    medicalDetails: { allergies: "Pollen", conditions: "Asthma" },
    role: "SELF" as const,
    accessLevel: "OWNER" as const,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const unchanged = buildProfileUpdateInput(savedProfile, {
    fullName: "Asha Mehta",
    nickname: "Ashu",
    dateOfBirth: savedProfile.dateOfBirth,
    relationship: savedProfile.relationship,
  });
  assert.equal(unchanged.avatarUrl, savedProfile.avatarUrl);
  assert.deepEqual(unchanged.medicalDetails, savedProfile.medicalDetails);

  const changedAvatar = buildProfileUpdateInput(savedProfile, {
    fullName: savedProfile.fullName,
    dateOfBirth: savedProfile.dateOfBirth,
    relationship: savedProfile.relationship,
    avatarUrl: "default:neutral",
  });
  assert.equal(changedAvatar.avatarUrl, "default:neutral");
  assert.deepEqual(changedAvatar.medicalDetails, savedProfile.medicalDetails);
  const clearedAvatar = buildProfileUpdateInput(savedProfile, {
    fullName: savedProfile.fullName,
    dateOfBirth: savedProfile.dateOfBirth,
    relationship: savedProfile.relationship,
    avatarUrl: null,
  });
  assert.equal(clearedAvatar.avatarUrl, null);
});

test("optional profile choices select, clear on repeat tap, and replace a different value", () => {
  assert.deepEqual(toggleOptionalProfileChoice(null, "man"), { value: "man", status: "answered" });
  assert.deepEqual(toggleOptionalProfileChoice("man", "man"), { value: null, status: "unanswered" });
  assert.deepEqual(toggleOptionalProfileChoice("man", "woman"), { value: "woman", status: "answered" });
  assert.deepEqual(toggleOptionalProfileChoice("preset:avatar-preset-02", "preset:avatar-preset-02"), { value: null, status: "unanswered" });
});

test("clearing an optional field preserves other draft values and deliberately skipped answers", () => {
  const draft = { nickname: "Ashu", gender: "man" as const, genderOther: "", answerStates: { gender: "answered" as const, reminderPreference: "skipped" as const } };
  const selection = toggleOptionalProfileChoice(draft.gender, "man");
  const updated = { ...draft, gender: selection.value, genderOther: null, answerStates: { ...draft.answerStates, gender: selection.status } };
  assert.equal(updated.gender, null);
  assert.equal(updated.genderOther, null);
  assert.equal(updated.nickname, "Ashu");
  assert.equal(updated.answerStates.reminderPreference, "skipped");
  assert.equal(updated.answerStates.gender, "unanswered");
});

test("initial setup detail mapping retains skipped versus unanswered and uses neutral avatar fallback", () => {
  const accountDraft = buildAccountDocumentDraft("account-1", null).profileSetupDraft;
  accountDraft.answerStates = { ...accountDraft.answerStates, fullName: "skipped", gender: "unanswered", profileType: "skipped", avatar: "skipped" };
  const details = buildAccountProfileSetupDetails(accountDraft, { fullName: "User 1", relationship: "Family member" });
  assert.equal(details.answerStates?.fullName, "skipped");
  assert.equal(details.answerStates?.gender, "unanswered");
  assert.equal(details.answerStates?.profileType, "skipped");
  assert.equal(details.answerStates?.avatar, "skipped");
  assert.equal(details.systemFallbacks?.fullName, "User 1");
  assert.equal(getProfileSetupAvatarUrl(accountDraft), "default:neutral");
});

test("clearing an optional choice does not bypass required profile-name validation", () => {
  assert.deepEqual(toggleOptionalProfileChoice("quiet", "quiet"), { value: null, status: "unanswered" });
  assert.throws(() => normalizeProfileInput({ fullName: "", relationship: "Family member" }), /full name/i);
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

test("additional profile draft starts unanswered with no generated form values", () => {
  const draft = createBlankAdditionalProfileDraft();
  assert.equal(draft.fullName, "");
  assert.equal(draft.nickname, "");
  assert.equal(draft.dateOfBirth, "");
  assert.equal(draft.gender, null);
  assert.equal(draft.avatarUrl, null);
  assert.equal(draft.profileType, null);
  assert.equal(draft.relationshipKind, null);
  assert.equal(draft.reminderPreference, null);
  assert.ok(Object.values(draft.answerStates).every((state) => state === "unanswered"));
});

test("empty additional profile saves no placeholder values or invented optional answers", () => {
  const input = buildAdditionalProfileInput(createBlankAdditionalProfileDraft(), ["Asha", "User 1"]);
  assert.equal(input.fullName, "User 2");
  assert.equal(input.nickname, undefined);
  assert.equal(input.dateOfBirth, undefined);
  assert.equal(input.avatarUrl, undefined);
  assert.equal(input.profileSetupDetails?.gender, null);
  assert.equal(input.profileSetupDetails?.profileType, null);
  assert.equal(input.profileSetupDetails?.reminderPreference, null);
  assert.equal(input.profileSetupDetails?.answerStates?.fullName, "unanswered");
  assert.equal(input.profileSetupDetails?.systemFallbacks?.fullName, "User 2");
});

test("skipped answers remain distinguished from app-provided compatibility fallbacks", () => {
  const draft = createBlankAdditionalProfileDraft();
  draft.answerStates.fullName = "skipped";
  draft.answerStates.profileType = "skipped";
  draft.answerStates.relationship = "skipped";
  const input = buildAdditionalProfileInput(draft, []);
  assert.equal(input.fullName, "User 1");
  assert.equal(input.relationship, "Family member");
  assert.equal(input.profileSetupDetails?.answerStates?.fullName, "skipped");
  assert.equal(input.profileSetupDetails?.answerStates?.profileType, "skipped");
  assert.equal(input.profileSetupDetails?.answerStates?.relationship, "skipped");
  assert.equal(input.profileSetupDetails?.systemFallbacks?.relationship, "Family member");
});

test("preset and device avatars stay unset until selected and then persist as profile values", () => {
  const draft = createBlankAdditionalProfileDraft();
  assert.equal(buildAdditionalProfileInput(draft, []).avatarUrl, undefined);
  draft.avatarUrl = "preset:avatar-preset-08";
  draft.answerStates.avatar = "answered";
  assert.equal(buildAdditionalProfileInput(draft, []).avatarUrl, "preset:avatar-preset-08");
  draft.avatarUrl = "file:///profile-avatars/account-profile.jpg";
  assert.equal(buildAdditionalProfileInput(draft, []).avatarUrl, "file:///profile-avatars/account-profile.jpg");
});

test("edit draft hydrates saved profile fields without inferring absent onboarding answers", () => {
  const saved: Profile = {
    id: "profile-a",
    accountUid: "account-a",
    fullName: "Kshitij",
    nickname: "K",
    dateOfBirth: "2001-04-08",
    relationship: "Mother",
    avatarUrl: "preset:avatar-preset-03",
    role: "DEPENDENT",
    accessLevel: "OWNER",
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const draft = createProfileEditDraft(saved);
  assert.equal(draft.fullName, "Kshitij");
  assert.equal(draft.nickname, "K");
  assert.equal(draft.dateOfBirth, "2001-04-08");
  assert.equal(draft.relationship, "Mother");
  assert.equal(draft.avatarUrl, "preset:avatar-preset-03");
  assert.deepEqual(draft.profileSetupDetails, {});
});

test("legacy account setup answers migrate only to their stable primary profile", () => {
  const accountUid = "account-legacy";
  const legacyDraft = {
    ...buildAccountDocumentDraft(accountUid, null).profileSetupDraft,
    gender: "woman" as const,
    profileType: "care_for" as const,
    relationship: "child" as const,
    relationshipOther: null,
    reminderPreference: "quiet" as const,
  };
  const primary: Profile = {
    id: createPrimaryProfileId(accountUid), accountUid, fullName: "Asha", dateOfBirth: "2001-04-08",
    relationship: "Child", avatarUrl: "preset:avatar-preset-03", role: "DEPENDENT", accessLevel: "OWNER",
    isActive: true, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const imported = getLegacyPrimaryProfileSetupDetails(primary, legacyDraft);
  assert.equal(imported?.gender, "woman");
  assert.equal(imported?.profileType, "care_for");
  assert.equal(imported?.relationshipKind, "child");
  assert.equal(imported?.reminderPreference, "quiet");
  assert.equal(imported?.answerStates?.dateOfBirth, "answered");
  assert.equal(imported?.answerStates?.gender, "answered");
  assert.equal("avatar" in (imported?.answerStates ?? {}), false);
  assert.equal(getLegacyPrimaryProfileSetupDetails({ ...primary, id: "dependent-profile" }, legacyDraft), null);
  assert.equal(getLegacyPrimaryProfileSetupDetails({ ...primary, profileSetupDetails: { gender: "man" } }, legacyDraft), null);
});

test("editing a generated label keeps it out of the text field until the user replaces it", () => {
  const saved: Profile = {
    id: "profile-b", accountUid: "account-a", fullName: "User 2", dateOfBirth: "", relationship: "Family member",
    avatarUrl: "default:neutral", profileSetupDetails: { systemFallbacks: { fullName: "User 2" }, answerStates: { fullName: "skipped" } },
    role: "DEPENDENT", accessLevel: "OWNER", isActive: true, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const draft = createProfileEditDraft(saved);
  assert.equal(draft.fullName, "");
  assert.equal(draft.profileSetupDetails.systemFallbacks?.fullName, "User 2");
  assert.equal(draft.avatarUrl, "default:neutral");
});

test("profile update preserves the avatar, medical details, and existing profile-scoped answers", () => {
  const details = { gender: "woman" as const, profileType: "care_for" as const, reminderPreference: "quiet" as const };
  const saved: Profile = {
    id: "profile-c", accountUid: "account-a", fullName: "Asha", dateOfBirth: "", relationship: "Spouse",
    avatarUrl: "preset:avatar-preset-06", medicalDetails: { allergies: "Pollen" }, profileSetupDetails: details,
    role: "DEPENDENT", accessLevel: "OWNER", isActive: true, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const updated = buildProfileUpdateInput(saved, { fullName: "Asha Mehta", relationship: "Spouse" });
  assert.equal(updated.avatarUrl, saved.avatarUrl);
  assert.deepEqual(updated.medicalDetails, saved.medicalDetails);
  assert.deepEqual(updated.profileSetupDetails, details);
});

test("profile setup answers remain isolated between separately built profile drafts", () => {
  const first = createBlankAdditionalProfileDraft();
  first.gender = "woman";
  first.reminderPreference = "quiet";
  const second = createBlankAdditionalProfileDraft();
  second.gender = "man";
  second.reminderPreference = "sound";
  assert.equal(buildAdditionalProfileInput(first, []).profileSetupDetails?.gender, "woman");
  assert.equal(buildAdditionalProfileInput(second, []).profileSetupDetails?.gender, "man");
  assert.equal(buildAdditionalProfileInput(first, []).profileSetupDetails?.reminderPreference, "quiet");
  assert.equal(buildAdditionalProfileInput(second, []).profileSetupDetails?.reminderPreference, "sound");
});

test("profile-scoped optional onboarding fields accept missing values", () => {
  const input = buildAdditionalProfileInput(createBlankAdditionalProfileDraft(), []);
  assert.doesNotThrow(() => normalizeProfileInput(input));
});
