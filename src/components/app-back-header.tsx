import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { AppColorTokens, ui } from "@/components/ui-tokens";
import { useAppTheme } from "@/components/app-theme-provider";

type AppBackHeaderProps = {
  title: string;
  onBack?: () => void;
  fallbackRoute?: string;
  disabled?: boolean;
};

/** Shared compact header for non-tab screens. Auth screens provide their own safe exit handler. */
export function AppBackHeader({ title, onBack, fallbackRoute = "/", disabled = false }: AppBackHeaderProps) {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  function handleBack() {
    if (disabled) return;
    if (onBack) {
      onBack();
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(fallbackRoute as never);
  }

  return <View style={styles.container}>
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" accessibilityState={{ disabled }} disabled={disabled} onPress={handleBack} style={[styles.back, disabled && styles.disabled]}>
        <Text accessibilityElementsHidden style={styles.backText}>‹</Text>
      </Pressable>
      <Text accessibilityRole="header" numberOfLines={2} style={styles.title}>{title}</Text>
    </View>
    <View style={styles.divider} />
  </View>;
}

const createStyles = (colors: AppColorTokens) => StyleSheet.create({
  container: { marginHorizontal: -ui.spacing.screen },
  row: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: ui.spacing.screen },
  back: { width: ui.touch.minimum, minHeight: ui.touch.minimum, alignItems: "center", justifyContent: "center", marginLeft: -8, borderRadius: ui.radius.button },
  backText: { color: colors.primary, fontSize: 31, lineHeight: 34, fontWeight: "500" },
  title: { flex: 1, flexShrink: 1, fontSize: 20, lineHeight: 25, fontWeight: "800", color: colors.text },
  divider: { height: 1, marginHorizontal: ui.spacing.screen, backgroundColor: colors.border },
  disabled: { opacity: 0.5 },
});
