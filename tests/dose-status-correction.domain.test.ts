import assert from "node:assert/strict";
import test from "node:test";
import { canCorrectDoseStatus, getReversedInventoryQuantity } from "../src/features/doses/dose-status-correction.domain";

test("only Taken and Skipped may be corrected to each other", () => {
  assert.equal(canCorrectDoseStatus("taken", "skipped"), true);
  assert.equal(canCorrectDoseStatus("skipped", "taken"), true);
  assert.equal(canCorrectDoseStatus("pending", "taken"), false);
  assert.equal(canCorrectDoseStatus("missed", "skipped"), false);
});

test("a reversal restores the actual deduction, including a partial clamped deduction", () => {
  assert.equal(getReversedInventoryQuantity(0.5), 0.5);
  assert.equal(getReversedInventoryQuantity(0), 0);
});
