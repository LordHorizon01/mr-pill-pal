import { toLocalDateString, validateLocalDate } from "@/features/doses/dose.domain";

import { createMedicationAdherenceReport, getMedicationReportRange } from "./medication-report.domain";
import { getMedicationReportSource } from "./medication-report.repository";
import { MedicationAdherenceReport, MedicationReportRangePreset } from "./medication-report.types";

export async function getMedicationAdherenceReport(
  profileId: string,
  preset: MedicationReportRangePreset = "30",
  today = toLocalDateString(),
  generatedAt = new Date().toISOString(),
): Promise<MedicationAdherenceReport> {
  if (!profileId.trim()) throw new Error("Choose a profile before creating a report.");
  const normalizedToday = validateLocalDate(today);
  const range = getMedicationReportRange(preset, normalizedToday);
  const source = await getMedicationReportSource(profileId, range.startDate, range.endDate);
  return createMedicationAdherenceReport(source, range, normalizedToday, generatedAt, profileId);
}
