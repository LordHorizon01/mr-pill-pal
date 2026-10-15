import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import { ProfileBackHeader } from "@/components/app-back-header";
import { useAppTheme } from "@/components/app-theme-provider";
import { AppColorTokens, AppearancePreference, ui } from "@/components/ui-tokens";
import { getProfileGreetingName } from "@/features/profiles/profile.domain";
import { useAuthStore } from "@/state/auth.store";
import { useProfileStore } from "@/state/profile.store";
import { useSettingsStore } from "@/state/settings.store";
import { ThemedButton, ThemedChip } from "@/components/themed-ui";
import { TabContentTransition } from "@/components/tab-content-transition";

const appearanceOptions: { value: AppearancePreference; label: string }[] = [{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }];

export default function SettingsScreen() {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const version = Constants.expoConfig?.version ?? "1.0.0";
  const profiles = useProfileStore((state) => state.profiles);
  const selectedProfileId = useProfileStore((state) => state.selectedProfileId);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const appearancePreference = useSettingsStore((state) => state.appearancePreference);
  const setAppearancePreference = useSettingsStore((state) => state.setAppearancePreference);
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? null;
  const requestSwitchAccount = () => Alert.alert("Switch account?", "You'll return to sign in and can choose another account. Your saved medication data will remain associated with the appropriate account and profile.", [{ text: "Cancel", style: "cancel" }, { text: "Switch account", style: "destructive", onPress: () => void logout().catch(() => undefined) }]);

  return <TabContentTransition style={styles.screen}><ScrollView contentContainerStyle={styles.page}>
    <ProfileBackHeader title="Settings" onBack={() => router.replace("/(tabs)/profile" as never)} contentInset={ui.spacing.screen} />
    <Section title="Current profile" styles={styles}><View style={styles.currentProfile}><View style={styles.avatar}><Text style={styles.avatarText}>{(getProfileGreetingName(selectedProfile) ?? "?").slice(0, 1).toUpperCase()}</Text></View><View style={styles.copy}><Text style={styles.cardTitle}>{getProfileGreetingName(selectedProfile) ?? "Choose a profile"}</Text><Text style={styles.description}>{selectedProfile?.relationship ?? "No active profile"}</Text></View></View><Action label="Switch profile" onPress={() => router.push("/profiles" as never)} styles={styles} /></Section>
    <Section title="Account" styles={styles}><SettingRow title="Email" description={user?.email?.trim() || "No email address available"} value={user?.emailVerified ? "Verified" : "Not verified"} styles={styles} /><View style={styles.divider} /><Action label="Manage profiles" onPress={() => router.push("/profiles" as never)} styles={styles} /><Action label="Switch account" onPress={requestSwitchAccount} styles={styles} danger /></Section>
    <Text style={[styles.sectionTitle, styles.standaloneSectionTitle]}>Reminders & Notifications</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Open reminders and notification settings" onPress={() => router.push("/reminder-settings" as never)} style={styles.linkCard}><Text style={styles.cardTitle}>Reminder settings</Text></Pressable>
    <Section title="Display" styles={styles}><View style={styles.appearanceOptions}>{appearanceOptions.map((option) => <ThemedChip key={option.value} label={option.label} selected={appearancePreference === option.value} onPress={() => void setAppearancePreference(option.value).catch(() => undefined)} accessibilityLabel={`Use ${option.label} appearance${appearancePreference === option.value ? ", selected" : ""}`} />)}</View></Section>
    <Section title="Privacy & Data" styles={styles}><SettingRow title="Storage and sync" value="Local only" styles={styles} /></Section>
    <Section title="About & Support" styles={styles}><SettingRow title="Mr. Pill Pal" description="Android-first medication management application." value={`Development build ${version}`} styles={styles} /><View style={styles.divider} /><Text style={styles.safety}>Mr. Pill Pal helps track medication schedules and intake. It does not provide medical or dosage advice.</Text></Section>
    <Pressable accessibilityRole="button" accessibilityLabel="Sign out" onPress={() => void logout().catch(() => undefined)} style={({ pressed }) => [styles.signOut, pressed && styles.signOutPressed]}>
      <Text style={styles.signOutText}>Sign out</Text>
    </Pressable>
    <View style={styles.accountLifecycle}>
      <Text accessibilityRole="header" style={styles.accountLifecycleTitle}>Account lifecycle</Text>
      <Text style={styles.accountLifecycleNote}>DEFERRED - BACKEND APPROVAL REQUIRED. These actions are unavailable until a secure server lifecycle can preserve and safely remove account data.</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Temporarily deactivate account - unavailable until backend approval" accessibilityHint="Account deactivation is not available in this version." accessibilityState={{ disabled: true }} disabled style={[styles.accountLifecycleButton, styles.accountDeactivationButton]}>
        <Text style={[styles.accountLifecycleButtonText, styles.accountDeactivationText]}>Temporarily deactivate account</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Permanently delete account - unavailable until backend approval" accessibilityHint="Permanent account deletion is deferred until secure server-side cleanup is approved." accessibilityState={{ disabled: true }} disabled style={[styles.accountLifecycleButton, styles.accountDeletionButton]}>
        <Text style={[styles.accountLifecycleButtonText, styles.accountDeletionText]}>Permanently delete account</Text>
      </Pressable>
    </View>
  </ScrollView></TabContentTransition>;
}

function Section({ title, children, styles }: { title: string; children: React.ReactNode; styles: ReturnType<typeof createStyles> }) { return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text><View style={styles.card}>{children}</View></View>; }
function SettingRow({ title, description, value, styles }: { title: string; description?: string; value: string; styles: ReturnType<typeof createStyles> }) { return <View><View style={styles.row}><Text style={styles.cardTitle}>{title}</Text><Text style={styles.value}>{value}</Text></View>{description ? <Text style={styles.description}>{description}</Text> : null}</View>; }
function Action({ label, onPress, styles, danger }: { label: string; onPress: () => void; styles: ReturnType<typeof createStyles>; danger?: boolean }) { return <ThemedButton label={label} tone={danger ? "danger" : "outline"} size="compact" accessibilityLabel={label} onPress={onPress} textStyle={{ fontSize: 15, fontWeight: "600" }} style={styles.action} />; }

const createStyles = (colors: AppColorTokens) => StyleSheet.create({
  screen: { flex: 1 },
  page: { padding: ui.spacing.screen, paddingTop: 0, paddingBottom: 120 },
  section: { marginTop: 12 },
  sectionTitle: { marginBottom: 8, fontSize: 15, lineHeight: 20, fontWeight: "700", color: colors.textPrimary },
  standaloneSectionTitle: { marginTop: 12 },
  card: { gap: 10, padding: 13, borderRadius: ui.radius.card, borderWidth: 1, borderColor: colors.border, borderTopColor: colors.borderStrong, backgroundColor: colors.cardBackground },
  linkCard: { minHeight: 48, justifyContent: "center", paddingHorizontal: 13, paddingVertical: 10, borderRadius: ui.radius.card, borderWidth: 1, borderColor: colors.border, borderTopColor: colors.borderStrong, backgroundColor: colors.cardBackground },
  copy: { flex: 1, flexShrink: 1 },
  currentProfile: { flexDirection: "row", alignItems: "center", gap: 8 },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: colors.badgePendingBackground },
  avatarText: { color: colors.badgePendingForeground, fontSize: 18, fontWeight: "800" },
  row: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "baseline", gap: 8 },
  cardTitle: { fontSize: 16, lineHeight: 20, fontWeight: "700", color: colors.cardForeground },
  value: { fontSize: 14, fontWeight: "700", color: colors.primary },
  description: { marginTop: 4, fontSize: 14, lineHeight: 19, color: colors.textSecondary },
  helper: { fontSize: 13, lineHeight: 18, color: colors.textMuted },
  safety: { fontSize: 14, lineHeight: 20, fontWeight: "600", color: colors.cardForeground },
  divider: { height: 1, backgroundColor: colors.divider },
  action: { minHeight: 48, alignItems: "center", justifyContent: "center", paddingHorizontal: 12, borderRadius: ui.radius.button, borderWidth: 1, borderColor: colors.outlineBorder, backgroundColor: colors.inputBackground },
  actionText: { fontSize: 15, fontWeight: "600", color: colors.outlineForeground },
  actionDanger: { borderColor: colors.danger },
  actionDangerText: { color: colors.dangerForeground },
  appearanceOptions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  signOut: { alignSelf: "center", minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: 12, paddingHorizontal: 19, paddingVertical: 12, borderRadius: 11, borderWidth: 1, borderColor: colors.danger, backgroundColor: colors.dangerBackground },
  signOutPressed: { opacity: 0.82, backgroundColor: colors.dangerSurface },
  signOutText: { fontSize: 15, lineHeight: 20, fontWeight: "700", color: colors.dangerForeground },
  accountLifecycle: { alignItems: "center", gap: 9, marginTop: 16, paddingBottom: 12 },
  accountLifecycleTitle: { alignSelf: "stretch", fontSize: 15, lineHeight: 20, fontWeight: "700", color: colors.textPrimary },
  accountLifecycleNote: { alignSelf: "stretch", fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  accountLifecycleButton: { minHeight: 48, maxWidth: "100%", alignSelf: "center", alignItems: "center", justifyContent: "center", paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderRadius: 10, opacity: 0.62 },
  accountDeactivationButton: { borderColor: colors.warning, backgroundColor: colors.warningSurface },
  accountDeletionButton: { borderColor: colors.danger, backgroundColor: colors.dangerBackground },
  accountLifecycleButtonText: { flexShrink: 1, textAlign: "center", fontSize: 14, lineHeight: 19, fontWeight: "600" },
  accountDeactivationText: { color: colors.warning },
  accountDeletionText: { color: colors.dangerForeground },
});
