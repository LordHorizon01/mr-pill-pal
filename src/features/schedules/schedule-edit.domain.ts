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

export type ScheduleStartTimeError = "past_date" | "past_time_today";

function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Validates a newly selected schedule's first local occurrence before any write. */
export function getScheduleStartTimeError(
  startDate: string,
  time: string,
  type: "one_time" | "recurring",
  now = new Date(),
): ScheduleStartTimeError | null {
  const today = toLocalDateString(now);
  if (startDate < today) return "past_date";

  if (startDate === today || type === "one_time") {
    const [hours, minutes] = time.split(":").map(Number);
    const occurrence = new Date(`${startDate}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`);
    if (!Number.isFinite(occurrence.getTime()) || occurrence.getTime() <= now.getTime()) {
      return "past_time_today";
    }
  }

  return null;
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
