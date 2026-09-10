import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider,
} from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import {
  AppState,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";
import { useEffect, useRef, useState } from "react";

import {
  getSafeDatabaseErrorMessage,
  initializeDatabase,
} from "@/database/database";
import { AnimatedSplashOverlay } from "@/components/animated-icon";
import {
  reconcileReminderHealth,
  ReminderHealthResult,
} from "@/features/schedules/schedule.service";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [startupAttempt, setStartupAttempt] = useState(0);
  const [isDatabaseReady, setIsDatabaseReady] = useState(false);
  const [isStartupReminderHealthReady, setIsStartupReminderHealthReady] =
    useState(false);
  const [databaseError, setDatabaseError] = useState<string | null>(null);
  const [reminderMessage, setReminderMessage] = useState<string | null>(null);
  const isCheckingReminderHealth = useRef(false);

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
    if (!isDatabaseReady) {
      return;
    }

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
      if (isCheckingReminderHealth.current) {
        return;
      }

      isCheckingReminderHealth.current = true;

      try {
        const result = await reconcileReminderHealth();

        if (isCurrent) {
          setReminderMessage(messageFor(result));
        }
      } catch {
        if (isCurrent) {
          setReminderMessage(
            "We could not check reminder health. Open your schedules and confirm they say Reminders on.",
          );
        }
      } finally {
        isCheckingReminderHealth.current = false;

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
  }, [isDatabaseReady]);

  if (databaseError) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Mr. Pill Pal could not open</Text>
        <Text style={styles.errorText}>{databaseError}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => setStartupAttempt((attempt) => attempt + 1)}
          style={styles.retryButton}
        >
          <Text style={styles.retryButtonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (!isDatabaseReady || !isStartupReminderHealthReady) {
    return null;
  }

  return (
    <ThemeProvider
      value={
        colorScheme === "dark"
          ? DarkTheme
          : DefaultTheme
      }
    >
      <AnimatedSplashOverlay />

      {reminderMessage ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss reminder status message"
          onPress={() => setReminderMessage(null)}
          style={styles.reminderBanner}
        >
          <Text style={styles.reminderBannerText}>{reminderMessage}</Text>
          <Text style={styles.reminderBannerHint}>Tap to dismiss</Text>
        </Pressable>
      ) : null}

      <Stack>
        <Stack.Screen
          name="index"
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="medications"
          options={{
            title: "Medications",
          }}
        />

        <Stack.Screen
          name="schedule"
          options={{
            title: "Schedule",
          }}
        />

        <Stack.Screen
          name="explore"
          options={{
            title: "Explore",
          }}
        />
      </Stack>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#FFFFFF",
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: "700",
  },
  errorText: {
    marginTop: 12,
    fontSize: 16,
    lineHeight: 23,
  },
  retryButton: {
    minHeight: 48,
    alignSelf: "flex-start",
    justifyContent: "center",
    marginTop: 20,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: "#222222",
  },
  retryButtonText: {
    color: "#FFFFFF",
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
    backgroundColor: "#FFF4DE",
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
