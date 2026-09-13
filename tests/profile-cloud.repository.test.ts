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

test("first-profile cloud creation writes directly without a profile pre-read", () => {
  assert.match(createProfileSource, /await firestore\.setDoc\(reference/);
  assert.doesNotMatch(createProfileSource, /\b(getDoc|getDocs|query|where|onSnapshot|runTransaction)\b/);
});

test("the direct profile write keeps owner UID and optional nickname behavior in the document draft", () => {
  assert.match(createProfileSource, /buildProfileDocumentDraft\(accountUid, input\)/);
  assert.match(createProfileSource, /createdAt: firestore\.serverTimestamp\(\)/);
  assert.match(createProfileSource, /updatedAt: firestore\.serverTimestamp\(\)/);
});
