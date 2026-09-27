import {
  formatMedicationReportGeneratedAt,
  formatMedicationReportPeriod,
} from "./medication-report.domain";
import { MedicationAdherenceReport } from "./medication-report.types";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeReportValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "Not available";
  return String(value);
}

function medicationRows(report: MedicationAdherenceReport): string {
  if (report.medications.length === 0) {
    return '<p class="muted">No medications are available for this profile.</p>';
  }

  return report.medications.map((medication) => {
    const detailLines = !medication.hasRelevantRecords || medication.adherence === null
      ? '<p class="muted">No intake data for this period.</p>'
      : `<p class="counts">Recorded as Taken: ${safeReportValue(medication.taken)} &nbsp; | &nbsp; Skipped: ${safeReportValue(medication.skipped)} &nbsp; | &nbsp; Missed: ${safeReportValue(medication.missed)}</p><p class="adherence">Routine adherence: ${safeReportValue(medication.adherence)}%</p>`;

    return `<section class="medication"><h3>${escapeHtml(safeReportValue(medication.medicationName))}</h3><p class="dosage">${escapeHtml(safeReportValue(medication.medicationDosage))}</p><p class="status">${escapeHtml(safeReportValue(medication.lifecycleStatus))}</p>${detailLines}</section>`;
  }).join("");
}

/** Produces a print-friendly, self-contained report using only the preview object. */
export function buildMedicationReportHtml(report: MedicationAdherenceReport): string {
  const overall = `<table class="summary"><tbody>
    <tr><th>Eligible records</th><td>${safeReportValue(report.eligible)}</td></tr>
    <tr><th>Recorded as Taken</th><td>${safeReportValue(report.taken)}</td></tr>
    <tr><th>Skipped</th><td>${safeReportValue(report.skipped)}</td></tr>
    <tr><th>Missed</th><td>${safeReportValue(report.missed)}</td></tr>
    <tr><th>Unresolved past</th><td>${safeReportValue(report.unresolvedPast)}</td></tr>
  </tbody></table>${report.adherence === null
    ? '<p class="muted">No adherence data is available for this period.</p>'
    : `<p class="overall-adherence">Routine adherence: ${safeReportValue(report.adherence)}%</p><p class="muted">Taken eligible doses / total eligible scheduled doses. This is routine tracking only.</p>`}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Mr. Pill Pal Medication Report</title>
  <style>
    @page { size: A4; margin: 18mm 16mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #1f2933; background: #ffffff; font-family: Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.45; }
    h1 { margin: 0; color: #17365d; font-size: 22pt; line-height: 1.2; }
    h2 { margin: 22px 0 9px; color: #17365d; font-size: 14pt; }
    h3 { margin: 0; color: #172b4d; font-size: 12pt; }
    .subtitle { margin: 5px 0 18px; color: #52616b; font-size: 13pt; }
    .metadata { padding: 12px 14px; border: 1px solid #d6dee6; border-radius: 8px; background: #f8fafc; }
    .metadata p { margin: 3px 0; }
    .summary { width: 100%; border-collapse: collapse; }
    .summary th, .summary td { padding: 7px 9px; border-bottom: 1px solid #e1e7ed; text-align: left; }
    .summary th { width: 72%; color: #52616b; font-weight: 600; }
    .summary td { color: #182230; font-weight: 700; }
    .overall-adherence { margin: 13px 0 0; color: #17365d; font-size: 15pt; font-weight: 700; }
    .medication { margin: 10px 0; padding: 12px 14px; border: 1px solid #d6dee6; border-radius: 8px; page-break-inside: avoid; }
    .dosage { margin: 3px 0; color: #52616b; }
    .status { margin: 7px 0; color: #52616b; font-size: 9.5pt; font-weight: 700; }
    .counts { margin: 8px 0 0; }
    .adherence { margin: 3px 0 0; color: #17365d; font-weight: 700; }
    .muted { color: #52616b; font-size: 9.5pt; }
    .notice { margin-top: 18px; padding-top: 11px; border-top: 1px solid #d6dee6; color: #52616b; font-size: 9.5pt; }
    .notice p { margin: 5px 0; }
  </style>
</head>
<body>
  <h1>MR. PILL PAL</h1>
  <p class="subtitle">Medication &amp; Adherence Report</p>
  <section class="metadata">
    <p><strong>Profile:</strong> ${escapeHtml(safeReportValue(report.profileName))}</p>
    <p><strong>Period:</strong> ${escapeHtml(formatMedicationReportPeriod(report.range))} (${escapeHtml(safeReportValue(report.range.label))})</p>
    <p><strong>Generated:</strong> ${escapeHtml(formatMedicationReportGeneratedAt(report.generatedAt))}</p>
  </section>
  <h2>Overall recorded intake</h2>
  ${overall}
  <h2>Medications</h2>
  ${medicationRows(report)}
  <footer class="notice">
    <p>This report summarizes records entered in Mr. Pill Pal and does not provide medical advice or verify medication ingestion.</p>
    <p>This report may contain personal medication information. Share it only with people you trust.</p>
  </footer>
</body>
</html>`;
}

function sanitizeFilenamePart(value: string): string {
  const sanitized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return sanitized || "Profile";
}

/** Creates a filename with a sanitized display name and no profile/database IDs. */
export function getMedicationReportPdfFilename(report: MedicationAdherenceReport): string {
  const generatedAt = new Date(report.generatedAt);
  const timestamp = Number.isNaN(generatedAt.getTime())
    ? ""
    : `_${generatedAt.toISOString().replace(/[-:.TZ]/g, "").slice(0, 17)}`;
  return `Mr_Pill_Pal_Medication_Report_${sanitizeFilenamePart(report.profileName)}_${report.range.endDate}${timestamp}.pdf`;
}
