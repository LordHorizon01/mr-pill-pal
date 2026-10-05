import assert from "node:assert/strict";
import test from "node:test";

import {
  canRequestPrimerPermission,
  createFirstRunPreferenceRepository,
  shouldContinueAfterPermissionCheckFailure,
  shouldShowNotificationPrimer,
  shouldShowOnboarding,
} from "../src/features/first-run/first-run.domain";

test("a clean installation starts onboarding while an authenticated session bypasses it", () => {
  assert.equal(shouldShowOnboarding(false, false), true);
  assert.equal(shouldShowOnboarding(true, false), false);
  assert.equal(shouldShowOnboarding(false, true), false);
});

test("existing authenticated users and installations with app data migrate past first-run", async () => {
  for (const [hasSession, hasLegacyData] of [[true, false], [false, true]] as const) {
    const values = new Map<string, string>();
    const repository = createFirstRunPreferenceRepository({
      get: async (key) => values.get(key) ?? null,
      set: async (key, value) => { values.set(key, value); },
      hasLegacyAppData: async () => hasLegacyData,
    });
    assert.deepEqual(await repository.load(hasSession), { onboardingComplete: true, notificationPrimerHandled: true });
  }
});

test("onboarding completion is retained when a new repository instance simulates an app restart", async () => {
  const values = new Map<string, string>();
  const storage = {
    get: async (key: string) => values.get(key) ?? null,
    set: async (key: string, value: string) => { values.set(key, value); },
    hasLegacyAppData: async () => false,
  };
  const firstRun = createFirstRunPreferenceRepository(storage);
  assert.deepEqual(await firstRun.load(false), { onboardingComplete: false, notificationPrimerHandled: false });
  await firstRun.completeOnboarding();

  const afterRestart = createFirstRunPreferenceRepository(storage);
  assert.deepEqual(await afterRestart.load(false), { onboardingComplete: true, notificationPrimerHandled: false });
});

test("notification primer is skipped when permission is granted or was already handled", () => {
  assert.equal(shouldShowNotificationPrimer({ hasAuthenticatedSession: false, onboardingComplete: true, notificationPrimerHandled: false, permission: "granted" }), false);
  assert.equal(shouldShowNotificationPrimer({ hasAuthenticatedSession: false, onboardingComplete: true, notificationPrimerHandled: true, permission: "denied" }), false);
  assert.equal(shouldShowNotificationPrimer({ hasAuthenticatedSession: false, onboardingComplete: true, notificationPrimerHandled: false, permission: "not_requested" }), true);
  assert.equal(shouldShowNotificationPrimer({ hasAuthenticatedSession: false, onboardingComplete: true, notificationPrimerHandled: false, permission: "denied" }), true);
});

test("Maybe later and denied choices do not request permission repeatedly", async () => {
  assert.equal(canRequestPrimerPermission("not_requested", true), true);
  assert.equal(canRequestPrimerPermission("denied", true), true);
  assert.equal(canRequestPrimerPermission("denied", false), false);
  assert.equal(canRequestPrimerPermission("granted", true), false);

  const values = new Map<string, string>();
  const repository = createFirstRunPreferenceRepository({ get: async (key) => values.get(key) ?? null, set: async (key, value) => { values.set(key, value); }, hasLegacyAppData: async () => false });
  await repository.load(false);
  await repository.markNotificationPrimerHandled();
  assert.equal((await createFirstRunPreferenceRepository({ get: async (key) => values.get(key) ?? null, set: async (key, value) => { values.set(key, value); }, hasLegacyAppData: async () => false }).load(false)).notificationPrimerHandled, true);
});

test("a notification permission API failure always permits continuing to authentication", () => {
  assert.equal(shouldContinueAfterPermissionCheckFailure(), true);
});

test("development replay resets only onboarding and notification-primer preferences", async () => {
  const values = new Map<string, string>([
    ["onboarding_complete", "true"],
    ["notification_primer_handled", "true"],
    ["appearance_preference", "dark"],
    ["hide_medication_name_on_lock_screen", "true"],
  ]);
  const repository = createFirstRunPreferenceRepository({
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => { values.set(key, value); },
    hasLegacyAppData: async () => true,
  });

  await repository.resetForDevelopment();

  assert.equal(values.get("onboarding_complete"), "false");
  assert.equal(values.get("notification_primer_handled"), "false");
  assert.equal(values.get("appearance_preference"), "dark");
  assert.equal(values.get("hide_medication_name_on_lock_screen"), "true");
  assert.equal(values.size, 4);
});
