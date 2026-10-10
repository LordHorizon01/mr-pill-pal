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
import { StatusBadge, ThemedButton } from "@/components/themed-ui";
import { DoseStatusOverflowSheet } from "@/features/doses/dose-status-overflow-sheet";
import { shouldShowDoseCorrectionOverflow } from "@/features/doses/dose-card-presentation.domain";
import { AnchoredMenuAnchor } from "@/components/anchored-action-menu.domain";
import { ContentFade, DoseListSkeleton, HomeSummarySkeleton } from "@/components/loading-primitives";
import { TabContentTransition } from "@/components/tab-content-transition";
import { useDelayedLoading } from "@/hooks/use-delayed-loading";
import { useUserPullRefresh } from "@/hooks/use-user-pull-refresh";
import { useDoseStore } from "@/state/dose.store";

const UPCOMING_STATUS_LABEL = "Upcoming";

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
  const statusMenuAnchorRefs = useRef<Record<string, View | null>>({});
  const pendingDoses = useMemo(() => visibleDoses.filter((dose) => dose.status === "pending"), [visibleDoses]);
  const takenDoses = useMemo(() => visibleDoses.filter((dose) => dose.status === "taken"), [visibleDoses]);
  const skippedDoses = useMemo(() => visibleDoses.filter((dose) => dose.status === "skipped"), [visibleDoses]);
  const missedDoses = useMemo(() => visibleDoses.filter((dose) => dose.status === "missed"), [visibleDoses]);
  const recordedCount = takenDoses.length + skippedDoses.length;
  const nextDose = pendingDoses[0] ?? null;
  const scheduleDoses = useMemo(() => visibleDoses.filter((dose) => dose.id !== nextDose?.id), [nextDose?.id, visibleDoses]);

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
    Alert.alert(
      "Skip this dose?",
      `Mark ${dose.medicationName} ${dose.medicationDosage} as skipped? You can review it in your intake history later.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Skip dose",
          style: "destructive",
          onPress: () => void recordSkipped(dose.id),
        },
      ],
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

  function renderDose({ item, featured = false }: { item: TodayDose; featured?: boolean }) {
    const isUpdating = updatingDoseId === item.id;
    const isPending = item.status === "pending";
    const presentation = getDosePresentationState(
      item.status,
      item.scheduledDate,
    );
    const isFutureDose = presentation.label === UPCOMING_STATUS_LABEL;
    const statusLabel = presentation.label;
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
      <View style={[styles.doseCard, featured && styles.featuredDose]}>
        <View style={styles.cardTopRow}>
          <Text style={styles.time}>{formatTime(item.scheduledTime)}</Text>
          <StatusBadge label={statusLabel} tone={isFutureDose && isPending ? "upcoming" : item.status} />
        </View>

        <Text style={styles.medicationName}>{item.medicationName}</Text>
        <Text style={styles.dosage}>{item.medicationDosage}</Text>

        {showsCorrectionOverflow ? (
          <View style={styles.finalizedStatusRow}>
            <Text style={[styles.statusDescription, styles.finalizedStatusDescription]}>{statusDescription}</Text>
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
            <ThemedButton label="Taken" tone="primary" loadingLabel="Saving..." loading={isUpdating} accessibilityLabel={`Mark ${item.medicationName} ${item.medicationDosage} as taken`} disabled={Boolean(updatingDoseId)} onPress={() => void recordTaken(item.id)} style={styles.flexAction} />
            <ThemedButton label="Skip" tone="outline" accessibilityLabel={`Mark ${item.medicationName} ${item.medicationDosage} as skipped`} disabled={Boolean(updatingDoseId)} onPress={() => confirmSkipDose(item)} style={styles.flexAction} />
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <TabContentTransition style={styles.container}><ScreenHeader variant="home" title="Home" greeting={getHomeGreeting(selectedProfile)} date={formatDate(todayDate)} /><View style={styles.container}>
      <FlatList
        data={scheduleDoses}
        keyExtractor={(item) => item.id}
        renderItem={renderDose}
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
          showFirstScopeSkeleton ? <ContentFade key="home-dose-skeleton" duration={motion.duration.skeletonCrossfade}><DoseListSkeleton /></ContentFade> : hasCurrentDoseContent && scheduleDoses.length === 0 && !nextDose && visibleDoses.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>No medications yet</Text>
              <Text style={styles.emptyText}>Add your first medication to start building your routine.</Text>
              <ThemedButton label="Add medication" onPress={() => router.push("/medications")} accessibilityLabel="Add medication" style={styles.emptyButton} />
            </View>
          ) : hasCurrentDoseContent && scheduleDoses.length === 0 && nextDose ? <Text style={styles.scheduleEnd}>No more medications scheduled for today.</Text> : null
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
  scheduleEnd: { paddingVertical: ui.spacing.md, color: colors.textSecondary, fontSize: 14 },
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
  dosage: { marginTop: 3, fontSize: 16, color: colors.textSecondary },
  statusDescription: { marginTop: 14, fontSize: 15, fontWeight: "600", color: colors.textSecondary },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: ui.spacing.xs, marginTop: ui.spacing.md },
  flexAction: { flex: 1 },
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
