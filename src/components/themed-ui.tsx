import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextStyle, View, ViewStyle } from "react-native";

import { useAppTheme } from "@/components/app-theme-provider";
import { AppColorTokens, ui } from "@/components/ui-tokens";

export type BadgeTone = "taken" | "skipped" | "missed" | "pending" | "upcoming" | "active" | "paused" | "expired";
export type ButtonTone = "primary" | "secondary" | "outline" | "danger";

const badgeColorKeys: Record<BadgeTone, readonly [keyof AppColorTokens, keyof AppColorTokens]> = {
  taken: ["badgeTakenBackground", "badgeTakenForeground"],
  skipped: ["badgeSkippedBackground", "badgeSkippedForeground"],
  missed: ["badgeMissedBackground", "badgeMissedForeground"],
  pending: ["badgePendingBackground", "badgePendingForeground"],
  upcoming: ["badgeUpcomingBackground", "badgeUpcomingForeground"],
  active: ["badgeActiveBackground", "badgeActiveForeground"],
  paused: ["badgePausedBackground", "badgePausedForeground"],
  expired: ["badgeExpiredBackground", "badgeExpiredForeground"],
};

export function ThemedChip({ label, selected = false, onPress, accessibilityLabel, disabled = false, style, textStyle }: {
  label: string; selected?: boolean; onPress: () => void; accessibilityLabel?: string; disabled?: boolean; style?: ViewStyle; textStyle?: TextStyle;
}) {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress} style={[styles.chip, selected && styles.chipSelected, disabled && styles.disabled, style]}><Text numberOfLines={1} style={[styles.chipText, selected && styles.chipTextSelected, textStyle]}>{label}</Text></Pressable>;
}

export function StatusBadge({ label, tone, style, textStyle }: { label: string; tone: BadgeTone; style?: ViewStyle; textStyle?: TextStyle }) {
  const { colors } = useAppTheme();
  const [backgroundKey, foregroundKey] = badgeColorKeys[tone];
  const styles = createStyles(colors);
  return <View accessibilityRole="text" accessibilityLabel={`Status: ${label}`} style={[styles.badge, { backgroundColor: colors[backgroundKey] }, style]}><Text style={[styles.badgeText, { color: colors[foregroundKey] }, textStyle]}>{label}</Text></View>;
}

export function ThemedButton({ label, onPress, tone = "primary", disabled = false, loading = false, accessibilityLabel, style, textStyle }: {
  label: string; onPress: () => void; tone?: ButtonTone; disabled?: boolean; loading?: boolean; accessibilityLabel?: string; style?: ViewStyle; textStyle?: TextStyle;
}) {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const buttonStyle = tone === "primary" ? styles.primaryButton : tone === "secondary" ? styles.secondaryButton : tone === "danger" ? styles.dangerButton : styles.outlineButton;
  const labelStyle = tone === "primary" ? styles.primaryButtonText : tone === "secondary" ? styles.secondaryButtonText : tone === "danger" ? styles.dangerButtonText : styles.outlineButtonText;
  const spinnerColor = tone === "primary" ? colors.primaryForeground : tone === "danger" ? colors.dangerForeground : colors.outlineForeground;
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled, busy: loading }} disabled={disabled || loading} onPress={onPress} style={[styles.button, buttonStyle, (disabled || loading) && styles.disabled, style]}>{loading ? <ActivityIndicator color={spinnerColor} /> : null}<Text style={[styles.buttonText, labelStyle, textStyle]}>{label}</Text></Pressable>;
}

export function ThemedCard({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  return <View style={[styles.card, style]}>{children}</View>;
}

const createStyles = (colors: AppColorTokens) => StyleSheet.create({
  chip: { minHeight: 44, justifyContent: "center", paddingHorizontal: 14, borderWidth: 1, borderColor: colors.outlineBorder, borderRadius: ui.radius.chip, backgroundColor: colors.inputBackground },
  chipSelected: { borderColor: colors.selectedBackground, backgroundColor: colors.selectedBackground },
  chipText: { fontWeight: "700", color: colors.inputForeground },
  chipTextSelected: { color: colors.selectedForeground },
  badge: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 6, borderRadius: ui.radius.chip },
  badgeText: { fontSize: 14, fontWeight: "800" },
  button: { minHeight: ui.touch.minimum, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 16, borderRadius: ui.radius.button },
  buttonText: { fontSize: 16, fontWeight: "800" },
  primaryButton: { backgroundColor: colors.primaryBackground }, primaryButtonText: { color: colors.primaryForeground },
  secondaryButton: { backgroundColor: colors.secondaryBackground }, secondaryButtonText: { color: colors.secondaryForeground },
  outlineButton: { borderWidth: 1, borderColor: colors.outlineBorder, backgroundColor: colors.inputBackground }, outlineButtonText: { color: colors.outlineForeground },
  dangerButton: { backgroundColor: colors.dangerBackground }, dangerButtonText: { color: colors.dangerForeground },
  card: { padding: ui.spacing.card, borderWidth: 1, borderColor: colors.border, borderRadius: ui.radius.card, backgroundColor: colors.cardBackground },
  disabled: { opacity: 0.5 },
});
