import assert from "node:assert/strict";
import test from "node:test";
import { normalizeEmail, normalizePhoneNumber, validateEmailPassword } from "../src/features/auth/auth.domain";
import { getGreeting, normalizeProfileInput } from "../src/features/profiles/profile.domain";

test("auth input normalizes email and preserves a valid international phone number", () => {
  assert.equal(normalizeEmail("  USER@Example.COM "), "user@example.com");
  assert.equal(normalizePhoneNumber("+91", "98765 43210"), "+919876543210");
});

test("auth input rejects unsafe account credentials before a Firebase request", () => {
  assert.throws(() => validateEmailPassword("not-email", "short"), /valid email/i);
  assert.throws(() => validateEmailPassword("student@example.com", "short"), /8 characters/i);
  assert.doesNotThrow(() => validateEmailPassword("student@example.com", "safe-password", "safe-password"));
});

test("profile onboarding validates local date of birth and removes excess whitespace", () => {
  const profile = normalizeProfileInput({ fullName: "  Asha   Sharma ", nickname: "  Ashu ", dateOfBirth: "2001-04-08", relationship: "Self" });
  assert.equal(profile.fullName, "Asha Sharma");
  assert.equal(profile.nickname, "Ashu");
  assert.throws(() => normalizeProfileInput({ fullName: "Asha", dateOfBirth: "2999-01-01", relationship: "Self" }), /future/i);
});

test("greeting is deterministic and does not expose private medical information", () => {
  const profile = { fullName: "Asha Sharma", nickname: "Asha" };
  assert.equal(getGreeting(profile, new Date("2026-09-12T08:00:00")), "Good morning, Asha (Asha Sharma)");
  assert.equal(getGreeting(profile, new Date("2026-09-12T14:00:00")), "Good afternoon, Asha (Asha Sharma)");
  assert.equal(getGreeting(profile, new Date("2026-09-12T19:00:00")), "Good evening, Asha (Asha Sharma)");
});
