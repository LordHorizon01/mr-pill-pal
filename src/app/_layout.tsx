import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider as NavigationThemeProvider,
} from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import {
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import Animated, { Easing, FadeIn, FadeInUp, FadeOut, FadeOutUp } from "react-native-reanimated";

import {
  getSafeDatabaseErrorMessage,
  initializeDatabase,
} from "@/database/database";
import { BrandedStartupSplash, FirstRunExperience } from "@/components/first-run-experience";
import { AppDrawerProvider } from "@/components/app-drawer";
import { AppColorTokens, ui } from "@/components/ui-tokens";
import { motion } from "@/components/motion-tokens";
import { AppThemeProvider, useAppTheme } from "@/components/app-theme-provider";
import { useAppThemeColorStyle } from "@/components/app-theme-provider";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import {
  reconcileReminderHealth,
  ReminderHealthResult,
} from "@/features/schedules/schedule.service";
import { generateDoseOccurrencesForDate } from "@/features/doses/dose.service";
import { reconcileLowStockAlertsForAccount } from "@/features/refills/low-stock-alert.service";
import { useAuthStore } from "@/state/auth.store";
import { useProfileStore } from "@/state/profile.store";
import { AuthGate } from "@/components/auth-gate";
import { useSettingsStore } from "@/state/settings.store";
import { FirstRunPreferences } from "@/features/first-run/first-run.domain";
import { loadFirstRunPreferences, resetFirstRunPreferencesForDevelopment } from "@/features/first-run/first-run.repository";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const authPhase = useAuthStore((state) => state.phase);
  const authUser = useAuthStore((state) => state.user);
  const startAuth = useAuthStore((state) => state.start);
  const setProfileReady = useAuthStore((state) => state.setProfileReady);
  const loadSettings = useSettingsStore((state) => state.loadSettings);
  const selectedProfileId = useProfileStore((state) => state.selectedProfileId);
  const selectedAccountUid = useProfileStore((state) => state.accountUid);
  const [startupAttempt, setStartupAttempt] = useState(0);
  const [isDatabaseReady, setIsDatabaseReady] = useState(false);
  const [isStartupReminderHealthReady, setIsStartupReminderHealthReady] =
    useState(false);
  const [databaseError, setDatabaseError] = useState<string | null>(null);
  const [reminderMessage, setReminderMessage] = useState<string | null>(null);
  const [firstRunPreferences, setFirstRunPreferences] = useState<FirstRunPreferences | null>(null);
  const [areSettingsReady, setAreSettingsReady] = useState(false);
  const [startupHandoffComplete, setStartupHandoffComplete] = useState(false);
  const firstRunLoadStarted = useRef(false);
  const previousDestinationKind = useRef("loading");
  const activeReminderHealthKey = useRef<string | null>(null);

  useEffect(() => {
    let isCurrent = true;

    async function startDatabase() {
      try {
        setDatabaseError(null);
        setIsDatabaseReady(false);
        setIsStartupReminderHealthReady(false);
        await initializeDatabase();

        if (isCurrent) {
          setIsDatabaseReady(true);
        }
      } catch (error) {
        if (isCurrent) {
          setDatabaseError(
            getSafeDatabaseErrorMessage(
              error,
              "The medication data could not be opened. Please try again.",
            ),
          );
        }
      }
    }

    void startDatabase();

    return () => {
      isCurrent = false;
    };
  }, [startupAttempt]);

  useEffect(() => {
    if (!isDatabaseReady) return;
    return startAuth();
  }, [isDatabaseReady, startAuth]);

  useEffect(() => {
    if (!isDatabaseReady) return;
    let current = true;
    void loadSettings().finally(() => { if (current) setAreSettingsReady(true); });
    return () => { current = false; };
  }, [isDatabaseReady, loadSettings]);

  useEffect(() => {
    if (!isDatabaseReady || authPhase === "loading" || firstRunLoadStarted.current) return;
    firstRunLoadStarted.current = true;
    let current = true;
    void loadFirstRunPreferences(authPhase !== "unauthenticated").then((preferences) => {
      if (current) setFirstRunPreferences(preferences);
    }).catch(() => {
      // A preference read must never block sign-in or strand an existing user.
      if (__DEV__) console.warn("[FirstRun] Preference read failed; continue without first-run screens.");
      if (current) setFirstRunPreferences({ onboardingComplete: true, notificationPrimerHandled: true });
    });
    return () => { current = false; };
  }, [authPhase, isDatabaseReady]);

  useEffect(() => {
    if (!isDatabaseReady || !authUser || authPhase === "verification_required") return;
    let current = true;
    void useProfileStore.getState().loadForAccount(authUser.uid).then((ready) => { if (current) setProfileReady(ready); });
    return () => { current = false; };
  }, [authUser?.uid, authPhase === "verification_required", isDatabaseReady, setProfileReady]);

  useEffect(() => {
    if (!isDatabaseReady || authPhase !== "authenticated" || !selectedProfileId || !selectedAccountUid) {
      return;
    }
    const accountUid = selectedAccountUid;
    const profileId = selectedProfileId;

    let isCurrent = true;

    function messageFor(result: ReminderHealthResult): string | null {
      if (result.permissionRequiredScheduleIds.length > 0) {
        return "Some reminders need notification permission. Open the schedule and use Enable notifications.";
      }

      if (result.schedulingFailedScheduleIds.length > 0) {
        return "Some reminders could not be set up. Open the schedule and tap Retry.";
      }

      if (result.expiredScheduleIds.length > 0) {
        return "Expired one-time reminders were marked as expired. You can delete them from their schedule.";
      }

      if (result.recoveredScheduleIds.length > 0) {
        return `We restored ${result.recoveredScheduleIds.length} reminder${
          result.recoveredScheduleIds.length === 1 ? "" : "s"
        } after checking this phone.`;
      }

      return null;
    }

    async function checkReminderHealth(isStartupCheck = false) {
      const checkKey = `${accountUid}:${profileId}`;
      if (activeReminderHealthKey.current === checkKey) {
        return;
      }

      activeReminderHealthKey.current = checkKey;

      try {
        const result = await reconcileReminderHealth(accountUid);

        if (isCurrent) {
          setReminderMessage(messageFor(result));
        }
      } catch {
        if (isCurrent) {
          setReminderMessage(
            "We could not check reminder health. Open your schedules and confirm they say Reminders on.",
          );
        }
      }

      try {
        await generateDoseOccurrencesForDate(profileId);
      } catch {
        if (isCurrent) {
          setReminderMessage(
            "We could not prepare today's doses. Open Today and tap Refresh to try again.",
          );
        }
      } finally {
        if (activeReminderHealthKey.current === checkKey) {
          activeReminderHealthKey.current = null;
        }

        if (isStartupCheck && isCurrent) {
          setIsStartupReminderHealthReady(true);
        }
      }
      void reconcileLowStockAlertsForAccount(accountUid);
    }

    void checkReminderHealth(true);

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void checkReminderHealth();
      }
    });

    return () => {
      isCurrent = false;
      subscription.remove();
    };
  }, [authPhase, isDatabaseReady, selectedAccountUid, selectedProfileId]);

  const isFirstRun = authPhase === "unauthenticated" && firstRunPreferences !== null &&
    (!firstRunPreferences.onboardingComplete || !firstRunPreferences.notificationPrimerHandled);
  const startupReady = databaseError !== null || (
    isDatabaseReady && authPhase !== "loading" && areSettingsReady && firstRunPreferences !== null &&
    (authPhase !== "authenticated" || isStartupReminderHealthReady)
  );

  useEffect(() => {
    if (!startupReady) setStartupHandoffComplete(false);
  }, [startupReady]);

  async function replayFirstRunForDevelopment() {
    if (!__DEV__) return;
    await resetFirstRunPreferencesForDevelopment();
    setFirstRunPreferences({ onboardingComplete: false, notificationPrimerHandled: false });
    setStartupHandoffComplete(false);
  }

  let destination: ReactNode = null;
  let destinationKind = "loading";
  if (databaseError) {
    destinationKind = "error";
    destination = <ThemedStartupError message={databaseError} onRetry={() => setStartupAttempt((attempt) => attempt + 1)} />;
  } else if (startupReady && isFirstRun) {
    destinationKind = "first-run";
    destination = <FirstRunExperience
      showOnboarding={!firstRunPreferences!.onboardingComplete}
      onFinished={() => setFirstRunPreferences({ onboardingComplete: true, notificationPrimerHandled: true })}
    />;
  } else if (startupReady && authPhase !== "authenticated") {
    destinationKind = "auth";
    destination = <ThemedAuthGate onReplayFirstRun={replayFirstRunForDevelopment} />;
  } else if (startupReady) {
    destinationKind = "app";
    destination = <ThemedApp reminderMessage={reminderMessage} onDismissReminder={() => setReminderMessage(null)} />;
  }
  const isPrimerToAuthHandoff = previousDestinationKind.current === "first-run" && destinationKind === "auth";
  useEffect(() => {
    if (destination) previousDestinationKind.current = destinationKind;
  }, [destinationKind, Boolean(destination)]);

  return <SafeAreaProvider><AppThemeProvider><View style={{ flex: 1 }}>
    {destination ? <DestinationTransition key={destinationKind} kind={destinationKind} authHandoff={isPrimerToAuthHandoff}>{destination}</DestinationTransition> : null}
    {!startupReady || !startupHandoffComplete ? <BrandedStartupSplash
      ready={startupReady}
      duration={isFirstRun ? 1500 : 650}
      onFinished={() => setStartupHandoffComplete(true)}
    /> : null}
  </View></AppThemeProvider></SafeAreaProvider>;
}

function DestinationTransition({ children, kind, authHandoff }: { children: ReactNode; kind: string; authHandoff: boolean }) {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  if (kind !== "first-run" && !authHandoff) {
    return <View style={{ flex: 1, backgroundColor: colors.background }}>{children}</View>;
  }
  const enter = reducedMotion
    ? FadeIn.duration(motion.duration.firstRunReducedTransition)
    : kind === "first-run"
      ? FadeInUp.duration(motion.duration.onboarding + motion.duration.standard).easing(Easing.bezier(...motion.easing.enter))
      : FadeInUp.duration(motion.duration.firstRunPrimerEntrance).withInitialValues({ transform: [{ translateY: 8 }] }).easing(Easing.bezier(...motion.easing.enter));
  const exit = reducedMotion
    ? FadeOut.duration(motion.duration.firstRunReducedTransition)
    : kind === "first-run"
      ? FadeOutUp.duration(motion.duration.firstRunScreenExit).easing(Easing.bezier(...motion.easing.exit))
      : FadeOut.duration(motion.duration.firstRunScreenExit).easing(Easing.bezier(...motion.easing.exit));
  return <Animated.View entering={enter} exiting={exit} style={{ flex: 1, backgroundColor: colors.background }}>{children}</Animated.View>;
}

function ThemedAuthGate({ onReplayFirstRun }: { onReplayFirstRun: () => Promise<void> }) {
  const { mode } = useAppTheme();
  return <NavigationThemeProvider value={mode === "dark" ? DarkTheme : DefaultTheme}><StatusBar style={mode === "dark" ? "light" : "dark"} /><AuthGate onReplayFirstRun={onReplayFirstRun} /></NavigationThemeProvider>;
}

function ThemedStartupError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { colors } = useAppTheme();
  const themedStyles = createStyles(colors);
  return <View style={themedStyles.errorContainer}><Text style={themedStyles.errorTitle}>Mr. Pill Pal could not open</Text><Text style={themedStyles.errorText}>{message}</Text><Pressable accessibilityRole="button" onPress={onRetry} style={themedStyles.retryButton}><Text style={themedStyles.retryButtonText}>Try again</Text></Pressable></View>;
}

function ThemedApp({ reminderMessage, onDismissReminder }: { reminderMessage: string | null; onDismissReminder: () => void }) {
  const { mode, colors } = useAppTheme();
  const themedStyles = createStyles(colors);
  const navigationTheme = mode === "dark" ? DarkTheme : DefaultTheme;
  const themedNavigation = { ...navigationTheme, colors: { ...navigationTheme.colors, primary: colors.primary, background: colors.background, card: colors.surface, text: colors.textPrimary, border: colors.border, notification: colors.accent } };
  return <NavigationThemeProvider value={themedNavigation}>
    <StatusBar style={mode === "dark" ? "light" : "dark"} />
    {reminderMessage ? <Pressable accessibilityRole="button" accessibilityLabel="Dismiss reminder status message" onPress={onDismissReminder} style={[themedStyles.reminderBanner, { backgroundColor: colors.badgeSkippedBackground }]}><Text style={[themedStyles.reminderBannerText, { color: colors.badgeSkippedForeground }]}>{reminderMessage}</Text><Text style={[themedStyles.reminderBannerHint, { color: colors.textSecondary }]}>Tap to dismiss</Text></Pressable> : null}
    <AppDrawerProvider><Stack screenOptions={{ animation: "fade_from_bottom", animationDuration: motion.duration.navigation, headerStyle: { backgroundColor: "transparent" }, headerBackground: () => <StackHeaderBackground />, headerTintColor: colors.primary, headerTitle: ({ children }) => <StackHeaderTitle>{children}</StackHeaderTitle>, headerShadowVisible: true }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="schedule" options={{ title: "Schedule" }} />
      <Stack.Screen name="refill-settings" options={{ title: "Refill tracking" }} />
      <Stack.Screen name="stock-history" options={{ title: "Stock history" }} />
      <Stack.Screen name="report-export" options={{ title: "Doctor / caregiver report" }} />
      <Stack.Screen name="dose-detail" options={{ title: "Dose details" }} />
      <Stack.Screen name="reminder-settings" options={{ title: "Reminders & notifications" }} />
      <Stack.Screen name="profiles" options={{ headerShown: false }} />
    </Stack></AppDrawerProvider>
  </NavigationThemeProvider>;
}

function StackHeaderBackground() {
  const colorStyle = useAppThemeColorStyle({ backgroundColor: "background" });
  return <Animated.View style={[StyleSheet.absoluteFill, colorStyle]} />;
}

function StackHeaderTitle({ children }: { children: string }) {
  const colorStyle = useAppThemeColorStyle({ color: "textPrimary" });
  return <Animated.Text numberOfLines={1} style={[{ fontSize: 20, fontWeight: "700" }, colorStyle]}>{children}</Animated.Text>;
}

const createStyles = (colors: AppColorTokens) => StyleSheet.create({
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: colors.background,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  errorText: {
    marginTop: 12,
    fontSize: 16,
    lineHeight: 23,
    color: colors.textSecondary,
  },
  retryButton: {
    minHeight: 48,
    alignSelf: "flex-start",
    justifyContent: "center",
    marginTop: 20,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: colors.primaryBackground,
  },
  retryButtonText: {
    color: colors.primaryForeground,
    fontSize: 16,
    fontWeight: "600",
  },
  reminderBanner: {
    position: "absolute",
    top: 12,
    right: 12,
    left: 12,
    zIndex: 2000,
    padding: 14,
    borderRadius: 10,
    backgroundColor: colors.badgeSkippedBackground,
  },
  reminderBannerText: {
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 21,
  },
  reminderBannerHint: {
    marginTop: 5,
    fontSize: 13,
  },
});
