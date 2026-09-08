import { getMedicationById } from "@/features/medications/medication.repository";

import {
  createSchedule,
  deleteSchedule,
  getScheduleById,
  getSchedulesByMedicationId,
  setScheduleActive,
  setScheduleNotificationId,
} from "./schedule.repository";

import {
  cancelScheduledNotification,
  scheduleDailyMedicationReminder,
} from "@/notifications/notification.service";

import { CreateScheduleInput, MedicationSchedule } from "./schedule.types";

function validateTime(time: string): string {
  const trimmedTime = time.trim();

  const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

  if (!timePattern.test(trimmedTime)) {
    throw new Error("Time must be in 24-hour HH:mm format.");
  }

  return trimmedTime;
}

function validateDate(date: string, fieldName: string): string {
  const trimmedDate = date.trim();

  const datePattern = /^\d{4}-\d{2}-\d{2}$/;

  if (!datePattern.test(trimmedDate)) {
    throw new Error(`${fieldName} must be in YYYY-MM-DD format.`);
  }

  const parsedDate = new Date(`${trimmedDate}T00:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error(`${fieldName} is invalid.`);
  }

  const [year, month, day] = trimmedDate.split("-").map(Number);

  if (
    parsedDate.getFullYear() !== year ||
    parsedDate.getMonth() + 1 !== month ||
    parsedDate.getDate() !== day
  ) {
    throw new Error(`${fieldName} is invalid.`);
  }

  return trimmedDate;
}

function validateRepeatDays(repeatDays?: number[]): number[] | undefined {
  if (repeatDays === undefined) {
    return undefined;
  }

  const uniqueDays = [...new Set(repeatDays)];

  const hasInvalidDay = uniqueDays.some(
    (day) => !Number.isInteger(day) || day < 0 || day > 6,
  );

  if (hasInvalidDay) {
    throw new Error("Repeat days must contain values from 0 to 6.");
  }

  return uniqueDays.sort((a, b) => a - b);
}

export async function addSchedule(
  input: CreateScheduleInput,
): Promise<MedicationSchedule> {
  if (!input.medicationId.trim()) {
    throw new Error("Medication ID is required.");
  }

  const medication = await getMedicationById(input.medicationId);

  if (!medication) {
    throw new Error("Medication not found.");
  }

  const startDate = validateDate(input.startDate, "Start date");

  const endDate =
    input.endDate !== undefined
      ? validateDate(input.endDate, "End date")
      : undefined;

  if (endDate && endDate < startDate) {
    throw new Error("End date cannot be before start date.");
  }

  const repeatDays = validateRepeatDays(input.repeatDays);

  if (input.type === "recurring" && (!repeatDays || repeatDays.length === 0)) {
    throw new Error("Recurring schedules require at least one repeat day.");
  }

  const normalizedTime = validateTime(input.time);

  const existingSchedules = await getSchedulesByMedicationId(
    input.medicationId,
  );

  const duplicateSchedule = existingSchedules.some((schedule) => {
    const existingDays = schedule.repeatDays ?? [];
    const newDays = repeatDays ?? [];

    const sameDays =
      existingDays.length === newDays.length &&
      existingDays.every((day, index) => day === newDays[index]);

    return (
      schedule.type === input.type &&
      schedule.time === normalizedTime &&
      sameDays &&
      schedule.startDate === startDate &&
      schedule.endDate === endDate
    );
  });

  if (duplicateSchedule) {
    throw new Error("This medication already has the same reminder schedule.");
  }

  const schedule = await createSchedule({
    medicationId: input.medicationId,
    type: input.type,
    time: normalizedTime,
    startDate,
    endDate,
    repeatDays: input.type === "recurring" ? repeatDays : undefined,
  });

  try {
    const notificationId = await scheduleDailyMedicationReminder(
      medication.name,
      schedule.time,
    );

    try {
      await setScheduleNotificationId(schedule.id, notificationId);

      return {
        ...schedule,
        notificationId,
      };
    } catch (databaseError) {
      // Native notification was created but its ID
      // could not be persisted. Cancel it so that
      // we never leave an orphan reminder.
      await cancelScheduledNotification(notificationId);

      throw databaseError;
    }
  } catch (notificationError) {
    console.error(
      "Schedule saved, but reminder scheduling failed:",
      notificationError,
    );

    return schedule;
  }
}

export async function getMedicationSchedules(
  medicationId: string,
): Promise<MedicationSchedule[]> {
  if (!medicationId.trim()) {
    throw new Error("Medication ID is required.");
  }

  return getSchedulesByMedicationId(medicationId);
}

export async function getSchedule(
  id: string,
): Promise<MedicationSchedule | null> {
  if (!id.trim()) {
    throw new Error("Schedule ID is required.");
  }

  return getScheduleById(id);
}

export async function pauseSchedule(id: string): Promise<void> {
  if (!id.trim()) {
    throw new Error("Schedule ID is required.");
  }

  const schedule = await getScheduleById(id);

  if (!schedule) {
    throw new Error("Schedule not found.");
  }

  if (schedule.notificationId) {
    await cancelScheduledNotification(schedule.notificationId);
  }

  await setScheduleNotificationId(id, null);
  await setScheduleActive(id, false);
}

export async function resumeSchedule(id: string): Promise<string> {
  if (!id.trim()) {
    throw new Error("Schedule ID is required.");
  }

  const schedule = await getScheduleById(id);

  if (!schedule) {
    throw new Error("Schedule not found.");
  }

  const medication = await getMedicationById(schedule.medicationId);

  if (!medication) {
    throw new Error("Medication not found.");
  }

  const notificationId = await scheduleDailyMedicationReminder(
    medication.name,
    schedule.time,
  );

  try {
    await setScheduleNotificationId(id, notificationId);

    await setScheduleActive(id, true);

    return notificationId;
  } catch (error) {
    await cancelScheduledNotification(notificationId);

    await setScheduleNotificationId(id, null);

    throw error;
  }
}

export async function removeSchedule(id: string): Promise<void> {
  if (!id.trim()) {
    throw new Error("Schedule ID is required.");
  }

  const schedule = await getScheduleById(id);

  if (!schedule) {
    throw new Error("Schedule not found.");
  }

  if (schedule.notificationId) {
    await cancelScheduledNotification(schedule.notificationId);
  }

  await deleteSchedule(id);
}
