import assert from "node:assert/strict";
import test from "node:test";

import {
  createMedicationAdherenceReport,
  formatMedicationReportForSharing,
  getMedicationReportRange,
} from "../src/features/reports/medication-report.domain";
import { MedicationReportSource } from "../src/features/reports/medication-report.types";

const profileA = { id: "profile-a", fullName: "Kshitij Sharma", nickname: "Kshitij" };

function source(): MedicationReportSource {
  return {
    profile: profileA,
    medications: [
      { id: "med-a", profileId: "profile-a", name: "Paracetamol", dosage: "500 mg", isActive: true },
      { id: "med-b", profileId: "profile-a", name: "Vitamin D", dosage: "1000 IU", isActive: false },
      { id: "med-archived", profileId: "profile-a", name: "Old Medicine", dosage: "10 mg", isActive: false, archivedAt: "2026-08-01" },
      { id: "med-other", profileId: "profile-b", name: "Other Profile Medicine", dosage: "25 mg", isActive: true },
    ],
    doses: [
      { profileId: "profile-a", medicationId: "med-a", scheduledDate: "2026-09-20", status: "taken", medicationName: "Paracetamol", medicationDosage: "500 mg" },
      { profileId: "profile-a", medicationId: "med-a", scheduledDate: "2026-09-21", status: "skipped", medicationName: "Paracetamol", medicationDosage: "500 mg" },
      { profileId: "profile-a", medicationId: "med-b", scheduledDate: "2026-09-22", status: "missed", medicationName: "Vitamin D", medicationDosage: "1000 IU" },
      { profileId: "profile-a", medicationId: "med-archived", scheduledDate: "2026-09-23", status: "taken", medicationName: "Old Medicine", medicationDosage: "10 mg" },
      { profileId: "profile-a", medicationId: "med-a", scheduledDate: "2026-09-24", status: "pending", medicationName: "Paracetamol", medicationDosage: "500 mg" },
      { profileId: "profile-a", medicationId: "med-a", scheduledDate: "2026-08-01", status: "taken", medicationName: "Outside range", medicationDosage: "1 mg" },
      { profileId: "profile-b", medicationId: "med-other", scheduledDate: "2026-09-22", status: "taken", medicationName: "Other Profile Medicine", medicationDosage: "25 mg" },
    ],
  };
}

function report() {
  const range = { preset: "7" as const, startDate: "2026-09-19", endDate: "2026-09-25", label: "Last 7 days" };
  return createMedicationAdherenceReport(source(), range, "2026-09-25", "2026-09-25T09:30:00.000Z", "profile-a");
}

test("report counts finalized and unresolved past records with the same adherence semantics as Insights", () => {
  const value = report();

  assert.deepEqual(
    { taken: value.taken, skipped: value.skipped, missed: value.missed, unresolvedPast: value.unresolvedPast, eligible: value.eligible, adherence: value.adherence },
    { taken: 2, skipped: 1, missed: 1, unresolvedPast: 1, eligible: 5, adherence: 40 },
  );
});

test("report is explicitly profile-scoped and ignores outside-range records", () => {
  const value = report();

  assert.equal(value.medications.some((medication) => medication.medicationName === "Other Profile Medicine"), false);
  assert.equal(value.medications.some((medication) => medication.medicationName === "Outside range"), false);
  assert.equal(value.profileId, "profile-a");
});

test("current active and paused medications remain listed, while archived medicines need relevant history", () => {
  const value = report();
  const paused = value.medications.find((medication) => medication.medicationId === "med-b");
  const archived = value.medications.find((medication) => medication.medicationId === "med-archived");

  assert.equal(paused?.lifecycleStatus, "Paused");
  assert.equal(archived?.lifecycleStatus, "Archived");
  assert.equal(archived?.taken, 1);

  const noArchivedHistory = source();
  noArchivedHistory.doses = noArchivedHistory.doses.filter((dose) => dose.medicationId !== "med-archived");
  const withoutArchived = createMedicationAdherenceReport(noArchivedHistory, value.range, "2026-09-25", value.generatedAt, "profile-a");
  assert.equal(withoutArchived.medications.some((medication) => medication.medicationId === "med-archived"), false);
});

test("report supports no-data periods without divide-by-zero or invented zero percent", () => {
  const range = { preset: "7" as const, startDate: "2026-07-01", endDate: "2026-07-07", label: "Last 7 days" };
  const value = createMedicationAdherenceReport(source(), range, "2026-09-25", "2026-09-25T09:30:00.000Z", "profile-a");

  assert.equal(value.eligible, 0);
  assert.equal(value.adherence, null);
  assert.equal(value.medications.find((medication) => medication.medicationId === "med-a")?.hasRelevantRecords, false);
});

test("range presets use inclusive local calendar dates", () => {
  assert.deepEqual(getMedicationReportRange("7", "2026-09-25"), { preset: "7", startDate: "2026-09-19", endDate: "2026-09-25", label: "Last 7 days" });
  assert.deepEqual(getMedicationReportRange("30", "2026-09-25"), { preset: "30", startDate: "2026-08-27", endDate: "2026-09-25", label: "Last 30 days" });
  assert.deepEqual(getMedicationReportRange("90", "2026-09-25"), { preset: "90", startDate: "2026-06-28", endDate: "2026-09-25", label: "Last 90 days" });
});

test("report includes both local start and end dates and keeps stored historical snapshots", () => {
  const input = source();
  input.medications[0] = { ...input.medications[0], name: "Renamed today", dosage: "650 mg" };
  input.doses.push(
    { profileId: "profile-a", medicationId: "med-a", scheduledDate: "2026-09-19", status: "taken", medicationName: "Historical Paracetamol", medicationDosage: "500 mg" },
    { profileId: "profile-a", medicationId: "med-a", scheduledDate: "2026-09-25", status: "taken", medicationName: "Historical Paracetamol", medicationDosage: "500 mg" },
  );
  const value = createMedicationAdherenceReport(input, { preset: "7", startDate: "2026-09-19", endDate: "2026-09-25", label: "Last 7 days" }, "2026-09-25", "2026-09-25T09:30:00.000Z", "profile-a");
  const medication = value.medications.find((item) => item.medicationId === "med-a");

  assert.equal(value.taken, 4);
  assert.equal(medication?.medicationName, "Historical Paracetamol");
  assert.equal(medication?.medicationDosage, "500 mg");
});

test("share text is deterministic, factual, private, and free of internal IDs or missing values", () => {
  const value = report();
  const first = formatMedicationReportForSharing(value);
  const second = formatMedicationReportForSharing(value);

  assert.equal(first, second);
  assert.match(first, /Recorded as Taken: 2/);
  assert.match(first, /does not provide medical advice or verify medication ingestion/);
  assert.match(first, /Share it only with people you trust/);
  assert.doesNotMatch(first, /profile-a|med-a|Medication details unavailable|undefined|null/);
});

test("historical medication snapshots remain clear when only current lifecycle status is unavailable", () => {
  const input = source();
  input.medications = input.medications.filter((medication) => medication.id !== "med-a");
  const value = createMedicationAdherenceReport(input, getMedicationReportRange("7", "2026-09-25"), "2026-09-25", "2026-09-25T09:30:00.000Z", "profile-a");
  const historical = value.medications.find((medication) => medication.medicationId === "med-a");

  assert.equal(historical?.medicationName, "Paracetamol");
  assert.equal(historical?.medicationDosage, "500 mg");
  assert.equal(historical?.lifecycleStatus, "Current status unavailable");
});

test("report generation does not mutate source arrays", () => {
  const input = source();
  const medicationIds = input.medications.map((medication) => medication.id);
  const doseDates = input.doses.map((dose) => dose.scheduledDate);

  createMedicationAdherenceReport(
    input,
    { preset: "7", startDate: "2026-09-19", endDate: "2026-09-25", label: "Last 7 days" },
    "2026-09-25",
    "2026-09-25T09:30:00.000Z",
    "profile-a",
  );

  assert.deepEqual(input.medications.map((medication) => medication.id), medicationIds);
  assert.deepEqual(input.doses.map((dose) => dose.scheduledDate), doseDates);
});
