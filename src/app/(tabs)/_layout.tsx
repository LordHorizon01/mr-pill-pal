import { Tabs } from "expo-router";
import { SymbolView } from "expo-symbols";
import Animated from "react-native-reanimated";
import { StyleSheet } from "react-native";
import { ui } from "@/components/ui-tokens";
import { useAppTheme, useAppThemeColorStyle } from "@/components/app-theme-provider";

const AnimatedSymbolView = Animated.createAnimatedComponent(SymbolView);

export default function MainTabsLayout() {
  const { colors } = useAppTheme();
  return <Tabs screenOptions={{
    headerShown: false,
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.textMuted,
    tabBarLabelStyle: { fontSize: 10, fontWeight: "700" },
    tabBarStyle: { minHeight: 68, paddingTop: 7, paddingBottom: 7, borderTopColor: "transparent", backgroundColor: "transparent" },
    tabBarBackground: () => <AnimatedTabBarBackground />,
    tabBarItemStyle: { flex: 1, minWidth: 0, minHeight: 52 },
  }}>
    <Tabs.Screen name="index" options={{ title: "Home", tabBarAccessibilityLabel: "Home tab", tabBarIcon: ({ focused }) => <TabIcon name="home" focused={focused} />, tabBarLabel: ({ focused }) => <TabLabel title="Home" focused={focused} /> }} />
    <Tabs.Screen name="medications" options={{ title: "Medications", tabBarAccessibilityLabel: "Medications tab", tabBarIcon: ({ focused }) => <TabIcon name="medication" focused={focused} />, tabBarLabel: ({ focused }) => <TabLabel title="Medications" focused={focused} /> }} />
    <Tabs.Screen name="history" options={{ title: "History", tabBarAccessibilityLabel: "History tab", tabBarIcon: ({ focused }) => <TabIcon name="history" focused={focused} />, tabBarLabel: ({ focused }) => <TabLabel title="History" focused={focused} /> }} />
    <Tabs.Screen name="insights" options={{ title: "Insights", tabBarAccessibilityLabel: "Insights tab", tabBarIcon: ({ focused }) => <TabIcon name="insights" focused={focused} />, tabBarLabel: ({ focused }) => <TabLabel title="Insights" focused={focused} /> }} />
    <Tabs.Screen name="settings" options={{ title: "Settings", tabBarAccessibilityLabel: "Settings tab", tabBarIcon: ({ focused }) => <TabIcon name="settings" focused={focused} />, tabBarLabel: ({ focused }) => <TabLabel title="Settings" focused={focused} /> }} />
  </Tabs>;
}

function TabIcon({ name, focused }: { name: "home" | "medication" | "history" | "insights" | "settings"; focused: boolean }) {
  const { colors } = useAppTheme();
  const role = focused ? "primary" : "textMuted";
  return <AnimatedSymbolView
    name={{ ios: name === "settings" ? "gearshape" : "house", android: name, web: name }}
    size={22}
    tintColor={colors[role]}
  />;
}

function TabLabel({ title, focused }: { title: string; focused: boolean }) {
  const colorStyle = useAppThemeColorStyle({ color: focused ? "primary" : "textMuted" });
  return <Animated.Text numberOfLines={1} style={[{ fontSize: 10, fontWeight: "700", color: focused ? ui.colors.primary : ui.colors.textMuted }, colorStyle]}>{title}</Animated.Text>;
}

function AnimatedTabBarBackground() {
  const colorStyle = useAppThemeColorStyle({ backgroundColor: "background", borderTopColor: "border" });
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderTopWidth: StyleSheet.hairlineWidth }, colorStyle]} />;
}
