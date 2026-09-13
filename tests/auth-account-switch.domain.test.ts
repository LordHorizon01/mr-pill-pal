import assert from "node:assert/strict";
import test from "node:test";

import { buildAccountSignOutPlan, profileSwitchKeepsAccountSession } from "../src/features/auth/auth-session.domain";

test("Google account switch plans Google SDK, Firebase, and transient-state cleanup", () => {
  assert.deepEqual(buildAccountSignOutPlan([{ providerId: "password" }, { providerId: "google.com" }]), {
    signOutGoogleSdk: true,
    signOutFirebase: true,
    clearTransientState: true,
  });
});

test("email/password logout keeps Google SDK untouched while still clearing Firebase and UI state", () => {
  assert.deepEqual(buildAccountSignOutPlan([{ providerId: "password" }]), {
    signOutGoogleSdk: false,
    signOutFirebase: true,
    clearTransientState: true,
  });
});

test("missing or malformed provider data stays safe and a profile switch never logs out the account", () => {
  assert.equal(buildAccountSignOutPlan(null).signOutGoogleSdk, false);
  assert.equal(buildAccountSignOutPlan([null, {}]).signOutGoogleSdk, false);
  assert.equal(profileSwitchKeepsAccountSession(), true);
});
