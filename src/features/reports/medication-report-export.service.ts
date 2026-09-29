import { File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import { MedicationAdherenceReport } from "./medication-report.types";
import { buildMedicationReportHtml, getMedicationReportPdfFilename } from "./medication-report-pdf";

export async function isMedicationReportSharingAvailable(): Promise<boolean> {
  return Sharing.isAvailableAsync();
}

/** Generates the selected report locally and gives the cached file a safe name. */
export async function createMedicationReportPdf(report: MedicationAdherenceReport): Promise<string> {
  const result = await Print.printToFileAsync({
    html: buildMedicationReportHtml(report),
    width: 595,
    height: 842,
  });
  const cachedPdf = new File(result.uri);
  const filename = getMedicationReportPdfFilename(report);
  let uniqueFilename = filename;
  let duplicate = 2;
  while (new File(Paths.cache, uniqueFilename).exists) {
    uniqueFilename = filename.replace(/\.pdf$/i, `_${duplicate}.pdf`);
    duplicate += 1;
  }
  cachedPdf.rename(uniqueFilename);
  return cachedPdf.uri;
}

/** Opens the system chooser with the generated PDF as an application/pdf attachment. */
export async function shareMedicationReportPdf(uri: string): Promise<void> {
  await Sharing.shareAsync(uri, {
    dialogTitle: "Share medication report",
    mimeType: "application/pdf",
    UTI: "com.adobe.pdf",
  });

  // expo-print writes into the cache. Keep the file there after the chooser
  // returns so a receiving app can finish reading its granted temporary URI.
  // The operating system can clear cache files later.
}
