import { useFocusEffect } from "expo-router";
import { useCallback, useRef } from "react";
import { StyleProp, ViewStyle } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { motion } from "@/components/motion-tokens";
import { getTabContentFadeConfig } from "@/features/loading/content-loading.domain";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

/**
 * First focus is immediate; returning to a visited tab gets a subtle opacity
 * fade only. The tab bar remains outside this view and never moves.
 */
export function TabContentTransition({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(1);
  const hasFocusedBefore = useRef(false);

  useFocusEffect(useCallback(() => {
    const returningToScreen = hasFocusedBefore.current;
    hasFocusedBefore.current = true;
    cancelAnimation(opacity);

    if (!returningToScreen) {
      opacity.set(1);
      return;
    }

    const { fromOpacity, duration } = getTabContentFadeConfig(reduceMotion);
    opacity.set(fromOpacity);
    const config = { duration, easing: Easing.bezier(...motion.easing.standard) };
    opacity.set(withTiming(1, config));

    return () => {
      cancelAnimation(opacity);
    };
  }, [opacity, reduceMotion]));

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={[{ flex: 1 }, style, animatedStyle]}>{children}</Animated.View>;
}
