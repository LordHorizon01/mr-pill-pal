import { addDaysToLocalDate, validateLocalDate } from "../doses/dose.domain";
import { calculateRoutineAdherence } from "../history/insights.domain";
import { getProfileDisplayName } from "../profiles/profile.domain";

import {
  MedicationAdherenceReport,
  MedicationAdherenceReportMedication,
  MedicationReportCounts,
  MedicationReportLifecycleStatus,
  MedicationReportRange,
  MedicationReportRangePreset,
  MedicationReportSource,
  MedicationReportSourceDose,
} from "./medication-report.types";

const FINALIZED_STATUSES = new Set(["taken", "skipped", "missed"]);

function emptyCounts(): MedicationReportCounts {
  return { taken: 0, skipped: 0, missed: 0, unresolvedPast: 0, eligible: 0, adherence: null };
}

function toDisplayDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function toDisplayGeneratedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not available" : date.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function getLifecycleStatus(medication: MedicationReportSource["medications"][number] | undefined): MedicationReportLifecycleStatus {
  if (!medication) return "Current status unavailable";
  if (medication.archivedAt) return "Archived";
  return medication.isActive ? "Active" : "Paused";
}

function isEligibleDose(dose: MedicationReportSourceDose, range: MedicationReportRange, today: string): boolean {
  if (dose.scheduledDate < range.startDate || dose.scheduledDate > range.endDate) return false;
  return FINALIZED_STATUSES.has(dose.status) || (dose.status === "pending" && dose.scheduledDate < today);
}

function applyDoseCount(target: MedicationReportCounts, dose: MedicationReportSourceDose): void {
  if (dose.status === "taken" || dose.status === "skipped" || dose.status === "missed") target[dose.status] += 1;
  else if (dose.status === "pending") target.unresolvedPast += 1;
}

function completeCounts<T extends MedicationReportCounts>(counts: T): T {
  const eligible = counts.taken + counts.skipped + counts.missed + counts.unresolvedPast;
  return { ...counts, eligible, adherence: calculateRoutineAdherence(counts, counts.unresolvedPast) } as T;
}

export function getMedicationReportRange(preset: MedicationReportRangePreset, today: string): MedicationReportRange {
  const endDate = validateLocalDate(today);
  const days = Number(preset);
  const startDate = addDaysToLocalDate(endDate, -(days - 1));
  return { preset, startDate, endDate, label: `Last ${days} days` };
}

/** Produces a factual report from profile-scoped, already-persisted records. */
export function createMedicationAdherenceReport(
  source: MedicationReportSource,
  range: MedicationReportRange,
  today: string,
  generatedAt: string,
  profileId: string,
): MedicationAdherenceReport {
  validateLocalDate(range.startDate); validateLocalDate(range.endDate); validateLocalDate(today);
  if (range.startDate > range.endDate) throw new Error("Report start date cannot be after the end date.");

  const medicationsById = new Map(source.medications.filter((medication) => medication.profileId === profileId).map((medication) => [medication.id, medication]));
  const relevantDoses = source.doses.filter((dose) => dose.profileId === profileId && isEligibleDose(dose, range, today));
  const medicationIdsWithRecords = new Set(relevantDoses.map((dose) => dose.medicationId));
  const summaries = new Map<string, MedicationAdherenceReportMedication>();

  for (const medication of medicationsById.values()) {
    if (medication.archivedAt && !medicationIdsWithRecords.has(medication.id)) continue;
    summaries.set(medication.id, { medicationId: medication.id, medicationName: medication.name || "Medication details unavailable", medicationDosage: medication.dosage || "Dosage unavailable", lifecycleStatus: getLifecycleStatus(medication), hasRelevantRecords: false, ...emptyCounts() });
  }

  for (const dose of relevantDoses) {
    const currentMedication = medicationsById.get(dose.medicationId);
    const existing = summaries.get(dose.medicationId) ?? {
      medicationId: dose.medicationId,
      medicationName: dose.medicationName?.trim() || currentMedication?.name || "Medication details unavailable",
      medicationDosage: dose.medicationDosage?.trim() || currentMedication?.dosage || "Dosage unavailable",
      lifecycleStatus: getLifecycleStatus(currentMedication),
      hasRelevantRecords: false,
      ...emptyCounts(),
    };
    // Prefer the persisted dose snapshot so later medication edits do not rewrite historical wording.
    if (dose.medicationName?.trim()) existing.medicationName = dose.medicationName.trim();
    if (dose.medicationDosage?.trim()) existing.medicationDosage = dose.medicationDosage.trim();
    existing.hasRelevantRecords = true;
    applyDoseCount(existing, dose);
    summaries.set(dose.medicationId, existing);
  }

  const medications = Array.from(summaries.values()).map(completeCounts).sort((left, right) => left.medicationName.localeCompare(right.medicationName));
  const overall = relevantDoses.reduce<MedicationReportCounts>((counts, dose) => { applyDoseCount(counts, dose); return counts; }, emptyCounts());
  const profile = source.profile?.id === profileId ? source.profile : null;

  return { profileId, profileName: profile ? getProfileDisplayName(profile) : "Profile details unavailable", range, generatedAt, medications, ...completeCounts(overall) };
}

export function formatMedicationReportPeriod(range: MedicationReportRange): string {
  return `${toDisplayDate(range.startDate)} - ${toDisplayDate(range.endDate)}`;
}

export function formatMedicationReportGeneratedAt(generatedAt: string): string {
  return toDisplayGeneratedAt(generatedAt);
}

/** Builds a concise, factual, user-initiated system-share message. */
export function formatMedicationReportForSharing(report: MedicationAdherenceReport): string {
  const lines = ["MR. PILL PAL", "Medication & Adherence Report", `Profile: ${report.profileName}`, `Period: ${formatMedicationReportPeriod(report.range)}`, `Generated: ${formatMedicationReportGeneratedAt(report.generatedAt)}`, "", "OVERALL"];
  if (report.adherence === null) lines.push("No adherence data is available for this period.");
  else lines.push(`Eligible records: ${report.eligible}`, `Recorded as Taken: ${report.taken}`, `Skipped: ${report.skipped}`, `Missed: ${report.missed}`, `Unresolved past: ${report.unresolvedPast}`, `Routine adherence: ${report.adherence}%`);
  lines.push("", "MEDICATIONS");
  if (report.medications.length === 0) lines.push("No medications are available for this profile.");
  else for (const medication of report.medications) {
    lines.push(`${medication.medicationName} - ${medication.medicationDosage}`, `Status: ${medication.lifecycleStatus}`);
    if (!medication.hasRelevantRecords || medication.adherence === null) lines.push("No intake data for this period.");
    else lines.push(`Recorded as Taken: ${medication.taken} | Skipped: ${medication.skipped} | Missed: ${medication.missed} | Routine adherence: ${medication.adherence}%`);
    lines.push("");
  }
  lines.push("This report summarizes records entered in Mr. Pill Pal and does not provide medical advice or verify medication ingestion.");
  lines.push("This report may contain personal medication information. Share it only with people you trust.");
  return lines.join("\n");
}
