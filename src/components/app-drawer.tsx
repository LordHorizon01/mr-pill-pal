import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { Animated, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { SymbolView } from "expo-symbols";
import { useAppTheme } from "@/components/app-theme-provider";
import { ProfileAvatar } from "@/components/profile-avatar";
import { motion } from "@/components/motion-tokens";
import { ui } from "@/components/ui-tokens";
import { getProfileGreetingName } from "@/features/profiles/profile.domain";
import { Profile } from "@/features/profiles/profile.types";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useProfileStore } from "@/state/profile.store";
import { useAuthStore } from "@/state/auth.store";

type ProfileSwitcherContextValue = { openProfileSwitcher: () => void; openDrawer: () => void };
const ProfileSwitcherContext = createContext<ProfileSwitcherContextValue | null>(null);
const primaryLogo = require("../../assets/brand/runtime/ui/Primary Horizontal Logo/mpp-logo-horizontal-1200 x 400.png");

export function AppDrawerProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const [translateY] = useState(() => new Animated.Value(48));
  const [backdropOpacity] = useState(() => new Animated.Value(0));
  const [drawerTranslateX] = useState(() => new Animated.Value(-320));
  const [drawerBackdropOpacity] = useState(() => new Animated.Value(0));
  const reduceMotion = useReducedMotion();
  const { width } = useWindowDimensions();
  const drawerWidth = Math.min(width * 0.84, 340);
  const { colors } = useAppTheme();
  const profiles = useProfileStore((state) => state.profiles);
  const selectedProfileId = useProfileStore((state) => state.selectedProfileId);
  const selectProfile = useProfileStore((state) => state.selectProfile);
  const logout = useAuthStore((state) => state.logout);
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? null;
  const styles = createStyles(colors);
  const duration = reduceMotion ? motion.duration.profileSheetReducedMotion : motion.duration.profileSheet;
  const drawerDuration = reduceMotion ? motion.duration.profileSheetReducedMotion : motion.duration.fast;

  useEffect(() => {
    if (!visible) return;
    translateY.setValue(48);
    backdropOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(translateY, { toValue: 0, duration, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 1, duration, useNativeDriver: true }),
    ]).start();
  }, [backdropOpacity, duration, translateY, visible]);

  useEffect(() => {
    if (!drawerVisible) return;
    drawerTranslateX.setValue(-drawerWidth);
    drawerBackdropOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(drawerTranslateX, { toValue: 0, duration: drawerDuration, useNativeDriver: true }),
      Animated.timing(drawerBackdropOpacity, { toValue: 1, duration: drawerDuration, useNativeDriver: true }),
    ]).start();
  }, [drawerBackdropOpacity, drawerDuration, drawerTranslateX, drawerVisible, drawerWidth]);
  const closeProfileSwitcher = () => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: 48, duration, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0, duration, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) { setVisible(false); setSwitchError(null); }
    });
  };
  const openProfileSwitcher = () => { setSwitchError(null); setVisible(true); };
  const openDrawer = () => { setDrawerError(null); setDrawerVisible(true); };
  const closeDrawer = (afterClose?: () => void) => {
    Animated.parallel([
      Animated.timing(drawerTranslateX, { toValue: -drawerWidth, duration: drawerDuration, useNativeDriver: true }),
      Animated.timing(drawerBackdropOpacity, { toValue: 0, duration: drawerDuration, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) { setDrawerVisible(false); afterClose?.(); }
    });
  };
  function openProfilesFromDrawer() {
    closeDrawer(() => { setSwitchError(null); setVisible(true); });
  }
  function openSettingsFromDrawer() {
    closeDrawer(() => router.push("/settings" as never));
  }
  async function signOutFromDrawer() {
    if (isSigningOut) return;
    setIsSigningOut(true);
    setDrawerError(null);
    try {
      await logout();
      closeDrawer();
    } catch {
      setDrawerError(useAuthStore.getState().error ?? "We could not sign out. Please try again.");
    } finally {
      setIsSigningOut(false);
    }
  }
  const value = { openProfileSwitcher, openDrawer };

  async function switchProfile(profile: Profile) {
    if (profile.id === selectedProfileId || switchingTo) return;
    setSwitchingTo(profile.id);
    setSwitchError(null);
    try { await selectProfile(profile.id); closeProfileSwitcher(); }
    catch { setSwitchError("We couldn’t switch profiles. Please try again."); }
    finally { setSwitchingTo(null); }
  }

  function goTo(route: "/profiles" | "/settings", addProfile = false) {
    closeProfileSwitcher();
    if (route === "/profiles" && addProfile) {
      router.push({ pathname: "/profiles", params: { mode: "add" } });
      return;
    }
    router.push(route as never);
  }

  return (
    <ProfileSwitcherContext.Provider value={value}>
      {children}
      <Modal transparent visible={drawerVisible} animationType="none" onRequestClose={() => closeDrawer()} statusBarTranslucent>
        <View style={styles.drawerOverlay}>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.drawerBackdrop, { opacity: drawerBackdropOpacity }]} />
          <Pressable accessibilityRole="button" accessibilityLabel="Close navigation menu" disabled={isSigningOut} onPress={() => closeDrawer()} style={StyleSheet.absoluteFill} />
          <Animated.View accessibilityViewIsModal style={[styles.drawerPanel, { width: drawerWidth, transform: [{ translateX: drawerTranslateX }] }]}>
            <SafeAreaView edges={["top", "bottom", "left"]} style={styles.drawerSafe}>
              <Image accessibilityLabel="Mr. Pill Pal" accessible source={primaryLogo} resizeMode="contain" style={styles.drawerBrandLogo} />
              <Pressable accessibilityRole="button" accessibilityLabel="Open Profiles" accessibilityState={{ disabled: isSigningOut }} disabled={isSigningOut} onPress={openProfilesFromDrawer} style={styles.drawerItem}>
                <Text style={styles.drawerItemText}>Profiles</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Open Settings" accessibilityState={{ disabled: isSigningOut }} disabled={isSigningOut} onPress={openSettingsFromDrawer} style={styles.drawerItem}>
                <Text style={styles.drawerItemText}>Settings</Text>
              </Pressable>
              <View style={styles.drawerSpacer} />
              <View style={styles.drawerDivider} />
              {drawerError ? <Text accessibilityRole="alert" style={styles.drawerError}>{drawerError}</Text> : null}
              <Pressable accessibilityRole="button" accessibilityLabel="Sign out of Mr. Pill Pal" accessibilityState={{ disabled: isSigningOut }} disabled={isSigningOut} onPress={() => void signOutFromDrawer()} style={styles.signOutItem}>
                <Text style={styles.signOutText}>{isSigningOut ? "Signing out…" : "Sign out"}</Text>
              </Pressable>
            </SafeAreaView>
          </Animated.View>
        </View>
      </Modal>
      <Modal transparent visible={visible} animationType="none" onRequestClose={closeProfileSwitcher} statusBarTranslucent>
        <View style={styles.overlay}>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdropOpacity }]} />
          <Pressable accessibilityRole="button" accessibilityLabel="Close profile switcher" onPress={closeProfileSwitcher} style={StyleSheet.absoluteFill} />
          <Animated.View accessibilityViewIsModal style={[styles.sheet, { transform: [{ translateY }] }]}>
            <SafeAreaView edges={["bottom"]} style={styles.sheetSafe}>
              <ScrollView bounces={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetContent}>
              <View style={styles.handle} />
              <View style={styles.headingRow}>
                <View style={styles.headingCopy}>
                  <Text accessibilityRole="header" style={styles.title}>Profiles</Text>
                  <Text style={styles.subtitle}>Choose who you’re caring for</Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Close profile switcher" onPress={closeProfileSwitcher} style={styles.closeButton}>
                  <Text style={styles.closeText}>×</Text>
                </Pressable>
              </View>
              <View accessibilityRole="radiogroup" accessibilityLabel="Available profiles" style={styles.profileList}>
                {profiles.filter((profile) => profile.isActive).map((profile) => {
                  const selected = profile.id === selectedProfileId;
                  const name = getProfileGreetingName(profile) ?? profile.fullName;
                  return (
                    <Pressable key={profile.id} accessibilityRole="radio" accessibilityLabel={`${name}, ${profile.relationship}`}
                      accessibilityState={{ checked: selected, disabled: switchingTo !== null }} disabled={switchingTo !== null}
                      onPress={() => void switchProfile(profile)} style={[styles.profileRow, selected && styles.profileRowSelected]}>
                      <ProfileAvatar profile={profile} size={44} />
                      <View style={styles.profileCopy}>
                        <Text numberOfLines={1} style={styles.profileName}>{name}</Text>
                        <Text numberOfLines={1} style={styles.relationship}>{profile.relationship}</Text>
                      </View>
                      {switchingTo === profile.id
                        ? <Text style={styles.switchStatus}>Switching…</Text>
                        : selected
                          ? <SymbolView accessibilityElementsHidden name={{ ios: "checkmark.circle.fill", android: "check_circle", web: "check_circle" }} size={22} tintColor={colors.primary} />
                          : null}
                    </Pressable>
                  );
                })}
              </View>
              {switchError ? <Text accessibilityRole="alert" style={styles.error}>{switchError}</Text> : null}
              <Pressable accessibilityRole="button" onPress={() => goTo("/profiles", true)} style={styles.addProfile}>
                <Text style={styles.addProfileText}>＋ Add profile</Text>
              </Pressable>
              <View style={styles.footer}>
                <Pressable accessibilityRole="button" onPress={() => goTo("/profiles")} style={styles.footerAction}>
                  <SymbolView accessibilityElementsHidden name={{ ios: "person.crop.circle", android: "manage_accounts", web: "manage_accounts" }} size={19} tintColor={colors.textSecondary} />
                  <Text style={styles.footerText}>Manage profiles</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => goTo("/settings")} style={styles.footerAction}>
                  <SymbolView accessibilityElementsHidden name={{ ios: "gearshape", android: "settings", web: "settings" }} size={19} tintColor={colors.textSecondary} />
                  <Text style={styles.footerText}>Settings</Text>
                </Pressable>
              </View>
              {selectedProfile ? <Text accessibilityLiveRegion="polite" style={styles.currentNote}>Currently viewing {getProfileGreetingName(selectedProfile) ?? selectedProfile.fullName}</Text> : null}
              </ScrollView>
            </SafeAreaView>
          </Animated.View>
        </View>
      </Modal>
    </ProfileSwitcherContext.Provider>
  );
}

export function useAppDrawer(): ProfileSwitcherContextValue {
  const value = useContext(ProfileSwitcherContext);
  if (!value) throw new Error("useAppDrawer must be used inside AppDrawerProvider.");
  return value;
}

const createStyles = (colors: ReturnType<typeof useAppTheme>["colors"]) => StyleSheet.create({
  drawerOverlay: { flex: 1, flexDirection: "row", backgroundColor: "transparent" },
  drawerBackdrop: { backgroundColor: "rgba(10, 22, 35, 0.36)" },
  drawerPanel: { height: "100%", backgroundColor: colors.surfaceRaised, elevation: 16, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 4, height: 0 } },
  drawerSafe: { flex: 1, paddingHorizontal: ui.spacing.screen, paddingTop: ui.spacing.lg, paddingBottom: ui.spacing.xs },
  drawerBrandLogo: { width: 160, height: 160 / 3, marginBottom: ui.spacing.lg, alignSelf: "flex-start" },
  drawerItem: { minHeight: ui.touch.minimum, justifyContent: "center", borderRadius: ui.radius.medium },
  drawerItemText: { ...ui.typography.bodyStrong, color: colors.textPrimary },
  drawerSpacer: { flex: 1 },
  drawerDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginBottom: ui.spacing.sm },
  drawerError: { ...ui.typography.supporting, color: colors.danger, marginBottom: ui.spacing.xs },
  signOutItem: { minHeight: ui.touch.minimum, justifyContent: "center", borderRadius: ui.radius.medium },
  signOutText: { ...ui.typography.bodyStrong, color: colors.dangerForeground },
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: { backgroundColor: "rgba(10, 22, 35, 0.48)" },
  sheet: { maxHeight: "82%", borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.surfaceRaised, overflow: "hidden", elevation: 16, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: -4 } },
  sheetSafe: { maxHeight: "82%" },
  sheetContent: { paddingHorizontal: ui.spacing.screen, paddingTop: ui.spacing.xs, paddingBottom: ui.spacing.xs },
  handle: { width: 36, height: 4, alignSelf: "center", borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: ui.spacing.md },
  headingRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: ui.spacing.md },
  headingCopy: { flex: 1, minWidth: 0 },
  title: { ...ui.typography.sectionTitle, color: colors.textPrimary },
  subtitle: { marginTop: 2, ...ui.typography.supporting, color: colors.textSecondary },
  closeButton: { width: ui.touch.minimum, height: ui.touch.minimum, alignItems: "center", justifyContent: "center", borderRadius: ui.radius.pill, backgroundColor: colors.surfaceSubtle },
  closeText: { color: colors.textSecondary, fontSize: 26, lineHeight: 30 },
  profileList: { gap: 4 },
  profileRow: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 10, borderRadius: ui.radius.medium, borderWidth: 1, borderColor: "transparent" },
  profileRowSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  profileCopy: { flex: 1, minWidth: 0 },
  profileName: { ...ui.typography.bodyStrong, color: colors.textPrimary },
  relationship: { ...ui.typography.caption, color: colors.textSecondary, textTransform: "capitalize" },
  switchStatus: { ...ui.typography.caption, color: colors.textSecondary },
  error: { marginTop: ui.spacing.xs, ...ui.typography.supporting, color: colors.danger },
  addProfile: { minHeight: ui.touch.minimum, justifyContent: "center", marginTop: ui.spacing.sm, paddingHorizontal: 10, borderRadius: ui.radius.medium, backgroundColor: colors.surfaceSubtle },
  addProfileText: { ...ui.typography.bodyStrong, color: colors.primary },
  footer: { flexDirection: "row", gap: ui.spacing.sm, marginTop: ui.spacing.sm, paddingTop: ui.spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  footerAction: { flex: 1, minHeight: ui.touch.minimum, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: ui.radius.medium },
  footerText: { ...ui.typography.label, color: colors.textSecondary },
  currentNote: { marginTop: ui.spacing.xs, ...ui.typography.caption, color: colors.textMuted, textAlign: "center" },
});
