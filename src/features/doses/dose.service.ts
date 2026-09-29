import { getActiveSchedulesWithMedicationByProfile } from "@/features/schedules/schedule.repository";
import { refreshReminderForDoseStatus } from "@/features/schedules/reminder-lifecycle.service";
import { reconcileLowStockAlert } from "@/features/refills/low-stock-alert.service";

import {
  createDoseOccurrences,
  getDoseById,
  getPendingDosesByDate,
  getTodayDosesByDate,
  markDoseMissedInDatabase,
  markDoseSkippedInDatabase,
  markDoseTakenInDatabase,
  correctDoseStatusInDatabase,
} from "./dose.repository";
import { DoseStatusCorrectionTarget } from "./dose-status-correction.domain";
import { CreateDoseOccurrenceInput, TodayDose } from "./dose.types";
import {
  DOSE_EXPIRY_MINUTES,
  addDaysToLocalDate,
  assertDoseCanBeRecordedOnLocalDate,
  evaluatePendingDoseStatus,
  scheduleOccursOnLocalDate,
  scheduleOccurrenceIsAtOrAfterEffectiveTime,
  toLocalDateString,
  validateLocalDate,
  validateScheduledTime,
} from "./dose.domain";

export { addDaysToLocalDate, toLocalDateString } from "./dose.domain";
export { DOSE_EXPIRY_MINUTES } from "./dose.domain";

export async function getDosesForDate(profileId: string, dateString: string): Promise<TodayDose[]> {
  const normalizedDate = validateLocalDate(dateString);

  await generateDoseOccurrencesForDate(profileId, normalizedDate);
  await evaluatePendingDosesForDate(profileId, normalizedDate);

  return getTodayDosesByDate(profileId, normalizedDate);
}

export async function generateDoseOccurrencesForDate(
  profileId: string,
  dateString = toLocalDateString(),
): Promise<void> {
  const normalizedDate = validateLocalDate(dateString);
  const schedules = await getActiveSchedulesWithMedicationByProfile(profileId);
  const occurrences: CreateDoseOccurrenceInput[] = [];

  for (const { schedule, medicationName, medicationDosage } of schedules) {
    if (!scheduleOccursOnLocalDate(schedule, normalizedDate)) {
      continue;
    }

    const scheduledTime = validateScheduledTime(schedule.time);
    if (!scheduleOccurrenceIsAtOrAfterEffectiveTime(schedule, normalizedDate, scheduledTime)) {
      continue;
    }

    occurrences.push({
      profileId,
      medicationId: schedule.medicationId,
      scheduleId: schedule.id,
      scheduledDate: normalizedDate,
      scheduledTime,
      medicationName,
      medicationDosage,
    });
  }

  await createDoseOccurrences(occurrences);
}

export async function markTaken(profileId: string, id: string): Promise<void> {
  validateDoseId(id);
  await validateDoseCanBeRecorded(profileId, id);
  const dose = await getDoseById(profileId, id);
  await markDoseTakenInDatabase(profileId, id, new Date().toISOString());
  await refreshReminderForDoseStatus(profileId, id);
  if (dose) void reconcileLowStockAlert(profileId, dose.medicationId);
}

export async function markSkipped(profileId: string, id: string): Promise<void> {
  validateDoseId(id);
  await validateDoseCanBeRecorded(profileId, id);
  await markDoseSkippedInDatabase(profileId, id);
  await refreshReminderForDoseStatus(profileId, id);
}

export async function correctDoseStatus(profileId: string, id: string, target: DoseStatusCorrectionTarget): Promise<void> {
  validateDoseId(id);
  const dose = await getDoseById(profileId, id);
  await correctDoseStatusInDatabase(profileId, id, target);
  await refreshReminderForDoseStatus(profileId, id);
  if (dose) void reconcileLowStockAlert(profileId, dose.medicationId);
}

export async function evaluatePendingDosesForDate(
  profileId: string,
  dateString = toLocalDateString(),
): Promise<void> {
  const normalizedDate = validateLocalDate(dateString);

  if (DOSE_EXPIRY_MINUTES === null) {
    return;
  }

  const pendingDoses = await getPendingDosesByDate(profileId, normalizedDate);

  for (const dose of pendingDoses) {
    if (
      evaluatePendingDoseStatus(
        dose.status,
        dose.scheduledDate,
        dose.scheduledTime,
      ) === "missed"
    ) {
      await markDoseMissedInDatabase(profileId, dose.id);
    }
  }
}

function validateDoseId(id: string): void {
  if (!id.trim()) {
    throw new Error("Dose record ID is required.");
  }
}

async function validateDoseCanBeRecorded(profileId: string, id: string): Promise<void> {
  const dose = await getDoseById(profileId, id);

  if (!dose) {
    throw new Error("Dose record not found.");
  }

  assertDoseCanBeRecordedOnLocalDate(dose.scheduledDate);
}
