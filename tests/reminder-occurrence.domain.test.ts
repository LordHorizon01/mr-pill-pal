import assert from "node:assert/strict";
import test from "node:test";
import { getExpectedReminderDates, occurrenceKey } from "../src/features/schedules/reminder-occurrence.domain";
import { MedicationSchedule } from "../src/features/schedules/schedule.types";

const schedule = (overrides: Partial<MedicationSchedule> = {}): MedicationSchedule => ({ id:"schedule-a", profileId:"profile-a", medicationId:"medication-a", type:"recurring", time:"21:00", startDate:"2026-09-22", repeatDays:[0,1,2,3,4,5,6], isActive:true, reminderStatus:"active", createdAt:"", updatedAt:"", ...overrides });

test("today finalized can be excluded while tomorrow remains a distinct recurring reminder occurrence", () => {
  const dates = getExpectedReminderDates(schedule(), "2026-09-22", new Date(2026, 8, 22, 20, 0));
  assert.equal(dates[0], "2026-09-22");
  assert.equal(dates.includes("2026-09-23"), true);
  assert.notEqual(occurrenceKey("schedule-a", "2026-09-22", "21:00"), occurrenceKey("schedule-a", "2026-09-23", "21:00"));
});

test("weekly schedules keep later selected weekdays independent", () => {
  const dates = getExpectedReminderDates(schedule({ repeatDays:[1,3,5] }), "2026-09-21", new Date(2026, 8, 21, 9, 0));
  assert.deepEqual(dates.slice(0, 3), ["2026-09-23", "2026-09-25", "2026-09-28"]);
});

test("past same-day occurrences are not scheduled again", () => {
  const dates = getExpectedReminderDates(schedule({ time:"09:00" }), "2026-09-22", new Date(2026, 8, 22, 10, 0));
  assert.equal(dates.includes("2026-09-22"), false);
});
