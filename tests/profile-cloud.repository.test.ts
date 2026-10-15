import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repositorySource = readFileSync(
  join(process.cwd(), "src", "features", "profiles", "profile-cloud.repository.ts"),
  "utf8",
);
const createProfileSource = repositorySource.slice(
  repositorySource.indexOf("export async function createRemoteProfile"),
  repositorySource.indexOf("export async function markRemoteProfileSetupComplete"),
);
const databaseSource = readFileSync(join(process.cwd(), "src", "database", "database.ts"), "utf8");
const schemaSource = readFileSync(join(process.cwd(), "src", "database", "schema", "schema.ts"), "utf8");
const profileStoreSource = readFileSync(join(process.cwd(), "src", "state", "profile.store.ts"), "utf8");

test("first-profile cloud creation writes directly without a profile pre-read", () => {
  assert.match(createProfileSource, /await firestore\.setDoc\(reference/);
  assert.doesNotMatch(createProfileSource, /\b(getDoc|getDocs|query|where|onSnapshot|runTransaction)\b/);
});

test("the direct profile write keeps owner UID and optional nickname behavior in the document draft", () => {
  assert.match(createProfileSource, /buildProfileDocumentDraft\(accountUid, input\)/);
  assert.match(createProfileSource, /createdAt: firestore\.serverTimestamp\(\)/);
  assert.match(createProfileSource, /updatedAt: firestore\.serverTimestamp\(\)/);
});

test("profile setup answers use an additive nullable local metadata migration", () => {
  assert.match(schemaSource, /profile_setup_details_json TEXT/);
  assert.match(databaseSource, /PRAGMA table_info\(local_profiles\)/);
  assert.match(databaseSource, /ALTER TABLE local_profiles ADD COLUMN profile_setup_details_json TEXT/);
});

test("rapid profile creation requests reuse the existing in-flight profile operation", () => {
  assert.match(profileStoreSource, /if \(activeProfileCreation\) return activeProfileCreation/);
});
