import assert from "node:assert/strict";
import test from "node:test";
import { authBackBehavior, canStartAuthOperation, hasProfileSetupDraft, isAuthOperationActive, resendCooldownLabel } from "../src/features/auth/auth-ui.domain";

test("auth operations keep unrelated loading states independent", () => {
  assert.equal(isAuthOperationActive("email-signup", "email-signup"), true);
  assert.equal(isAuthOperationActive("email-signup", "google"), false);
  assert.equal(isAuthOperationActive("google", "email-login"), false);
  assert.equal(isAuthOperationActive("google-link", "google-link"), true);
  assert.equal(canStartAuthOperation("google-link"), false);
});

test("only one mutually exclusive authentication operation can start at once", () => {
  assert.equal(canStartAuthOperation(null), true);
  assert.equal(canStartAuthOperation("email-login"), false);
  assert.equal(canStartAuthOperation("resend-email"), false);
});

test("resend label exposes cooldown clearly", () => {
  assert.equal(resendCooldownLabel(30), "Resend available in 30s");
  assert.equal(resendCooldownLabel(0), "Resend verification email");
});

test("auth and onboarding screens use the correct kind of back behavior", () => {
  assert.equal(authBackBehavior("create-account"), "auth-cancel");
  assert.equal(authBackBehavior("verify-email"), "auth-cancel");
  assert.equal(authBackBehavior("first-profile"), "authenticated-onboarding-exit");
  assert.equal(authBackBehavior("additional-profile"), "normal");
});

test("first profile setup only asks before leaving when entered details would be discarded", () => {
  assert.equal(hasProfileSetupDraft({ fullName: "", nickname: "", dateOfBirth: "", relationship: "Self" }), false);
  assert.equal(hasProfileSetupDraft({ fullName: "Asha", nickname: "", dateOfBirth: "", relationship: "Self" }), true);
  assert.equal(hasProfileSetupDraft({ fullName: "", nickname: "", dateOfBirth: "", relationship: "Mother" }), true);
});
