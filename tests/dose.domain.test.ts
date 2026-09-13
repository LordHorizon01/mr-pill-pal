import assert from "node:assert/strict";
import test from "node:test";

import {
  FutureDoseRecordingError,
  assertDoseCanBeRecordedOnLocalDate,
  evaluatePendingDoseStatus,
  getDosePresentationState,
  isDoseExpired,
  isDoseStatusTransitionAllowed,
  scheduleOccursOnLocalDate,
  toLocalDateString,
} from "../src/features/doses/dose.domain";
import { MedicationSchedule } from "../src/features/schedules/schedule.types";

function schedule(overrides: Partial<MedicationSchedule> = {}): MedicationSchedule {
  return {
    id: "schedule-1",
    profileId: "profile-1",
    medicationId: "medication-1",
    type: "recurring",
    time: "09:00",
    startDate: "2024-01-01",
    repeatDays: [1, 3, 5],
    isActive: true,
    reminderStatus: "active",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("one-time schedules create an occurrence only on their selected local date", () => {
  const oneTime = schedule({ type: "one_time", startDate: "2024-02-29" });

  assert.equal(scheduleOccursOnLocalDate(oneTime, "2024-02-29"), true);
  assert.equal(scheduleOccursOnLocalDate(oneTime, "2024-03-01"), false);
});

test("daily and selected-weekday schedules respect start, end, and paused state", () => {
  const daily = schedule({ repeatDays: [0, 1, 2, 3, 4, 5, 6] });
  assert.equal(scheduleOccursOnLocalDate(daily, "2024-01-02"), true);
  assert.equal(scheduleOccursOnLocalDate(daily, "2023-12-31"), false);

  const bounded = schedule({ endDate: "2024-01-10" });
  assert.equal(scheduleOccursOnLocalDate(bounded, "2024-01-12"), false);
  assert.equal(scheduleOccursOnLocalDate(bounded, "2024-01-03"), true);
  assert.equal(scheduleOccursOnLocalDate(schedule({ isActive: false }), "2024-01-03"), false);
});

test("selected weekdays generate only on their selected local weekday", () => {
  const selectedDays = schedule({ repeatDays: [1, 3, 5] });

  assert.equal(scheduleOccursOnLocalDate(selectedDays, "2024-01-01"), true); // Monday
  assert.equal(scheduleOccursOnLocalDate(selectedDays, "2024-01-02"), false); // Tuesday
  assert.equal(scheduleOccursOnLocalDate(selectedDays, "2024-01-03"), true); // Wednesday
});

test("two medicines at the same clock time remain separate schedule occurrences", () => {
  const first = schedule({ id: "schedule-a", medicationId: "medicine-a", time: "09:00" });
  const second = schedule({ id: "schedule-b", medicationId: "medicine-b", time: "09:00" });

  assert.equal(scheduleOccursOnLocalDate(first, "2024-01-01"), true);
  assert.equal(scheduleOccursOnLocalDate(second, "2024-01-01"), true);
  assert.notEqual(first.id, second.id);
});

test("only pending doses can change status", () => {
  assert.equal(isDoseStatusTransitionAllowed("pending", "taken"), true);
  assert.equal(isDoseStatusTransitionAllowed("pending", "skipped"), true);
  assert.equal(isDoseStatusTransitionAllowed("pending", "missed"), true);
  assert.equal(isDoseStatusTransitionAllowed("taken", "missed"), false);
  assert.equal(isDoseStatusTransitionAllowed("skipped", "missed"), false);
  assert.equal(isDoseStatusTransitionAllowed("missed", "taken"), false);
});

test("missed-dose evaluation has no active rule until one is deliberately configured", () => {
  const late = new Date(2024, 0, 1, 12, 0, 0);

  assert.equal(evaluatePendingDoseStatus("pending", "2024-01-01", "09:00", late), "pending");
  assert.equal(isDoseExpired("2024-01-01", "09:00", late, 60), true);
  assert.equal(evaluatePendingDoseStatus("taken", "2024-01-01", "09:00", late), "taken");
});

test("local date formatting does not use UTC calendar slicing", () => {
  assert.equal(toLocalDateString(new Date(2024, 0, 1, 0, 5, 0)), "2024-01-01");
});

test("future Taken recording is rejected using the local calendar date", () => {
  assert.throws(
    () => assertDoseCanBeRecordedOnLocalDate("2024-09-17", "2024-09-10"),
    FutureDoseRecordingError,
  );
});

test("future Skip recording is rejected using the local calendar date", () => {
  assert.throws(
    () => assertDoseCanBeRecordedOnLocalDate("2024-09-17", "2024-09-10"),
    FutureDoseRecordingError,
  );
});

test("today's doses remain available for manual Taken and Skip recording", () => {
  assert.doesNotThrow(() =>
    assertDoseCanBeRecordedOnLocalDate("2024-09-10", "2024-09-10"),
  );
});

test("future pending doses are Upcoming and cannot expose intake actions", () => {
  assert.deepEqual(
    getDosePresentationState("pending", "2024-09-17", "2024-09-10"),
    { label: "Upcoming", canRecord: false },
  );
  assert.deepEqual(
    getDosePresentationState("pending", "2024-09-10", "2024-09-10"),
    { label: "Pending", canRecord: true },
  );
});

test("existing non-pending values stay unchanged in a future planning view", () => {
  assert.deepEqual(
    getDosePresentationState("taken", "2024-09-17", "2024-09-10"),
    { label: "Taken", canRecord: false },
  );
});
