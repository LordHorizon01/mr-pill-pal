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
import { useEffect, useRef, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import {
  getSafeDatabaseErrorMessage,
  initializeDatabase,
} from "@/database/database";
import { AnimatedSplashOverlay } from "@/components/animated-icon";
import { AppDrawerProvider } from "@/components/app-drawer";
import { AppColorTokens, ui } from "@/components/ui-tokens";
import { AppThemeProvider, useAppTheme } from "@/components/app-theme-provider";
import {
  reconcileReminderHealth,
  ReminderHealthResult,
} from "@/features/schedules/schedule.service";
import { generateDoseOccurrencesForDate } from "@/features/doses/dose.service";
import { useAuthStore } from "@/state/auth.store";
import { useProfileStore } from "@/state/profile.store";
import { AuthGate } from "@/components/auth-gate";
import { useSettingsStore } from "@/state/settings.store";

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
          void SplashScreen.hideAsync();
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
    if (isDatabaseReady) void loadSettings();
  }, [isDatabaseReady, loadSettings]);

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

  if (databaseError) return <SafeAreaProvider><AppThemeProvider><ThemedStartupError message={databaseError} onRetry={() => setStartupAttempt((attempt) => attempt + 1)} /></AppThemeProvider></SafeAreaProvider>;

  if (!isDatabaseReady || authPhase === "loading") {
    return null;
  }

  if (authPhase !== "authenticated") return <SafeAreaProvider><AppThemeProvider><ThemedAuthGate /></AppThemeProvider></SafeAreaProvider>;

  if (!isStartupReminderHealthReady) return null;

  return <SafeAreaProvider><AppThemeProvider><ThemedApp reminderMessage={reminderMessage} onDismissReminder={() => setReminderMessage(null)} /></AppThemeProvider></SafeAreaProvider>;
}

function ThemedAuthGate() {
  const { mode } = useAppTheme();
  return <NavigationThemeProvider value={mode === "dark" ? DarkTheme : DefaultTheme}><StatusBar style={mode === "dark" ? "light" : "dark"} /><AuthGate /></NavigationThemeProvider>;
}

function ThemedStartupError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { colors } = useAppTheme();
  const themedStyles = createStyles(colors);
  return <View style={themedStyles.errorContainer}><Text style={themedStyles.errorTitle}>Mr. Pill Pal could not open</Text><Text style={themedStyles.errorText}>{message}</Text><Pressable accessibilityRole="button" onPress={onRetry} style={themedStyles.retryButton}><Text style={themedStyles.retryButtonText}>Try again</Text></Pressable></View>;
}

function ThemedApp({ reminderMessage, onDismissReminder }: { reminderMessage: string | null; onDismissReminder: () => void }) {
  const { mode, colors } = useAppTheme();
  const themedStyles = createStyles(colors);
  return <NavigationThemeProvider value={mode === "dark" ? DarkTheme : DefaultTheme}>
    <StatusBar style={mode === "dark" ? "light" : "dark"} />
    <AnimatedSplashOverlay />
    {reminderMessage ? <Pressable accessibilityRole="button" accessibilityLabel="Dismiss reminder status message" onPress={onDismissReminder} style={[themedStyles.reminderBanner, { backgroundColor: colors.badgeSkippedBackground }]}><Text style={[themedStyles.reminderBannerText, { color: colors.badgeSkippedForeground }]}>{reminderMessage}</Text><Text style={[themedStyles.reminderBannerHint, { color: colors.textSecondary }]}>Tap to dismiss</Text></Pressable> : null}
    <AppDrawerProvider><Stack screenOptions={{ headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.primary, headerTitleStyle: { fontSize: 20, fontWeight: "700", color: colors.text }, headerShadowVisible: true }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="schedule" options={{ title: "Schedule" }} />
      <Stack.Screen name="dose-detail" options={{ title: "Dose details" }} />
      <Stack.Screen name="reminder-settings" options={{ title: "Reminders & notifications" }} />
      <Stack.Screen name="profiles" options={{ headerShown: false }} />
    </Stack></AppDrawerProvider>
  </NavigationThemeProvider>;
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
