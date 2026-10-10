import { Tabs, useSegments } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppTheme } from "@/components/app-theme-provider";
import { ProfileAvatar } from "@/components/profile-avatar";
import { useProfileStore } from "@/state/profile.store";
import { AppColorTokens } from "@/components/ui-tokens";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { Profile } from "@/features/profiles/profile.types";

type Destination = "home" | "medications" | "history" | "insights" | "profile";
const destinations: Record<Destination, { label: string; ios: string; material: string }> = {
  home: { label: "Home", ios: "house.fill", material: "home" },
  medications: { label: "Medications", ios: "pills.fill", material: "medication" },
  history: { label: "History", ios: "clock.arrow.circlepath", material: "history" },
  insights: { label: "Insights", ios: "chart.bar.xaxis", material: "monitoring" },
  profile: { label: "Profile", ios: "person.crop.circle.fill", material: "account_circle" },
};

export default function MainTabsLayout() {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const profile = useProfileStore((state) => state.profiles.find((item) => item.id === state.selectedProfileId) ?? null);
  const onSettingsRoute = segments[segments.length - 1] === "settings";

  function destination(name: Destination) {
    const item = destinations[name];
    const TabIcon = ({ focused }: { focused: boolean }) => <AnimatedTabIcon name={name} item={item} profile={profile} colors={colors} focused={focused} />;
    return TabIcon;
  }
  return <Tabs screenOptions={{
    headerShown: false,
    tabBarShowLabel: false,
    tabBarActiveTintColor: colors.navigationSelectedText,
    tabBarInactiveTintColor: colors.navigationInactive,
    tabBarStyle: [styles.tabBar, { height: 58 + insets.bottom, paddingBottom: Math.max(6, insets.bottom), display: onSettingsRoute ? "none" : "flex" }],
    tabBarBackground: () => <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.barBackground, { backgroundColor: colors.navigationSurface, borderTopColor: colors.navigationBorder }]} />,
    tabBarItemStyle: styles.tabBarItem,
  }}>
    <Tabs.Screen name="index" options={{ title: "Home", tabBarAccessibilityLabel: "Home", tabBarIcon: destination("home") }} />
    <Tabs.Screen name="medications" options={{ title: "Medications", tabBarAccessibilityLabel: "Medications", tabBarIcon: destination("medications") }} />
    <Tabs.Screen name="history" options={{ title: "History", tabBarAccessibilityLabel: "History", tabBarIcon: destination("history") }} />
    <Tabs.Screen name="insights" options={{ title: "Insights", tabBarAccessibilityLabel: "Insights", tabBarIcon: destination("insights") }} />
    <Tabs.Screen name="profile" options={{ title: "Profile", tabBarAccessibilityLabel: "Profile", tabBarIcon: destination("profile") }} />
    <Tabs.Screen name="settings" options={{ href: null, title: "Settings" }} />
  </Tabs>;
}

function AnimatedTabIcon({ name, item, profile, colors, focused }: {
  name: Destination;
  item: { label: string; ios: string; material: string };
  profile: Profile | null;
  colors: AppColorTokens;
  focused: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const [focusOpacity] = useState(() => new Animated.Value(focused ? 1 : 0));
  useEffect(() => {
    const animation = Animated.timing(focusOpacity, {
      toValue: focused ? 1 : 0,
      duration: reduceMotion ? 0 : 170,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [focusOpacity, focused, reduceMotion]);

  return <View accessible={false} style={styles.destination}>
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.destinationFocus, { opacity: focusOpacity, backgroundColor: colors.navigationSelected, borderColor: colors.primary }]} />
    {name === "profile" && profile
      ? <ProfileAvatar profile={profile} size={32} />
      : <SymbolView accessibilityElementsHidden name={{ ios: item.ios as never, android: item.material as never, web: item.material as never }} size={24} tintColor={focused ? colors.navigationSelectedText : colors.navigationInactive} />}
  </View>;
}

const createStyles = () => StyleSheet.create({
  tabBar: { paddingTop: 4, borderTopWidth: StyleSheet.hairlineWidth, elevation: 0, shadowOpacity: 0 },
  barBackground: { borderTopWidth: StyleSheet.hairlineWidth },
  tabBarItem: { flex: 1, minWidth: 0, minHeight: 48, alignItems: "center", justifyContent: "center" },
  destination: { width: 46, height: 46, alignItems: "center", justifyContent: "center" },
  destinationFocus: { borderWidth: 1, borderRadius: 14 },
});

const styles = createStyles();
