import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";

import { ThemedButton, ThemedCard, ThemedChip } from "@/components/themed-ui";
import { AppColorTokens, getButtonColorRoles, ui } from "@/components/ui-tokens";
import { useAppTheme } from "@/components/app-theme-provider";
import {
  formatMedicationReportForSharing,
  formatMedicationReportGeneratedAt,
  formatMedicationReportPeriod,
} from "@/features/reports/medication-report.domain";
import { getMedicationAdherenceReport } from "@/features/reports/medication-report.service";
import { createMedicationReportPdf, isMedicationReportSharingAvailable, shareMedicationReportPdf } from "@/features/reports/medication-report-export.service";
import { MedicationAdherenceReport, MedicationReportRangePreset } from "@/features/reports/medication-report.types";
import { useProfileStore } from "@/state/profile.store";

const presets: { value: MedicationReportRangePreset; label: string }[] = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

type ShareChoice = "pdf" | "text";
type PendingShare = { choice: ShareChoice; report: MedicationAdherenceReport; profileId: string; preset: MedicationReportRangePreset; revision: number };

export default function ReportExportScreen() {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const profileId = useProfileStore((state) => state.selectedProfileId);
  const [preset, setPreset] = useState<MedicationReportRangePreset>("30");
  const [loadedReport, setLoadedReport] = useState<MedicationAdherenceReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canRetryLoad, setCanRetryLoad] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isShareChooserVisible, setIsShareChooserVisible] = useState(false);
  const [shareOperation, setShareOperation] = useState<ShareChoice | null>(null);
  const requestRevision = useRef(0);
  const shareInProgress = useRef(false);
  const pendingShare = useRef<PendingShare | null>(null);
  const reportRef = useRef(loadedReport);
  const selectedProfileIdRef = useRef(profileId);
  const presetRef = useRef(preset);
  const report = loadedReport?.profileId === profileId && loadedReport.range.preset === preset ? loadedReport : null;
  reportRef.current = loadedReport;
  selectedProfileIdRef.current = profileId;
  presetRef.current = preset;

  const load = useCallback((nextPreset = preset) => {
    const request = ++requestRevision.current;
    if (!profileId) {
      setLoadedReport(null); setError(null); setCanRetryLoad(false); setIsLoading(false);
      return;
    }
    setLoadedReport(null); setIsLoading(true); setError(null); setCanRetryLoad(false);
    void getMedicationAdherenceReport(profileId, nextPreset).then((nextReport) => {
      if (request !== requestRevision.current) return;
      setLoadedReport(nextReport); setIsLoading(false);
    }).catch(() => {
      if (request !== requestRevision.current) return;
      setError("The report couldn't be loaded. Please try again."); setCanRetryLoad(true); setIsLoading(false);
    });
  }, [preset, profileId]);

  useFocusEffect(useCallback(() => {
    load();
    return () => { requestRevision.current += 1; };
  }, [load]));

  const changePreset = (nextPreset: MedicationReportRangePreset) => {
    if (nextPreset === preset) return;
    setPreset(nextPreset);
  };

  const openShareChooser = () => {
    if (!report || report.profileId !== profileId || report.range.preset !== preset || shareInProgress.current) return;
    setError(null); setCanRetryLoad(false);
    setIsShareChooserVisible(true);
  };

  const chooseShareFormat = (choice: ShareChoice) => {
    if (!report || report.profileId !== profileId || report.range.preset !== preset || shareInProgress.current) return;
    shareInProgress.current = true;
    pendingShare.current = { choice, report, profileId, preset, revision: requestRevision.current };
    setShareOperation(choice);
    setIsShareChooserVisible(false);
  };

  useEffect(() => {
    if (isShareChooserVisible || !shareOperation) return;
    const request = pendingShare.current;
    pendingShare.current = null;
    if (!request) {
      shareInProgress.current = false;
      setShareOperation(null);
      return;
    }

    const isStillCurrent = () => requestRevision.current === request.revision
      && useProfileStore.getState().selectedProfileId === request.profileId
      && selectedProfileIdRef.current === request.profileId
      && presetRef.current === request.preset
      && reportRef.current === request.report;

    void (async () => {
      try {
        if (!isStillCurrent()) {
          setError("The selected profile or report period changed. Please review the report and try again.");
          setCanRetryLoad(false);
          return;
        }
        if (request.choice === "text") {
          await Share.share({ message: formatMedicationReportForSharing(request.report) });
          return;
        }

        let canSharePdf = false;
        try {
          canSharePdf = await isMedicationReportSharingAvailable();
        } catch {
          canSharePdf = false;
        }
        if (!canSharePdf) {
          setError("Sharing is not available on this device.");
          setCanRetryLoad(false);
          return;
        }
        let uri: string;
        try {
          uri = await createMedicationReportPdf(request.report);
        } catch {
          setError("We couldn't create the PDF report. Please try again.");
          setCanRetryLoad(false);
          return;
        }
        if (!isStillCurrent()) {
          setError("The selected profile or report period changed. Please review the report and try again.");
          setCanRetryLoad(false);
          return;
        }
        try {
          await shareMedicationReportPdf(uri);
        } catch {
          setError("The sharing screen couldn't be opened. Please try again.");
          setCanRetryLoad(false);
        }
      } catch {
        setError("The sharing screen couldn't be opened. Please try again.");
        setCanRetryLoad(false);
      } finally {
        shareInProgress.current = false;
        setShareOperation(null);
      }
    })();
  }, [isShareChooserVisible, shareOperation]);

  return <>
  <ScrollView contentContainerStyle={styles.page}>
    <Text style={styles.periodLabel}>Period</Text>
    <View style={styles.chips}>{presets.map((item) => <ThemedChip key={item.value} label={item.label} selected={preset === item.value} onPress={() => changePreset(item.value)} accessibilityLabel={`${item.label} report period${preset === item.value ? ", selected" : ""}`} style={styles.periodChip} textStyle={styles.periodChipText} hitSlop={4} allowTextWrap />)}</View>

    {isLoading && !report ? <ActivityIndicator size="large" style={styles.loader} /> : null}
    {error ? <View style={styles.error}><Text accessibilityRole="alert" style={styles.errorTitle}>{error}</Text>{canRetryLoad ? <ThemedButton label="Try again" size="compact" tone="outline" accessibilityLabel="Try loading the report again" onPress={() => load()} style={{ alignSelf: "flex-start" }} /> : null}</View> : null}

    {report ? <>
      <ThemedCard style={styles.card}>
        <Text style={styles.cardTitle}>Medication &amp; adherence report</Text>
        <ReportDetail label="Profile" value={report.profileName} />
        <ReportDetail label="Period" value={formatMedicationReportPeriod(report.range)} />
        <ReportDetail label="Generated" value={formatMedicationReportGeneratedAt(report.generatedAt)} />
      </ThemedCard>

      <ThemedCard style={styles.card}>
        <Text style={styles.cardTitle}>Overall recorded intake</Text>
        {report.adherence === null ? <Text style={styles.emptyText}>No adherence data is available for this period.</Text> : <>
          <ReportDetail label="Eligible records" value={String(report.eligible)} />
          <ReportDetail label="Recorded as Taken" value={String(report.taken)} />
          <ReportDetail label="Skipped" value={String(report.skipped)} />
          <ReportDetail label="Missed" value={String(report.missed)} />
          {report.unresolvedPast > 0 ? <ReportDetail label="Unresolved past" value={String(report.unresolvedPast)} /> : null}
          <Text style={styles.adherence}>Routine adherence: {report.adherence}%</Text>
          <Text style={styles.helper}>Taken eligible doses / total eligible scheduled doses. This is routine tracking only.</Text>
        </>}
      </ThemedCard>

      <Text style={styles.sectionLabel}>Medications</Text>
      {report.medications.length === 0 ? <ThemedCard style={styles.card}><Text style={styles.emptyText}>No medications are available for this profile.</Text></ThemedCard> : report.medications.map((medication) => <ThemedCard key={medication.medicationId} style={styles.medicationCard}>
        <Text style={styles.medicationName}>{medication.medicationName}</Text>
        <Text style={styles.dosage}>{medication.medicationDosage}</Text>
        <Text style={styles.lifecycle}>{medication.lifecycleStatus}</Text>
        {!medication.hasRelevantRecords || medication.adherence === null ? <Text style={styles.emptyText}>No intake data for this period.</Text> : <>
          <Text style={styles.counts}>Recorded as Taken: {medication.taken}   Skipped: {medication.skipped}   Missed: {medication.missed}</Text>
          <Text style={styles.helper}>Routine adherence: {medication.adherence}%</Text>
        </>}
      </ThemedCard>)}

      <ThemedCard style={styles.privacyCard}><Text style={styles.privacyTitle}>Privacy note</Text><Text style={styles.helper}>This report may contain personal medication information. Share it only with people you trust.</Text></ThemedCard>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Share doctor or caregiver report"
        accessibilityState={{ disabled: isLoading || Boolean(shareOperation), busy: Boolean(shareOperation) }}
        disabled={isLoading || Boolean(shareOperation)}
        onPress={openShareChooser}
        style={({ pressed }) => {
          const state = isLoading || shareOperation ? "disabled" : pressed ? "pressed" : "default";
          const roles = getButtonColorRoles("primary", state);
          return [styles.shareButton, { backgroundColor: colors[roles.background], borderColor: colors[roles.border] }];
        }}
      >
        <Text style={[styles.shareButtonText, { color: colors[getButtonColorRoles("primary", isLoading || shareOperation ? "disabled" : "default").foreground] }]}>
          {shareOperation ? shareOperation === "pdf" ? "Preparing PDF…" : "Preparing report…" : "Share report"}
        </Text>
      </Pressable>
    </> : null}
  </ScrollView>
  <Modal visible={isShareChooserVisible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setIsShareChooserVisible(false)}>
    <View style={styles.modalRoot}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsShareChooserVisible(false)} accessibilityRole="button" accessibilityLabel="Close share report options" />
      <View accessibilityViewIsModal accessibilityLabel="Share report options" style={styles.modalCard}>
        <Text accessibilityRole="header" style={styles.modalTitle}>Share report</Text>
        <Text style={styles.modalDescription}>Choose how you want to share this report.</Text>
        <ReportShareChoiceButton label="Share as PDF" tone="primary" onPress={() => chooseShareFormat("pdf")} accessibilityLabel="Share report as PDF" />
        <ReportShareChoiceButton label="Share as text" tone="outline" onPress={() => chooseShareFormat("text")} accessibilityLabel="Share report as text" />
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel sharing" onPress={() => setIsShareChooserVisible(false)} style={styles.modalCancel}>
          <Text style={styles.modalCancelText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  </Modal>
  </>;
}

function ReportDetail({ label, value }: { label: string; value: string }) {
  const { colors } = useAppTheme(); const styles = createStyles(colors);
  return <View style={styles.detail}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>;
}

function ReportShareChoiceButton({ label, tone, onPress, accessibilityLabel }: { label: string; tone: "primary" | "outline"; onPress: () => void; accessibilityLabel: string }) {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel}
    onPress={onPress}
    style={({ pressed }) => {
      const roles = getButtonColorRoles(tone, pressed ? "pressed" : "default");
      return [styles.modalAction, tone === "outline" && styles.modalActionOutline, { backgroundColor: colors[roles.background], borderColor: colors[roles.border] }];
    }}
  >
    <Text style={[styles.modalActionText, { color: colors[getButtonColorRoles(tone).foreground] }]}>{label}</Text>
  </Pressable>;
}

const createStyles = (colors: AppColorTokens) => StyleSheet.create({
  page: { paddingHorizontal: ui.spacing.screen, paddingTop: 10, paddingBottom: 120, backgroundColor: colors.background },
  periodLabel: { fontSize: 16, fontWeight: "700", color: colors.textPrimary },
  sectionLabel: { marginTop: 12, fontSize: 16, fontWeight: "700", color: colors.textPrimary },
  chips: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 8 },
  periodChip: { minHeight: 36, paddingHorizontal: 12 },
  periodChipText: { fontSize: 14, lineHeight: 18, fontWeight: "600" },
  loader: { marginTop: 28 },
  error: { marginTop: 12, padding: 14, borderRadius: ui.radius.card, backgroundColor: colors.dangerBackground },
  errorTitle: { fontSize: 16, fontWeight: "700", color: colors.dangerForeground },
  card: { marginTop: 12, padding: 12, borderRadius: 16 },
  cardTitle: { marginBottom: 4, fontSize: 16, lineHeight: 22, fontWeight: "700", color: colors.cardForeground },
  detail: { minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.borderStrong },
  detailLabel: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 19, fontWeight: "600", color: colors.textPrimary },
  detailValue: { flex: 1, minWidth: 0, flexShrink: 1, textAlign: "right", fontSize: 14, lineHeight: 19, fontWeight: "700", color: colors.textPrimary },
  adherence: { marginTop: 8, fontSize: 17, lineHeight: 24, fontWeight: "700", color: colors.primary },
  helper: { marginTop: 4, fontSize: 14, lineHeight: 19, color: colors.textSecondary },
  emptyText: { marginTop: 8, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  medicationCard: { marginTop: 10, padding: 12, borderRadius: 16 },
  medicationName: { fontSize: 16, lineHeight: 21, fontWeight: "700", color: colors.cardForeground },
  dosage: { marginTop: 2, fontSize: 14, lineHeight: 19, color: colors.textSecondary },
  lifecycle: { marginTop: 6, fontSize: 14, lineHeight: 19, fontWeight: "700", color: colors.primary },
  counts: { marginTop: 8, fontSize: 14, lineHeight: 20, color: colors.textPrimary },
  privacyCard: { marginTop: 12, padding: 12, borderRadius: 16, backgroundColor: colors.secondaryBackground },
  privacyTitle: { fontSize: 16, fontWeight: "700", color: colors.secondaryForeground },
  shareButton: { alignSelf: "center", marginTop: 12, minHeight: 48, justifyContent: "center", alignItems: "center", paddingHorizontal: 19, paddingVertical: 12, borderWidth: 1, borderRadius: 11 },
  shareButtonText: { fontSize: 15, lineHeight: 20, fontWeight: "700", textAlign: "center" },
  modalRoot: { flex: 1, justifyContent: "center", alignItems: "center", padding: ui.spacing.screen, backgroundColor: "rgba(0, 0, 0, 0.48)" },
  modalCard: { width: "100%", maxWidth: 420, padding: ui.spacing.card, gap: 12, borderWidth: 1, borderColor: colors.border, borderRadius: ui.radius.card, backgroundColor: colors.surfaceElevated, elevation: 14 },
  modalTitle: { fontSize: 21, lineHeight: 28, fontWeight: "800", color: colors.textPrimary },
  modalDescription: { marginBottom: 4, fontSize: 16, lineHeight: 23, color: colors.textSecondary },
  modalAction: { width: "100%", minHeight: 48, justifyContent: "center", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderRadius: ui.radius.button },
  modalActionOutline: { borderWidth: 1 },
  modalActionText: { fontSize: 16, lineHeight: 22, fontWeight: "700", textAlign: "center" },
  modalCancel: { minHeight: ui.touch.minimum, justifyContent: "center", alignItems: "center", paddingHorizontal: 16, borderRadius: ui.radius.button },
  modalCancelText: { fontSize: 16, fontWeight: "700", color: colors.outlineForeground },
});
