import { useState } from "react";
import { Animated, Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppDrawer } from "@/components/app-drawer";
import { useAppTheme, useAppThemeColorStyle } from "@/components/app-theme-provider";
import { AppColorTokens, ui } from "@/components/ui-tokens";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

const primaryLogo = require("../../assets/brand/runtime/ui/Primary Horizontal Logo/mpp-logo-horizontal-home-header.png");
const homeBrandInset = 21;
const homeMenuOpticalOffsetY = 4;
const logoOpticalOffsetX = -2;
const pageHeaderInset = 18;
const logoWidthTarget = 194;
// Ratios are measured within the visible bounds of the approved 2400 x 800 PNG master.
const logoSymbolCenterRatio = (455 - 173) / (2226 - 173);
const logoWordmarkStartRatio = (823 - 173) / (2226 - 173);
const logoWordmarkBottomRatio = (577 - 107) / (693 - 107);
const logoVisibleAspectRatio = (2226 - 173) / (693 - 107);

type ScreenHeaderProps = { title: string; variant?: "home" | "page"; greeting?: string; date?: string };

export function ScreenHeader({ title, variant = "page", greeting, date }: ScreenHeaderProps) {
  const { openDrawer } = useAppDrawer();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const styles = createStyles(colors);
  const [feedback] = useState(() => new Animated.Value(1));
  const [homeCopyHeight, setHomeCopyHeight] = useState(42);
  const [pageTitleHeight, setPageTitleHeight] = useState(28);
  const isHome = variant === "home";
  const logoWidth = Math.min(logoWidthTarget, Math.max(0, width - homeBrandInset * 2));
  const logoHeight = logoWidth / logoVisibleAspectRatio;
  const heading = greeting ?? title;
  const wordmarkStartX = homeBrandInset + logoOpticalOffsetX + logoWidth * logoWordmarkStartRatio;
  const symbolCenterX = homeBrandInset + logoOpticalOffsetX + logoWidth * logoSymbolCenterRatio;
  const wordmarkDividerY = logoHeight * logoWordmarkBottomRatio + 2.5;
  const homeCopyTop = wordmarkDividerY + 1 + 2;
  const menuTop = logoHeight + 2 - 8 + homeMenuOpticalOffsetY;
  const homeContentHeight = Math.max(menuTop + 48, homeCopyTop + homeCopyHeight) + 4;
  const pageHeaderRowHeight = Math.max(48, pageTitleHeight + 6);
  const greetingMatch = /^(Good (?:morning|afternoon|evening), )(.+)$/.exec(heading);
  const greetingName = greetingMatch?.[2];
  const emphasizeGreetingName = Boolean(greetingName && !/^User(?:\s+\d+)?$/i.test(greetingName));
  const animatedSurface = useAppThemeColorStyle({ backgroundColor: "background" });
  const feedbackDuration = reduceMotion ? 1 : 110;

  function animateFeedback(toValue: number) {
    Animated.timing(feedback, { toValue, duration: feedbackDuration, useNativeDriver: true }).start();
  }

  return <Animated.View style={[styles.container, animatedSurface, isHome ? styles.homeContainer : styles.pageContainer]}>
    {isHome ? <View style={{ paddingTop: insets.top + 1 }}>
      <View style={{ height: homeContentHeight, width, position: "relative" }}>
        <Image accessibilityLabel="Mr. Pill Pal" accessible source={primaryLogo} resizeMode="contain" style={{ position: "absolute", left: homeBrandInset, top: 0, width: logoWidth, height: logoHeight, transform: [{ translateX: logoOpticalOffsetX }] }} />
        <View style={[styles.wordmarkDivider, { left: wordmarkStartX, top: wordmarkDividerY, width: Math.max(0, width - 1 - wordmarkStartX) }]} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open navigation menu"
          onPress={openDrawer}
          onPressIn={() => animateFeedback(0.76)}
          onPressOut={() => animateFeedback(1)}
          style={[styles.menuHitTarget, { left: symbolCenterX - 24, top: menuTop }]}
        >
          <Animated.View style={[styles.menuSurface, { opacity: feedback }]}>
            <View accessible={false} style={styles.hamburger}>
              <View style={styles.hamburgerLine} />
              <View style={styles.hamburgerLine} />
              <View style={styles.hamburgerLine} />
            </View>
          </Animated.View>
        </Pressable>
        <View
          onLayout={(event) => setHomeCopyHeight((previous) => Math.abs(previous - event.nativeEvent.layout.height) < 0.5 ? previous : event.nativeEvent.layout.height)}
          style={[styles.homeCopy, { left: wordmarkStartX, right: 16, top: homeCopyTop }]}
        >
          <Text accessibilityRole="header" style={styles.homeTitle}>
            {emphasizeGreetingName && greetingMatch ? <><Text style={styles.homeGreetingPrefix}>{greetingMatch[1]}</Text><Text style={styles.homeGreetingName}>{greetingName}</Text></> : heading}
          </Text>
          {date ? <Text style={styles.date}>{date}</Text> : null}
        </View>
      </View>
    </View> : null}
    {!isHome ? <View style={{ paddingTop: insets.top + 2, paddingHorizontal: pageHeaderInset }}>
      <View style={{ width: width - pageHeaderInset * 2, height: pageHeaderRowHeight, position: "relative" }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open navigation menu"
          onPress={openDrawer}
          onPressIn={() => animateFeedback(0.76)}
          onPressOut={() => animateFeedback(1)}
          style={[styles.menuHitTarget, { left: symbolCenterX - pageHeaderInset - 24, top: 0 }]}
        >
          <Animated.View style={[styles.menuSurface, styles.pageMenuSurface, { opacity: feedback }]}>
            <View accessible={false} style={styles.hamburger}>
              <View style={styles.hamburgerLine} />
              <View style={styles.hamburgerLine} />
              <View style={styles.hamburgerLine} />
            </View>
          </Animated.View>
        </Pressable>
        <View style={[styles.pageCopy, { left: symbolCenterX - pageHeaderInset + 27, right: 0, top: 3 }]}>
          <Text accessibilityRole="header" onLayout={(event) => setPageTitleHeight((previous) => Math.abs(previous - event.nativeEvent.layout.height) < 0.5 ? previous : event.nativeEvent.layout.height)} style={styles.pageTitle}>{heading}</Text>
        </View>
      </View>
    </View> : null}
  </Animated.View>;
}

const createStyles = (colors: AppColorTokens) => StyleSheet.create({
  container: { marginHorizontal: -ui.spacing.screen, paddingBottom: 0 },
  homeContainer: { paddingBottom: 0 },
  pageContainer: { paddingBottom: 0 },
  wordmarkDivider: { height: 1, position: "absolute", backgroundColor: colors.dividerStrong },
  menuHitTarget: { width: 48, height: 48, position: "absolute", alignItems: "center", justifyContent: "center" },
  menuSurface: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surfaceSubtle },
  pageMenuSurface: { transform: [{ translateY: -7 }] },
  hamburger: { width: 16, gap: 3 },
  hamburgerLine: { height: 2, width: "100%", borderRadius: 1, backgroundColor: colors.textPrimary },
  homeCopy: { position: "absolute" },
  pageCopy: { position: "absolute" },
  homeTitle: { fontSize: 16, lineHeight: 20, fontWeight: "400", color: colors.textPrimary },
  homeGreetingPrefix: { fontSize: 16, lineHeight: 20, fontWeight: "400", color: colors.textPrimary },
  homeGreetingName: { fontSize: 16, lineHeight: 20, fontWeight: "600", color: colors.textPrimary },
  pageTitle: { fontSize: 20, lineHeight: 26, fontWeight: "600", color: colors.textPrimary },
  date: { marginTop: 1, fontSize: 12.5, lineHeight: 15, color: colors.textSecondary },
});
