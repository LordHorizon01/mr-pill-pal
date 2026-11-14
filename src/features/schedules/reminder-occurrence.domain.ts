import { addDaysToLocalDate, scheduleOccursOnLocalDate, toLocalDateString } from "../doses/dose.domain";
import { MedicationSchedule } from "./schedule.types";

/** Per-occurrence Android alarms are rolled forward on app start/resume; this is not an indefinite native repeat. */
export const REMINDER_HORIZON_DAYS = 14;

export function getExpectedReminderDates(schedule: MedicationSchedule, today = toLocalDateString(), now = new Date()): string[] {
  const dates: string[] = [];
  // Queue future-start schedules before their first occurrence, even when that
  // date is beyond the rolling window measured from today.
  const horizonStart = schedule.startDate > today ? schedule.startDate : today;
  for (let offset = 0; offset < REMINDER_HORIZON_DAYS; offset += 1) {
    const date = addDaysToLocalDate(horizonStart, offset);
    if (!scheduleOccursOnLocalDate(schedule, date)) continue;
    const [hour, minute] = schedule.time.split(":").map(Number);
    const scheduledAt = new Date(`${date}T00:00:00`);
    scheduledAt.setHours(hour, minute, 0, 0);
    if (scheduledAt.getTime() > now.getTime()) dates.push(date);
  }
  return dates;
}

export function occurrenceKey(scheduleId: string, date: string, time: string): string {
  return `${scheduleId}:${date}:${time}`;
}
