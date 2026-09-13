import assert from "node:assert/strict";
import test from "node:test";
import { hasMedicationChanges } from "../src/features/medications/medication.domain";
import { calculateRoutineAdherence } from "../src/features/history/insights.domain";

const medication = { id: "m1", profileId: "profile-1", name: "Dose Test", dosage: "500 mg", isActive: true, createdAt: "2026-09-11T00:00:00.000Z", updatedAt: "2026-09-11T00:00:00.000Z" };

test("unchanged medication input is recognized without a database update", () => {
  assert.equal(hasMedicationChanges(medication, { name: "Dose Test", dosage: "500 mg" }), false);
  assert.equal(hasMedicationChanges(medication, { name: " Dose Test ", dosage: "500 mg" }), false);
  assert.equal(hasMedicationChanges(medication, { dosage: "1 tablet" }), true);
});

test("routine adherence uses Taken divided by all eligible outcomes", () => {
  assert.equal(calculateRoutineAdherence({ taken: 8, skipped: 1, missed: 1 }), 80);
  assert.equal(calculateRoutineAdherence({ taken: 0, skipped: 0, missed: 0 }), null);
  assert.equal(calculateRoutineAdherence({ taken: 2, skipped: 0, missed: 0 }, 2), 50);
});
