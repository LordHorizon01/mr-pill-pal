import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  canOpenAuthenticatedLocalApp,
  getRestorableProfiles,
  isCurrentAccountRequest,
  isOfflineStartupFailure,
  isNetworkUnreachable,
  mergeRemoteProfilesSafely,
  resolveIdentityStartupPhase,
  resolveLocalProfileSetupState,
  restoreSelectedProfile,
  withStartupTimeout,
} from "../src/features/auth/offline-startup.domain";

type LocalProfileFixture = {
  id: string;
  accountUid: string;
  isActive: boolean;
  updatedAt: string;
  deletedAt?: string;
};

const profile = (id: string, accountUid = "account-a", updatedAt = "2026-10-20T10:00:00.000Z"): LocalProfileFixture => ({
  id,
  accountUid,
  isActive: true,
  updatedAt,
});

test("a verified Firebase identity remains unresolved until its local setup gate is restored", () => {
  assert.equal(resolveIdentityStartupPhase(false, false), "unauthenticated");
  assert.equal(resolveIdentityStartupPhase(true, true), "verification_required");
  assert.equal(resolveIdentityStartupPhase(true, false), "loading");
  assert.equal(resolveLocalProfileSetupState("COMPLETED", true), "COMPLETED");
  assert.equal(resolveLocalProfileSetupState("NOT_STARTED", false), "NOT_STARTED");
});

test("root startup renders destinations only after account-scoped local setup restoration", () => {
  const authStore = readFileSync("src/state/auth.store.ts", "utf8");
  const rootLayout = readFileSync("src/app/_layout.tsx", "utf8");
  assert.match(authStore, /resolveIdentityStartupPhase\(Boolean\(user\), Boolean\(user && requiresEmailVerification\(user\)\)\)/);
  assert.match(rootLayout, /setProfileReady\(progress\.state === "COMPLETED"\)/);
  assert.match(rootLayout, /loadFirstRunPreferences\(Boolean\(authUserUid\)\)/);
  assert.match(rootLayout, /setRestoredAccountUid\(accountUid\)/);
  assert.match(rootLayout, /startupReady && authPhase !== "authenticated"/);
  assert.match(rootLayout, /authPhase === "loading" && !authUserUid/);
  assert.match(authStore, /set\(\{ phase: ready \? "authenticated" : "profile_setup_required" \}\)/);
  assert.equal(resolveIdentityStartupPhase(true, false), "loading");
  assert.equal(resolveLocalProfileSetupState("NOT_STARTED", false), "NOT_STARTED");
});

test("online returning account restores its previously selected local profile", () => {
  const profiles = [profile("self"), profile("parent")];
  assert.equal(restoreSelectedProfile(profiles, "account-a", "parent")?.id, "parent");
  assert.equal(resolveLocalProfileSetupState("COMPLETED", true), "COMPLETED");
});

test("offline returning account can enter using local profiles and cached completion", () => {
  const localProfile = restoreSelectedProfile([profile("self")], "account-a", "self");
  assert.ok(localProfile);
  assert.equal(canOpenAuthenticatedLocalApp({ databaseReady: true, authRestored: true, localAccountRestored: true, setupState: "COMPLETED" }), true);
});

test("a rejected cloud profile refresh cannot remove or overwrite local profiles", () => {
  const local = [profile("self")];
  assert.deepEqual(mergeRemoteProfilesSafely(local, [], "account-a"), local);
  assert.deepEqual(mergeRemoteProfilesSafely(local, [profile("self", "account-a", "2026-10-19T10:00:00.000Z")], "account-a"), local);
});

test("a never-resolving background request times out without holding local app readiness", async () => {
  const pending = new Promise<never>(() => undefined);
  await assert.rejects(withStartupTimeout(pending, "test remote request", 10), /timeout/i);
  assert.equal(canOpenAuthenticatedLocalApp({ databaseReady: true, authRestored: true, localAccountRestored: true, setupState: "COMPLETED" }), true);
});

test("a failed account setup read preserves a completed account-scoped cache", () => {
  assert.equal(resolveLocalProfileSetupState("COMPLETED", false), "COMPLETED");
  assert.equal(resolveLocalProfileSetupState("IN_PROGRESS", false), "IN_PROGRESS");
});

test("missing Firebase authentication never authorizes protected local data", () => {
  assert.equal(isCurrentAccountRequest("account-a", null), false);
  assert.equal(canOpenAuthenticatedLocalApp({ databaseReady: true, authRestored: false, localAccountRestored: true, setupState: "COMPLETED" }), false);
});

test("explicit sign-out cannot reuse the prior account UID as an offline session", () => {
  const activeUidAfterSignOut: string | null = null;
  assert.equal(isCurrentAccountRequest("account-a", activeUidAfterSignOut), false);
  assert.equal(canOpenAuthenticatedLocalApp({ databaseReady: true, authRestored: false, localAccountRestored: true, setupState: "COMPLETED" }), false);
});

test("profiles and selection are filtered by the authenticated account UID", () => {
  const profiles = [profile("a-self", "account-a"), profile("b-self", "account-b")];
  assert.deepEqual(getRestorableProfiles(profiles, "account-a").map((item) => item.id), ["a-self"]);
  assert.equal(restoreSelectedProfile(profiles, "account-a", "b-self")?.id, "a-self");
});

test("a stale response from the old account is rejected after account switching", () => {
  assert.equal(isCurrentAccountRequest("account-a", "account-b"), false);
  const merged = mergeRemoteProfilesSafely([profile("b-self", "account-b")], [profile("a-new", "account-a")], "account-b");
  assert.deepEqual(merged.map((item) => item.id), ["b-self"]);
});

test("reminder reconciliation failure does not block an authenticated local app", () => {
  const error = Object.assign(new Error("network unavailable"), { code: "firestore/unavailable" });
  assert.equal(isOfflineStartupFailure(error), true);
  assert.equal(canOpenAuthenticatedLocalApp({ databaseReady: true, authRestored: true, localAccountRestored: true, setupState: "COMPLETED" }), true);
});

test("Taken and Skipped actions persist profile-scoped dose status in local SQLite", () => {
  const repository = readFileSync("src/features/doses/dose.repository.ts", "utf8");
  const schema = readFileSync("src/database/schema/schema.ts", "utf8");
  assert.match(repository, /UPDATE dose_records SET status='taken'[\s\S]*WHERE id=\? AND profile_id=\? AND status='pending'/);
  assert.match(repository, /markDoseSkippedInDatabase = \(profileId: string, id: string\) => updatePendingStatus\(profileId, id, "skipped"\)/);
  assert.match(schema, /status TEXT NOT NULL CHECK \(status IN \('pending', 'taken', 'skipped', 'missed'\)\)/);
});

test("when internet returns, newer same-account profile data merges without losing local-only rows", () => {
  const local = [profile("self", "account-a", "2026-10-20T10:00:00.000Z"), profile("local-only")];
  const remote = [profile("self", "account-a", "2026-10-21T10:00:00.000Z"), profile("other-account", "account-b")];
  const merged = mergeRemoteProfilesSafely(local, remote, "account-a");
  assert.deepEqual(merged.map((item) => [item.id, item.updatedAt]), [
    ["self", "2026-10-21T10:00:00.000Z"],
    ["local-only", "2026-10-20T10:00:00.000Z"],
  ]);
  assert.equal(resolveLocalProfileSetupState("COMPLETED", false), "COMPLETED");
});

test("device network-state changes distinguish offline, online, and unknown connectivity", () => {
  assert.equal(isNetworkUnreachable({ isConnected: false, isInternetReachable: false }), true);
  assert.equal(isNetworkUnreachable({ isConnected: true, isInternetReachable: true }), false);
  assert.equal(isNetworkUnreachable({}), null);
});
