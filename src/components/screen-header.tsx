import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAppDrawer } from "@/components/app-drawer";
import { useAppTheme } from "@/components/app-theme-provider";
import { AppColorTokens, ui } from "@/components/ui-tokens";
import { useSettingsStore } from "@/state/settings.store";
import { SymbolView } from "expo-symbols";

export function ScreenHeader({ title }: { title: string }) {
  const { openDrawer } = useAppDrawer();
  const { colors, mode } = useAppTheme();
  const setAppearancePreference = useSettingsStore((state) => state.setAppearancePreference);
  const styles = createStyles(colors);
  const nextMode = mode === "dark" ? "light" : "dark";

  return <View style={styles.container}>
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel="Open navigation menu" onPress={openDrawer} style={styles.menu}>
        <SymbolView accessibilityElementsHidden name={{ ios: "line.3.horizontal", android: "menu", web: "menu" }} size={22} tintColor={colors.primary} />
      </Pressable>
      <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>{title}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Switch to ${nextMode} mode`} onPress={() => void setAppearancePreference(nextMode)} style={styles.themeToggle}>
        <SymbolView accessibilityElementsHidden name={mode === "dark" ? { ios: "sun.max", android: "light_mode", web: "light_mode" } : { ios: "moon", android: "dark_mode", web: "dark_mode" }} size={21} tintColor={colors.primary} />
      </Pressable>
    </View>
    <View style={styles.divider} />
  </View>;
}

const createStyles = (colors: AppColorTokens) => StyleSheet.create({
  container: { marginHorizontal: -ui.spacing.screen },
  row: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: ui.spacing.screen },
  menu: { width: ui.touch.minimum, minHeight: ui.touch.minimum, alignItems: "center", justifyContent: "center", marginLeft: -12, borderRadius: ui.radius.button },
  title: { flex: 1, flexShrink: 1, fontSize: 20, lineHeight: 25, fontWeight: "700", color: colors.text },
  themeToggle: { width: ui.touch.minimum, minHeight: ui.touch.minimum, alignItems: "center", justifyContent: "center", borderRadius: ui.radius.button },
  divider: { height: 1, marginHorizontal: ui.spacing.screen, backgroundColor: colors.border },
});
