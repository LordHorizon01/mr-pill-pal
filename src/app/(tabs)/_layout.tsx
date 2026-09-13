import { Tabs } from "expo-router";
import { SymbolView } from "expo-symbols";
import { ColorValue } from "react-native";
import { ui } from "@/components/ui-tokens";
import { useAppTheme } from "@/components/app-theme-provider";

export default function MainTabsLayout() {
  const { colors } = useAppTheme();
  const icon = (name: "home" | "medication" | "history" | "insights" | "settings", color: ColorValue) => <SymbolView name={{ ios: name === "settings" ? "gearshape" : "house", android: name, web: name }} size={22} tintColor={color} />;
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.muted, tabBarLabelStyle: { fontSize: 10, fontWeight: "700" }, tabBarStyle: { minHeight: 68, paddingTop: 7, paddingBottom: 7, borderTopColor: colors.border, backgroundColor: colors.background }, tabBarItemStyle: { flex: 1, minWidth: 0, minHeight: 52 } }}>
    <Tabs.Screen name="index" options={{ title: "Home", tabBarAccessibilityLabel: "Home tab", tabBarIcon: ({ color }) => icon("home", color) }} />
    <Tabs.Screen name="medications" options={{ title: "Medications", tabBarAccessibilityLabel: "Medications tab", tabBarIcon: ({ color }) => icon("medication", color) }} />
    <Tabs.Screen name="history" options={{ title: "History", tabBarAccessibilityLabel: "History tab", tabBarIcon: ({ color }) => icon("history", color) }} />
    <Tabs.Screen name="insights" options={{ title: "Insights", tabBarAccessibilityLabel: "Insights tab", tabBarIcon: ({ color }) => icon("insights", color) }} />
    <Tabs.Screen name="settings" options={{ title: "Settings", tabBarAccessibilityLabel: "Settings tab", tabBarIcon: ({ color }) => icon("settings", color) }} />
  </Tabs>;
}
