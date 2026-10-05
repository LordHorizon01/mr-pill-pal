import { useEffect } from "react";
import {
  DimensionValue,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { BrandMark } from "@/components/brand-mark";
import { useAppTheme } from "@/components/app-theme-provider";
import { ui } from "@/components/ui-tokens";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { motion } from "@/components/motion-tokens";

export function ContentFade({ children, style, duration = motion.duration.contentReconciliation }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; duration?: number }) {
  const reduceMotion = useReducedMotion();
  const transitionDuration = reduceMotion ? motion.duration.reducedMotionTransition : duration;
  return <Animated.View
    entering={FadeIn.duration(transitionDuration)}
    exiting={FadeOut.duration(transitionDuration)}
    style={style}
  >{children}</Animated.View>;
}

export function LoadingSurface({
  message = "Preparing your experience",
  accessibilityLabel,
  safeAreaAware = true,
  style,
}: {
  message?: string;
  accessibilityLabel?: string;
  safeAreaAware?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useAppTheme();
  const reduceMotion = useReducedMotion();

  const SurfaceContainer = safeAreaAware ? SafeAreaView : View;
  return (
    <SurfaceContainer
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel ?? message}
      accessibilityState={{ busy: true }}
      style={[styles.loadingSurface, { backgroundColor: colors.background }, style]}
    >
      <BrandMark size={76} decorative />
      <View style={styles.loadingCopy}>
        <Text style={[styles.wordmark, { color: colors.textPrimary }]}>Mr. Pill Pal</Text>
        <Text style={[styles.loadingMessage, { color: colors.textPrimary }]}>
          {message}
        </Text>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.progressDots}
        >
          <LoadingDot delay={0} reduceMotion={reduceMotion} color={colors.primary} />
          <LoadingDot delay={170} reduceMotion={reduceMotion} color={colors.primary} />
          <LoadingDot delay={340} reduceMotion={reduceMotion} color={colors.primary} />
        </View>
      </View>
    </SurfaceContainer>
  );
}

function LoadingDot({ delay, reduceMotion, color }: { delay: number; reduceMotion: boolean; color: string }) {
  const opacity = useSharedValue(reduceMotion ? 0.68 : 0.38);

  useEffect(() => {
    cancelAnimation(opacity);
    if (reduceMotion) {
      opacity.value = 0.68;
      return;
    }
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.95, { duration: motion.duration.loaderPulse / 2 }),
          withTiming(0.38, { duration: motion.duration.loaderPulse / 2 }),
        ),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(opacity);
  }, [delay, opacity, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.dot, { backgroundColor: color }, animatedStyle]} />;
}

export function SkeletonBlock({
  width = "100%",
  height = 120,
  radius = ui.radius.medium,
  style,
}: {
  width?: DimensionValue;
  height?: DimensionValue;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return <SkeletonSurface width={width} height={height} radius={radius} style={style} />;
}

export function SkeletonLine({
  width = "76%",
  height = 14,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return <SkeletonSurface width={width} height={height} radius={height / 2} style={style} />;
}

export function SkeletonCard({
  children,
  style,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.skeletonCard, style]}
    >
      {children ?? <>
        <SkeletonLine width="58%" height={18} />
        <SkeletonLine width="82%" style={styles.skeletonGap} />
        <SkeletonLine width="42%" style={styles.skeletonGap} />
      </>}
    </View>
  );
}

export function HomeSummarySkeleton() {
  return <View style={styles.homeSummarySkeleton}>
    <SkeletonCard style={styles.homeSummarySkeleton}>
      <SkeletonLine width="42%" height={18} />
      <SkeletonLine width="68%" style={styles.skeletonGap} />
      <SkeletonLine width="84%" style={styles.skeletonGap} />
    </SkeletonCard>
  </View>;
}

export function DoseListSkeleton() {
  return <View style={styles.skeletonStack}>
    <DoseCardSkeleton />
    <DoseCardSkeleton />
  </View>;
}

export function MedicationListSkeleton() {
  return <View style={styles.skeletonStack}>
    {[0, 1].map((key) => <SkeletonCard key={key} style={styles.medicationSkeleton}>
      <SkeletonLine width="60%" height={20} />
      <SkeletonLine width="32%" style={styles.skeletonGap} />
      <SkeletonLine width="28%" height={22} style={styles.skeletonGap} />
      <SkeletonLine width="76%" style={styles.skeletonGap} />
      <SkeletonLine width="58%" height={38} style={styles.skeletonGap} />
    </SkeletonCard>)}
  </View>;
}

export function HistoryListSkeleton() {
  return <View style={styles.skeletonStack}>
    {[0, 1].map((key) => <SkeletonCard key={key} style={styles.historySkeleton}>
      <SkeletonLine width="36%" height={16} />
      <SkeletonLine width="62%" height={19} style={styles.skeletonGap} />
      <SkeletonLine width="44%" style={styles.skeletonGap} />
      <SkeletonLine width="72%" style={styles.skeletonGap} />
    </SkeletonCard>)}
  </View>;
}

export function InsightsInitialSkeleton() {
  return <View style={styles.skeletonStack}>
    <SkeletonCard style={styles.insightsSkeleton}>
      <SkeletonLine width="48%" height={19} />
      {[0, 1, 2, 3].map((key) => <View key={key} style={styles.skeletonMetricRow}>
        <SkeletonLine width="34%" />
        <SkeletonLine width="12%" />
      </View>)}
    </SkeletonCard>
    <SkeletonCard style={styles.insightsSkeleton}>
      <SkeletonLine width="56%" height={19} />
      <SkeletonLine width="42%" height={34} style={styles.skeletonGap} />
      <SkeletonLine width="92%" style={styles.skeletonGap} />
    </SkeletonCard>
  </View>;
}

function DoseCardSkeleton() {
  return <SkeletonCard style={styles.doseSkeleton}>
    <SkeletonLine width="26%" height={18} />
    <SkeletonLine width="64%" height={20} style={styles.skeletonGap} />
    <SkeletonLine width="32%" style={styles.skeletonGap} />
    <View style={styles.skeletonActions}><SkeletonLine width="44%" height={42} /><SkeletonLine width="44%" height={42} /></View>
  </SkeletonCard>;
}

function SkeletonSurface({
  width,
  height,
  radius,
  style,
}: {
  width: DimensionValue;
  height: DimensionValue;
  radius: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useAppTheme();
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(reduceMotion ? 0.62 : 0.5);

  useEffect(() => {
    cancelAnimation(opacity);
    if (reduceMotion) {
      opacity.value = 0.62;
      return;
    }
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.9, { duration: motion.duration.skeletonPulse / 2 }),
        withTiming(0.5, { duration: motion.duration.skeletonPulse / 2 }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(opacity);
  }, [opacity, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius: radius, backgroundColor: colors.surfaceMuted }, style, animatedStyle]}
    />
  );
}

const styles = StyleSheet.create({
  loadingSurface: { flex: 1, alignItems: "center", justifyContent: "center", padding: ui.spacing.screen },
  loadingCopy: { alignItems: "center", marginTop: ui.spacing.sm, gap: 7 },
  wordmark: { ...ui.typography.pageTitle, textAlign: "center" },
  loadingMessage: { ...ui.typography.bodyStrong, textAlign: "center" },
  progressDots: { flexDirection: "row", alignItems: "center", gap: ui.spacing.sm, minHeight: 12 },
  dot: { width: 8, height: 8, borderRadius: ui.radius.pill },
  skeletonCard: { gap: 10, padding: ui.spacing.card, borderRadius: ui.radius.card },
  skeletonGap: { marginTop: 2 },
  skeletonStack: { gap: ui.spacing.md, marginTop: ui.spacing.md },
  homeSummarySkeleton: { minHeight: 126, justifyContent: "center" },
  doseSkeleton: { minHeight: 176 },
  skeletonActions: { flexDirection: "row", justifyContent: "space-between", gap: ui.spacing.sm, marginTop: 8 },
  medicationSkeleton: { minHeight: 184 },
  historySkeleton: { minHeight: 150 },
  insightsSkeleton: { minHeight: 178 },
  skeletonMetricRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10 },
});
