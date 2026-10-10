import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { AppColorTokens } from "@/components/ui-tokens";
import { getHomeDateCarouselDates, getHomeDateCarouselIndex, getHomeDateIndexFromOffset, getHomeDateOffsetForIndex, isHomeDateToday } from "@/features/doses/home-date-carousel.domain";
import { parseLocalDate } from "@/features/doses/dose.domain";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

const CARD_WIDTH = 52;
const ITEM_GAP = 7;
const ITEM_STRIDE = CARD_WIDTH + ITEM_GAP;
const CARD_HEIGHT = 70;
const STRIP_HEIGHT = 88;
const STRIP_ACTION_HEIGHT = 28;
const STRIP_EXPANDED_HEIGHT = STRIP_HEIGHT + STRIP_ACTION_HEIGHT;
const STRIP_HORIZONTAL_MARGIN = 18;
const STRIP_MAX_WIDTH = 420;

type Props = {
  todayDate: string;
  selectedScheduleDate: string;
  colors: AppColorTokens;
  onSelectDate: (date: string) => void;
};

export function HomeDateCarousel({ todayDate, selectedScheduleDate, colors, onSelectDate }: Props) {
  const listRef = useRef<FlatList<string>>(null);
  const lastOffset = useRef(0);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const centeredTodayRef = useRef(false);
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const styles = createStyles(colors);
  const dates = useMemo(() => getHomeDateCarouselDates(todayDate), [todayDate]);
  const todayIndex = getHomeDateCarouselIndex(todayDate, todayDate);
  const selectedIndex = getHomeDateCarouselIndex(selectedScheduleDate, todayDate);
  const hasOtherSelectedDate = selectedScheduleDate !== todayDate;
  const [stripHeight] = useState(() => new Animated.Value(hasOtherSelectedDate ? STRIP_EXPANDED_HEIGHT : STRIP_HEIGHT));
  const [showTodayAction, setShowTodayAction] = useState(hasOtherSelectedDate);
  const stripWidth = Math.min(Math.max(0, width - STRIP_HORIZONTAL_MARGIN * 2), STRIP_MAX_WIDTH);
  const listWidth = Math.max(0, stripWidth - 18);
  const horizontalInset = Math.max(0, (listWidth - ITEM_STRIDE) / 2);

  function clearSettleTimer() {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = null;
  }

  function commitCenteredDate(offset = lastOffset.current) {
    clearSettleTimer();
    const index = getHomeDateIndexFromOffset(offset, ITEM_STRIDE, dates.length);
    const nextDate = dates[index];
    if (nextDate && nextDate !== selectedScheduleDate) onSelectDate(nextDate);
  }

  function scrollToDate(date: string) {
    const index = getHomeDateCarouselIndex(date, todayDate);
    const offset = getHomeDateOffsetForIndex(index, ITEM_STRIDE);
    clearSettleTimer();
    listRef.current?.scrollToOffset({ offset, animated: true });
    const fallbackDuration = Math.min(900, Math.max(360, Math.abs(offset - lastOffset.current) * 0.12));
    settleTimer.current = setTimeout(() => commitCenteredDate(), fallbackDuration);
  }

  useEffect(() => () => clearSettleTimer(), []);

  useEffect(() => {
    const animation = Animated.timing(stripHeight, {
      toValue: hasOtherSelectedDate ? STRIP_EXPANDED_HEIGHT : STRIP_HEIGHT,
      duration: reduceMotion ? 1 : 200,
      useNativeDriver: false,
    });
    animation.start(({ finished }) => {
      if (finished) setShowTodayAction(hasOtherSelectedDate);
    });
    return () => animation.stop();
  }, [hasOtherSelectedDate, reduceMotion, stripHeight]);

  function centerTodayOnFirstLayout() {
    if (centeredTodayRef.current) return;
    centeredTodayRef.current = true;
    requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: getHomeDateOffsetForIndex(todayIndex, ITEM_STRIDE), animated: false }));
  }

  const getItemLayout = (_: ArrayLike<string> | null | undefined, index: number) => ({ length: ITEM_STRIDE, offset: ITEM_STRIDE * index, index });

  return <View style={[styles.container, { width: stripWidth }]}>
    <Animated.View style={[styles.strip, { height: stripHeight }]}>
      <FlatList
        ref={listRef}
        horizontal
        data={dates}
        keyExtractor={(date) => date}
        renderItem={({ item, index }) => <HomeDateCard date={item} todayDate={todayDate} selected={index === selectedIndex} colors={colors} reduceMotion={reduceMotion} onPress={scrollToDate} />}
        extraData={`${selectedScheduleDate}:${todayDate}`}
        style={styles.list}
        contentContainerStyle={{ paddingHorizontal: horizontalInset }}
        showsHorizontalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
        decelerationRate="fast"
        snapToInterval={ITEM_STRIDE}
        snapToAlignment="start"
        scrollEventThrottle={16}
        initialScrollIndex={todayIndex}
        getItemLayout={getItemLayout}
        onLayout={centerTodayOnFirstLayout}
        onContentSizeChange={centerTodayOnFirstLayout}
        onScroll={(event) => { lastOffset.current = Math.max(0, event.nativeEvent.contentOffset.x); }}
        onScrollBeginDrag={clearSettleTimer}
        onScrollEndDrag={() => { clearSettleTimer(); settleTimer.current = setTimeout(() => commitCenteredDate(), 160); }}
        onMomentumScrollBegin={clearSettleTimer}
        onMomentumScrollEnd={(event) => commitCenteredDate(event.nativeEvent.contentOffset.x)}
        onScrollToIndexFailed={() => listRef.current?.scrollToOffset({ offset: getHomeDateOffsetForIndex(todayIndex, ITEM_STRIDE), animated: false })}
        accessibilityLabel="Browse schedule dates"
      />
      {showTodayAction || hasOtherSelectedDate ? <Pressable accessibilityRole="button" accessibilityLabel="Back to today" accessibilityElementsHidden={!hasOtherSelectedDate} importantForAccessibility={hasOtherSelectedDate ? "auto" : "no-hide-descendants"} disabled={!hasOtherSelectedDate} hitSlop={{ top: 10, bottom: 10 }} onPress={() => scrollToDate(todayDate)} style={styles.todayAction}>
        <Text style={styles.todayActionText}>Back to today</Text>
      </Pressable> : null}
    </Animated.View>
  </View>;
}

function HomeDateCard({ date, todayDate, selected, colors, reduceMotion, onPress }: { date: string; todayDate: string; selected: boolean; colors: AppColorTokens; reduceMotion: boolean; onPress: (date: string) => void }) {
  const styles = createStyles(colors);
  const today = isHomeDateToday(date, todayDate);
  const parsedDate = parseLocalDate(date);
  const weekday = parsedDate.toLocaleDateString(undefined, { weekday: "short" });
  const fullDate = parsedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const dateNumber = parsedDate.toLocaleDateString(undefined, { day: "numeric" });
  const month = parsedDate.toLocaleDateString(undefined, { month: "short" });
  const [scale] = useState(() => new Animated.Value(selected ? 1.07 : 1));

  useEffect(() => {
    const animation = Animated.timing(scale, { toValue: selected ? 1.07 : 1, duration: reduceMotion ? 0 : 190, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [reduceMotion, scale, selected]);

  const todayStyle = today ? styles.todayCard : undefined;
  const selectedStyle = selected && !today ? styles.selectedCard : undefined;
  const textColor = today ? colors.onPrimary : colors.textPrimary;
  const secondaryColor = today ? colors.primarySoft : colors.textSecondary;
  const topRegionColor = today ? colors.primaryStrong : colors.surfaceSubtle;
  const lowerRegionColor = today ? colors.primary : colors.surface;
  const label = `${fullDate}${today ? ", today" : ""}${selected ? ", selected" : ""}`;

  return <View style={styles.itemSlot}>
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} onPress={() => onPress(date)} style={styles.cardHitTarget}>
      <Animated.View style={[styles.card, todayStyle, selectedStyle, { transform: [{ scale }] }]}>
        <View style={[styles.dayRegion, { backgroundColor: topRegionColor }]}>
          <Text maxFontSizeMultiplier={1.4} style={[styles.weekday, { color: today ? colors.onPrimary : selected ? colors.primaryStrong : colors.textSecondary }]}>{weekday.toUpperCase()}</Text>
        </View>
        <View accessible={false} style={[styles.separator, { backgroundColor: today ? colors.onPrimary : selected ? colors.primary : colors.dividerStrong, opacity: today ? 0.48 : 0.72 }]} />
        <View style={[styles.dateRegion, { backgroundColor: lowerRegionColor }]}>
          <Text maxFontSizeMultiplier={1.4} style={[styles.dateNumber, { color: textColor, fontWeight: selected || today ? "700" : "600" }]}>{dateNumber}</Text>
          <Text maxFontSizeMultiplier={1.4} style={[styles.month, { color: today ? colors.primarySoft : selected ? colors.primaryStrong : secondaryColor }]}>{month.toUpperCase()}</Text>
        </View>
      </Animated.View>
    </Pressable>
  </View>;
}

const createStyles = (colors: AppColorTokens) => StyleSheet.create({
  container: { alignSelf: "center", marginBottom: 12 },
  strip: { paddingHorizontal: 8, borderRadius: 17, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSubtle, overflow: "hidden", justifyContent: "flex-start" },
  list: { height: STRIP_HEIGHT, overflow: "hidden" },
  itemSlot: { width: ITEM_STRIDE, height: STRIP_HEIGHT, alignItems: "center", justifyContent: "center", overflow: "visible" },
  cardHitTarget: { width: ITEM_STRIDE, height: STRIP_HEIGHT, justifyContent: "center", alignItems: "center" },
  card: { width: CARD_WIDTH, height: CARD_HEIGHT, overflow: "hidden", borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  todayCard: { borderColor: colors.primaryStrong, borderWidth: 1 },
  selectedCard: { borderColor: colors.primary, borderWidth: 1.5, backgroundColor: colors.surface },
  dayRegion: { height: 21, alignItems: "center", justifyContent: "center" },
  weekday: { fontSize: 10, lineHeight: 13, fontWeight: "600", letterSpacing: 0.25 },
  separator: { height: 1, width: "100%" },
  dateRegion: { height: 46, alignItems: "center", justifyContent: "center" },
  dateNumber: { fontSize: 18, lineHeight: 22, fontWeight: "600", fontVariant: ["tabular-nums"] },
  month: { fontSize: 9, lineHeight: 11, fontWeight: "600", letterSpacing: 0.35 },
  todayAction: { height: STRIP_ACTION_HEIGHT, width: "100%", alignItems: "center", justifyContent: "flex-start" },
  todayActionText: { color: colors.outlineForeground, fontSize: 13, lineHeight: 18, fontWeight: "600" },
});
