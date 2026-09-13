import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import {
  ActivityIndicator,
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
  addDaysToLocalDate,
  toLocalDateString,
} from "@/features/doses/dose.service";
import { getDosePresentationState } from "@/features/doses/dose.domain";
import { TodayDose } from "@/features/doses/dose.types";
import { useDoses } from "@/hooks/useDoses";
import { AppColorTokens, ui } from "@/components/ui-tokens";
import { ScreenHeader } from "@/components/screen-header";
import { useAppTheme } from "@/components/app-theme-provider";
import { useProfileStore } from "@/state/profile.store";
import { getHomeGreeting } from "@/features/profiles/profile.domain";
import { StatusBadge, ThemedButton } from "@/components/themed-ui";

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
  const {
    selectedDate,
    doses,
    isLoading,
    updatingDoseId,
    error,
    loadDoses,
    recordTaken,
    recordSkipped,
    clearError,
  } = useDoses();
  const [showTaken, setShowTaken] = useState(false);
  const [showSkipped, setShowSkipped] = useState(false);
  const [showMissed, setShowMissed] = useState(false);
  const pendingDoses = useMemo(() => doses.filter((dose) => dose.status === "pending"), [doses]);
  const takenDoses = useMemo(() => doses.filter((dose) => dose.status === "taken"), [doses]);
  const skippedDoses = useMemo(() => doses.filter((dose) => dose.status === "skipped"), [doses]);
  const missedDoses = useMemo(() => doses.filter((dose) => dose.status === "missed"), [doses]);
  const recordedCount = takenDoses.length + skippedDoses.length;

  const refreshDoses = useCallback(() => {
    void loadDoses();
  }, [loadDoses]);

  useFocusEffect(
    useCallback(() => {
      refreshDoses();
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

  function changeDate(days: number) {
    void loadDoses(addDaysToLocalDate(selectedDate, days));
  }

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

  function renderDose({ item }: { item: TodayDose }) {
    const isUpdating = updatingDoseId === item.id;
    const isPending = item.status === "pending";
    const presentation = getDosePresentationState(
      item.status,
      item.scheduledDate,
    );
    const isFutureDose = presentation.label === UPCOMING_STATUS_LABEL;
    const statusLabel = presentation.label;

    return (
      <View
        accessible
        accessibilityLabel={`${item.medicationName}, ${item.medicationDosage}, scheduled for ${formatDate(item.scheduledDate)} at ${formatTime(item.scheduledTime)}, ${statusLabel}`}
        style={styles.doseCard}
      >
        <View style={styles.cardTopRow}>
          <Text style={styles.time}>{formatTime(item.scheduledTime)}</Text>
          <StatusBadge label={statusLabel} tone={isFutureDose && isPending ? "upcoming" : item.status} />
        </View>

        <Text style={styles.medicationName}>{item.medicationName}</Text>
        <Text style={styles.dosage}>{item.medicationDosage}</Text>

        <Text style={styles.statusDescription}>
          {isFutureDose && isPending
            ? `Upcoming - scheduled for ${formatDate(item.scheduledDate)}`
            : item.status === "taken" && item.takenAt
              ? `Taken at ${formatTakenAt(item.takenAt)}`
              : item.status === "skipped"
                ? "Skipped"
                : item.status === "missed"
                  ? "Missed"
                  : "Pending - not yet recorded"}
        </Text>

        {presentation.canRecord ? (
          <View style={styles.actionRow}>
            <ThemedButton label={isUpdating ? "Saving..." : "Taken"} loading={isUpdating} accessibilityLabel={`Mark ${item.medicationName} ${item.medicationDosage} as taken`} disabled={Boolean(updatingDoseId)} onPress={() => void recordTaken(item.id)} style={styles.flexAction} />
            <ThemedButton label="Skip" tone="outline" accessibilityLabel={`Mark ${item.medicationName} ${item.medicationDosage} as skipped`} disabled={Boolean(updatingDoseId)} onPress={() => confirmSkipDose(item)} style={styles.flexAction} />
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={pendingDoses}
        keyExtractor={(item) => item.id}
        renderItem={renderDose}
        contentContainerStyle={styles.listContent}
        refreshing={isLoading}
        onRefresh={refreshDoses}
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <ScreenHeader title="Mr. Pill Pal" />
              <Text style={styles.greeting}>{getHomeGreeting(selectedProfile)}</Text>
              <Text style={styles.homeDate}>{formatDate(selectedDate)}</Text>
              <Text style={styles.offlineHint}>Your medication routine works without internet</Text>
            </View>

            <View style={styles.dateControls}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Show previous day"
                onPress={() => changeDate(-1)}
                style={styles.dateButton}
              >
                <Text style={styles.dateButtonText}>Previous</Text>
              </Pressable>

              <View style={styles.dateCenter}>
                <Text style={styles.dateLabel}>{formatDate(selectedDate)}</Text>
                {selectedDate !== toLocalDateString() ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void loadDoses(toLocalDateString())}
                  >
                    <Text style={styles.todayLink}>Back to today</Text>
                  </Pressable>
                ) : null}
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Show next day"
                onPress={() => changeDate(1)}
                style={styles.dateButton}
              >
                <Text style={styles.dateButtonText}>Next</Text>
              </Pressable>
            </View>

            <View style={styles.progressCard}>
              <Text style={styles.progressTitle}>Daily routine</Text>
              <Text style={styles.progressText}>{recordedCount} of {doses.length} doses recorded</Text>
              <View style={styles.summaryCounts}>
                <Text style={styles.summaryText}>Taken {takenDoses.length}</Text>
                <Text style={styles.summaryText}>Skipped {skippedDoses.length}</Text>
                <Text style={styles.summaryText}>Pending {pendingDoses.length}</Text>
                {missedDoses.length ? <Text style={styles.summaryText}>Missed {missedDoses.length}</Text> : null}
              </View>
              {pendingDoses[0] ? <Text style={styles.nextText}>Next: {pendingDoses[0].medicationName} at {formatTime(pendingDoses[0].scheduledTime)}</Text> : null}
            </View>
            <View style={styles.quickActions}>
              <Pressable accessibilityRole="button" accessibilityLabel="Add medication" onPress={() => router.push("/medications")} style={styles.quickButton}><Text style={styles.quickButtonText}>Add medication</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="View medication history" onPress={() => router.push("/history" as never)} style={styles.quickButton}><Text style={styles.quickButtonText}>View history</Text></Pressable>
            </View>
            <Text style={styles.sectionTitle}>{selectedDate === toLocalDateString() ? "To take" : "Planned doses"}</Text>

            {error ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Dismiss dose error"
                onPress={clearError}
                style={styles.errorBox}
              >
                <Text style={styles.errorText}>{error}</Text>
                <Text style={styles.errorHint}>Tap to dismiss</Text>
              </Pressable>
            ) : null}

            {isLoading && doses.length === 0 ? (
              <ActivityIndicator size="large" style={styles.loader} />
            ) : null}
          </>
        }
        ListEmptyComponent={
          !isLoading && pendingDoses.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>{doses.length ? "No doses waiting" : "No doses scheduled for today"}</Text>
              <Text style={styles.emptyText}>{doses.length ? "Recorded doses are available in their sections below." : "Add your first medication to get started."}</Text>
              <ThemedButton label="Manage medications" onPress={() => router.push("/medications")} accessibilityLabel="Manage medications" style={styles.emptyButton} />
            </View>
          ) : null
        }
        ListFooterComponent={<View style={styles.completedSection}>
          <FinalizedSection label="Taken today" doses={takenDoses} expanded={showTaken} onToggle={() => setShowTaken((value) => !value)} renderDose={renderDose} />
          <FinalizedSection label="Skipped today" doses={skippedDoses} expanded={showSkipped} onToggle={() => setShowSkipped((value) => !value)} renderDose={renderDose} />
          <FinalizedSection label="Missed today" doses={missedDoses} expanded={showMissed} onToggle={() => setShowMissed((value) => !value)} renderDose={renderDose} />
        </View>}
      />
    </View>
  );
}

function FinalizedSection({ label, doses, expanded, onToggle, renderDose }: { label: string; doses: TodayDose[]; expanded: boolean; onToggle: () => void; renderDose: ({ item }: { item: TodayDose }) => ReactElement }) {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  if (!doses.length) return null;
  return <View style={styles.finalizedGroup}><Pressable accessibilityRole="button" accessibilityLabel={`${expanded ? "Collapse" : "Expand"} ${label}`} accessibilityState={{ expanded }} onPress={onToggle} style={styles.completedToggle}><Text style={styles.sectionTitle}>{label} ({doses.length})</Text><Text style={styles.todayLink}>{expanded ? "Hide" : "Show"}</Text></Pressable>{expanded ? doses.map((dose) => <View key={dose.id}>{renderDose({ item: dose })}</View>) : null}</View>;
}

const createStyles = (colors: AppColorTokens) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: ui.spacing.screen, paddingTop: 20, paddingBottom: 110 },
  header: { gap: 8 },
  greeting: { marginTop: 10, fontSize: 21, lineHeight: 27, fontWeight: "700", color: colors.textPrimary },
  homeDate: { fontSize: 17, fontWeight: "700", color: colors.textSecondary },
  offlineHint: { fontSize: 14, lineHeight: 20, color: colors.textMuted },
  dateControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 24,
    marginBottom: 20,
    gap: 8,
  },
  dateCenter: { flex: 1, minWidth: 0, alignItems: "center" },
  dateLabel: { fontSize: 17, fontWeight: "700", textAlign: "center", color: colors.textPrimary },
  todayLink: { marginTop: 4, color: colors.outlineForeground, fontSize: 14, fontWeight: "600" },
  dateButton: {
    minHeight: ui.touch.minimum,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: 9,
    backgroundColor: colors.secondaryBackground,
  },
  dateButtonText: { fontWeight: "700", color: colors.secondaryForeground },
  progressCard: { padding: ui.spacing.card, marginBottom: 18, borderRadius: ui.radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.secondaryBackground },
  progressTitle: { fontSize: 17, fontWeight: "700", color: colors.secondaryForeground },
  progressText: { marginTop: 5, fontSize: 16, color: colors.secondaryForeground },
  nextText: { marginTop: 8, fontSize: 15, fontWeight: "600", color: colors.secondaryForeground },
  summaryCounts: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
  summaryText: { color: colors.secondaryForeground, fontSize: 14, fontWeight: "600" },
  quickActions: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
  quickButton: { flexGrow: 1, minHeight: ui.touch.minimum, alignItems: "center", justifyContent: "center", paddingHorizontal: 14, borderWidth: 1, borderColor: colors.outlineBorder, borderRadius: ui.radius.button, backgroundColor: colors.inputBackground },
  quickButtonText: { color: colors.outlineForeground, fontWeight: "700" },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: colors.textPrimary },
  completedSection: { marginTop: 20 },
  finalizedGroup: { marginBottom: 8 },
  completedToggle: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  errorBox: {
    marginBottom: 16,
    padding: 14,
    borderRadius: 10,
    backgroundColor: colors.dangerBackground,
  },
  errorText: { fontSize: 15, fontWeight: "600", color: colors.dangerForeground },
  errorHint: { marginTop: 4, fontSize: 13, color: colors.textMuted },
  loader: { marginVertical: 32 },
  doseCard: {
    marginBottom: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.cardBackground,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  time: { fontSize: 19, fontWeight: "700", color: colors.cardForeground },
  medicationName: { marginTop: 14, fontSize: 19, fontWeight: "700", color: colors.cardForeground },
  dosage: { marginTop: 3, fontSize: 16, color: colors.textSecondary },
  statusDescription: { marginTop: 14, fontSize: 15, fontWeight: "600", color: colors.textSecondary },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 16 },
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
