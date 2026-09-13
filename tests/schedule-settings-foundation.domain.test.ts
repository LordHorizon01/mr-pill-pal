import assert from "node:assert/strict";
import test from "node:test";
import {
  createNotificationOccurrenceKey,
  getScheduleEditStatusAfterPersist,
  hasScheduleChanges,
  isOneTimeScheduleInFuture,
  isReminderRegistrationHealthy,
} from "../src/features/schedules/schedule-edit.domain";
import { MedicationSchedule, ReminderSettingsOverview } from "../src/features/schedules/schedule.types";
import { canReuseReminderHealthRequest, getReminderHealthLabel, getReminderProblemLabel } from "../src/features/settings/reminder-health.domain";
import { SUCCESS_NOTICE_DURATION_MS } from "../src/features/settings/success-notice.domain";

function schedule(overrides: Partial<MedicationSchedule> = {}): MedicationSchedule {
  return {
    id: "schedule-1",
    profileId: "profile-1",
    medicationId: "medication-1",
    type: "recurring",
    time: "10:00",
    startDate: "2026-09-10",
    repeatDays: [2, 4, 6],
    isActive: true,
    reminderStatus: "active",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

test("schedule edit detects time, weekday, and start-date changes", () => {
  const current = schedule();
  assert.equal(hasScheduleChanges(current, { time: "11:00", startDate: current.startDate, repeatDays: current.repeatDays }), true);
  assert.equal(hasScheduleChanges(current, { time: current.time, startDate: current.startDate, repeatDays: [1, 2, 4, 6] }), true);
  assert.equal(hasScheduleChanges(current, { time: current.time, startDate: "2026-09-11", repeatDays: current.repeatDays }), true);
});

test("unchanged weekday order is normalized and causes no save", () => {
  const current = schedule();
  assert.equal(hasScheduleChanges(current, { time: "10:00", startDate: "2026-09-10", repeatDays: [6, 2, 4, 4] }), false);
});

test("paused schedules preserve paused state while active schedules enter repair state during replacement", () => {
  assert.equal(getScheduleEditStatusAfterPersist(schedule({ isActive: false, reminderStatus: "paused" })), "paused");
  assert.equal(getScheduleEditStatusAfterPersist(schedule()), "scheduling_failed");
});

test("failed reminder state is repaired even when an old native identifier still exists", () => {
  const nativeIds = new Set(["old-native-id"]);
  assert.equal(isReminderRegistrationHealthy("active", ["old-native-id"], nativeIds), true);
  assert.equal(isReminderRegistrationHealthy("scheduling_failed", ["old-native-id"], nativeIds), false);
  assert.equal(isReminderRegistrationHealthy("permission_required", ["old-native-id"], nativeIds), false);
});

test("one-time update boundary rejects current/past time and accepts future time using local date-time", () => {
  const now = new Date(2026, 8, 10, 10, 0, 0, 0);
  assert.equal(isOneTimeScheduleInFuture("2026-09-10", "10:00", now), false);
  assert.equal(isOneTimeScheduleInFuture("2026-09-10", "09:59", now), false);
  assert.equal(isOneTimeScheduleInFuture("2026-09-10", "10:01", now), true);
  assert.equal(isOneTimeScheduleInFuture("2026-09-11", "00:01", now), true);
});

test("reminder health labels are based on real overview states", () => {
  const base: ReminderSettingsOverview = { permissionGranted: true, health: "working", affectedSchedules: [] };
  assert.equal(getReminderHealthLabel(base), "Working");
  assert.equal(getReminderHealthLabel({ ...base, permissionGranted: false, health: "permission_required" }), "Permission required");
  assert.equal(getReminderHealthLabel({ ...base, health: "attention_required", affectedSchedules: [{ scheduleId: "s", medicationId: "m", medicationName: "Dose Test", time: "10:00", reminderStatus: "scheduling_failed" }] }), "1 schedule needs attention");
  assert.equal(getReminderProblemLabel("permission_required"), "Notification permission required");
  assert.equal(getReminderProblemLabel("scheduling_failed"), "Reminder setup failed");
});

test("reminder-health deduplication never treats another account's check as its own", () => {
  assert.equal(canReuseReminderHealthRequest("account-a", "account-a"), true);
  assert.equal(canReuseReminderHealthRequest("account-a", "account-b"), false);
  assert.equal(canReuseReminderHealthRequest(undefined, "account-b"), false);
});

test("success feedback duration stays inside the requested 2.5 to 3 second window", () => {
  assert.ok(SUCCESS_NOTICE_DURATION_MS >= 2500);
  assert.ok(SUCCESS_NOTICE_DURATION_MS <= 3000);
});

test("same-time cross-profile reminders keep independent occurrence identities", () => {
  const first = createNotificationOccurrenceKey({ profileId: "profile-a", scheduleId: "schedule-a" });
  const second = createNotificationOccurrenceKey({ profileId: "profile-b", scheduleId: "schedule-b" });
  const third = createNotificationOccurrenceKey({ profileId: "profile-c", scheduleId: "schedule-c" });
  assert.equal(new Set([first, second, third]).size, 3);
});
