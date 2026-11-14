import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getLowStockNotificationContent, decideLowStockEpisode } from "../src/features/refills/low-stock-alert.domain";
import { isReminderRegistrationHealthy } from "../src/features/schedules/schedule-edit.domain";
import { getStatusAwareReminderContent } from "../src/notifications/reminder-content.domain";
import { getNotificationPermissionRecoveryAction } from "../src/notifications/notification-permission.domain";
import { dispatchLocalNotificationRequest } from "../src/notifications/local-notification-dispatch.domain";
import { getExpectedReminderDates } from "../src/features/schedules/reminder-occurrence.domain";

const notificationService = readFileSync("src/notifications/notification.service.ts", "utf8");
const scheduleService = readFileSync("src/features/schedules/schedule.service.ts", "utf8");
const scheduleRepository = readFileSync("src/features/schedules/schedule.repository.ts", "utf8");
const layout = readFileSync("src/app/_layout.tsx", "utf8");
const scheduleScreen = readFileSync("src/app/schedule.tsx", "utf8");
const authStore = readFileSync("src/state/auth.store.ts", "utf8");
const nativeAlarmDelegate = readFileSync("node_modules/expo-notifications/android/src/main/java/expo/modules/notifications/service/delegates/ExpoSchedulingDelegate.kt", "utf8");
const expoNotificationsManifest = readFileSync("node_modules/expo-notifications/android/src/main/AndroidManifest.xml", "utf8");
const expoNotificationsService = readFileSync("node_modules/expo-notifications/android/src/main/java/expo/modules/notifications/service/NotificationsService.kt", "utf8");

test("one-time medication reminders use a native local date trigger and occurrence metadata", () => {
  assert.match(notificationService, /dispatchLocalNotificationRequest\(Notifications\.scheduleNotificationAsync, \{[\s\S]*?type:\s*Notifications\.SchedulableTriggerInputTypes\.DATE/);
  assert.match(scheduleService, /scheduledDate: date, scheduledTime: schedule\.time/);
  assert.doesNotMatch(scheduleService, /fetch\s*\(|firebase|firestore/i);
});

test("a mocked local notification API accepts a one-time reminder without any remote service", async () => {
  const requests: { content: { data?: { profileId?: string } }; trigger: { type: string; date: Date } }[] = [];
  const id = await dispatchLocalNotificationRequest(async (request) => {
    requests.push(request);
    return "local-one-time-id";
  }, {
    content: { data: { profileId: "profile-a" } },
    trigger: { type: "date", date: new Date("2026-11-20T21:00:00") },
  });
  assert.equal(id, "local-one-time-id");
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.trigger.type, "date");
  assert.equal(requests[0]?.content.data?.profileId, "profile-a");
});

test("a mocked local notification API accepts selected weekday occurrences as separate native date alarms", async () => {
  const schedule = { id: "schedule-a", profileId: "profile-a", medicationId: "medicine-a", type: "recurring" as const, time: "09:00", startDate: "2026-11-13", repeatDays: [1, 3, 5], isActive: true, reminderStatus: "active" as const, createdAt: "", updatedAt: "" };
  const dates = getExpectedReminderDates(schedule, "2026-11-13", new Date(2026, 10, 13, 8, 0));
  const requests: { trigger: { type: string; date: Date } }[] = [];
  const ids = await Promise.all(dates.slice(0, 3).map((date) => dispatchLocalNotificationRequest(async (request) => {
    requests.push(request);
    return `local-${requests.length}`;
  }, { trigger: { type: "date", date: new Date(`${date}T09:00:00`) } })));
  assert.deepEqual(dates.slice(0, 3), ["2026-11-13", "2026-11-16", "2026-11-18"]);
  assert.equal(ids.length, 3);
  assert.equal(requests.every((request) => request.trigger.type === "date"), true);
});

test("offline recurring reminders are materialized as local future date alarms", () => {
  assert.match(scheduleService, /getExpectedReminderDates\(schedule\)/);
  assert.match(notificationService, /dispatchLocalNotificationRequest\(Notifications\.scheduleNotificationAsync, \{[\s\S]*?type:\s*Notifications\.SchedulableTriggerInputTypes\.DATE/);
});

test("editing a schedule replaces its previous notification identifiers", () => {
  const update = scheduleService.slice(scheduleService.indexOf("export async function updateMedicationSchedule"), scheduleService.indexOf("export async function getReminderSettingsOverview"));
  assert.match(update, /cancelScheduledNotifications\(oldNotificationIds\)/);
  assert.match(update, /scheduleNativeNotifications\(/);
  assert.match(scheduleService, /async function getAllStoredNotificationIds\(schedule: MedicationSchedule\)/);
});

test("pausing a schedule cancels stored alarms and marks its occurrences cancelled", () => {
  const inactive = scheduleService.slice(scheduleService.indexOf("async function setInactiveScheduleState"), scheduleService.indexOf("async function markScheduleAsUnavailable"));
  assert.match(inactive, /cancelScheduledNotifications\(notificationIds\)/);
  assert.match(inactive, /markScheduleOccurrencesCancelled\(schedule\.id\)/);
});

test("resuming a schedule recreates eligible future local alarms", () => {
  const resume = scheduleService.slice(scheduleService.indexOf("export async function resumeSchedule"), scheduleService.indexOf("export async function removeSchedule"));
  assert.match(resume, /replaceScheduleNotifications\(schedule, medication\.name/);
});

test("deleting a schedule cancels its alarms before deleting the SQLite schedule", () => {
  const remove = scheduleService.slice(scheduleService.indexOf("export async function removeSchedule"));
  assert.ok(remove.indexOf("cancelScheduledNotifications(notificationIds)") < remove.indexOf("await deleteSchedule(id)"));
});

test("schedule health spans active profiles in the same account without tying reminders to the selected profile", () => {
  assert.match(scheduleRepository, /local_profiles\.account_uid = \?/);
  assert.match(scheduleRepository, /local_profiles\.is_active = 1/);
  assert.match(notificationService, /profileId: metadata\.profileId/);
});

test("account sign-out cancels schedule occurrences and low-stock alerts before ending authentication", () => {
  const logout = authStore.slice(authStore.indexOf("logout: async () =>"));
  assert.match(logout, /cancelAccountReminderNotifications\(user\.uid\)/);
  assert.match(logout, /cancelLowStockAlertsForAccount\(user\.uid\)/);
  assert.ok(logout.indexOf("cancelLowStockAlertsForAccount(user.uid)") < logout.indexOf("signOutCurrentAccount()"));
  assert.match(scheduleService, /getReminderOccurrenceNotificationIdsForAccount\(accountUid\)/);
});

test("Taken dose notification content is informational and does not request another dose", () => {
  const content = getStatusAwareReminderContent({ medicationName: "Test medicine", hideMedicationName: false, status: "taken", statusRecordedAt: "2026-11-13T08:00:00" });
  assert.match(content.body, /recorded as Taken/);
  assert.doesNotMatch(content.body, /take another dose|time to take/i);
});

test("Skipped dose notification content is informational and does not request another dose", () => {
  const content = getStatusAwareReminderContent({ medicationName: "Test medicine", hideMedicationName: false, status: "skipped", statusRecordedAt: "2026-11-13T08:00:00" });
  assert.match(content.body, /recorded as Skipped/);
  assert.doesNotMatch(content.body, /take another dose|time to take/i);
});

test("denied notification permission requests only after explicit user action, then guides to settings", () => {
  assert.equal(getNotificationPermissionRecoveryAction({ granted: false, canAskAgain: true }), "request");
  assert.equal(getNotificationPermissionRecoveryAction({ granted: false, canAskAgain: false }), "settings");
  assert.match(scheduleScreen, /requestPrimerNotificationPermission\(\)/);
  assert.match(scheduleScreen, /Linking\.openSettings\(\)/);
  assert.match(notificationService, /Scheduling and health checks never prompt/);
});

test("Android exact-alarm access falls back to an inexact alarm when restricted", () => {
  assert.match(nativeAlarmDelegate, /alarmManager\.canScheduleExactAlarms\(\)/);
  assert.match(nativeAlarmDelegate, /setExactAndAllowWhileIdle/);
  assert.match(nativeAlarmDelegate, /setAndAllowWhileIdle/);
});

test("the existing medication channel keeps its ID, high importance, and vibration settings", () => {
  assert.match(notificationService, /MEDICATION_CHANNEL_ID = "medication-reminders-v3"/);
  assert.match(notificationService, /importance: Notifications\.AndroidImportance\.MAX/);
  assert.match(notificationService, /vibrationPattern: \[0, 250, 250, 250\]/);
  assert.match(notificationService, /setNotificationChannelAsync\(MEDICATION_CHANNEL_ID/);
});

test("the installed Expo Android manifest restores scheduled notifications after boot", () => {
  assert.match(expoNotificationsManifest, /android\.permission\.RECEIVE_BOOT_COMPLETED/);
  assert.match(expoNotificationsManifest, /android\.intent\.action\.BOOT_COMPLETED/);
  assert.match(expoNotificationsService, /Intent\.ACTION_BOOT_COMPLETED/);
  assert.match(expoNotificationsService, /setupScheduledNotifications/);
});

test("offline startup keeps reminder reconciliation best-effort and local", () => {
  assert.match(layout, /reconcileReminderHealth\(accountUid\)/);
  assert.match(layout, /Notification reconciliation is best-effort/);
  assert.doesNotMatch(scheduleService, /firebase|firestore|fetch\s*\(/i);
});

test("low-stock delivery is local and an already-alerted episode does not duplicate", () => {
  const input = { trackingEnabled: true, medicationIsActive: true, medicationIsArchived: false, currentQuantity: 2, lowStockThreshold: 5, previousEpisodeActive: true, previousAlertStatus: "alerted" as const };
  assert.equal(decideLowStockEpisode(input).shouldCheckDelivery, false);
  assert.equal(getLowStockNotificationContent({ medicationName: "Test medicine", quantity: 2, unit: "tablets", hideMedicationName: true }).title, "Refill reminder");
  assert.match(readFileSync("src/features/refills/low-stock-alert.service.ts", "utf8"), /scheduleLowStockNotification\(/);
});

test("a missing native notification identifier makes the registration unhealthy", () => {
  assert.equal(isReminderRegistrationHealthy("active", ["native-a", "native-b"], new Set(["native-a"])), false);
});

test("repeated health reconciliation can reuse an intact registration without replacing it", () => {
  const nativeIds = new Set(["native-a", "native-b"]);
  assert.equal(isReminderRegistrationHealthy("active", ["native-a", "native-b"], nativeIds), true);
  assert.match(scheduleService, /if \(!hasMissingFutureOccurrence && isHealthy && await hasScheduledReminderOccurrences[\s\S]*?continue;/);
});

test("health reconciliation detects missing or cleanup-failed future occurrence identifiers", () => {
  assert.match(scheduleService, /getReminderOccurrencesForSchedule\(schedule\.profileId, schedule\.id\)/);
  assert.match(scheduleService, /occurrence\.status === "cleanup_failed"/);
  assert.match(scheduleService, /!nativeNotificationIds\.has\(occurrence\.nativeNotificationId\)/);
  assert.match(scheduleService, /await getAllStoredNotificationIds\(schedule\)/);
});
