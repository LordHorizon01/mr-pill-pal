import { createContext, ReactNode, useContext, useMemo, useRef, useState } from "react";
import { Animated, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { router, usePathname } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { SymbolView } from "expo-symbols";
import { useAppTheme } from "@/components/app-theme-provider";
import { AppColorTokens, ui } from "@/components/ui-tokens";
import { getProfileGreetingName } from "@/features/profiles/profile.domain";
import { Profile } from "@/features/profiles/profile.types";
import { useProfileStore } from "@/state/profile.store";

type DrawerContextValue = { openDrawer: () => void; closeDrawer: () => void };
type DrawerSymbol = "home" | "medication" | "history" | "insights" | "settings";
type DrawerItem = { label: string; route: string; symbol: DrawerSymbol };
const DrawerContext = createContext<DrawerContextValue | null>(null);
const destinations: readonly DrawerItem[] = [
  { label: "Home", route: "/", symbol: "home" }, { label: "Medications", route: "/medications", symbol: "medication" },
  { label: "History", route: "/history", symbol: "history" }, { label: "Insights", route: "/insights", symbol: "insights" },
];

export function AppDrawerProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [showProfilePicker, setShowProfilePicker] = useState(false);
  const { width } = useWindowDimensions();
  const drawerWidth = Math.min(width * 0.84, 340);
  const translateX = useRef(new Animated.Value(-340)).current;
  const pathname = usePathname();
  const { colors } = useAppTheme();
  const profiles = useProfileStore((state) => state.profiles);
  const selectedProfileId = useProfileStore((state) => state.selectedProfileId);
  const selectProfile = useProfileStore((state) => state.selectProfile);
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? null;
  const styles = createStyles(colors);
  const runAnimation = (toValue: number, done?: () => void) => Animated.timing(translateX, { toValue, duration: 230, useNativeDriver: true }).start(({ finished }) => { if (finished) done?.(); });
  const openDrawer = () => { setShowProfilePicker(false); translateX.setValue(-drawerWidth); setVisible(true); requestAnimationFrame(() => runAnimation(0)); };
  const closeDrawer = () => runAnimation(-drawerWidth, () => { setShowProfilePicker(false); setVisible(false); });
  const value = useMemo(() => ({ openDrawer, closeDrawer }), [drawerWidth]);
  function goTo(route: string) { closeDrawer(); router.replace(route as never); }
  const isActive = (route: string) => pathname === route || (route === "/" && pathname === "/index");
  async function switchProfile(profile: Profile) { await selectProfile(profile.id); closeDrawer(); router.replace("/" as never); }

  return <DrawerContext.Provider value={value}>{children}<Modal transparent visible={visible} animationType="none" onRequestClose={closeDrawer} statusBarTranslucent>
    <View style={styles.overlay}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close navigation menu" onPress={closeDrawer} style={StyleSheet.absoluteFill} />
      <Animated.View accessibilityViewIsModal style={[styles.panel, { width: drawerWidth, transform: [{ translateX }] }]}>
        <SafeAreaView edges={["top", "bottom"]} style={styles.safePanel}>
          <View style={styles.brand}><Text style={styles.brandTitle}>Mr. Pill Pal</Text><Text style={styles.brandText}>Medication routine</Text></View>
          <Text style={styles.profileLabel}>CURRENT PROFILE</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Switch profile" onPress={() => setShowProfilePicker((value) => !value)} style={styles.profileRow}>
            <Avatar profile={selectedProfile} colors={colors} />
            <View style={styles.profileCopy}><Text numberOfLines={1} style={styles.profileName}>{getProfileGreetingName(selectedProfile) ?? "Choose profile"}</Text><Text style={styles.profileRelationship}>{selectedProfile?.relationship ?? ""}</Text></View>
            <Text accessibilityElementsHidden style={styles.profileChevron}>{showProfilePicker ? "▲" : "▼"}</Text>
          </Pressable>
          {showProfilePicker ? <View style={styles.profilePicker}><Text style={styles.switchTitle}>Switch profile</Text>{profiles.filter((profile) => profile.isActive).map((profile) => <Pressable key={profile.id} accessibilityRole="button" accessibilityLabel={`Switch to ${getProfileGreetingName(profile) ?? profile.fullName}`} accessibilityState={{ selected: profile.id === selectedProfileId }} onPress={() => void switchProfile(profile)} style={[styles.profileOption, profile.id === selectedProfileId && styles.profileOptionSelected]}><View style={styles.profileCopy}><Text style={styles.profileName}>{getProfileGreetingName(profile) ?? profile.fullName}</Text><Text style={styles.profileRelationship}>{profile.relationship}</Text></View><Text style={styles.selectedMark}>{profile.id === selectedProfileId ? "✓" : ""}</Text></Pressable>)}</View> : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Add profile" onPress={() => { closeDrawer(); router.push({ pathname: "/profiles", params: { mode: "add" } }); }} style={styles.addProfile}><Text style={styles.addProfileText}>+ Add profile</Text></Pressable>
          <View style={styles.links}>{destinations.map((item) => <DrawerLink key={item.route} item={item} active={isActive(item.route)} onPress={() => goTo(item.route)} colors={colors} />)}</View>
          <DrawerLink item={{ label: "Settings", route: "/settings", symbol: "settings" }} active={isActive("/settings")} onPress={() => goTo("/settings")} bottom colors={colors} />
        </SafeAreaView>
      </Animated.View>
    </View>
  </Modal></DrawerContext.Provider>;
}

function Avatar({ profile, colors }: { profile: Profile | null; colors: AppColorTokens }) { const initial = (getProfileGreetingName(profile) ?? "?").slice(0, 1).toUpperCase(); return <View accessibilityElementsHidden style={[avatarStyles.circle, { backgroundColor: colors.badgePendingBackground }]}><Text style={[avatarStyles.text, { color: colors.badgePendingForeground }]}>{initial}</Text></View>; }
const avatarStyles = StyleSheet.create({ circle: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" }, text: { fontSize: 17, fontWeight: "800" } });
function DrawerLink({ item, active, onPress, bottom, colors }: { item: DrawerItem; active: boolean; onPress: () => void; bottom?: boolean; colors: AppColorTokens }) { const styles = createStyles(colors); return <Pressable accessibilityRole="button" accessibilityLabel={`Open ${item.label}${active ? ", current screen" : ""}`} accessibilityState={{ selected: active }} onPress={onPress} style={[styles.link, bottom && styles.bottomLink, active && styles.activeLink]}><SymbolView name={{ ios: item.symbol === "settings" ? "gearshape" : "house", android: item.symbol, web: item.symbol }} size={20} tintColor={active ? colors.secondaryForeground : colors.textMuted} /><Text style={[styles.linkText, active && styles.activeLinkText]}>{item.label}</Text>{active ? <Text style={styles.currentText}>Current</Text> : null}</Pressable>; }
export function useAppDrawer(): DrawerContextValue { const value = useContext(DrawerContext); if (!value) throw new Error("useAppDrawer must be used inside AppDrawerProvider."); return value; }

const createStyles = (colors: AppColorTokens) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(10, 22, 35, 0.46)" }, panel: { height: "100%", maxWidth: 340, backgroundColor: colors.background, shadowColor: "#000", shadowOpacity: 0.22, shadowRadius: 16, elevation: 18 }, safePanel: { flex: 1, paddingHorizontal: ui.spacing.screen, paddingBottom: ui.spacing.compact },
  brand: { paddingTop: ui.spacing.compact, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.border }, brandTitle: { fontSize: 20, fontWeight: "700", color: colors.text }, brandText: { marginTop: 2, color: colors.muted, fontSize: 13 },
  profileLabel: { marginTop: 16, color: colors.muted, fontSize: 11, letterSpacing: 0.8, fontWeight: "800" }, profileRow: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 10, marginTop: 5, paddingHorizontal: 4, borderRadius: ui.radius.button }, profileCopy: { flex: 1, minWidth: 0 }, profileName: { color: colors.text, fontSize: 16, fontWeight: "700" }, profileRelationship: { marginTop: 2, color: colors.muted, fontSize: 13 }, profileChevron: { color: colors.primary, fontSize: 13 },
  profilePicker: { marginTop: 4, padding: 8, borderWidth: 1, borderColor: colors.border, borderRadius: ui.radius.card, backgroundColor: colors.cardBackground }, switchTitle: { paddingHorizontal: 6, paddingBottom: 5, color: colors.textMuted, fontSize: 13, fontWeight: "700" }, profileOption: { minHeight: 52, flexDirection: "row", alignItems: "center", paddingHorizontal: 8, borderRadius: ui.radius.button }, profileOptionSelected: { backgroundColor: colors.secondaryBackground }, selectedMark: { color: colors.secondaryForeground, fontSize: 18, fontWeight: "800" },
  addProfile: { minHeight: ui.touch.minimum, alignSelf: "flex-start", justifyContent: "center", paddingHorizontal: 4 }, addProfileText: { color: colors.outlineForeground, fontSize: 15, fontWeight: "700" }, links: { gap: 4, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.divider }, link: { minHeight: ui.touch.minimum, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, borderRadius: ui.radius.button }, bottomLink: { marginTop: "auto" }, activeLink: { backgroundColor: colors.secondaryBackground }, linkText: { flex: 1, fontSize: 16, fontWeight: "600", color: colors.textPrimary }, activeLinkText: { color: colors.secondaryForeground, fontWeight: "700" }, currentText: { fontSize: 11, color: colors.secondaryForeground, fontWeight: "700" },
});
