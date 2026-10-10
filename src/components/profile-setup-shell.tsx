import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppTheme } from "@/components/app-theme-provider";
import { profileSetupColors, ui } from "@/components/ui-tokens";

export function ProfileSetupShell({ step, totalSteps, onBack, onSkip, backDisabled, skipDisabled, visual, children }: {
  step: number; totalSteps: number; onBack: (() => void) | null; onSkip?: () => void; backDisabled?: boolean; skipDisabled?: boolean; visual: ReactNode; children: ReactNode;
}) {
  const { mode } = useAppTheme(); const colors = profileSetupColors[mode];
  return <SafeAreaView edges={["top", "bottom"]} style={[styles.page, { backgroundColor: colors.canvas }]}>
    <View style={styles.topRow}>
      {onBack ? <Pressable accessibilityRole="button" accessibilityLabel="Back" disabled={backDisabled} onPress={onBack} hitSlop={10} style={styles.textButton}><Text style={[styles.textButtonLabel, { color: colors.teal, opacity: backDisabled ? 0.55 : 1 }]}>Back</Text></Pressable> : <View style={styles.topSpacer} />}
      <View accessibilityRole="progressbar" accessibilityLabel={`Profile setup, step ${step} of ${totalSteps}`} accessibilityValue={{ min: 1, max: totalSteps, now: step }} style={styles.progress}>
        {Array.from({ length: totalSteps }, (_, index) => <View key={index} style={[styles.progressDot, { backgroundColor: index < step ? colors.primary : "transparent", borderColor: index < step ? colors.primary : colors.borderStrong }]} />)}
      </View>
      {onSkip ? <Pressable accessibilityRole="button" accessibilityLabel="Skip this question" disabled={skipDisabled} onPress={onSkip} hitSlop={10} style={styles.textButton}><Text style={[styles.textButtonLabel, { color: colors.teal, opacity: skipDisabled ? 0.55 : 1 }]}>Skip</Text></Pressable> : <View style={styles.topSpacer} />}
    </View>
    <View style={styles.content}><View style={styles.visual}>{visual}</View>{children}</View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  page: { flex: 1 }, topRow: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: ui.spacing.md },
  textButton: { minWidth: 52, minHeight: 44, justifyContent: "center" }, textButtonLabel: { fontSize: 15, fontWeight: "800" }, topSpacer: { width: 52 },
  progress: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 4 }, progressDot: { width: 7, height: 7, borderRadius: 4, borderWidth: 1 }, content: { flex: 1, width: "100%", maxWidth: 460, alignSelf: "center", paddingHorizontal: ui.spacing.screen, paddingBottom: ui.spacing.md }, visual: { alignItems: "center", paddingTop: ui.spacing.xs, paddingBottom: ui.spacing.sm },
});
