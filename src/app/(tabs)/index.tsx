import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AppState,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";

import {
  toLocalDateString,
} from "@/features/doses/dose.service";
import { getDosePresentationState } from "@/features/doses/dose.domain";
import { TodayDose } from "@/features/doses/dose.types";
import { useDoses } from "@/hooks/useDoses";
import { AppColorTokens, ui } from "@/components/ui-tokens";
import { ScreenHeader } from "@/components/screen-header";
import { HomeDateCarousel } from "@/components/home-date-carousel";
import { motion } from "@/components/motion-tokens";
import { useAppTheme } from "@/components/app-theme-provider";
import { useProfileStore } from "@/state/profile.store";
import { getHomeGreeting } from "@/features/profiles/profile.domain";
import { StatusBadge, ThemedButton, ThemedChip } from "@/components/themed-ui";
import { DoseStatusOverflowSheet } from "@/features/doses/dose-status-overflow-sheet";
import { shouldShowDoseCorrectionOverflow } from "@/features/doses/dose-card-presentation.domain";
import { AnchoredMenuAnchor } from "@/components/anchored-action-menu.domain";
import { ContentFade, DoseListSkeleton, HomeSummarySkeleton } from "@/components/loading-primitives";
import { TabContentTransition } from "@/components/tab-content-transition";
import { useDelayedLoading } from "@/hooks/use-delayed-loading";
import { useUserPullRefresh } from "@/hooks/use-user-pull-refresh";
import { useDoseStore } from "@/state/dose.store";

const UPCOMING_STATUS_LABEL = "Upcoming";
type FinalizedDoseFilter = "taken" | "skipped";

function formatDate(dateString: string): string {
  const [year, month, day] = dateString.split("-").map(Number);

  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function formatTime(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date(2000, 0, 1, hours, minutes);

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTakenAt(takenAt: string): string {
  return new Date(takenAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function HomeScreen() {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const profiles = useProfileStore((state) => state.profiles);
  const selectedProfileId = useProfileStore((state) => state.selectedProfileId);
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? null;
  const doseProfileId = useDoseStore((state) => state.profileId);
  const loadedDate = useDoseStore((state) => state.loadedDate);
  const todayDate = toLocalDateString();
  const {
    selectedDate: selectedScheduleDate,
    doses,
    isLoading,
    updatingDoseId,
    error,
    loadDoses,
    recordTaken,
    recordSkipped,
    correctStatus,
    clearError,
  } = useDoses();
  const hasCurrentDoseData = doseProfileId === selectedProfileId && loadedDate === selectedScheduleDate;
  const delayedLoadingVisible = useDelayedLoading(isLoading && !hasCurrentDoseData);
  const showFirstScopeSkeleton = !error && !hasCurrentDoseData && delayedLoadingVisible;
  const hasCurrentDoseContent = hasCurrentDoseData;
  const visibleDoses = useMemo(() => hasCurrentDoseContent ? doses : [], [doses, hasCurrentDoseContent]);
  const [statusMenuDose, setStatusMenuDose] = useState<TodayDose | null>(null);
  const [statusMenuAnchor, setStatusMenuAnchor] = useState<AnchoredMenuAnchor | null>(null);
  const [skipConfirmationDoseId, setSkipConfirmationDoseId] = useState<string | null>(null);
  const [finalizedDoseFilter, setFinalizedDoseFilter] = useState<FinalizedDoseFilter>("taken");
  const skipConfirmationDoseIdRef = useRef<string | null>(null);
  const statusMenuAnchorRefs = useRef<Record<string, View | null>>({});
  const pendingDoses = useMemo(() => visibleDoses.filter((dose) => dose.status === "pending"), [visibleDoses]);
  const takenDoses = useMemo(() => visibleDoses.filter((dose) => dose.status === "taken"), [visibleDoses]);
  const skippedDoses = useMemo(() => visibleDoses.filter((dose) => dose.status === "skipped"), [visibleDoses]);
  const missedDoses = useMemo(() => visibleDoses.filter((dose) => dose.status === "missed"), [visibleDoses]);
  const recordedCount = takenDoses.length + skippedDoses.length;
  const nextDose = pendingDoses[0] ?? null;
  const finalizedDoses = useMemo(
    () => visibleDoses.filter((dose) => dose.status === finalizedDoseFilter),
    [finalizedDoseFilter, visibleDoses],
  );

  const refreshDoses = useCallback(() => {
    void loadDoses();
  }, [loadDoses]);
  const { refreshing: userPullRefreshing, onRefresh: refreshFromPull } = useUserPullRefresh(loadDoses);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setStatusMenuDose(null);
      setStatusMenuAnchor(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedProfileId]);

  useFocusEffect(
    useCallback(() => {
      if (selectedProfileId) refreshDoses();
    }, [refreshDoses, selectedProfileId]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        refreshDoses();
      }
    });

    return () => subscription.remove();
  }, [refreshDoses]);

  const selectScheduleDate = useCallback((date: string) => {
    if (date !== selectedScheduleDate) void loadDoses(date);
  }, [loadDoses, selectedScheduleDate]);

  function confirmSkipDose(dose: TodayDose) {
    if (skipConfirmationDoseIdRef.current || useDoseStore.getState().updatingDoseId) {
      return;
    }

    skipConfirmationDoseIdRef.current = dose.id;
    setSkipConfirmationDoseId(dose.id);
    const releaseSkipConfirmation = () => {
      if (skipConfirmationDoseIdRef.current === dose.id) {
        skipConfirmationDoseIdRef.current = null;
        setSkipConfirmationDoseId(null);
      }
    };

    Alert.alert(
      "Skip this dose?",
      `Mark ${dose.medicationName} ${dose.medicationDosage} as skipped? You can review it in your intake history later.`,
      [
        { text: "Cancel", style: "cancel", onPress: releaseSkipConfirmation },
        {
          text: "Skip dose",
          style: "destructive",
          onPress: () => {
            releaseSkipConfirmation();
            void recordSkipped(dose.id);
          },
        },
      ],
      { cancelable: true, onDismiss: releaseSkipConfirmation },
    );
  }

  function confirmStatusCorrection(dose: TodayDose, target: "taken" | "skipped") {
    setStatusMenuDose(null);
    setStatusMenuAnchor(null);
    const targetLabel = target === "taken" ? "Taken" : "Skipped";
    Alert.alert("Change dose status?", `This dose is currently recorded as ${dose.status === "taken" ? "Taken" : "Skipped"}. Change it to ${targetLabel}?`, [
      { text: "Cancel", style: "cancel" },
      { text: `Change to ${targetLabel}`, onPress: () => void correctStatus(dose.id, target) },
    ]);
  }

  function renderDose({ item, featured = false, finalized = false }: { item: TodayDose; featured?: boolean; finalized?: boolean }) {
    const isUpdating = updatingDoseId === item.id;
    const isPending = item.status === "pending";
    const isFinalized = item.status === "taken" || item.status === "skipped";
    const presentation = getDosePresentationState(
      item.status,
      item.scheduledDate,
    );
    const isFutureDose = presentation.label === UPCOMING_STATUS_LABEL;
    const statusLabel = presentation.label;
    const isSkipConfirmationOpen = skipConfirmationDoseId === item.id;
    const isActionUnavailable = Boolean(updatingDoseId) || isSkipConfirmationOpen;
    const statusDescription = isFutureDose && isPending
      ? `Upcoming - scheduled for ${formatDate(item.scheduledDate)}`
      : item.status === "taken" && item.takenAt
        ? `Taken at ${formatTakenAt(item.takenAt)}`
        : item.status === "skipped"
          ? item.statusRecordedAt
            ? `Skipped at ${formatTakenAt(item.statusRecordedAt)}`
            : "Skipped"
          : item.status === "missed"
            ? "Missed"
            : "Pending - not yet recorded";
    const showsCorrectionOverflow = shouldShowDoseCorrectionOverflow(item.status);

    return (
      <View style={[styles.doseCard, featured && styles.featuredDose, finalized && styles.finalizedDoseCard]}>
        <View style={styles.cardTopRow}>
          <Text style={styles.time}>{formatTime(item.scheduledTime)}</Text>
            {isFinalized ? (
              <View
                accessible
                accessibilityRole="text"
                accessibilityLabel={`Status: ${statusLabel}`}
                style={[styles.finalizedStatusBadge, item.status === "taken" ? styles.takenStatusBadge : styles.skippedStatusBadge]}
              >
                <Text style={[styles.finalizedStatusBadgeText, item.status === "taken" ? styles.takenStatusBadgeText : styles.skippedStatusBadgeText]}>{statusLabel}</Text>
              </View>
            ) : <StatusBadge label={statusLabel} tone={isFutureDose && isPending ? "upcoming" : item.status} />}
        </View>

        <Text style={[styles.medicationName, finalized && styles.finalizedMedicationName]}>{item.medicationName}</Text>
        <Text style={styles.dosage}>{item.medicationDosage}</Text>

        {showsCorrectionOverflow ? (
          <View style={styles.finalizedStatusRow}>
            <Text
              accessibilityLabel={`${item.medicationName}, scheduled for ${formatTime(item.scheduledTime)}, ${statusDescription}`}
              style={[styles.statusDescription, styles.finalizedStatusDescription]}
            >
              {statusDescription}
            </Text>
            <View ref={(node) => { statusMenuAnchorRefs.current[item.id] = node; }} collapsable={false}>
              <Pressable accessibilityRole="button" accessibilityLabel={`More actions for ${item.medicationName} dose`} onPress={() => {
                const anchor = statusMenuAnchorRefs.current[item.id];
                anchor?.measureInWindow((x, y, width, height) => {
                  setStatusMenuAnchor({ x, y, width, height });
                  setStatusMenuDose(item);
                });
              }} disabled={Boolean(updatingDoseId)} style={styles.overflowButton}>
                <Text style={styles.overflowText}>⋮</Text>
              </Pressable>
            </View>
          </View>
        ) : <Text style={styles.statusDescription}>{statusDescription}</Text>}

        {presentation.canRecord ? (
          <View style={styles.actionRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Mark ${item.medicationName} dose as taken`}
              accessibilityState={{ disabled: isActionUnavailable, busy: isUpdating }}
              disabled={isActionUnavailable}
              hitSlop={{ top: 2, bottom: 2 }}
              onPress={() => void recordTaken(item.id)}
              style={({ pressed }) => [styles.doseAction, styles.takenAction, pressed && !isActionUnavailable && styles.doseActionPressed, isActionUnavailable && styles.doseActionDisabled]}
            >
              <Text style={styles.takenActionLabel}>{isUpdating ? "Saving..." : "Taken"}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Skip ${item.medicationName} dose`}
              accessibilityState={{ disabled: isActionUnavailable }}
              disabled={isActionUnavailable}
              hitSlop={{ top: 2, bottom: 2 }}
              onPress={() => confirmSkipDose(item)}
              style={({ pressed }) => [styles.doseAction, styles.skipAction, pressed && !isActionUnavailable && styles.doseActionPressed, isActionUnavailable && styles.doseActionDisabled]}
            >
              <Text style={styles.skipActionLabel}>Skip</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <TabContentTransition style={styles.container}><ScreenHeader variant="home" title="Home" greeting={getHomeGreeting(selectedProfile)} date={formatDate(todayDate)} /><View style={styles.container}>
      <FlatList
        data={finalizedDoses}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ContentFade key={`${finalizedDoseFilter}-${item.id}`} duration={motion.duration.fast}>
            <View style={styles.finalizedDoseItem}>{renderDose({ item, finalized: true })}</View>
          </ContentFade>
        )}
        contentContainerStyle={styles.listContent}
        refreshing={userPullRefreshing}
        onRefresh={refreshFromPull}
        ListHeaderComponent={
          <>
            <HomeDateCarousel todayDate={todayDate} selectedScheduleDate={selectedScheduleDate} colors={colors} onSelectDate={selectScheduleDate} />

            <ContentFade key={hasCurrentDoseContent ? "home-summary-content" : showFirstScopeSkeleton ? "home-summary-skeleton" : "home-summary-wait"} duration={motion.duration.skeletonCrossfade}>{hasCurrentDoseContent ? <View style={styles.progressCard}>
              <Text style={styles.progressTitle}>Today&apos;s summary</Text>
              <Text style={styles.progressText}>{recordedCount} of {visibleDoses.length} doses recorded</Text>
              <View style={styles.summaryCounts}>
                <Text style={styles.summaryText}>Taken {takenDoses.length}</Text>
                <Text style={styles.summaryText}>Upcoming {pendingDoses.length}</Text>
                {skippedDoses.length ? <Text style={styles.summaryText}>Skipped {skippedDoses.length}</Text> : null}
                {missedDoses.length ? <Text style={styles.summaryText}>Missed {missedDoses.length}</Text> : null}
              </View>
            </View> : showFirstScopeSkeleton ? <HomeSummarySkeleton /> : <View style={styles.progressPlaceholder} />}</ContentFade>
            <Text style={styles.sectionTitle}>Next medication</Text>
            {nextDose ? renderDose({ item: nextDose, featured: true }) : hasCurrentDoseContent && visibleDoses.length > 0 ? <View style={styles.caughtUp}>
              <Text style={styles.emptyTitle}>You&apos;re all caught up</Text>
              <Text style={styles.emptyText}>No more medications scheduled for today.</Text>
            </View> : null}
            <View style={styles.scheduleHeading}>
              <Text style={styles.sectionTitle}>Today&apos;s schedule</Text>
              <ThemedButton label="Add medication" tone="outline" size="compact" onPress={() => router.push("/medications")} accessibilityLabel="Add medication" style={styles.quickButton} />
            </View>

            <View style={styles.finalizedFilters}>
              <ThemedChip label="Taken" selected={finalizedDoseFilter === "taken"} onPress={() => setFinalizedDoseFilter("taken")} accessibilityLabel="Taken doses" style={styles.finalizedFilterChip} textStyle={styles.finalizedFilterLabel} hitSlop={5} />
              <ThemedChip label="Skipped" selected={finalizedDoseFilter === "skipped"} onPress={() => setFinalizedDoseFilter("skipped")} accessibilityLabel="Skipped doses" style={styles.finalizedFilterChip} textStyle={styles.finalizedFilterLabel} hitSlop={5} />
            </View>

            {error ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Dismiss dose error"
                onPress={clearError}
                style={styles.errorBox}
              >
                <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>
                <Text style={styles.errorHint}>Tap to dismiss</Text>
              </Pressable>
            ) : null}

          </>
        }
        ListEmptyComponent={
          showFirstScopeSkeleton ? <ContentFade key="home-dose-skeleton" duration={motion.duration.skeletonCrossfade}><DoseListSkeleton /></ContentFade> : hasCurrentDoseContent ? (
            <ContentFade key={`finalized-empty-${finalizedDoseFilter}`} duration={motion.duration.fast}>
              <Text style={styles.finalizedEmptyText}>{finalizedDoseFilter === "taken" ? "No taken doses yet." : "No skipped doses."}</Text>
            </ContentFade>
          ) : null
        }
      />
      <DoseStatusOverflowSheet dose={statusMenuDose} anchor={statusMenuAnchor} onClose={() => { setStatusMenuDose(null); setStatusMenuAnchor(null); }} onCorrect={(target) => statusMenuDose && confirmStatusCorrection(statusMenuDose, target)} />
    </View></TabContentTransition>
  );
}

const createStyles = (colors: AppColorTokens) => StyleSheet.create({
  container: { flex: 1 },
  listContent: { padding: ui.spacing.screen, paddingTop: 10, paddingBottom: 120 },
  progressCard: { paddingHorizontal: ui.spacing.card, paddingVertical: ui.spacing.md, marginBottom: ui.spacing.section, borderRadius: ui.radius.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSubtle },
  progressPlaceholder: { minHeight: 84, marginBottom: ui.spacing.section },
  progressTitle: { fontSize: 15, fontWeight: "800", color: colors.textPrimary },
  progressText: { marginTop: 3, fontSize: 14, color: colors.textSecondary },
  summaryCounts: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 9 },
  summaryText: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  quickButton: { flexGrow: 0 },
  scheduleHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginTop: ui.spacing.md, marginBottom: ui.spacing.xs },
  caughtUp: { paddingVertical: ui.spacing.md },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: colors.textPrimary },
  errorBox: {
    marginBottom: 16,
    padding: 14,
    borderRadius: 10,
    backgroundColor: colors.dangerBackground,
  },
  errorText: { fontSize: 15, fontWeight: "600", color: colors.dangerForeground },
  errorHint: { marginTop: 4, fontSize: 13, color: colors.textMuted },
  loader: { marginVertical: 32 },
  doseCard: { marginBottom: 0, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  featuredDose: { marginBottom: ui.spacing.section, padding: ui.spacing.card, borderWidth: 1, borderBottomWidth: 1, borderColor: colors.borderStrong, borderRadius: ui.radius.card, backgroundColor: colors.cardBackground },
  finalizedDoseCard: { marginBottom: 0, padding: 14, borderWidth: 1, borderBottomWidth: 1, borderColor: colors.border, borderRadius: 15, backgroundColor: colors.cardBackground },
  finalizedFilters: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  finalizedFilterChip: { minHeight: 34, paddingHorizontal: 16, borderRadius: 999 },
  finalizedFilterLabel: { fontSize: 13, lineHeight: 18, fontWeight: "600" },
  finalizedDoseItem: { marginBottom: 8 },
  finalizedEmptyText: { paddingVertical: 8, color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  finalizedStatusBadge: { minHeight: 28, alignSelf: "flex-start", justifyContent: "center", paddingHorizontal: 11, paddingVertical: 4, borderWidth: 1, borderRadius: 999 },
  takenStatusBadge: { borderColor: colors.border, backgroundColor: colors.successSurface },
  skippedStatusBadge: { borderColor: colors.border, backgroundColor: colors.warningSurface },
  finalizedStatusBadgeText: { fontSize: 12, lineHeight: 16, fontWeight: "700" },
  takenStatusBadgeText: { color: colors.success },
  skippedStatusBadgeText: { color: colors.warning },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  finalizedStatusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 10 },
  finalizedStatusDescription: { flex: 1, minWidth: 0, marginTop: 0 },
  overflowButton: { minWidth: ui.touch.minimum, minHeight: ui.touch.minimum, alignItems: "center", justifyContent: "center", borderRadius: ui.radius.button },
  overflowText: { fontSize: 24, lineHeight: 28, color: colors.textPrimary },
  time: { fontSize: 19, fontWeight: "700", color: colors.cardForeground },
  medicationName: { marginTop: 14, fontSize: 19, fontWeight: "700", color: colors.cardForeground },
  finalizedMedicationName: { marginTop: 8 },
  dosage: { marginTop: 3, fontSize: 16, color: colors.textSecondary },
  statusDescription: { marginTop: 14, fontSize: 15, fontWeight: "600", color: colors.textSecondary },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: ui.spacing.md },
  doseAction: { minHeight: 44, justifyContent: "center", alignItems: "center", paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderRadius: 11 },
  takenAction: { flex: 1, backgroundColor: colors.primaryBackground, borderColor: colors.primaryBackground },
  takenActionLabel: { flexShrink: 1, textAlign: "center", fontSize: 15, fontWeight: "700", color: colors.primaryForeground },
  skipAction: { flex: 1, backgroundColor: colors.surfaceSubtle, borderColor: colors.outlineBorder },
  skipActionLabel: { flexShrink: 1, textAlign: "center", fontSize: 15, fontWeight: "700", color: colors.outlineForeground },
  doseActionPressed: { opacity: 0.82 },
  doseActionDisabled: { opacity: 0.5 },
  emptyContainer: { alignItems: "center", paddingVertical: 48, paddingHorizontal: 20 },
  emptyTitle: { fontSize: 19, fontWeight: "700", color: colors.textPrimary },
  emptyText: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    color: colors.textSecondary,
  },
  emptyButton: { alignSelf: "center", marginTop: 18 },
});
