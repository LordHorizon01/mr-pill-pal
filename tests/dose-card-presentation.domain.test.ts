import assert from "node:assert/strict";
import test from "node:test";
import { shouldShowDoseCorrectionOverflow } from "../src/features/doses/dose-card-presentation.domain";

test("only Taken and Skipped dose cards expose the correction overflow", () => {
  assert.equal(shouldShowDoseCorrectionOverflow("pending"), false);
  assert.equal(shouldShowDoseCorrectionOverflow("taken"), true);
  assert.equal(shouldShowDoseCorrectionOverflow("skipped"), true);
  assert.equal(shouldShowDoseCorrectionOverflow("missed"), false);
});
