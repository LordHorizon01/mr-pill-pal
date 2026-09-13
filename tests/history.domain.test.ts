import assert from "node:assert/strict";
import test from "node:test";
import { canDeleteHistoryStatus } from "../src/features/history/history.domain";

test("only finalized dose records are eligible for History deletion", () => {
  assert.equal(canDeleteHistoryStatus("taken"), true);
  assert.equal(canDeleteHistoryStatus("skipped"), true);
  assert.equal(canDeleteHistoryStatus("missed"), true);
  assert.equal(canDeleteHistoryStatus("pending"), false);
});
