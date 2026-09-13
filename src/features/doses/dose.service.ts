import { getActiveSchedulesByProfile } from "@/features/schedules/schedule.repository";
import { getMedicationById } from "@/features/medications/medication.repository";

import {
  createDoseOccurrences,
  getDoseById,
  getPendingDosesByDate,
  getTodayDosesByDate,
  markDoseMissedInDatabase,
  markDoseSkippedInDatabase,
  markDoseTakenInDatabase,
} from "./dose.repository";
import { CreateDoseOccurrenceInput, TodayDose } from "./dose.types";
import {
  DOSE_EXPIRY_MINUTES,
  addDaysToLocalDate,
  assertDoseCanBeRecordedOnLocalDate,
  evaluatePendingDoseStatus,
  scheduleOccursOnLocalDate,
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
  const schedules = await getActiveSchedulesByProfile(profileId);
  const occurrences: CreateDoseOccurrenceInput[] = [];

  for (const schedule of schedules) {
    if (!scheduleOccursOnLocalDate(schedule, normalizedDate)) {
      continue;
    }

    const medication = await getMedicationById(profileId, schedule.medicationId);

    if (!medication) {
      continue;
    }

    occurrences.push({
      profileId,
      medicationId: schedule.medicationId,
      scheduleId: schedule.id,
      scheduledDate: normalizedDate,
      scheduledTime: validateScheduledTime(schedule.time),
      medicationName: medication.name,
      medicationDosage: medication.dosage,
    });
  }

  await createDoseOccurrences(occurrences);
}

export async function markTaken(profileId: string, id: string): Promise<void> {
  validateDoseId(id);
  await validateDoseCanBeRecorded(profileId, id);
  await markDoseTakenInDatabase(profileId, id, new Date().toISOString());
}

export async function markSkipped(profileId: string, id: string): Promise<void> {
  validateDoseId(id);
  await validateDoseCanBeRecorded(profileId, id);
  await markDoseSkippedInDatabase(profileId, id);
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
