import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import { ScreenHeader } from "@/components/screen-header";
import { useAppTheme } from "@/components/app-theme-provider";
import { AppColorTokens, AppearancePreference, ui } from "@/components/ui-tokens";
import { getProfileGreetingName } from "@/features/profiles/profile.domain";
import { useAuthStore } from "@/state/auth.store";
import { useProfileStore } from "@/state/profile.store";
import { useSettingsStore } from "@/state/settings.store";
import { ThemedChip } from "@/components/themed-ui";

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

  return <ScrollView contentContainerStyle={styles.page}>
    <ScreenHeader title="Settings" />
    <Text style={styles.subtitle}>Clear controls for your account, reminders, privacy, and appearance.</Text>
    <Section title="Current profile" styles={styles}><View style={styles.currentProfile}><View style={styles.avatar}><Text style={styles.avatarText}>{(getProfileGreetingName(selectedProfile) ?? "?").slice(0, 1).toUpperCase()}</Text></View><View style={styles.copy}><Text style={styles.cardTitle}>{getProfileGreetingName(selectedProfile) ?? "Choose a profile"}</Text><Text style={styles.description}>{selectedProfile?.relationship ?? "No active profile"}</Text></View></View><Action label="Switch profile" onPress={() => router.push("/profiles" as never)} styles={styles} /></Section>
    <Section title="Account" styles={styles}><SettingRow title="Email" description={user?.email?.trim() || "No email address available"} value={user?.emailVerified ? "Verified" : "Not verified"} styles={styles} /><View style={styles.divider} /><Action label="Manage profiles" onPress={() => router.push("/profiles" as never)} styles={styles} /><Action label="Switch account" onPress={requestSwitchAccount} styles={styles} danger /></Section>
    <Text style={styles.sectionTitle}>Reminders & Notifications</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Open reminders and notification settings" onPress={() => router.push("/reminder-settings" as never)} style={styles.linkCard}><View style={styles.copy}><Text style={styles.cardTitle}>Reminder settings</Text><Text style={styles.description}>Check reminder health, send a test notification, and manage lock-screen privacy.</Text></View><Text accessibilityElementsHidden style={styles.chevron}>›</Text></Pressable>
    <Section title="Appearance" styles={styles}><Text style={styles.description}>Choose how Mr. Pill Pal looks on this device.</Text><View style={styles.appearanceOptions}>{appearanceOptions.map((option) => <ThemedChip key={option.value} label={option.label} selected={appearancePreference === option.value} onPress={() => void setAppearancePreference(option.value)} accessibilityLabel={`Use ${option.label} appearance${appearancePreference === option.value ? ", selected" : ""}`} />)}</View><Text style={styles.helper}>Text remains compatible with your device text-size setting.</Text></Section>
    <Section title="Privacy & Data" styles={styles}><SettingRow title="Storage and sync" description="Medication and intake data is currently stored locally on this device." value="Local only" styles={styles} /><Text style={styles.helper}>Cloud sync and data export are not enabled in this development build.</Text></Section>
    <Section title="About & Support" styles={styles}><SettingRow title="Mr. Pill Pal" description="Android-first medication management application." value={`Development build ${version}`} styles={styles} /><View style={styles.divider} /><Text style={styles.safety}>Mr. Pill Pal helps track medication schedules and intake. It does not provide medical or dosage advice.</Text></Section>
    <Pressable accessibilityRole="button" accessibilityLabel="Sign out" onPress={() => void logout().catch(() => undefined)} style={styles.signOut}><Text style={styles.signOutText}>Sign out</Text></Pressable>
  </ScrollView>;
}

function Section({ title, children, styles }: { title: string; children: React.ReactNode; styles: ReturnType<typeof createStyles> }) { return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text><View style={styles.card}>{children}</View></View>; }
function SettingRow({ title, description, value, styles }: { title: string; description: string; value: string; styles: ReturnType<typeof createStyles> }) { return <View><View style={styles.row}><Text style={styles.cardTitle}>{title}</Text><Text style={styles.value}>{value}</Text></View><Text style={styles.description}>{description}</Text></View>; }
function Action({ label, onPress, styles, danger }: { label: string; onPress: () => void; styles: ReturnType<typeof createStyles>; danger?: boolean }) { return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[styles.action, danger && styles.actionDanger]}><Text style={[styles.actionText, danger && styles.actionDangerText]}>{label}</Text></Pressable>; }

const createStyles = (colors: AppColorTokens) => StyleSheet.create({
  page: { padding: ui.spacing.screen, paddingTop: 14, paddingBottom: 120, backgroundColor: colors.background }, subtitle: { marginTop: 14, fontSize: 16, lineHeight: 22, color: colors.textSecondary }, section: { marginTop: ui.spacing.section }, sectionTitle: { marginBottom: 9, fontSize: 16, fontWeight: "700", color: colors.textPrimary }, card: { gap: 14, padding: ui.spacing.card, borderRadius: ui.radius.card, borderWidth: 1, borderColor: colors.border, borderTopColor: colors.borderStrong, backgroundColor: colors.cardBackground }, linkCard: { minHeight: 88, flexDirection: "row", alignItems: "center", gap: 12, padding: ui.spacing.card, borderRadius: ui.radius.card, borderWidth: 1, borderColor: colors.border, borderTopColor: colors.borderStrong, backgroundColor: colors.cardBackground }, copy: { flex: 1, flexShrink: 1 }, currentProfile: { flexDirection: "row", alignItems: "center", gap: 12 }, avatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: colors.badgePendingBackground }, avatarText: { color: colors.badgePendingForeground, fontSize: 18, fontWeight: "800" }, row: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "baseline", gap: 8 }, cardTitle: { fontSize: 17, fontWeight: "700", color: colors.cardForeground }, value: { fontSize: 14, fontWeight: "700", color: colors.primary }, description: { marginTop: 5, fontSize: 15, lineHeight: 21, color: colors.textSecondary }, helper: { fontSize: 14, lineHeight: 20, color: colors.textMuted }, safety: { fontSize: 15, lineHeight: 22, fontWeight: "600", color: colors.cardForeground }, divider: { height: 1, backgroundColor: colors.divider }, chevron: { fontSize: 26, color: colors.primary }, action: { minHeight: ui.touch.minimum, alignItems: "center", justifyContent: "center", paddingHorizontal: 14, borderRadius: ui.radius.button, borderWidth: 1, borderColor: colors.outlineBorder, backgroundColor: colors.inputBackground }, actionText: { fontSize: 16, fontWeight: "700", color: colors.outlineForeground }, actionDanger: { borderColor: colors.danger }, actionDangerText: { color: colors.dangerForeground }, appearanceOptions: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, signOut: { minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: ui.spacing.section, borderRadius: ui.radius.button, borderWidth: 1, borderColor: colors.danger }, signOutText: { fontSize: 16, fontWeight: "800", color: colors.dangerForeground },
});
