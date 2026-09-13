import { getMedicationById } from "@/features/medications/medication.repository";
import { getHideMedicationName } from "@/features/settings/settings.repository";
import { deletePendingDosesForScheduleFromDate } from "@/features/doses/dose.repository";
import { toLocalDateString } from "@/features/doses/dose.domain";
import { getLocalProfileById } from "@/features/profiles/profile.repository";
import { getProfileGreetingName } from "@/features/profiles/profile.domain";

import {
  createSchedule,
  deleteSchedule,
  getActiveSchedules,
  getActiveSchedulesByProfile,
  getScheduleById,
  getSchedulesByMedicationId,
  getSchedulesForReminderHealth,
  getSchedulesByAccount,
  getSchedulesNeedingAttention,
  setScheduleReminderState,
  updateScheduleDetails,
} from "./schedule.repository";

import {
  cancelScheduledNotifications,
  getScheduledNotificationIds,
  hasNotificationPermission,
  NotificationPermissionError,
  ReminderTimeExpiredError,
  scheduleDailyMedicationReminder,
  scheduleOneTimeMedicationReminder,
  scheduleWeeklyMedicationReminders,
} from "@/notifications/notification.service";

import {
  CreateScheduleInput,
  MedicationSchedule,
  ReminderSettingsOverview,
  ReminderStatus,
  UpdateScheduleInput,
} from "./schedule.types";
import {
  getScheduleEditStatusAfterPersist,
  hasScheduleChanges,
  isOneTimeScheduleInFuture,
  isReminderRegistrationHealthy,
} from "./schedule-edit.domain";
import { canReuseReminderHealthRequest } from "@/features/settings/reminder-health.domain";

export type ReminderHealthResult = {
  recoveredScheduleIds: string[];
  permissionRequiredScheduleIds: string[];
  schedulingFailedScheduleIds: string[];
  expiredScheduleIds: string[];
};

type ReminderFailureStatus = Exclude<ReminderStatus, "active" | "paused">;
let reminderHealthPromise: Promise<ReminderHealthResult> | null = null;
let reminderHealthAccountUid: string | undefined;
let scheduleMutationQueue: Promise<void> = Promise.resolve();

async function runScheduleMutation<T>(operation: () => Promise<T>): Promise<T> {
  const previousOperation = scheduleMutationQueue;
  let releaseOperation!: () => void;
  scheduleMutationQueue = new Promise<void>((resolve) => { releaseOperation = resolve; });
  await previousOperation;

  try {
    return await operation();
  } finally {
    releaseOperation();
  }
}

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

function getOneTimeReminderDate(startDate: string, time: string): Date {
  return new Date(`${startDate}T${time}:00`);
}

function validateOneTimeReminderIsFuture(startDate: string, time: string): void {
  if (!isOneTimeScheduleInFuture(startDate, time)) {
    throw new ReminderTimeExpiredError();
  }
}

export function getReminderStatusForError(
  error: unknown,
): ReminderFailureStatus {
  if (error instanceof NotificationPermissionError) {
    return "permission_required";
  }

  if (error instanceof ReminderTimeExpiredError) {
    return "expired";
  }

  return "scheduling_failed";
}

function getStoredNotificationIds(schedule: MedicationSchedule): string[] {
  if (schedule.notificationIds && schedule.notificationIds.length > 0) {
    return schedule.notificationIds;
  }

  if (schedule.notificationId) {
    return [schedule.notificationId];
  }

  return [];
}

async function scheduleNativeNotifications(
  medicationName: string,
  schedule: MedicationSchedule,
  hideMedicationName?: boolean,
): Promise<string[]> {
  const shouldHideMedicationName =
    hideMedicationName ?? (await getHideMedicationName());
  const profile = await getLocalProfileById(schedule.profileId);
  const profileName = getProfileGreetingName(profile) ?? undefined;

  if (schedule.type === "one_time") {
    const notificationId = await scheduleOneTimeMedicationReminder(
      medicationName,
      schedule.startDate,
      schedule.time,
      shouldHideMedicationName,
      { medicationId: schedule.medicationId, scheduleId: schedule.id, profileId: schedule.profileId },
      profileName,
    );

    return [notificationId];
  }

  const repeatDays = schedule.repeatDays ?? [];

  if (repeatDays.length === 0) {
    throw new Error("Recurring schedule has no repeat days.");
  }

  if (repeatDays.length === 7) {
    const notificationId = await scheduleDailyMedicationReminder(
      medicationName,
      schedule.time,
      shouldHideMedicationName,
      { medicationId: schedule.medicationId, scheduleId: schedule.id, profileId: schedule.profileId },
      profileName,
    );

    return [notificationId];
  }

  return scheduleWeeklyMedicationReminders(
    medicationName,
    schedule.time,
    repeatDays,
    shouldHideMedicationName,
    { medicationId: schedule.medicationId, scheduleId: schedule.id, profileId: schedule.profileId },
    profileName,
  );
}

function isPastOneTimeSchedule(schedule: MedicationSchedule): boolean {
  if (schedule.type !== "one_time") {
    return false;
  }

  return getOneTimeReminderDate(schedule.startDate, schedule.time).getTime() <= Date.now();
}

async function cancelNotificationsSilently(notificationIds: string[]): Promise<void> {
  try {
    await cancelScheduledNotifications(notificationIds);
  } catch {
    // Keep the original error from the main notification operation.
  }
}

async function setInactiveScheduleState(
  schedule: MedicationSchedule,
  reminderStatus: Exclude<ReminderStatus, "active">,
): Promise<void> {
  const notificationIds = getStoredNotificationIds(schedule);

  if (notificationIds.length > 0) {
    await cancelScheduledNotifications(notificationIds);
  }

  await setScheduleReminderState(schedule.id, reminderStatus);
}

async function markScheduleAsUnavailable(
  schedule: MedicationSchedule,
  reminderStatus: ReminderFailureStatus,
): Promise<void> {
  await cancelNotificationsSilently(getStoredNotificationIds(schedule));
  await setScheduleReminderState(schedule.id, reminderStatus);
}

async function expirePastOneTimeSchedules(
  schedules: MedicationSchedule[],
): Promise<string[]> {
  const expiredScheduleIds: string[] = [];

  for (const schedule of schedules) {
    if (
      isPastOneTimeSchedule(schedule) &&
      schedule.reminderStatus !== "expired"
    ) {
      await markScheduleAsUnavailable(schedule, "expired");
      expiredScheduleIds.push(schedule.id);
    }
  }

  return expiredScheduleIds;
}

async function replaceScheduleNotifications(
  schedule: MedicationSchedule,
  medicationName: string,
  hideMedicationName?: boolean,
): Promise<string[]> {
  const oldNotificationIds = getStoredNotificationIds(schedule);
  const newNotificationIds = await scheduleNativeNotifications(
    medicationName,
    schedule,
    hideMedicationName,
  );

  try {
    if (oldNotificationIds.length > 0) {
      await cancelScheduledNotifications(oldNotificationIds);
    }
  } catch (error) {
    await cancelNotificationsSilently(newNotificationIds);
    throw error;
  }

  try {
    await setScheduleReminderState(
      schedule.id,
      "active",
      newNotificationIds,
    );

    return newNotificationIds;
  } catch (error) {
    await cancelNotificationsSilently(newNotificationIds);

    try {
      await setScheduleReminderState(schedule.id, "scheduling_failed");
    } catch {
      // The original database error is more useful to the caller.
    }

    throw error;
  }
}

async function refreshMedicationRemindersInternal(
  medicationId: string,
  medicationName: string,
): Promise<void> {
  const schedules = await getSchedulesByMedicationId(medicationId);
  const activeSchedules = schedules.filter((schedule) => schedule.isActive);
  const hideMedicationName = await getHideMedicationName();
  const failedScheduleIds: string[] = [];

  for (const schedule of activeSchedules) {
    try {
      await replaceScheduleNotifications(
        schedule,
        medicationName,
        hideMedicationName,
      );
    } catch {
      failedScheduleIds.push(schedule.id);
    }
  }

  if (failedScheduleIds.length > 0) {
    throw new Error(
      "Medication details were saved, but some reminder text could not be updated. Open the schedule and tap Resume to try again.",
    );
  }
}

export function refreshMedicationReminders(
  medicationId: string,
  medicationName: string,
): Promise<void> {
  return runScheduleMutation(() => refreshMedicationRemindersInternal(medicationId, medicationName));
}

async function refreshAllReminderPrivacyInternal(
  hideMedicationName: boolean,
): Promise<void> {
  const activeSchedules = await getActiveSchedules();
  const failedScheduleIds: string[] = [];

  for (const schedule of activeSchedules) {
    try {
      const medication = await getMedicationById(schedule.profileId, schedule.medicationId);

      if (!medication) {
        throw new Error("Medication not found.");
      }

      await replaceScheduleNotifications(
        schedule,
        medication.name,
        hideMedicationName,
      );
    } catch {
      failedScheduleIds.push(schedule.id);
    }
  }

  if (failedScheduleIds.length > 0) {
    throw new Error(
      "Could not update privacy for every existing reminder. Please try again.",
    );
  }
}

export function refreshAllReminderPrivacy(hideMedicationName: boolean): Promise<void> {
  return runScheduleMutation(() => refreshAllReminderPrivacyInternal(hideMedicationName));
}

export function reconcileReminderHealth(accountUid?: string): Promise<ReminderHealthResult> {
  if (reminderHealthPromise && canReuseReminderHealthRequest(reminderHealthAccountUid, accountUid)) {
    return reminderHealthPromise;
  }

  const previousRequest = reminderHealthPromise;
  const request = (previousRequest ? previousRequest.catch(() => undefined) : Promise.resolve())
    .then(() => runScheduleMutation(() => reconcileReminderHealthInternal(accountUid)));

  reminderHealthPromise = request;
  reminderHealthAccountUid = accountUid;
  request.then(
    () => {
      if (reminderHealthPromise === request) {
        reminderHealthPromise = null;
        reminderHealthAccountUid = undefined;
      }
    },
    () => {
      if (reminderHealthPromise === request) {
        reminderHealthPromise = null;
        reminderHealthAccountUid = undefined;
      }
    },
  );

  return request;
}

/** Cancels only this signed-in account's native reminders before logout. SQLite schedules stay intact. */
export async function cancelAccountReminderNotifications(accountUid: string): Promise<void> {
  const schedules = await getSchedulesByAccount(accountUid);
  const ids = [...new Set<string>(schedules.flatMap((schedule) => getStoredNotificationIds(schedule)))];
  if (ids.length > 0) await cancelScheduledNotifications(ids);
}

/** Used for profile deactivation; it never touches another profile's reminders. */
export async function cancelProfileReminderNotifications(profileId: string): Promise<void> {
  const schedules = await getActiveSchedulesByProfile(profileId);
  const ids = [...new Set<string>(schedules.flatMap((schedule) => getStoredNotificationIds(schedule)))];
  if (ids.length > 0) await cancelScheduledNotifications(ids);
}

async function reconcileReminderHealthInternal(accountUid?: string): Promise<ReminderHealthResult> {
  const activeSchedules = await getSchedulesForReminderHealth(accountUid);
  const result: ReminderHealthResult = {
    recoveredScheduleIds: [],
    permissionRequiredScheduleIds: [],
    schedulingFailedScheduleIds: [],
    expiredScheduleIds: [],
  };

  if (activeSchedules.length === 0) {
    return result;
  }

  const futureActiveSchedules: MedicationSchedule[] = [];

  for (const schedule of activeSchedules) {
    if (!isPastOneTimeSchedule(schedule)) {
      futureActiveSchedules.push(schedule);
      continue;
    }

    try {
      await markScheduleAsUnavailable(schedule, "expired");
      result.expiredScheduleIds.push(schedule.id);
    } catch {
      result.schedulingFailedScheduleIds.push(schedule.id);
    }
  }

  if (futureActiveSchedules.length === 0) {
    return result;
  }

  if (!(await hasNotificationPermission())) {
    for (const schedule of futureActiveSchedules) {
      try {
        await markScheduleAsUnavailable(schedule, "permission_required");
        result.permissionRequiredScheduleIds.push(schedule.id);
      } catch {
        result.schedulingFailedScheduleIds.push(schedule.id);
      }
    }

    return result;
  }

  const nativeNotificationIds = new Set(await getScheduledNotificationIds());

  for (const schedule of futureActiveSchedules) {
    const storedNotificationIds = getStoredNotificationIds(schedule);
    const isHealthy = isReminderRegistrationHealthy(
      schedule.reminderStatus,
      storedNotificationIds,
      nativeNotificationIds,
    );

    if (isHealthy) {
      continue;
    }

    try {
      const medication = await getMedicationById(schedule.profileId, schedule.medicationId);

      if (!medication) {
        throw new Error("Medication not found.");
      }

      await replaceScheduleNotifications(schedule, medication.name);
      result.recoveredScheduleIds.push(schedule.id);
    } catch (error) {
      try {
        const reminderStatus = getReminderStatusForError(error);
        await markScheduleAsUnavailable(schedule, reminderStatus);

        if (reminderStatus === "permission_required") {
          result.permissionRequiredScheduleIds.push(schedule.id);
        } else if (reminderStatus === "expired") {
          result.expiredScheduleIds.push(schedule.id);
        } else {
          result.schedulingFailedScheduleIds.push(schedule.id);
        }
      } catch {
        result.schedulingFailedScheduleIds.push(schedule.id);
      }
    }
  }

  return result;
}

async function addScheduleInternal(
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

  if (input.type === "recurring" && endDate !== undefined) {
    throw new Error("End dates for recurring schedules are not supported yet.");
  }

  const normalizedTime = validateTime(input.time);

  if (input.type === "one_time") {
    // This must happen before createSchedule so an expired input never reaches SQLite.
    validateOneTimeReminderIsFuture(startDate, normalizedTime);
  }

  const existingSchedules = await getSchedulesByMedicationId(medication.profileId, input.medicationId);

  const duplicateSchedule = existingSchedules.some((schedule) => {
    const existingDays = schedule.repeatDays ?? [];

    const newDays = repeatDays ?? [];

    const sameDays =
      existingDays.length === newDays.length &&
      existingDays.every((day, index) => day === newDays[index]);

    if (input.type === "one_time") {
      return (
        schedule.type === "one_time" &&
        schedule.time === normalizedTime &&
        schedule.startDate === startDate
      );
    }

    return (
      schedule.type === "recurring" &&
      schedule.time === normalizedTime &&
      sameDays
    );
  });

  if (duplicateSchedule) {
    throw new Error("This medication already has the same reminder schedule.");
  }

  const schedule = await createSchedule({
    profileId: medication.profileId,
    medicationId: input.medicationId,
    type: input.type,
    time: normalizedTime,
    startDate,
    endDate,
    repeatDays: input.type === "recurring" ? repeatDays : undefined,
  });

  try {
    const notificationIds = await scheduleNativeNotifications(
      medication.name,
      schedule,
    );

    try {
      await setScheduleReminderState(
        schedule.id,
        "active",
        notificationIds,
      );

      return {
        ...schedule,
        notificationId: undefined,
        notificationIds,
      };
    } catch (databaseError) {
      await cancelScheduledNotifications(notificationIds);

      throw databaseError;
    }
  } catch (notificationError) {
    const reminderStatus = getReminderStatusForError(notificationError);

    if (reminderStatus === "expired") {
      // A time can pass in the few seconds between validation and native scheduling.
      // Delete this just-created record so it never appears as a broken schedule card.
      await deleteSchedule(schedule.id);
      throw notificationError;
    }

    await setScheduleReminderState(schedule.id, reminderStatus);

    return {
      ...schedule,
      isActive: false,
      reminderStatus,
    };
  }
}

export function addSchedule(input: CreateScheduleInput): Promise<MedicationSchedule> {
  return runScheduleMutation(() => addScheduleInternal(input));
}

export async function getMedicationSchedules(
  medicationId: string,
): Promise<MedicationSchedule[]> {
  if (!medicationId.trim()) {
    throw new Error("Medication ID is required.");
  }

  const schedules = await getSchedulesByMedicationId(medicationId);
  const expiredScheduleIds = await expirePastOneTimeSchedules(schedules);

  return expiredScheduleIds.length > 0
    ? getSchedulesByMedicationId(medicationId)
    : schedules;
}

export async function getSchedule(
  id: string,
): Promise<MedicationSchedule | null> {
  if (!id.trim()) {
    throw new Error("Schedule ID is required.");
  }

  return getScheduleById(id);
}

function normalizeScheduleUpdate(
  schedule: MedicationSchedule,
  input: UpdateScheduleInput,
): UpdateScheduleInput {
  const startDate = validateDate(input.startDate, "Start date");
  const endDate = input.endDate !== undefined
    ? validateDate(input.endDate, "End date")
    : undefined;
  const time = validateTime(input.time);

  if (endDate && endDate < startDate) {
    throw new Error("End date cannot be before start date.");
  }

  if (schedule.type === "one_time") {
    validateOneTimeReminderIsFuture(startDate, time);
    return { time, startDate };
  }

  if (endDate !== undefined) {
    throw new Error("End dates for recurring schedules are not supported yet.");
  }

  const repeatDays = validateRepeatDays(input.repeatDays);
  if (!repeatDays || repeatDays.length === 0) {
    throw new Error("Recurring schedules require at least one repeat day.");
  }

  return { time, startDate, repeatDays };
}

export async function updateMedicationSchedule(
  id: string,
  input: UpdateScheduleInput,
): Promise<MedicationSchedule> {
  if (!id.trim()) {
    throw new Error("Schedule ID is required.");
  }

  return runScheduleMutation(async () => {
    const schedule = await getScheduleById(id);
    if (!schedule) {
      throw new Error("Schedule not found.");
    }

    if (schedule.reminderStatus === "expired") {
      throw new Error("Expired reminders cannot be edited. Create a new reminder instead.");
    }

    const normalizedInput = normalizeScheduleUpdate(schedule, input);
    if (!hasScheduleChanges(schedule, normalizedInput)) {
      return schedule;
    }

    const medication = await getMedicationById(schedule.profileId, schedule.medicationId);
    if (!medication) {
      throw new Error("Medication not found.");
    }

    const schedules = await getSchedulesByMedicationId(schedule.profileId, schedule.medicationId);
    const duplicate = schedules.some((candidate) => {
      if (candidate.id === schedule.id || candidate.type !== schedule.type) {
        return false;
      }

      const candidateDays = validateRepeatDays(candidate.repeatDays) ?? [];
      const updatedDays = validateRepeatDays(normalizedInput.repeatDays) ?? [];
      if (schedule.type === "one_time") {
        return candidate.time === normalizedInput.time &&
          candidate.startDate === normalizedInput.startDate;
      }

      return candidate.time === normalizedInput.time &&
        candidateDays.length === updatedDays.length &&
        candidateDays.every((day, index) => day === updatedDays[index]);
    });

    if (duplicate) {
      throw new Error("This medication already has the same reminder schedule.");
    }

    const oldNotificationIds = getStoredNotificationIds(schedule);
    const persistedStatus = getScheduleEditStatusAfterPersist(schedule);
    const updatedSchedule = await updateScheduleDetails(
      id,
      normalizedInput,
      persistedStatus,
    );

    if (oldNotificationIds.length > 0) {
      try {
        await cancelScheduledNotifications(oldNotificationIds);
      } catch {
        await setScheduleReminderState(id, "scheduling_failed", oldNotificationIds);
        throw new Error(
          "Schedule changes were saved, but the old reminder could not be replaced. Please try again.",
        );
      }
    }


    await deletePendingDosesForScheduleFromDate(id, toLocalDateString());

    if (persistedStatus === "paused") {
      return updatedSchedule;
    }

    try {
      const notificationIds = await scheduleNativeNotifications(
        medication.name,
        updatedSchedule,
      );
      try {
        await setScheduleReminderState(id, "active", notificationIds);
      } catch (error) {
        await cancelNotificationsSilently(notificationIds);
        throw error;
      }

      return {
        ...updatedSchedule,
        isActive: true,
        reminderStatus: "active",
        notificationIds,
        updatedAt: new Date().toISOString(),
      };
    } catch (error) {
      const status = getReminderStatusForError(error);
      await setScheduleReminderState(id, status);
      throw error;
    }
  });
}

export async function getReminderSettingsOverview(): Promise<ReminderSettingsOverview> {
  await reconcileReminderHealth();
  const permissionGranted = await hasNotificationPermission();
  const schedules = await getSchedulesNeedingAttention();
  const affectedSchedules = await Promise.all(schedules.map(async (schedule) => {
    const medication = await getMedicationById(schedule.profileId, schedule.medicationId);
    return {
      scheduleId: schedule.id,
      medicationId: schedule.medicationId,
      medicationName: medication?.name ?? "Medication unavailable",
      time: schedule.time,
      reminderStatus: schedule.reminderStatus as "permission_required" | "scheduling_failed",
    };
  }));

  return {
    permissionGranted,
    health: !permissionGranted
      ? "permission_required"
      : affectedSchedules.length > 0
        ? "attention_required"
        : "working",
    affectedSchedules,
  };
}

export async function pauseSchedule(id: string): Promise<void> {
  if (!id.trim()) {
    throw new Error("Schedule ID is required.");
  }

  await runScheduleMutation(async () => {
    const schedule = await getScheduleById(id);
    if (!schedule) {
      throw new Error("Schedule not found.");
    }

    await setInactiveScheduleState(schedule, "paused");
    await deletePendingDosesForScheduleFromDate(id, toLocalDateString());
  });
}

export async function resumeSchedule(id: string): Promise<string[]> {
  if (!id.trim()) {
    throw new Error("Schedule ID is required.");
  }

  return runScheduleMutation(async () => {
  const schedule = await getScheduleById(id);

  if (!schedule) {
    throw new Error("Schedule not found.");
  }

  if (isPastOneTimeSchedule(schedule)) {
    await markScheduleAsUnavailable(schedule, "expired");
    throw new ReminderTimeExpiredError();
  }

  const medication = await getMedicationById(schedule.profileId, schedule.medicationId);

  if (!medication) {
    throw new Error("Medication not found.");
  }

  try {
    return await replaceScheduleNotifications(schedule, medication.name);
  } catch (error) {
    await markScheduleAsUnavailable(
      schedule,
      getReminderStatusForError(error),
    );
    throw error;
  }
  });
}

export async function removeSchedule(id: string): Promise<void> {
  if (!id.trim()) {
    throw new Error("Schedule ID is required.");
  }

  await runScheduleMutation(async () => {
  const schedule = await getScheduleById(id);

  if (!schedule) {
    throw new Error("Schedule not found.");
  }

  const notificationIds = getStoredNotificationIds(schedule);

  if (notificationIds.length > 0) {
    await cancelScheduledNotifications(notificationIds);
  }

  await deletePendingDosesForScheduleFromDate(id, toLocalDateString());
  await deleteSchedule(id);
  });
}
