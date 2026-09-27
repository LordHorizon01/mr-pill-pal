import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("caregiver access rules keep profile data owner-only and avoid pending-invitation lists", () => {
  const rules = readFileSync(join(process.cwd(), "firestore.rules"), "utf8");
  assert.match(rules, /match \/profiles\/\{profileId\}[\s\S]*?allow read: if signedIn\(\) && resource\.data\.ownerUid == request\.auth\.uid;/);
  assert.match(rules, /match \/profileAccess\/\{accessId\}/);
  assert.match(rules, /allow get: if ownerCanReadCaregiverAccess\(\)[\s\S]*?resource\.data\.status == 'PENDING'/);
  assert.match(rules, /allow list: if ownerCanReadCaregiverAccess\(\) \|\| activeCaregiverCanReadOwnAccess\(\);/);
  assert.match(rules, /request\.resource\.data\.role == 'READ_ONLY_CAREGIVER'/);
  assert.match(rules, /request\.auth\.uid != resource\.data\.ownerUid/);
  assert.match(rules, /request\.resource\.data\.expiresAt <= request\.time \+ duration\.value\(7, 'd'\)/);
  assert.doesNotMatch(rules, /match \/profileAccess\/\{accessId\}[\s\S]*?allow read: if signedIn\(\);/);
});
