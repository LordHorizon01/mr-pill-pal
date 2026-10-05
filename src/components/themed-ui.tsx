import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, TextStyle, View, ViewStyle, type PressableStateCallbackType, type StyleProp } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { useAppTheme, useAppThemeColorStyle } from "@/components/app-theme-provider";
import { motion } from "@/components/motion-tokens";
import { AppColorTokens, getButtonColorRoles, ui } from "@/components/ui-tokens";

export type BadgeTone = "taken" | "skipped" | "missed" | "pending" | "upcoming" | "active" | "paused" | "expired";
export type ButtonTone = "primary" | "secondary" | "outline" | "danger";
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const AnimatedText = Animated.createAnimatedComponent(Text);

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
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel ?? label}
    accessibilityState={{ selected, disabled }}
    disabled={disabled}
    onPress={onPress}
    style={(state: PressableStateCallbackType) => [styles.chip, style, selected && styles.chipSelected, disabled && styles.chipDisabled, state.pressed && !disabled && (selected ? styles.chipSelectedPressed : styles.chipPressed)]}
  >
    {(state: PressableStateCallbackType) => <Text numberOfLines={1} style={[styles.chipText, textStyle, selected && styles.chipTextSelected, disabled && styles.chipTextDisabled, state.pressed && !disabled && (selected ? styles.chipTextSelectedPressed : styles.chipTextPressed)]}>{label}</Text>}
  </Pressable>;
}

export function StatusBadge({ label, tone, style, textStyle }: { label: string; tone: BadgeTone; style?: ViewStyle; textStyle?: TextStyle }) {
  const { colors } = useAppTheme();
  const [backgroundKey, foregroundKey] = badgeColorKeys[tone];
  const styles = createStyles(colors);
  const animatedSurface = useAppThemeColorStyle({ backgroundColor: backgroundKey });
  const animatedText = useAppThemeColorStyle({ color: foregroundKey });
  return <Animated.View accessibilityRole="text" accessibilityLabel={`Status: ${label}`} style={[styles.badge, { backgroundColor: colors[backgroundKey] }, style, animatedSurface]}><AnimatedText style={[styles.badgeText, { color: colors[foregroundKey] }, textStyle, animatedText]}>{label}</AnimatedText></Animated.View>;
}

export function ThemedButton({ label, onPress, tone = "primary", size = "regular", disabled = false, loading = false, loadingLabel, accessibilityLabel, style, textStyle }: {
  label: string; onPress: () => void; tone?: ButtonTone; size?: "regular" | "compact"; disabled?: boolean; loading?: boolean; loadingLabel?: string; accessibilityLabel?: string; style?: StyleProp<ViewStyle>; textStyle?: TextStyle;
}) {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const statusLabel = loading ? loadingLabel ?? label : label;
  const sizingLabel = loadingLabel && loadingLabel.length > label.length ? loadingLabel : label;
  const isUnavailable = disabled || loading;
  const pressProgress = useSharedValue(0);
  const pressStyle = useAnimatedStyle(() => ({ opacity: 1 - pressProgress.value * 0.14 }));
  return <AnimatedPressable
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel ?? statusLabel}
    accessibilityState={{ disabled: isUnavailable, busy: loading }}
    disabled={isUnavailable}
    onPressIn={() => { pressProgress.value = withTiming(1, { duration: motion.duration.feedback, easing: Easing.bezier(...motion.easing.standard) }); }}
    onPressOut={() => { pressProgress.value = withTiming(0, { duration: motion.duration.feedback, easing: Easing.bezier(...motion.easing.standard) }); }}
    onPress={onPress}
    style={(state: PressableStateCallbackType) => {
      const colorState = isUnavailable ? "disabled" : state.pressed ? "pressed" : "default";
      const roles = getButtonColorRoles(tone, colorState);
      return [
        styles.button,
        size === "compact" && styles.compactButton,
        tone !== "primary" && styles.borderedButton,
        isUnavailable && styles.disabled,
        style,
        pressStyle,
        { backgroundColor: colors[roles.background], borderColor: colors[roles.border] },
      ];
    }}
  >
    {(state: PressableStateCallbackType) => {
      const colorState = isUnavailable ? "disabled" : state.pressed ? "pressed" : "default";
      const roles = getButtonColorRoles(tone, colorState);
      return <View style={styles.buttonLabelSlot}>
        <Text accessible={false} style={[styles.buttonText, textStyle, styles.buttonLabelSizer]}>{sizingLabel}</Text>
        <AnimatedText accessible={false} style={[styles.buttonText, styles.buttonLabelOverlay, textStyle, { color: colors[roles.foreground] }]}>{statusLabel}</AnimatedText>
      </View>;
    }}
  </AnimatedPressable>;
}

export function ThemedCard({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const animatedSurface = useAppThemeColorStyle({ backgroundColor: "surfaceRaised", borderColor: "border" });
  return <Animated.View style={[styles.card, style, animatedSurface]}>{children}</Animated.View>;
}

const createStyles = (colors: AppColorTokens) => StyleSheet.create({
  chip: { minHeight: ui.touch.minimum, justifyContent: "center", paddingHorizontal: 14, borderWidth: 1, borderColor: colors.chipBorder, borderRadius: ui.radius.chip, backgroundColor: colors.chipBackground },
  chipSelected: { borderColor: colors.chipSelectedBackground, backgroundColor: colors.chipSelectedBackground },
  chipPressed: { borderColor: colors.chipPressedBackground, backgroundColor: colors.chipPressedBackground },
  chipSelectedPressed: { borderColor: colors.chipSelectedPressedBackground, backgroundColor: colors.chipSelectedPressedBackground },
  chipDisabled: { borderColor: colors.chipDisabledBorder, backgroundColor: colors.chipDisabledBackground },
  chipText: { ...ui.typography.label, color: colors.chipForeground },
  chipTextSelected: { color: colors.chipSelectedForeground },
  chipTextPressed: { color: colors.chipPressedForeground },
  chipTextSelectedPressed: { color: colors.chipSelectedPressedForeground },
  chipTextDisabled: { color: colors.chipDisabledForeground },
  badge: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 6, borderRadius: ui.radius.chip },
  badgeText: ui.typography.label,
  button: { minHeight: ui.touch.minimum, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 16, borderRadius: ui.radius.button },
  compactButton: { minHeight: 44, paddingHorizontal: 12 },
  borderedButton: { borderWidth: 1 },
  buttonText: ui.typography.button,
  buttonLabelSlot: { position: "relative", alignItems: "center", justifyContent: "center" },
  buttonLabelSizer: { opacity: 0 },
  buttonLabelOverlay: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, textAlign: "center", textAlignVertical: "center" },
  card: { padding: ui.spacing.card, borderWidth: 1, borderColor: colors.border, borderRadius: ui.radius.card, backgroundColor: colors.surfaceRaised, elevation: ui.elevation.card },
  disabled: { borderWidth: 1 },
});
