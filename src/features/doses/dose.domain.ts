import { MedicationSchedule } from "../schedules/schedule.types";

import { DoseStatus } from "./dose.types";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

// This intentionally stays unset until the project team agrees on a product rule.
// It is not medical advice or a clinical recommendation.
export const DOSE_EXPIRY_MINUTES: number | null = null;

export class FutureDoseRecordingError extends Error {
  constructor() {
    super("Future doses cannot be recorded yet.");
    this.name = "FutureDoseRecordingError";
  }
}

export function toLocalDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function addDaysToLocalDate(dateString: string, days: number): string {
  const date = parseLocalDate(validateLocalDate(dateString));
  date.setDate(date.getDate() + days);

  return toLocalDateString(date);
}

export function validateLocalDate(value: string): string {
  if (!DATE_PATTERN.test(value)) {
    throw new Error("A valid local date is required.");
  }

  const date = parseLocalDate(value);

  if (toLocalDateString(date) !== value) {
    throw new Error("A valid local date is required.");
  }

  return value;
}

export function validateScheduledTime(value: string): string {
  if (!TIME_PATTERN.test(value)) {
    throw new Error("A valid schedule time is required.");
  }

  return value;
}

export function isFutureLocalDate(
  scheduledDate: string,
  currentLocalDate = toLocalDateString(),
): boolean {
  return (
    validateLocalDate(scheduledDate) > validateLocalDate(currentLocalDate)
  );
}

export function assertDoseCanBeRecordedOnLocalDate(
  scheduledDate: string,
  currentLocalDate = toLocalDateString(),
): void {
  if (isFutureLocalDate(scheduledDate, currentLocalDate)) {
    throw new FutureDoseRecordingError();
  }
}

export function getDosePresentationState(
  status: DoseStatus,
  scheduledDate: string,
  currentLocalDate = toLocalDateString(),
): { label: "Pending" | "Taken" | "Skipped" | "Missed" | "Upcoming"; canRecord: boolean } {
  const isFuture = isFutureLocalDate(scheduledDate, currentLocalDate);

  if (status === "pending" && isFuture) {
    return { label: "Upcoming", canRecord: false };
  }

  return {
    label: status.charAt(0).toUpperCase() + status.slice(1) as
      | "Pending"
      | "Taken"
      | "Skipped"
      | "Missed",
    canRecord: status === "pending" && !isFuture,
  };
}

export function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);

  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

export function scheduleOccursOnLocalDate(
  schedule: MedicationSchedule,
  dateString: string,
): boolean {
  if (!schedule.isActive || dateString < schedule.startDate) {
    return false;
  }

  if (schedule.endDate && dateString > schedule.endDate) {
    return false;
  }

  if (schedule.type === "one_time") {
    return dateString === schedule.startDate;
  }

  const repeatDays = schedule.repeatDays ?? [];

  if (repeatDays.length === 7) {
    return true;
  }

  return repeatDays.includes(parseLocalDate(dateString).getDay());
}

export function isDoseStatusTransitionAllowed(
  from: DoseStatus,
  to: DoseStatus,
): boolean {
  return from === "pending" && (to === "taken" || to === "skipped" || to === "missed");
}

export function isDoseExpired(
  scheduledDate: string,
  scheduledTime: string,
  now = new Date(),
  expiryMinutes = DOSE_EXPIRY_MINUTES,
): boolean {
  if (expiryMinutes === null) {
    return false;
  }

  const normalizedDate = validateLocalDate(scheduledDate);
  const normalizedTime = validateScheduledTime(scheduledTime);
  const [hours, minutes] = normalizedTime.split(":").map(Number);
  const scheduledAt = parseLocalDate(normalizedDate);
  scheduledAt.setHours(hours, minutes, 0, 0);

  return now.getTime() >= scheduledAt.getTime() + expiryMinutes * 60_000;
}

export function evaluatePendingDoseStatus(
  currentStatus: DoseStatus,
  scheduledDate: string,
  scheduledTime: string,
  now = new Date(),
): DoseStatus {
  if (currentStatus !== "pending") {
    return currentStatus;
  }

  return isDoseExpired(scheduledDate, scheduledTime, now) ? "missed" : "pending";
}
