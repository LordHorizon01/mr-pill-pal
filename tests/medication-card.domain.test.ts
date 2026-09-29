import assert from "node:assert/strict";
import test from "node:test";

import { getMedicationCardActionModel } from "../src/features/medications/medication-card.domain";

test("active medication cards keep Refill as a primary action", () => {
  const model = getMedicationCardActionModel(false);
  assert.deepEqual(model.primary, ["schedule", "edit", "refill"]);
  assert.deepEqual(model.overflow, ["archive", "delete"]);
  assert.equal(model.overflow.includes("refill" as never), false);
});

test("archived medication cards keep restore primary and destructive delete secondary", () => {
  const model = getMedicationCardActionModel(true);
  assert.deepEqual(model.primary, ["restore"]);
  assert.deepEqual(model.overflow, ["delete"]);
});
