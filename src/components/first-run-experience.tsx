import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
  useColorScheme,
  useWindowDimensions,
} from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  FadeOutUp,
  FadeInUp,
  interpolate,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type AnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandMark } from "@/components/brand-mark";
import { LoadingSurface } from "@/components/loading-primitives";
import { useAppTheme } from "@/components/app-theme-provider";
import { darkUiColors, ui } from "@/components/ui-tokens";
import { motion } from "@/components/motion-tokens";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { completeOnboarding, markNotificationPrimerHandled } from "@/features/first-run/first-run.repository";
import { canRequestPrimerPermission, PrimerPermissionState } from "@/features/first-run/first-run.domain";
import { getFirstRunHandoffDestination, getRemainingFirstRunHandoffMs } from "@/features/first-run/handoff.domain";
import {
  getPrimerNotificationPermission,
  PrimerNotificationPermission,
  requestPrimerNotificationPermission,
} from "@/notifications/notification.service";

const pages = [
  { title: "Your medication routine, made simpler.", body: "Plan medicines, get timely reminders, and keep a clear record — even offline.", art: "routine" },
  { title: "Know what is due, at a glance.", body: "See today's doses, record Taken or Skipped, and review your history without digging through menus.", art: "today" },
  { title: "Stay prepared, not surprised.", body: "Track refill levels and get a heads-up when stock is running low.", art: "refill" },
  { title: "Built for you and the people you care for.", body: "Keep separate profiles, use core medication features offline, and share a clear report when you choose.", art: "profiles" },
] as const;

type Props = {
  showOnboarding: boolean;
  onFinished: () => void;
};

export function FirstRunExperience({ showOnboarding, onFinished }: Props) {
  const { colors, mode } = useAppTheme();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [stage, setStage] = useState<"onboarding" | "handoff" | "primer">(showOnboarding ? "onboarding" : "primer");
  const [page, setPage] = useState(0);
  const [pageTransitioning, setPageTransitioning] = useState(false);
  const [permission, setPermission] = useState<PrimerNotificationPermission>({ status: "not_requested", canAskAgain: true });
  const [permissionState, setPermissionState] = useState<PrimerPermissionState>("not_requested");
  const [permissionProblem, setPermissionProblem] = useState(false);
  const [primerPermissionResolved, setPrimerPermissionResolved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const completeRef = useRef(onFinished);
  const mounted = useRef(true);
  const actionLock = useRef(false);
  const pageTransitionLock = useRef(false);
  const indicatorFrom = useSharedValue(0);
  const indicatorTo = useSharedValue(0);
  const indicatorProgress = useSharedValue(0);
  const indicatorTransitioning = useSharedValue(false);
  const illustrationOpacity = useSharedValue(1);
  const illustrationTranslateX = useSharedValue(0);
  const headingOpacity = useSharedValue(1);
  const headingTranslateY = useSharedValue(0);
  const bodyOpacity = useSharedValue(1);
  const bodyTranslateY = useSharedValue(0);
  const styles = useMemo(() => createStyles(colors, mode), [colors, mode]);
  const compact = height < 720;

  useEffect(() => { completeRef.current = onFinished; }, [onFinished]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (stage !== "primer" || primerPermissionResolved) return;
    let current = true;
    void getPrimerNotificationPermission().then((value) => {
      if (!current) return;
      setPermission(value);
      setPermissionState(value.status);
      if (value.status === "granted") {
        void markNotificationPrimerHandled().then(() => {
          if (current) completeRef.current();
        }).catch(() => {
          if (current) setError("We couldn't save this choice. Please try again, or continue to sign in.");
        });
      }
    }).catch(() => {
      if (current) { setPermissionProblem(true); setPermissionState("unavailable"); }
    });
    return () => { current = false; };
    // finishPrimer is stable and declared below through a ref-backed callback.
  }, [primerPermissionResolved, stage]);

  const finishPrimer = useCallback(async () => {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setError(null);
    try {
      await markNotificationPrimerHandled();
      completeRef.current();
    } catch {
      setError("We couldn't save this choice. Please try again, or continue to sign in.");
      setBusy(false);
      actionLock.current = false;
    }
  }, []);

  useEffect(() => {
    if (stage !== "onboarding") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (page > 0) { goToPage(page - 1); return true; }
      return false;
    });
    return () => subscription.remove();
  }, [page, stage]);

  const finishPageTransition = useCallback(() => {
    pageTransitionLock.current = false;
    setPageTransitioning(false);
  }, []);

  const commitPageTransition = useCallback((nextPage: number, direction: -1 | 1) => {
    setPage(nextPage);
    const reducedPhase = motion.duration.standard / 2;
    const illustrationDuration = reducedMotion ? reducedPhase : motion.duration.onboarding + motion.duration.standard / 2;
    const headingDelay = reducedMotion ? 0 : motion.duration.standard / 2;
    const headingDuration = reducedMotion ? reducedPhase : motion.duration.onboarding + 100;
    const bodyDelay = reducedMotion ? 0 : motion.duration.standard;
    const bodyDuration = reducedMotion ? reducedPhase : motion.duration.onboarding + 50;

    illustrationOpacity.value = 0;
    illustrationTranslateX.value = reducedMotion ? 0 : direction * 14;
    headingOpacity.value = 0;
    headingTranslateY.value = reducedMotion ? 0 : 8;
    bodyOpacity.value = 0;
    bodyTranslateY.value = reducedMotion ? 0 : 6;

    illustrationOpacity.value = withTiming(1, {
      duration: illustrationDuration,
      easing: Easing.bezier(...motion.easing.enter),
    });
    illustrationTranslateX.value = withTiming(0, {
      duration: reducedMotion ? 0 : illustrationDuration,
      easing: Easing.bezier(...motion.easing.enter),
    });
    headingOpacity.value = withDelay(headingDelay, withTiming(1, {
      duration: headingDuration,
      easing: Easing.bezier(...motion.easing.enter),
    }));
    headingTranslateY.value = withDelay(headingDelay, withTiming(0, {
      duration: reducedMotion ? 0 : headingDuration,
      easing: Easing.bezier(...motion.easing.enter),
    }));
    bodyOpacity.value = withDelay(bodyDelay, withTiming(1, {
      duration: bodyDuration,
      easing: Easing.bezier(...motion.easing.enter),
    }, (finished) => {
      if (finished) runOnJS(finishPageTransition)();
    }));
    bodyTranslateY.value = withDelay(bodyDelay, withTiming(0, {
      duration: reducedMotion ? 0 : bodyDuration,
      easing: Easing.bezier(...motion.easing.enter),
    }));
  }, [bodyOpacity, bodyTranslateY, finishPageTransition, headingOpacity, headingTranslateY, illustrationOpacity, illustrationTranslateX, reducedMotion]);

  function goToPage(next: number) {
    const safePage = Math.max(0, Math.min(pages.length - 1, next));
    if (safePage === page || pageTransitionLock.current) return;
    pageTransitionLock.current = true;
    setPageTransitioning(true);
    const direction = safePage > page ? 1 : -1;
    indicatorFrom.value = page;
    indicatorTo.value = safePage;
    indicatorProgress.value = 0;
    indicatorTransitioning.value = true;
    function finishIndicator(finished?: boolean) {
      "worklet";
      if (finished) indicatorTransitioning.value = false;
    }
    if (reducedMotion) {
      indicatorProgress.value = withTiming(1, {
        duration: motion.duration.standard,
        easing: Easing.bezier(...motion.easing.standard),
      }, finishIndicator);
    } else {
      const expandDuration = motion.duration.deliberate;
      const holdDuration = motion.duration.onboarding;
      const contractDuration = motion.duration.standard + motion.duration.onboardingFeedback / 2;
      indicatorProgress.value = withSequence(
        withTiming(0.42, { duration: expandDuration, easing: Easing.bezier(...motion.easing.standard) }),
        withTiming(0.48, { duration: holdDuration, easing: Easing.linear }),
        withTiming(1, { duration: contractDuration, easing: Easing.bezier(...motion.easing.standard) }, finishIndicator),
      );
    }
    const outgoingDuration = reducedMotion ? motion.duration.standard / 2 : motion.duration.deliberate;
    const outgoingX = reducedMotion ? 0 : direction * -12;
    illustrationOpacity.value = withTiming(0, {
      duration: outgoingDuration,
      easing: Easing.bezier(...motion.easing.exit),
    }, (finished) => {
      if (finished) runOnJS(commitPageTransition)(safePage, direction);
    });
    illustrationTranslateX.value = withTiming(outgoingX, {
      duration: reducedMotion ? 0 : outgoingDuration,
      easing: Easing.bezier(...motion.easing.exit),
    });
    headingOpacity.value = withTiming(0, { duration: outgoingDuration, easing: Easing.bezier(...motion.easing.exit) });
    headingTranslateY.value = withTiming(0, { duration: reducedMotion ? 0 : outgoingDuration, easing: Easing.bezier(...motion.easing.exit) });
    bodyOpacity.value = withTiming(0, { duration: outgoingDuration, easing: Easing.bezier(...motion.easing.exit) });
    bodyTranslateY.value = withTiming(0, { duration: reducedMotion ? 0 : outgoingDuration, easing: Easing.bezier(...motion.easing.exit) });
  }

  async function startPrimer() {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setError(null);
    const handoffStartedAt = Date.now();
    setStage("handoff");
    try {
      const permissionRequest = getPrimerNotificationPermission().catch(() => null);
      await completeOnboarding();
      let resolvedPermission: PrimerPermissionState = "unavailable";
      const value = await permissionRequest;
      if (value) {
        resolvedPermission = value.status;
        if (mounted.current) {
          setPermission(value);
          setPermissionState(value.status);
          setPermissionProblem(false);
        }
      } else {
        if (mounted.current) {
          setPermissionProblem(true);
          setPermissionState("unavailable");
        }
      }

      if (!mounted.current) return;
      setPrimerPermissionResolved(true);
      let nextStage: "primer" | "auth" = getFirstRunHandoffDestination(resolvedPermission);
      if (nextStage === "auth") {
        try {
          await markNotificationPrimerHandled();
        } catch {
          nextStage = "primer";
          setError("We couldn't save this choice. Please try again, or continue to sign in.");
        }
      }

      const remaining = getRemainingFirstRunHandoffMs(handoffStartedAt, Date.now(), reducedMotion);
      if (remaining > 0) await new Promise<void>((resolve) => setTimeout(resolve, remaining));
      if (!mounted.current) return;
      if (nextStage === "auth") completeRef.current();
      else setStage("primer");
    } catch {
      if (mounted.current) {
        setStage("onboarding");
        setError("We couldn't save your introduction progress. Please try again.");
      }
    } finally {
      if (mounted.current) setBusy(false);
      actionLock.current = false;
    }
  }

  async function skipOnboarding() {
    await startPrimer();
  }

  async function enableNotifications() {
    if (!canRequestPrimerPermission(permission.status, permission.canAskAgain) || actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setPermissionProblem(false);
    setError(null);
    try {
      const value = await requestPrimerNotificationPermission();
      setPermission(value);
      setPermissionState(value.status);
      if (value.status === "granted") {
        await markNotificationPrimerHandled();
        completeRef.current();
      } else setBusy(false);
    } catch {
      setPermissionProblem(true);
      setPermissionState("unavailable");
      setBusy(false);
    } finally { actionLock.current = false; }
  }

  async function continueWithoutNotifications() {
    await finishPrimer();
  }

  const illustrationMotionStyle = useAnimatedStyle(() => ({
    opacity: illustrationOpacity.value,
    transform: [{ translateX: reducedMotion ? 0 : illustrationTranslateX.value }],
  }), [reducedMotion]);
  const headingMotionStyle = useAnimatedStyle(() => ({
    opacity: headingOpacity.value,
    transform: [{ translateY: reducedMotion ? 0 : headingTranslateY.value }],
  }), [reducedMotion]);
  const bodyMotionStyle = useAnimatedStyle(() => ({
    opacity: bodyOpacity.value,
    transform: [{ translateY: reducedMotion ? 0 : bodyTranslateY.value }],
  }), [reducedMotion]);
  return <View style={[styles.root, { paddingTop: Math.max(insets.top, ui.spacing.md), paddingBottom: Math.max(insets.bottom, ui.spacing.md) }]}>
    <StatusBar style={mode === "dark" ? "light" : "dark"} />
    {stage === "onboarding" ? <Animated.View key="onboarding" entering={reducedMotion ? FadeIn.duration(motion.duration.standard) : FadeInUp.duration(motion.duration.onboarding + motion.duration.standard).easing(Easing.bezier(...motion.easing.enter))} exiting={reducedMotion ? FadeOut.duration(motion.duration.firstRunReducedTransition) : FadeOutUp.duration(motion.duration.firstRunScreenExit).easing(Easing.bezier(...motion.easing.exit))} style={styles.stage}>
      <View style={styles.topRow}>
        {page < pages.length - 1 ? <Pressable accessibilityRole="button" accessibilityLabel="Skip introduction" onPress={() => void skipOnboarding()} disabled={busy || pageTransitioning} style={styles.topAction}><Text style={styles.topActionText}>Skip</Text></Pressable> : <View style={styles.topActionPlaceholder} />}
        <Text accessibilityLiveRegion="polite" style={styles.stepLabel}>{page + 1} of {pages.length}</Text>
      </View>
      <ScrollView style={styles.pageViewport} contentContainerStyle={[styles.pageContent, compact && styles.pageContentCompact]} alwaysBounceVertical={false} showsVerticalScrollIndicator={false}>
        <View style={styles.pageContentInner}>
          <OnboardingPageContent item={pages[page]} compact={compact} styles={styles} illustrationMotionStyle={illustrationMotionStyle} headingMotionStyle={headingMotionStyle} bodyMotionStyle={bodyMotionStyle} />
        </View>
      </ScrollView>
      <View accessibilityLabel={`Page ${page + 1} of ${pages.length}`} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: pages.length, now: page + 1 }} style={styles.indicatorTrack}>
        <View style={styles.indicatorRail}>
          {pages.map((dot, index) => <View key={dot.title} style={styles.indicatorSlot}>
            <OnboardingIndicatorDot
              index={index}
              pageIndex={page}
              reducedMotion={reducedMotion}
              from={indicatorFrom}
              to={indicatorTo}
              progress={indicatorProgress}
              transitioning={indicatorTransitioning}
              activeColor={colors.primary}
              inactiveColor={colors.textMuted}
              style={styles.indicatorDot}
            />
          </View>)}
        </View>
      </View>
      <View style={styles.footer}>
        {page > 0 ? <Pressable accessibilityRole="button" accessibilityLabel="Previous introduction page" accessibilityState={{ disabled: pageTransitioning }} disabled={pageTransitioning} onPress={() => goToPage(page - 1)} style={styles.backButton}><Text style={styles.backText}>Back</Text></Pressable> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={page === pages.length - 1 ? "Get started" : "Next introduction page"} accessibilityState={{ busy, disabled: busy || pageTransitioning }} disabled={busy || pageTransitioning} onPress={() => page === pages.length - 1 ? void startPrimer() : goToPage(page + 1)} style={[styles.primaryButton, page > 0 && styles.primaryButtonWithBack]}>
          <Text style={styles.primaryText}>{busy ? "Please wait…" : page === pages.length - 1 ? "Get started" : "Next"}</Text>
        </Pressable>
      </View>
    </Animated.View> : stage === "handoff" ? <Animated.View key="handoff" entering={FadeIn.duration(reducedMotion ? motion.duration.firstRunReducedTransition : motion.duration.loaderTransition)} exiting={FadeOut.duration(reducedMotion ? motion.duration.firstRunReducedTransition : motion.duration.loaderTransition)} style={styles.stage}>
      <LoadingSurface message="Preparing your experience" accessibilityLabel="Preparing your experience" safeAreaAware={false} />
    </Animated.View> : <Animated.View key="primer" entering={reducedMotion ? FadeIn.duration(motion.duration.firstRunReducedTransition) : FadeInUp.duration(motion.duration.firstRunPrimerEntrance).withInitialValues({ transform: [{ translateY: 8 }] }).easing(Easing.bezier(...motion.easing.enter))} exiting={reducedMotion ? FadeOut.duration(motion.duration.firstRunReducedTransition) : FadeOutUp.duration(motion.duration.firstRunScreenExit).easing(Easing.bezier(...motion.easing.exit))} style={styles.stage}>
      <View style={styles.primerContent}>
        <View style={styles.primerIcon} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><View style={styles.bellShape}><View style={styles.bellClapper} /></View><View style={styles.bellBase} /></View>
        <Text accessibilityRole="header" style={styles.heading}>Make room for reminders</Text>
        <Text style={styles.body}>Allow notifications so Mr. Pill Pal can alert you at the times you schedule. You can change this later in your phone settings.</Text>
        <View style={styles.privacyNote}><Text style={styles.privacyNoteTitle}>Your choice</Text><Text style={styles.privacyNoteBody}>We only ask after you choose Enable. Medication and intake records continue to work on this device if reminders are off.</Text></View>
        {permissionState === "granted" ? <Text style={styles.notice}>Notifications are enabled.</Text> : null}
        {permissionState === "denied" && !permission.canAskAgain ? <Text style={styles.notice}>Notifications are off for now. You can enable them later in phone settings.</Text> : null}
        {permissionProblem ? <Text style={styles.notice}>We couldn't check notification access just now. You can continue and change it later.</Text> : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      </View>
      <View style={styles.footer}>
        {canRequestPrimerPermission(permissionState, permission.canAskAgain) && !permissionProblem ? <Pressable accessibilityRole="button" accessibilityLabel="Enable notifications" accessibilityState={{ busy, disabled: busy }} disabled={busy} onPress={() => void enableNotifications()} style={styles.primaryButton}><Text style={styles.primaryText}>{busy ? "Checking…" : "Enable notifications"}</Text></Pressable> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Maybe later, continue to sign in" accessibilityState={{ busy, disabled: busy }} disabled={busy} onPress={() => void continueWithoutNotifications()} style={[styles.secondaryButton, canRequestPrimerPermission(permissionState, permission.canAskAgain) && !permissionProblem && styles.secondaryButtonSpaced]}><Text style={styles.secondaryText}>{permissionProblem ? "Continue" : "Maybe later"}</Text></Pressable>
      </View>
    </Animated.View>}
  </View>;
}

export function BrandedStartupSplash({ duration, ready, onFinished }: { duration: number; ready: boolean; onFinished: () => void }) {
  const systemScheme = useColorScheme();
  const mode = systemScheme === "dark" ? "dark" : "light";
  const colors = mode === "dark" ? darkUiColors : ui.colors;
  const reduceMotion = useReducedMotion();
  const finished = useRef(onFinished);
  const hiddenNative = useRef(false);
  const [handoffReady, setHandoffReady] = useState(false);
  const styles = useMemo(() => createStyles(colors, mode), [colors, mode]);
  useEffect(() => { finished.current = onFinished; }, [onFinished]);
  useEffect(() => {
    if (!ready || !handoffReady) return;
    const timer = setTimeout(() => finished.current(), reduceMotion ? 0 : duration);
    return () => clearTimeout(timer);
  }, [duration, handoffReady, ready, reduceMotion]);
  const handleSurfaceLayout = useCallback(() => {
    if (hiddenNative.current) return;
    hiddenNative.current = true;
    requestAnimationFrame(() => {
      void SplashScreen.hideAsync().catch(() => undefined).finally(() => setHandoffReady(true));
    });
  }, []);

  return <><StatusBar style={mode === "dark" ? "light" : "dark"} /><Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" exiting={FadeOut.duration(reduceMotion ? 0 : motion.duration.fast)} onLayout={handleSurfaceLayout} style={[styles.splash, { backgroundColor: colors.background }]}>
    <View style={styles.splashBrand}>
      <BrandMark variant="simple" size={132} decorative style={styles.brandMark} />
      {handoffReady ? <Animated.View style={styles.splashWordmark}>
        <Animated.Text entering={FadeInUp.duration(reduceMotion ? 0 : motion.duration.deliberate).delay(reduceMotion ? 0 : 35)} style={styles.brandName}>Mr. Pill Pal</Animated.Text>
        <Animated.Text entering={FadeInUp.duration(reduceMotion ? 0 : motion.duration.deliberate).delay(reduceMotion ? 0 : 75)} style={styles.brandTagline}>Medication routines, made simpler.</Animated.Text>
      </Animated.View> : null}
    </View>
  </Animated.View></>;
}

function OnboardingPageContent({
  item,
  compact,
  styles,
  illustrationMotionStyle,
  headingMotionStyle,
  bodyMotionStyle,
}: {
  item: typeof pages[number];
  compact: boolean;
  styles: ReturnType<typeof createStyles>;
  illustrationMotionStyle: AnimatedStyle<ViewStyle>;
  headingMotionStyle: AnimatedStyle<ViewStyle>;
  bodyMotionStyle: AnimatedStyle<ViewStyle>;
}) {
  return <>
    <Animated.View style={[styles.illustrationMotionWrapper, illustrationMotionStyle]}><OnboardingIllustration kind={item.art} compact={compact} /></Animated.View>
    <Animated.View style={[styles.headingWrap, headingMotionStyle]}><Text accessibilityRole="header" style={styles.heading}>{item.title}</Text></Animated.View>
    <Animated.View style={[styles.bodyWrap, bodyMotionStyle]}><Text style={styles.body}>{item.body}</Text></Animated.View>
  </>;
}

function OnboardingIndicatorDot({
  index,
  pageIndex,
  reducedMotion,
  from,
  to,
  progress,
  transitioning,
  activeColor,
  inactiveColor,
  style,
}: {
  index: number;
  pageIndex: number;
  reducedMotion: boolean;
  from: SharedValue<number>;
  to: SharedValue<number>;
  progress: SharedValue<number>;
  transitioning: SharedValue<boolean>;
  activeColor: string;
  inactiveColor: string;
  style: ReturnType<typeof createStyles>["indicatorDot"];
}) {
  const animatedStyle = useAnimatedStyle(() => {
    let width = 6;
    let backgroundColor = index === pageIndex ? activeColor : inactiveColor;

    if (transitioning.value && index === to.value) {
      width = reducedMotion ? 6 : interpolate(progress.value, [0, 0.42, 0.48, 1], [6, 22, 22, 6]);
      backgroundColor = interpolateColor(progress.value, [0, 0.22, 1], [inactiveColor, activeColor, activeColor]);
    } else if (transitioning.value && index === from.value) {
      backgroundColor = interpolateColor(progress.value, [0, 0.34, 1], [activeColor, inactiveColor, inactiveColor]);
    }

    return { width, height: 6, borderRadius: 3, backgroundColor };
  }, [activeColor, inactiveColor, index, pageIndex, reducedMotion]);

  return <Animated.View style={[style, animatedStyle]} />;
}

function OnboardingIllustration({ kind, compact }: { kind: typeof pages[number]["art"]; compact: boolean }) {
  const { colors } = useAppTheme();
  const styles = createStyles(colors, "light");
  return <View accessible={false} style={[styles.illustration, compact && styles.illustrationCompact]}>
    {kind === "routine" ? <View style={styles.timelineArt}>
      <View style={styles.timelineLine} />
      {["Morning", "Afternoon", "Evening"].map((label, index) => <View key={label} style={styles.timelineRow}><View style={[styles.timelineNode, index === 0 && styles.timelineNodeDone]}><Text style={styles.nodeText}>{index === 0 ? "✓" : "•"}</Text></View><View style={styles.timelineCard}><Text style={styles.artTitle}>{label}</Text><Text style={styles.artCaption}>{index === 0 ? "Taken" : "Scheduled"}</Text></View></View>)}
    </View> : null}
    {kind === "today" ? <View style={styles.todayArt}><Text style={styles.artEyebrow}>TODAY</Text><View style={styles.todayCard}><View style={styles.todayDot} /><View style={styles.todayLines}><Text style={styles.artTitle}>Medication reminder</Text><Text style={styles.artCaption}>9:00 AM · Pending</Text></View></View><View style={styles.takenPill}><Text style={styles.takenPillText}>✓  Taken</Text></View></View> : null}
    {kind === "refill" ? <View style={styles.stockArt}><View style={styles.stockBottle}><View style={styles.bottleCap} /><View style={styles.bottleBody}><Text style={styles.bottleCount}>12</Text><Text style={styles.bottleLabel}>tablets</Text></View></View><View style={styles.stockAlert}><Text style={styles.stockAlertTitle}>Stock running low</Text><View style={styles.stockTrack}><View style={styles.stockFill} /></View><Text style={styles.artCaption}>A gentle heads-up</Text></View></View> : null}
    {kind === "profiles" ? <View style={styles.profileArt}><View style={styles.profileTile}><View style={styles.avatarOne}><Text style={styles.avatarText}>A</Text></View><Text style={styles.artTitle}>Your routine</Text></View><View style={styles.profileTile}><View style={styles.avatarTwo}><Text style={styles.avatarText}>B</Text></View><Text style={styles.artTitle}>Family routine</Text></View><View style={styles.reportSlip}><Text style={styles.reportSlipTitle}>Routine report</Text><View style={styles.reportLine} /><View style={styles.reportLineShort} /><Text style={styles.reportCheck}>✓</Text></View></View> : null}
  </View>;
}

function createStyles(colors: ReturnType<typeof useAppTheme>["colors"], mode: "light" | "dark") {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background, paddingHorizontal: ui.spacing.lg },
    stage: { flex: 1 },
    topRow: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    topAction: { minWidth: 72, minHeight: 48, justifyContent: "center" },
    topActionPlaceholder: { width: 72, height: 48 },
    topActionText: { color: colors.primary, fontSize: 16, fontWeight: "600" },
    stepLabel: { color: colors.textSecondary, fontSize: 14, fontWeight: "600" },
    pageViewport: { flex: 1, width: "100%" },
    pageContent: { flexGrow: 1, width: "100%", justifyContent: "center", alignItems: "center", paddingHorizontal: ui.spacing.md, paddingVertical: ui.spacing.md },
    pageContentCompact: { paddingVertical: ui.spacing.xs },
    pageContentInner: { width: "100%", alignItems: "center" },
    illustrationMotionWrapper: { width: "100%", alignItems: "center" },
    illustration: { height: 260, width: "100%", maxWidth: 440, alignItems: "center", justifyContent: "center", marginBottom: ui.spacing.lg },
    illustrationCompact: { height: 196, marginBottom: ui.spacing.md },
    headingWrap: { width: "100%", maxWidth: 460, marginTop: ui.spacing.sm },
    bodyWrap: { width: "100%", maxWidth: 440 },
    heading: { width: "100%", textAlign: "center", color: colors.textPrimary, fontSize: 28, lineHeight: 36, fontWeight: "700" },
    body: { width: "100%", maxWidth: 440, textAlign: "center", color: colors.textSecondary, fontSize: 17, lineHeight: 26, marginTop: ui.spacing.md },
    indicatorTrack: { height: 28, marginTop: ui.spacing.xs, alignItems: "center", justifyContent: "center" },
    indicatorRail: { position: "relative", width: 56, height: 18, flexDirection: "row", alignItems: "center" },
    indicatorSlot: { width: 14, height: 18, justifyContent: "center", alignItems: "center" },
    indicatorDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.textMuted },
    footer: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: ui.spacing.sm, paddingTop: ui.spacing.sm },
    primaryButton: { minHeight: 56, flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: ui.spacing.lg, borderRadius: ui.radius.button, backgroundColor: colors.primary },
    primaryButtonWithBack: { flex: 1 },
    primaryText: { color: colors.onPrimary, fontSize: 17, lineHeight: 24, fontWeight: "700", textAlign: "center" },
    backButton: { minWidth: 76, minHeight: 48, alignItems: "center", justifyContent: "center" },
    backText: { color: colors.textSecondary, fontSize: 16, fontWeight: "600" },
    primerContent: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: ui.spacing.sm },
    primerIcon: { height: 96, width: 96, borderRadius: 48, alignItems: "center", justifyContent: "center", backgroundColor: colors.secondaryBackground },
    bellShape: { width: 36, height: 32, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, backgroundColor: colors.primary },
    bellBase: { width: 54, height: 5, marginTop: 3, borderRadius: 3, backgroundColor: colors.primary },
    bellClapper: { position: "absolute", bottom: -8, left: 13, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
    privacyNote: { width: "100%", maxWidth: 440, marginTop: ui.spacing.xl, padding: ui.spacing.md, borderRadius: ui.radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised },
    privacyNoteTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
    privacyNoteBody: { marginTop: ui.spacing.xs, color: colors.textSecondary, fontSize: 15, lineHeight: 22 },
    notice: { width: "100%", maxWidth: 440, marginTop: ui.spacing.md, color: colors.textSecondary, fontSize: 15, lineHeight: 22, textAlign: "center" },
    error: { width: "100%", maxWidth: 440, marginTop: ui.spacing.md, color: colors.danger, fontSize: 15, lineHeight: 22, textAlign: "center" },
    secondaryButton: { minHeight: 52, flex: 1, alignItems: "center", justifyContent: "center", borderRadius: ui.radius.button, borderWidth: 1, borderColor: colors.outlineBorder, backgroundColor: colors.inputBackground },
    secondaryButtonSpaced: { flex: 0.8 },
    secondaryText: { color: colors.outlineForeground, fontSize: 16, fontWeight: "700" },
    splash: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 3000, justifyContent: "center", alignItems: "center" },
    splashBrand: { width: "100%", alignItems: "center", paddingHorizontal: ui.spacing.xl },
    splashWordmark: { width: "100%", alignItems: "center" },
    brandMark: { marginBottom: ui.spacing.md },
    brandName: { color: colors.textPrimary, fontSize: 28, lineHeight: 36, fontWeight: "700", textAlign: "center" },
    brandTagline: { marginTop: ui.spacing.xs, color: colors.textSecondary, fontSize: 16, lineHeight: 24, textAlign: "center" },
    timelineArt: { width: "78%", maxWidth: 330, gap: 12 },
    timelineLine: { position: "absolute", left: 21, top: 25, bottom: 24, width: 2, backgroundColor: colors.border },
    timelineRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 14 },
    timelineNode: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: colors.borderStrong, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center", zIndex: 1 },
    timelineNodeDone: { backgroundColor: colors.successSurface, borderColor: colors.success },
    nodeText: { color: colors.success, fontSize: 20, fontWeight: "700" },
    timelineCard: { flex: 1, minHeight: 52, justifyContent: "center", paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
    artTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
    artCaption: { marginTop: 3, color: colors.textSecondary, fontSize: 13 },
    todayArt: { width: "86%", maxWidth: 360, padding: 22, borderRadius: 24, backgroundColor: colors.secondaryBackground },
    artEyebrow: { marginBottom: 14, color: colors.textSecondary, fontSize: 13, fontWeight: "700", letterSpacing: 1.1 },
    todayCard: { minHeight: 80, flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 15, backgroundColor: colors.surfaceRaised, gap: 12 },
    todayDot: { width: 13, height: 13, borderRadius: 7, backgroundColor: colors.accent },
    todayLines: { flex: 1 },
    takenPill: { alignSelf: "flex-end", marginTop: 12, paddingVertical: 8, paddingHorizontal: 14, borderRadius: ui.radius.pill, backgroundColor: colors.successSurface },
    takenPillText: { color: colors.badgeTakenForeground, fontSize: 14, fontWeight: "700" },
    stockArt: { width: "84%", maxWidth: 360, minHeight: 188, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 22, borderRadius: 24, backgroundColor: colors.warningSurface, padding: 22 },
    stockBottle: { width: 90, alignItems: "center" },
    bottleCap: { width: 48, height: 15, borderTopLeftRadius: 6, borderTopRightRadius: 6, backgroundColor: colors.primary },
    bottleBody: { width: 82, height: 112, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceRaised, borderWidth: 2, borderColor: colors.borderStrong },
    bottleCount: { color: colors.textPrimary, fontSize: 30, fontWeight: "700" },
    bottleLabel: { color: colors.textSecondary, fontSize: 13 },
    stockAlert: { flex: 1 },
    stockAlertTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
    stockTrack: { width: "100%", height: 10, marginTop: 12, borderRadius: 5, backgroundColor: colors.surfaceRaised, overflow: "hidden" },
    stockFill: { width: "30%", height: 10, borderRadius: 5, backgroundColor: colors.accent },
    profileArt: { width: "90%", maxWidth: 380, flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 12 },
    profileTile: { width: "46%", minHeight: 132, padding: 14, alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 18, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
    avatarOne: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 24, backgroundColor: colors.secondaryBackground },
    avatarTwo: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 24, backgroundColor: colors.warningSurface },
    avatarText: { color: colors.textPrimary, fontSize: 18, fontWeight: "700" },
    reportSlip: { width: "70%", minHeight: 70, padding: 12, borderRadius: 12, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, gap: 6 },
    reportSlipTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: "700" },
    reportLine: { width: "74%", height: 4, borderRadius: 2, backgroundColor: colors.border },
    reportLineShort: { width: "50%", height: 4, borderRadius: 2, backgroundColor: colors.border },
    reportCheck: { position: "absolute", right: 10, top: 12, color: colors.success, fontSize: 18, fontWeight: "700" },
  });
}
