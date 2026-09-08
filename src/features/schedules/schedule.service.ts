import { getMedicationById } from "@/features/medications/medication.repository";

import {
  createSchedule,
  deleteSchedule,
  getScheduleById,
  getSchedulesByMedicationId,
  setScheduleActive,
  setScheduleNotificationIds,
} from "./schedule.repository";

import {
  cancelScheduledNotifications,
  scheduleDailyMedicationReminder,
  scheduleOneTimeMedicationReminder,
  scheduleWeeklyMedicationReminders,
} from "@/notifications/notification.service";

import {
  CreateScheduleInput,
  MedicationSchedule,
} from "./schedule.types";

function validateTime(time: string): string {
  const trimmedTime = time.trim();

  const timePattern =
    /^([01]\d|2[0-3]):([0-5]\d)$/;

  if (!timePattern.test(trimmedTime)) {
    throw new Error(
      "Time must be in 24-hour HH:mm format."
    );
  }

  return trimmedTime;
}

function validateDate(
  date: string,
  fieldName: string
): string {
  const trimmedDate = date.trim();

  const datePattern =
    /^\d{4}-\d{2}-\d{2}$/;

  if (!datePattern.test(trimmedDate)) {
    throw new Error(
      `${fieldName} must be in YYYY-MM-DD format.`
    );
  }

  const parsedDate = new Date(
    `${trimmedDate}T00:00:00`
  );

  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error(
      `${fieldName} is invalid.`
    );
  }

  const [year, month, day] =
    trimmedDate.split("-").map(Number);

  if (
    parsedDate.getFullYear() !== year ||
    parsedDate.getMonth() + 1 !== month ||
    parsedDate.getDate() !== day
  ) {
    throw new Error(
      `${fieldName} is invalid.`
    );
  }

  return trimmedDate;
}

function validateRepeatDays(
  repeatDays?: number[]
): number[] | undefined {
  if (repeatDays === undefined) {
    return undefined;
  }

  const uniqueDays = [
    ...new Set(repeatDays),
  ];

  const hasInvalidDay =
    uniqueDays.some(
      (day) =>
        !Number.isInteger(day) ||
        day < 0 ||
        day > 6
    );

  if (hasInvalidDay) {
    throw new Error(
      "Repeat days must contain values from 0 to 6."
    );
  }

  return uniqueDays.sort(
    (a, b) => a - b
  );
}

function getStoredNotificationIds(
  schedule: MedicationSchedule
): string[] {
  if (
    schedule.notificationIds &&
    schedule.notificationIds.length > 0
  ) {
    return schedule.notificationIds;
  }

  if (schedule.notificationId) {
    return [schedule.notificationId];
  }

  return [];
}

async function scheduleNativeNotifications(
  medicationName: string,
  schedule: MedicationSchedule
): Promise<string[]> {
  if (schedule.type === "one_time") {
    const notificationId =
      await scheduleOneTimeMedicationReminder(
        medicationName,
        schedule.startDate,
        schedule.time
      );

    return [notificationId];
  }

  const repeatDays =
    schedule.repeatDays ?? [];

  if (repeatDays.length === 0) {
    throw new Error(
      "Recurring schedule has no repeat days."
    );
  }

  if (repeatDays.length === 7) {
    const notificationId =
      await scheduleDailyMedicationReminder(
        medicationName,
        schedule.time
      );

    return [notificationId];
  }

  return scheduleWeeklyMedicationReminders(
    medicationName,
    schedule.time,
    repeatDays
  );
}

export async function addSchedule(
  input: CreateScheduleInput
): Promise<MedicationSchedule> {
  if (!input.medicationId.trim()) {
    throw new Error(
      "Medication ID is required."
    );
  }

  const medication =
    await getMedicationById(
      input.medicationId
    );

  if (!medication) {
    throw new Error(
      "Medication not found."
    );
  }

  const startDate = validateDate(
    input.startDate,
    "Start date"
  );

  const endDate =
    input.endDate !== undefined
      ? validateDate(
          input.endDate,
          "End date"
        )
      : undefined;

  if (
    endDate &&
    endDate < startDate
  ) {
    throw new Error(
      "End date cannot be before start date."
    );
  }

  const repeatDays =
    validateRepeatDays(
      input.repeatDays
    );

  if (
    input.type === "recurring" &&
    (!repeatDays ||
      repeatDays.length === 0)
  ) {
    throw new Error(
      "Recurring schedules require at least one repeat day."
    );
  }

  if (
    input.type === "recurring" &&
    endDate !== undefined
  ) {
    throw new Error(
      "End dates for recurring schedules are not supported yet."
    );
  }

  const normalizedTime =
    validateTime(input.time);

  const existingSchedules =
    await getSchedulesByMedicationId(
      input.medicationId
    );

  const duplicateSchedule =
    existingSchedules.some(
      (schedule) => {
        const existingDays =
          schedule.repeatDays ?? [];

        const newDays =
          repeatDays ?? [];

        const sameDays =
          existingDays.length ===
            newDays.length &&
          existingDays.every(
            (day, index) =>
              day === newDays[index]
          );

        return (
          schedule.type ===
            input.type &&
          schedule.time ===
            normalizedTime &&
          sameDays &&
          schedule.startDate ===
            startDate &&
          schedule.endDate ===
            endDate
        );
      }
    );

  if (duplicateSchedule) {
    throw new Error(
      "This medication already has the same reminder schedule."
    );
  }

  const schedule =
    await createSchedule({
      medicationId:
        input.medicationId,
      type: input.type,
      time: normalizedTime,
      startDate,
      endDate,
      repeatDays:
        input.type === "recurring"
          ? repeatDays
          : undefined,
    });

  try {
    const notificationIds =
      await scheduleNativeNotifications(
        medication.name,
        schedule
      );

    try {
      await setScheduleNotificationIds(
        schedule.id,
        notificationIds
      );

      return {
        ...schedule,
        notificationId: undefined,
        notificationIds,
      };
    } catch (databaseError) {
      await cancelScheduledNotifications(
        notificationIds
      );

      throw databaseError;
    }
  } catch (notificationError) {
    console.error(
      "Schedule saved, but reminder scheduling failed:",
      notificationError
    );

    await setScheduleActive(
      schedule.id,
      false
    );

    return {
      ...schedule,
      isActive: false,
    };
  }
}

export async function getMedicationSchedules(
  medicationId: string
): Promise<MedicationSchedule[]> {
  if (!medicationId.trim()) {
    throw new Error(
      "Medication ID is required."
    );
  }

  return getSchedulesByMedicationId(
    medicationId
  );
}

export async function getSchedule(
  id: string
): Promise<MedicationSchedule | null> {
  if (!id.trim()) {
    throw new Error(
      "Schedule ID is required."
    );
  }

  return getScheduleById(id);
}

export async function pauseSchedule(
  id: string
): Promise<void> {
  if (!id.trim()) {
    throw new Error(
      "Schedule ID is required."
    );
  }

  const schedule =
    await getScheduleById(id);

  if (!schedule) {
    throw new Error(
      "Schedule not found."
    );
  }

  const notificationIds =
    getStoredNotificationIds(
      schedule
    );

  if (
    notificationIds.length > 0
  ) {
    await cancelScheduledNotifications(
      notificationIds
    );
  }

  await setScheduleNotificationIds(
    id,
    []
  );

  await setScheduleActive(
    id,
    false
  );
}

export async function resumeSchedule(
  id: string
): Promise<string[]> {
  if (!id.trim()) {
    throw new Error(
      "Schedule ID is required."
    );
  }

  const schedule =
    await getScheduleById(id);

  if (!schedule) {
    throw new Error(
      "Schedule not found."
    );
  }

  const medication =
    await getMedicationById(
      schedule.medicationId
    );

  if (!medication) {
    throw new Error(
      "Medication not found."
    );
  }

  const notificationIds =
    await scheduleNativeNotifications(
      medication.name,
      schedule
    );

  try {
    await setScheduleNotificationIds(
      id,
      notificationIds
    );

    await setScheduleActive(
      id,
      true
    );

    return notificationIds;
  } catch (error) {
    await cancelScheduledNotifications(
      notificationIds
    );

    await setScheduleNotificationIds(
      id,
      []
    );

    throw error;
  }
}

export async function removeSchedule(
  id: string
): Promise<void> {
  if (!id.trim()) {
    throw new Error(
      "Schedule ID is required."
    );
  }

  const schedule =
    await getScheduleById(id);

  if (!schedule) {
    throw new Error(
      "Schedule not found."
    );
  }

  const notificationIds =
    getStoredNotificationIds(
      schedule
    );

  if (
    notificationIds.length > 0
  ) {
    await cancelScheduledNotifications(
      notificationIds
    );
  }

  await deleteSchedule(id);
}