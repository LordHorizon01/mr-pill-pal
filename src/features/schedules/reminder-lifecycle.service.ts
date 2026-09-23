import { getDoseById } from "@/features/doses/dose.repository";
import { getHideMedicationName } from "@/features/settings/settings.repository";
import { getLocalProfileById } from "@/features/profiles/profile.repository";
import { getProfileGreetingName } from "@/features/profiles/profile.domain";
import { cancelScheduledNotification, scheduleOneTimeMedicationReminder } from "@/notifications/notification.service";
import { getReminderOccurrence, markReminderOccurrence, saveReminderOccurrence } from "./reminder-occurrence.repository";

function isFutureOccurrence(date: string, time: string): boolean {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0).getTime() > Date.now();
}

/** Native work follows committed SQLite data and can be repaired later without a rollback. */
export async function refreshReminderForDoseStatus(profileId: string, doseId: string): Promise<void> {
  const dose = await getDoseById(profileId, doseId);
  if (!dose || !isFutureOccurrence(dose.scheduledDate, dose.scheduledTime)) return;
  const occurrence = await getReminderOccurrence(profileId, dose.scheduleId, dose.scheduledDate, dose.scheduledTime);
  if (!occurrence || occurrence.status === "cancelled") return;
  try {
    if (occurrence.nativeNotificationId) await cancelScheduledNotification(occurrence.nativeNotificationId);
    const hideMedicationName = await getHideMedicationName();
    const profileName = getProfileGreetingName(await getLocalProfileById(profileId)) ?? undefined;
    const notificationId = await scheduleOneTimeMedicationReminder(
      dose.medicationName ?? "Medication", dose.scheduledDate, dose.scheduledTime, hideMedicationName,
      { medicationId: dose.medicationId, scheduleId: dose.scheduleId, profileId, scheduledDate: dose.scheduledDate, scheduledTime: dose.scheduledTime, doseId: dose.id },
      profileName, dose.status, dose.statusRecordedAt,
    );
    await saveReminderOccurrence({ profileId, medicationId: dose.medicationId, scheduleId: dose.scheduleId, scheduledDate: dose.scheduledDate, scheduledTime: dose.scheduledTime, nativeNotificationId: notificationId });
  } catch (error) {
    await markReminderOccurrence(profileId, dose.scheduleId, dose.scheduledDate, dose.scheduledTime, "cleanup_failed");
    if (__DEV__) console.warn("[ReminderLifecycle] status-content-refresh-failed", { stage: "refresh-dose-status", error });
  }
}
