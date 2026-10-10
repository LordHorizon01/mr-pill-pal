import { StyleSheet, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { useEffect } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useAppTheme } from "@/components/app-theme-provider";
import { ui } from "@/components/ui-tokens";

/** A quiet routine preview: plan, reminder, then a completed dose. */
export function AuthRoutineVisual() {
  const { colors } = useAppTheme();
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = reduceMotion ? 0 : withRepeat(
      withSequence(
        withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 1800, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [progress, reduceMotion]);
  const reminderStyle = useAnimatedStyle(() => ({ opacity: 0.72 + progress.value * 0.28, transform: [{ translateY: progress.value * -2 }] }));
  const checkStyle = useAnimatedStyle(() => ({ opacity: 0.7 + progress.value * 0.3 }));
  return <View accessible accessibilityRole="image" accessibilityLabel="A medication plan becomes a reminder and a completed dose" style={[styles.frame, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}>
    <View style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}><Text style={[styles.cardLabel, { color: colors.textSecondary }]}>Morning plan</Text><View style={styles.row}><View style={[styles.pill, { backgroundColor: colors.accent }]} /><Text style={[styles.cardText, { color: colors.textPrimary }]}>Vitamin D</Text></View></View>
    <View style={[styles.line, { backgroundColor: colors.borderStrong }]} />
    <Animated.View style={[styles.reminder, { backgroundColor: colors.cardBackground, borderColor: colors.border }, reminderStyle]}><Text style={[styles.reminderTime, { color: colors.primary }]}>8:00 AM</Text><Text style={[styles.reminderText, { color: colors.textSecondary }]}>Time for Vitamin D</Text></Animated.View>
    <View style={[styles.line, { backgroundColor: colors.borderStrong }]} />
    <Animated.View style={[styles.taken, { backgroundColor: colors.successSurface }, checkStyle]}><Text style={[styles.check, { color: colors.success }]}>✓</Text><Text style={[styles.takenText, { color: colors.success }]}>Taken</Text></Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  frame: { alignSelf: "center", width: "100%", maxWidth: 330, padding: ui.spacing.md, borderRadius: ui.radius.card, borderWidth: 1, alignItems: "center" },
  card: { width: "100%", padding: ui.spacing.sm, borderRadius: ui.radius.medium, borderWidth: 1 },
  cardLabel: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 },
  row: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 6 },
  pill: { width: 24, height: 12, borderRadius: 8 }, cardText: { fontSize: 15, fontWeight: "700" },
  line: { width: 1, height: 14 },
  reminder: { width: "92%", paddingHorizontal: ui.spacing.sm, paddingVertical: 10, borderRadius: ui.radius.medium, borderWidth: 1 },
  reminderTime: { fontSize: 14, fontWeight: "800" }, reminderText: { marginTop: 2, fontSize: 13 },
  taken: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: ui.radius.pill },
  check: { fontSize: 16, fontWeight: "900" }, takenText: { fontSize: 14, fontWeight: "800" },
});
