import assert from "node:assert/strict";
import test from "node:test";

import { getStockHistoryPresentation, sortStockHistoryNewestFirst } from "../src/features/refills/stock-history.domain";
import { StockHistoryEvent } from "../src/features/refills/refill.types";

const event = (id: string, createdAt: string, type: StockHistoryEvent["type"], delta: number, unitSnapshot?: StockHistoryEvent["unitSnapshot"]): StockHistoryEvent => ({ id, profileId: "profile-a", medicationId: "medicine-a", type, quantityDelta: delta, quantityBefore: 3, quantityAfter: 3 + delta, unitSnapshot, createdAt });

test("stock history labels every supported audit event with user-friendly text", () => {
  assert.equal(getStockHistoryPresentation(event("1", "2026-09-24T10:00:00.000Z", "refill_addition", 30, "tablets")).label, "Refill added");
  assert.equal(getStockHistoryPresentation(event("2", "2026-09-24T10:00:00.000Z", "dose_consumption", -1, "tablets")).label, "Dose taken");
  assert.equal(getStockHistoryPresentation(event("3", "2026-09-24T10:00:00.000Z", "dose_consumption_reversal", 1, "tablets")).label, "Dose correction");
  assert.equal(getStockHistoryPresentation(event("4", "2026-09-24T10:00:00.000Z", "dose_consumption_reapplied", -1, "tablets")).label, "Dose correction");
});

test("stock history preserves unit snapshots and does not guess a legacy event unit", () => {
  const current = getStockHistoryPresentation(event("1", "2026-09-24T10:00:00.000Z", "refill_addition", 30, "ml"));
  const legacy = getStockHistoryPresentation(event("2", "2026-09-24T10:00:00.000Z", "dose_consumption", -1, undefined));
  assert.equal(current.delta, "+30 ml");
  assert.equal(current.change, "3 ml -> 33 ml");
  assert.equal(legacy.hasUnitSnapshot, false);
  assert.match(legacy.change, /unit not saved/);
});

test("stock history is newest first and never mixes profile data in presentation input", () => {
  const sorted = sortStockHistoryNewestFirst([
    event("old", "2026-09-20T10:00:00.000Z", "dose_consumption", -1, "tablets"),
    event("new", "2026-09-24T10:00:00.000Z", "refill_addition", 30, "tablets"),
  ]);
  assert.deepEqual(sorted.map((item) => item.id), ["new", "old"]);
  assert.equal(sorted.every((item) => item.profileId === "profile-a" && item.medicationId === "medicine-a"), true);
});
