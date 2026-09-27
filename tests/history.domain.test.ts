import assert from "node:assert/strict";
import test from "node:test";
import { canDeleteHistoryStatus, groupHistoryByLocalDate } from "../src/features/history/history.domain";
import { HistoryDose } from "../src/features/history/history.types";

function historyDose(id: string, scheduledDate: string): HistoryDose {
  return {
    id,
    profileId: "profile-a",
    medicationId: "medication-a",
    scheduleId: "schedule-a",
    scheduledDate,
    scheduledTime: "09:00",
    scheduledAt: `${scheduledDate}T09:00:00`,
    status: "taken",
    medicationName: "Medication",
    medicationDosage: "500 mg",
    createdAt: "2026-09-01T09:00:00.000Z",
    updatedAt: "2026-09-01T09:00:00.000Z",
  };
}

test("only finalized dose records are eligible for History deletion", () => {
  assert.equal(canDeleteHistoryStatus("taken"), true);
  assert.equal(canDeleteHistoryStatus("skipped"), true);
  assert.equal(canDeleteHistoryStatus("missed"), true);
  assert.equal(canDeleteHistoryStatus("pending"), false);
});

test("History grouping remains correct and does not mutate a 1,000-record result", () => {
  const source = Array.from({ length: 1_000 }, (_, index) => {
    const date = index < 500
      ? "2026-09-25"
      : index < 800
        ? "2026-09-24"
        : "2026-09-23";
    return historyDose(`dose-${index}`, date);
  });
  const sourceIds = source.map((dose) => dose.id);

  const groups = groupHistoryByLocalDate(source, "2026-09-25");

  assert.deepEqual(groups.map((group) => [group.date, group.data.length]), [
    ["2026-09-25", 500],
    ["2026-09-24", 300],
    ["2026-09-23", 200],
  ]);
  assert.equal(groups[0].label, "Today");
  assert.equal(groups[1].label, "Yesterday");
  assert.deepEqual(source.map((dose) => dose.id), sourceIds);
});
