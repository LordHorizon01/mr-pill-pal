import assert from "node:assert/strict";
import test from "node:test";
import { PRIMARY_TAB_NAMES } from "../src/features/navigation/navigation.domain";
import { resetExpandedHistoryDate, toggleExpandedHistoryDate } from "../src/features/history/history-accordion.domain";

test("five primary tabs include the shared Settings destination", () => {
  assert.deepEqual(PRIMARY_TAB_NAMES, ["Home", "Medications", "History", "Insights", "Settings"]);
});

test("History accordion starts and returns collapsed, with only one date open", () => {
  assert.equal(resetExpandedHistoryDate(), null);
  assert.equal(toggleExpandedHistoryDate(null, "2026-09-11"), "2026-09-11");
  assert.equal(toggleExpandedHistoryDate("2026-09-11", "2026-09-10"), "2026-09-10");
  assert.equal(toggleExpandedHistoryDate("2026-09-10", "2026-09-10"), null);
});
