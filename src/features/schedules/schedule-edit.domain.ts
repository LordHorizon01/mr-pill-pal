import { MedicationSchedule, UpdateScheduleInput } from "./schedule.types";

function normalizedDays(days?: number[]): number[] {
  return [...new Set(days ?? [])].sort((a, b) => a - b);
}

export function hasScheduleChanges(
  schedule: MedicationSchedule,
  input: UpdateScheduleInput,
): boolean {
  const oldDays = normalizedDays(schedule.repeatDays);
  const newDays = normalizedDays(input.repeatDays);

  return schedule.time !== input.time ||
    schedule.startDate !== input.startDate ||
    (schedule.endDate ?? undefined) !== (input.endDate ?? undefined) ||
    oldDays.length !== newDays.length ||
    oldDays.some((day, index) => day !== newDays[index]);
}

export function getScheduleEditStatusAfterPersist(
  schedule: MedicationSchedule,
): "paused" | "scheduling_failed" {
  return schedule.reminderStatus === "paused" ? "paused" : "scheduling_failed";
}

export function isOneTimeScheduleInFuture(
  startDate: string,
  time: string,
  now = new Date(),
): boolean {
  return new Date(`${startDate}T${time}:00`).getTime() > now.getTime();
}

export function isReminderRegistrationHealthy(
  reminderStatus: MedicationSchedule["reminderStatus"],
  storedNotificationIds: readonly string[],
  nativeNotificationIds: ReadonlySet<string>,
): boolean {
  return reminderStatus === "active" &&
    storedNotificationIds.length > 0 &&
    storedNotificationIds.every((id) => nativeNotificationIds.has(id));
}

export function createNotificationOccurrenceKey(metadata: {
  profileId?: string;
  scheduleId: string;
  doseId?: string;
}): string {
  return [metadata.profileId ?? "local", metadata.scheduleId, metadata.doseId ?? "schedule"]
    .join(":");
}
