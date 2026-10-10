import { useCallback } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";

import { ProfileAvatar } from "@/components/profile-avatar";
import { ScreenHeader } from "@/components/screen-header";
import { TabContentTransition } from "@/components/tab-content-transition";
import { ThemedButton } from "@/components/themed-ui";
import { useAppTheme } from "@/components/app-theme-provider";
import { ui } from "@/components/ui-tokens";
import { getProfileDisplayName } from "@/features/profiles/profile.domain";
import { toLocalDateString } from "@/features/doses/dose.service";
import { useDoseStore } from "@/state/dose.store";
import { useMedicationStore } from "@/state/medication.store";
import { useProfileStore } from "@/state/profile.store";

export default function ProfileHubScreen() {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const profiles = useProfileStore((state) => state.profiles);
  const profileId = useProfileStore((state) => state.selectedProfileId);
  const profile = profiles.find((item) => item.id === profileId) ?? null;
  const medicationProfileId = useMedicationStore((state) => state.profileId);
  const loadedMedicationProfileId = useMedicationStore((state) => state.loadedProfileId);
  const loadedMedicationFilter = useMedicationStore((state) => state.loadedFilter);
  const medications = useMedicationStore((state) => state.medications);
  const loadMedications = useMedicationStore((state) => state.loadMedications);
  const doseProfileId = useDoseStore((state) => state.profileId);
  const loadedDoseDate = useDoseStore((state) => state.loadedDate);
  const doses = useDoseStore((state) => state.doses);
  const loadDoses = useDoseStore((state) => state.loadDoses);

  useFocusEffect(useCallback(() => {
    if (profileId) {
      void loadMedications("active");
      void loadDoses(toLocalDateString());
    }
  }, [loadDoses, loadMedications, profileId]));

  const hasMedicationData = medicationProfileId === profileId
    && loadedMedicationProfileId === profileId
    && loadedMedicationFilter === "active";
  const hasDoseData = doseProfileId === profileId
    && loadedDoseDate === toLocalDateString();
  const profileDoses = hasDoseData ? doses : [];
  const remainingDoses = profileDoses.filter((dose) => dose.status === "pending").length;

  return <TabContentTransition style={styles.container}>
    <ScreenHeader title="Profile" />
    <ScrollView contentContainerStyle={styles.content}>
      {profile ? <>
        <View style={styles.identity}>
          <ProfileAvatar profile={profile} size={112} />
          <Text accessibilityRole="header" style={styles.name}>{getProfileDisplayName(profile)}</Text>
          <Text style={styles.relationship}>{profile.relationship === "Self" ? "Personal profile" : `${profile.relationship} profile`}</Text>
          <ThemedButton label="Edit profile" tone="outline" accessibilityLabel={`Edit ${getProfileDisplayName(profile)} profile`} onPress={() => router.push("/profiles")} style={styles.editButton} />
        </View>

        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>Personal details</Text>
          <DetailRow label="Name" value={getProfileDisplayName(profile)} />
          <DetailRow label="Relationship" value={profile.relationship} />
          {profile.dateOfBirth ? <DetailRow label="Date of birth" value={formatDate(profile.dateOfBirth)} /> : null}
        </View>

        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>Medication overview</Text>
          <DetailRow label="Active medications" value={hasMedicationData ? String(medications.length) : "Loading"} />
          <DetailRow label="Today's remaining doses" value={hasDoseData ? String(remainingDoses) : "Loading"} />
        </View>

        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>Profile tools</Text>
          <ThemedButton label="Medication reports" tone="outline" accessibilityLabel="Open medication reports" onPress={() => router.push("/report-export")} style={styles.toolButton} />
          <ThemedButton label="Manage profiles" tone="outline" accessibilityLabel="Manage medication profiles" onPress={() => router.push("/profiles")} style={styles.toolButton} />
        </View>
      </> : <View style={styles.empty}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>No active profile</Text>
        <Text style={styles.emptyText}>Choose or create a profile to view its medication overview.</Text>
        <ThemedButton label="Manage profiles" accessibilityLabel="Open profile management" onPress={() => router.push("/profiles")} style={styles.toolButton} />
      </View>}
    </ScrollView>
  </TabContentTransition>;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  return <View style={styles.detailRow}>
    <Text style={styles.detailLabel}>{label}</Text>
    <Text selectable style={styles.detailValue}>{value}</Text>
  </View>;
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

const createStyles = (colors: ReturnType<typeof useAppTheme>["colors"]) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, padding: ui.spacing.screen, paddingTop: ui.spacing.md, paddingBottom: 120, gap: ui.spacing.section },
  identity: { alignItems: "center", paddingVertical: ui.spacing.md, gap: ui.spacing.xs },
  name: { maxWidth: "100%", textAlign: "center", fontSize: 24, lineHeight: 30, fontWeight: "800", color: colors.textPrimary },
  relationship: { fontSize: 15, fontWeight: "600", color: colors.textSecondary },
  editButton: { minWidth: 160, marginTop: ui.spacing.xs },
  section: { padding: ui.spacing.card, borderWidth: 1, borderColor: colors.border, borderRadius: ui.radius.card, backgroundColor: colors.cardBackground },
  sectionTitle: { marginBottom: ui.spacing.xs, fontSize: 17, fontWeight: "800", color: colors.cardForeground },
  detailRow: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: ui.spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  detailLabel: { flex: 1, fontSize: 15, color: colors.textSecondary },
  detailValue: { flex: 1, fontSize: 15, fontWeight: "700", textAlign: "right", color: colors.textPrimary },
  toolButton: { marginTop: ui.spacing.xs },
  empty: { paddingVertical: ui.spacing.xl, gap: ui.spacing.xs },
  emptyText: { fontSize: 15, lineHeight: 22, color: colors.textSecondary },
});
