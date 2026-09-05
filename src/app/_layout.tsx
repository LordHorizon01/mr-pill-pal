import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider,
} from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useColorScheme } from "react-native";
import { useEffect } from "react";

import { initializeDatabase } from "@/database/database";
import { AnimatedSplashOverlay } from "@/components/animated-icon";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    initializeDatabase().catch((error) => {
      console.error(
        "Failed to initialize database:",
        error
      );
    });
  }, []);

  return (
    <ThemeProvider
      value={
        colorScheme === "dark"
          ? DarkTheme
          : DefaultTheme
      }
    >
      <AnimatedSplashOverlay />

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