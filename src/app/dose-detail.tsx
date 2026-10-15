import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getHistoryDetail } from "@/features/history/history.service";
import { HistoryDose } from "@/features/history/history.types";
import { AppColorTokens, ui } from "@/components/ui-tokens";
import { useAppTheme } from "@/components/app-theme-provider";
import { useProfileStore } from "@/state/profile.store";
import { ThemedButton } from "@/components/themed-ui";

export default function DoseDetailScreen() {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const profileId = useProfileStore((state) => state.selectedProfileId);
  const [dose, setDose] = useState<HistoryDose | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestRevision = useRef(0);
  const loadDose = useCallback(() => {
    const currentRequest = ++requestRevision.current;
    if (!id || !profileId) { setDose(null); return () => undefined; }
    let current = true;
    setDose(null); setError(null);
    void getHistoryDetail(profileId, id).then((result) => {
      if (!current || requestRevision.current !== currentRequest) return;
      if (result) setDose(result);
      else setError("This dose record is no longer available.");
    }).catch(() => {
      if (current && requestRevision.current === currentRequest) setError("Dose details couldn't be loaded. Please try again.");
    });
    return () => { current = false; };
  }, [id, profileId]);
  useEffect(() => loadDose(), [loadDose]);

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, ui.spacing.screen) + ui.spacing.md }]}
      contentInsetAdjustmentBehavior="automatic"
    >
      {!dose ? (
        error ? (
          <View style={styles.error}>
            <Text style={styles.errorText}>{error}</Text>
            <ThemedButton label="Try again" size="compact" tone="outline" accessibilityLabel="Try loading dose details again" onPress={() => void loadDose()} />
          </View>
        ) : <ActivityIndicator size="large" style={styles.loader} />
      ) : (
        <>
          <Text selectable style={styles.name}>{dose.medicationName}</Text>
          <Text selectable style={styles.dosage}>{dose.medicationDosage}</Text>
          <View style={styles.card}>
            <Detail label="Scheduled date" value={dose.scheduledDate} first />
            <Detail label="Scheduled time" value={dose.scheduledTime} />
            <Detail label="Status" value={dose.status[0].toUpperCase() + dose.status.slice(1)} last={!dose.takenAt && !dose.notes} />
            {dose.takenAt ? <Detail label="Recorded" value={new Date(dose.takenAt).toLocaleString()} last={!dose.notes} /> : null}
            {dose.notes ? <Detail label="Notes" value={dose.notes} last /> : null}
          </View>
        </>
      )}
    </ScrollView>
  );
}

function Detail({ label, value, first = false, last = false }: { label: string; value: string; first?: boolean; last?: boolean }) {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  return (
    <View style={[styles.detail, first && styles.firstDetail, last && styles.lastDetail]}>
      <Text style={styles.label}>{label}</Text>
      <Text selectable style={styles.value}>{value}</Text>
    </View>
  );
}

const createStyles = (colors: AppColorTokens) => StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, paddingTop: 10, paddingHorizontal: 18 },
  loader: { marginTop: 48 },
  error: { marginTop: 20, padding: ui.spacing.card, borderRadius: ui.radius.card, backgroundColor: colors.dangerBackground },
  errorText: { marginBottom: 12, fontWeight: "700", color: colors.dangerForeground },
  name: { fontSize: 21, lineHeight: 28, fontWeight: "700", color: colors.textPrimary },
  dosage: { marginTop: 3, fontSize: 15, lineHeight: 21, fontWeight: "500", color: colors.textSecondary },
  card: { marginTop: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: colors.border, borderTopColor: colors.borderStrong, borderRadius: 14, backgroundColor: colors.cardBackground },
  detail: { paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.divider },
  firstDetail: { paddingTop: 0 },
  lastDetail: { paddingBottom: 0, borderBottomWidth: 0 },
  label: { fontSize: 12, lineHeight: 16, fontWeight: "600", color: colors.textSecondary },
  value: { marginTop: 3, fontSize: 15.5, lineHeight: 22, fontWeight: "500", color: colors.cardForeground },
});
