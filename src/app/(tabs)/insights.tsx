import { useCallback, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";

import { useAppTheme } from "@/components/app-theme-provider";
import { motion } from "@/components/motion-tokens";
import { ContentFade, InsightsInitialSkeleton } from "@/components/loading-primitives";
import { ScreenHeader } from "@/components/screen-header";
import { TabContentTransition } from "@/components/tab-content-transition";
import { ThemedButton, ThemedChip } from "@/components/themed-ui";
import { AppColorTokens, ui } from "@/components/ui-tokens";
import { calculateRoutineAdherence } from "@/features/history/insights.domain";
import { getRoutineInsights } from "@/features/history/history.service";
import { DetailedInsights, InsightRange } from "@/features/history/history.types";
import { useDelayedLoading } from "@/hooks/use-delayed-loading";
import { useProfileStore } from "@/state/profile.store";

const ranges: { value: InsightRange; label: string }[] = [
  { value: "7", label: "7 Days" },
  { value: "30", label: "30 Days" },
  { value: "90", label: "90 Days" },
  { value: "all", label: "All Time" },
];

export default function InsightsScreen() {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const profileId = useProfileStore((state) => state.selectedProfileId);
  const [range, setRange] = useState<InsightRange>("7");
  const [loadedData, setLoadedData] = useState<DetailedInsights | null>(null);
  const [loadedProfileId, setLoadedProfileId] = useState<string | null>(null);
  const [loadedRange, setLoadedRange] = useState<InsightRange | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRevision = useRef(0);
  const data = loadedProfileId === profileId && loadedRange === range ? loadedData : null;

  const load = useCallback((nextRange = range) => {
    const currentRequest = ++requestRevision.current;
    if (!profileId) {
      setLoadedData(null);
      setLoadedProfileId(null);
      setLoadedRange(null);
      setError(null);
      setIsLoading(false);
      return;
    }
    setError(null);
    setIsLoading(true);
    void getRoutineInsights(profileId, nextRange).then((result) => {
      if (requestRevision.current !== currentRequest) return;
      setLoadedData(result);
      setLoadedProfileId(profileId);
      setLoadedRange(nextRange);
      setError(null);
      setIsLoading(false);
    }).catch(() => {
      if (requestRevision.current !== currentRequest) return;
      setError("Insights couldn't be loaded. Please try again.");
      setIsLoading(false);
    });
  }, [profileId, range]);

  useFocusEffect(useCallback(() => {
    load();
    return () => { requestRevision.current += 1; };
  }, [load]));

  const delayedLoadingVisible = useDelayedLoading(isLoading && !data);
  const showFirstScopeSkeleton = !error && !data && delayedLoadingVisible;
  const visibleData = showFirstScopeSkeleton ? null : data;
  const hasData = Boolean(visibleData && visibleData.eligible > 0);
  const routineAdherence = visibleData ? calculateRoutineAdherence(visibleData, visibleData.unresolvedPast) : null;

  return (
    <TabContentTransition style={styles.screen}>
      <ScreenHeader title="Insights" />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.page}>
        <Text style={styles.sectionHeading}>Create report</Text>
        <View style={styles.reportCard}>
          <View style={styles.reportTitleSection}>
            <Text style={styles.reportTitle}>Doctor / Caregiver Report</Text>
          </View>
          <View style={styles.reportDivider} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create doctor or caregiver report"
            onPress={() => router.push("/report-export" as never)}
            style={({ pressed }) => [styles.reportAction, pressed && styles.reportActionPressed]}
          >
            <Text style={styles.reportActionText}>Create report</Text>
          </Pressable>
        </View>
        <Text style={styles.statsHeading}>Medication Status Overview</Text>
        <View style={styles.ranges}>
          {ranges.map((item) => (
            <ThemedChip
              key={item.value}
              label={item.label}
              selected={range === item.value}
              onPress={() => setRange(item.value)}
              accessibilityLabel={`${item.label} insights${range === item.value ? ", selected" : ""}`}
              style={styles.rangeChip}
              textStyle={styles.rangeChipText}
              hitSlop={5}
              allowTextWrap
            />
          ))}
        </View>
        {showFirstScopeSkeleton ? (
          <ContentFade key="insights-skeleton" duration={motion.duration.skeletonCrossfade}><InsightsInitialSkeleton /></ContentFade>
        ) : null}
        {error ? (
          <ContentFade key="insights-error">
            <View style={styles.error}>
              <Text style={styles.errorText}>{error}</Text>
              <ThemedButton label="Try again" size="compact" tone="outline" accessibilityLabel="Try loading insights again" onPress={() => load()} />
            </View>
          </ContentFade>
        ) : null}
        {visibleData && !hasData ? (
          <ContentFade key={`insights-empty-${range}`} duration={motion.duration.skeletonCrossfade}>
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No dose history yet.</Text>
              <Text style={styles.emptyText}>Record medication intake to see routine insights.</Text>
            </View>
          </ContentFade>
        ) : null}
        {visibleData && hasData ? (
          <ContentFade key={`insights-data-${range}`} duration={motion.duration.skeletonCrossfade}>
            <>
              <View style={[styles.card, styles.firstCard]}>
                <Text style={styles.cardTitle}>{ranges.find((item) => item.value === range)?.label}</Text>
                <Metric label="Total eligible" value={visibleData.eligible} />
                <Metric label="Taken" value={visibleData.taken} />
                <Metric label="Skipped" value={visibleData.skipped} />
                <Metric label="Missed" value={visibleData.missed} />
                {visibleData.unresolvedPast ? <Text style={styles.helper}>Unresolved past doses: {visibleData.unresolvedPast}</Text> : null}
              </View>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Routine adherence</Text>
                <Text style={styles.percentage}>{routineAdherence}%</Text>
                <Text style={styles.helper}>Taken eligible doses / total eligible scheduled doses. This is routine tracking only.</Text>
              </View>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>By medication</Text>
                {visibleData.byMedication.map((medication) => (
                  <View key={medication.medicationId} style={styles.breakdown}>
                    <Text style={styles.medicationName}>{medication.medicationName}</Text>
                    <Text style={styles.breakdownText}>Taken {medication.taken}   Skipped {medication.skipped}   Missed {medication.missed}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Daily routine records</Text>
                {visibleData.trend.map((day) => (
                  <View key={day.date} style={styles.breakdown}>
                    <Text style={styles.medicationName}>{new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</Text>
                    <Text style={styles.breakdownText}>Taken {day.taken}   Skipped {day.skipped}   Missed {day.missed}</Text>
                  </View>
                ))}
              </View>
            </>
          </ContentFade>
        ) : null}
      </ScrollView>
    </TabContentTransition>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
}

const createStyles = (colors: AppColorTokens) => StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flex: 1 },
  page: { padding: ui.spacing.screen, paddingTop: 8, paddingBottom: 120 },
  sectionHeading: { fontSize: 14, lineHeight: 18, fontWeight: "600", color: colors.textPrimary },
  reportCard: { marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 16, overflow: "hidden", backgroundColor: colors.surfaceRaised },
  reportTitleSection: { alignItems: "center", paddingTop: 16, paddingBottom: 20, paddingHorizontal: 16, backgroundColor: colors.surfaceRaised },
  reportTitle: { flexShrink: 1, fontSize: 18, lineHeight: 24, fontWeight: "700", color: colors.cardForeground, textAlign: "center" },
  reportDivider: { height: 1, backgroundColor: colors.border },
  reportAction: { minHeight: 48, alignItems: "center", justifyContent: "center", paddingVertical: 12, paddingHorizontal: 14, backgroundColor: colors.cardBackground },
  reportActionPressed: { opacity: 0.84 },
  reportActionText: { flexShrink: 1, fontSize: 15, lineHeight: 20, fontWeight: "600", color: colors.outlineForeground, textAlign: "center" },
  statsHeading: { marginTop: 16, fontSize: 14, lineHeight: 18, fontWeight: "600", color: colors.textPrimary },
  ranges: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 8 },
  rangeChip: { minHeight: 38, maxWidth: "100%", paddingHorizontal: 13, borderRadius: 999 },
  rangeChipText: { flexShrink: 1, textAlign: "center", fontSize: 14, lineHeight: 18, fontWeight: "600" },
  error: { marginTop: ui.spacing.section, padding: ui.spacing.card, borderRadius: ui.radius.card, backgroundColor: colors.dangerBackground },
  errorText: { fontWeight: "700", color: colors.dangerForeground },
  empty: { marginTop: ui.spacing.section, padding: ui.spacing.card, borderRadius: ui.radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardBackground },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: colors.cardForeground },
  emptyText: { marginTop: 6, fontSize: 16, lineHeight: 22, color: colors.textSecondary },
  card: { marginTop: ui.spacing.section, padding: ui.spacing.card, borderWidth: 1, borderColor: colors.border, borderTopColor: colors.borderStrong, borderRadius: ui.radius.card, backgroundColor: colors.cardBackground },
  firstCard: { marginTop: 16 },
  cardTitle: { fontSize: 18, fontWeight: "700", color: colors.cardForeground },
  metric: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: colors.divider },
  metricLabel: { fontSize: 16, fontWeight: "600", color: colors.textPrimary },
  metricValue: { fontSize: 19, fontWeight: "700", color: colors.primary },
  percentage: { marginTop: 12, fontSize: 34, fontWeight: "700", color: colors.primary },
  helper: { marginTop: 10, fontSize: 14, lineHeight: 20, color: colors.textMuted },
  breakdown: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.divider },
  medicationName: { fontSize: 16, fontWeight: "700", color: colors.cardForeground },
  breakdownText: { marginTop: 4, fontSize: 15, lineHeight: 21, color: colors.textSecondary },
});
