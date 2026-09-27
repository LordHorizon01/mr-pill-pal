import assert from "node:assert/strict";
import test from "node:test";

import { createMedicationAdherenceReport, formatMedicationReportPeriod, getMedicationReportRange } from "../src/features/reports/medication-report.domain";
import { buildMedicationReportHtml, getMedicationReportPdfFilename } from "../src/features/reports/medication-report-pdf";
import { MedicationAdherenceReport, MedicationReportRangePreset, MedicationReportSource } from "../src/features/reports/medication-report.types";

const reportSource: MedicationReportSource = {
  profile: { id: "profile-secret-id", fullName: "Kshitij Nigam", nickname: "Kshitij" },
  medications: [
    { id: "medicine-secret-id", profileId: "profile-secret-id", name: "Paracetamol <500 mg>", dosage: "500 mg & 1/2", isActive: true },
    { id: "other-profile-med", profileId: "other-profile", name: "Private Other Medicine", dosage: "2 mg", isActive: true },
  ],
  doses: [
    { profileId: "profile-secret-id", medicationId: "medicine-secret-id", scheduledDate: "2026-09-20", status: "taken", medicationName: "Paracetamol <500 mg>", medicationDosage: "500 mg & 1/2" },
    { profileId: "profile-secret-id", medicationId: "medicine-secret-id", scheduledDate: "2026-09-21", status: "skipped", medicationName: "Paracetamol <500 mg>", medicationDosage: "500 mg & 1/2" },
    { profileId: "profile-secret-id", medicationId: "medicine-secret-id", scheduledDate: "2026-09-22", status: "missed", medicationName: "Paracetamol <500 mg>", medicationDosage: "500 mg & 1/2" },
    { profileId: "other-profile", medicationId: "other-profile-med", scheduledDate: "2026-09-22", status: "taken", medicationName: "Private Other Medicine", medicationDosage: "2 mg" },
  ],
};

function makeReport(preset: MedicationReportRangePreset): MedicationAdherenceReport {
  const range = getMedicationReportRange(preset, "2026-09-25");
  return createMedicationAdherenceReport(reportSource, range, "2026-09-25", "2026-09-25T09:30:00.123Z", "profile-secret-id");
}

test("PDF HTML is deterministic, print-friendly, and includes the report profile, selected dates, and counts", () => {
  const value = makeReport("7");
  const html = buildMedicationReportHtml(value);

  assert.equal(html, buildMedicationReportHtml(value));
  assert.match(html, /size: A4/);
  assert.match(html, /Kshitij/);
  assert.ok(html.includes(formatMedicationReportPeriod(value.range)));
  assert.match(html, /Last 7 days/);
  assert.match(html, /Eligible records/);
  assert.match(html, /Recorded as Taken<\/th><td>1/);
  assert.match(html, /Skipped<\/th><td>1/);
  assert.match(html, /Missed<\/th><td>1/);
  assert.match(html, /Routine adherence: 33%/);
});

test("PDF includes medication breakdown and both safety and privacy notes without exposing IDs or other profiles", () => {
  const html = buildMedicationReportHtml(makeReport("30"));

  assert.match(html, /Paracetamol &lt;500 mg&gt;/);
  assert.match(html, /500 mg &amp; 1\/2/);
  assert.match(html, /<p class="status">Active<\/p>/);
  assert.match(html, /does not provide medical advice or verify medication ingestion/);
  assert.match(html, /Share it only with people you trust/);
  assert.doesNotMatch(html, /profile-secret-id|medicine-secret-id|other-profile-med|Private Other Medicine/);
  assert.doesNotMatch(html, /undefined|null/);
});

test("PDF safely escapes special characters in profile and medication values", () => {
  const source = structuredClone(reportSource);
  source.profile = { id: "profile-secret-id", fullName: "A <B> & C", nickname: "A <B> & C" };
  source.medications[0] = { ...source.medications[0], name: "A <script>alert(1)</script> & B", dosage: "1 < 2 & 3 > 1" };
  source.doses = source.doses.slice(0, 1).map((dose) => ({ ...dose, medicationName: "A <script>alert(1)</script> & B", medicationDosage: "1 < 2 & 3 > 1" }));
  const range = getMedicationReportRange("7", "2026-09-25");
  const html = buildMedicationReportHtml(createMedicationAdherenceReport(source, range, "2026-09-25", "2026-09-25T09:30:00.123Z", "profile-secret-id"));

  assert.match(html, /A &lt;B&gt; &amp; C/);
  assert.match(html, /A &lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; B/);
  assert.match(html, /1 &lt; 2 &amp; 3 &gt; 1/);
  assert.doesNotMatch(html, /<script>/);
});

test("filename uses a safe profile label and contains no profile or medication IDs", () => {
  const value = makeReport("7");
  const filename = getMedicationReportPdfFilename({ ...value, profileName: "../Kshitij: Nigam/" });

  assert.equal(filename, "Mr_Pill_Pal_Medication_Report_Kshitij_Nigam_2026-09-25_20260925093000123.pdf");
  assert.doesNotMatch(filename, /[\\/:*?"<>|]|profile-secret-id|undefined|null/);
});

test("PDF preserves the selected 7, 30, and 90 day range from the same report object", () => {
  for (const preset of ["7", "30", "90"] as const) {
    const value = makeReport(preset);
    const html = buildMedicationReportHtml(value);
    assert.match(html, new RegExp(`Last ${preset} days`));
    assert.ok(html.includes(formatMedicationReportPeriod(value.range)));
    assert.equal(value.range.preset, preset);
  }
});
