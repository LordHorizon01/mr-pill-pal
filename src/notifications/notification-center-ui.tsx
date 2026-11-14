import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SymbolView } from "expo-symbols";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppTheme } from "@/components/app-theme-provider";
import { AppColorTokens, ui } from "@/components/ui-tokens";
import { useAuthStore } from "@/state/auth.store";
import { useNotificationCenterStore } from "@/state/notification-center.store";
import { useProfileStore } from "@/state/profile.store";
import { useSettingsStore } from "@/state/settings.store";
import { formatNotificationPresentation, formatNotificationTimestamp, getUnreadBadgeLabel } from "./notification-center.domain";
import { getNotificationPanelLayout } from "./notification-center-layout.domain";
import { NotificationEvent } from "./notification-center.types";

type OverlayProps = {
  accountUid: string;
  bannerTopInset: number;
  onReload: () => void;
  onLoadMore: () => void;
  onMarkRead: (event: NotificationEvent) => Promise<void>;
  onMarkAllRead: () => Promise<void>;
};

type NotificationList = "unread" | "read";

export function NotificationBellButton() {
  const { colors } = useAppTheme();
  const userUid = useAuthStore((state) => state.user?.uid ?? null);
  const activeAccountUid = useNotificationCenterStore((state) => state.accountUid);
  const unreadCount = useNotificationCenterStore((state) => state.unreadCount);
  const isPanelOpen = useNotificationCenterStore((state) => state.isPanelOpen);
  const badgeLabel = activeAccountUid === userUid ? getUnreadBadgeLabel(unreadCount) : null;
  const styles = createStyles(colors);

  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={badgeLabel ? `Open notifications, ${badgeLabel} unread` : "Open notifications"}
    accessibilityHint="Opens recent notification history"
    accessibilityState={{ expanded: isPanelOpen }}
    onPress={() => useNotificationCenterStore.getState().openPanel()}
    style={({ pressed }) => [styles.bellButton, pressed && styles.bellPressed]}
  >
    <SymbolView
      accessibilityElementsHidden
      name={{ ios: "bell", android: "notifications", web: "notifications" }}
      size={23}
      tintColor={colors.primary}
    />
    {badgeLabel ? <View accessible={false} style={styles.bellBadge}><Text style={styles.bellBadgeText}>{badgeLabel}</Text></View> : null}
  </Pressable>;
}

export function NotificationCenterOverlay({ accountUid, bannerTopInset, onReload, onLoadMore, onMarkRead, onMarkAllRead }: OverlayProps) {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const userUid = useAuthStore((state) => state.user?.uid ?? null);
  const activeAccountUid = useNotificationCenterStore((state) => state.accountUid);
  const isPanelOpen = useNotificationCenterStore((state) => state.isPanelOpen);
  const events = useNotificationCenterStore((state) => state.events);
  const unreadCount = useNotificationCenterStore((state) => state.unreadCount);
  const totalCount = useNotificationCenterStore((state) => state.totalCount);
  const isLoading = useNotificationCenterStore((state) => state.isLoading);
  const isLoadingMore = useNotificationCenterStore((state) => state.isLoadingMore);
  const hasMore = useNotificationCenterStore((state) => state.hasMore);
  const error = useNotificationCenterStore((state) => state.error);
  const currentBanner = useNotificationCenterStore((state) => state.currentBanner);
  const selectedProfileId = useProfileStore((state) => state.selectedProfileId);
  const hideMedicationName = useSettingsStore((state) => state.hideMedicationName);
  const [selectedList, setSelectedList] = useState<NotificationList>("unread");
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [clockNow, setClockNow] = useState<number | null>(null);
  const panelIsVisible = isPanelOpen && activeAccountUid === accountUid && userUid === accountUid;
  const safeEvents = activeAccountUid === accountUid && userUid === accountUid
    ? events.filter((event) => event.accountUid === accountUid)
    : [];
  const readCount = Math.max(0, totalCount - unreadCount);
  const visibleEvents = safeEvents.filter((event) => selectedList === "read" ? Boolean(event.readAt) : !event.readAt);
  const visibleUnreadCount = activeAccountUid === accountUid && userUid === accountUid ? unreadCount : 0;
  const visibleBanner = activeAccountUid === accountUid && userUid === accountUid && currentBanner?.accountUid === accountUid
    ? currentBanner
    : null;
  const panelLayout = getNotificationPanelLayout(width, height, insets.top, insets.bottom);
  const bannerPresentation = visibleBanner
    ? formatNotificationPresentation(visibleBanner, selectedProfileId, hideMedicationName)
    : null;

  useEffect(() => {
    if (!visibleBanner) return;
    const timeout = setTimeout(() => useNotificationCenterStore.getState().dismissCurrentBanner(accountUid), 6500);
    return () => clearTimeout(timeout);
  }, [accountUid, visibleBanner]);

  useEffect(() => {
    if (!panelIsVisible) return;
    const updateClock = () => setClockNow(Date.now());
    const initialUpdate = setTimeout(updateClock, 0);
    const interval = setInterval(updateClock, 30_000);
    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") updateClock();
    });
    return () => {
      clearTimeout(initialUpdate);
      clearInterval(interval);
      appStateSubscription.remove();
    };
  }, [panelIsVisible]);

  const closePanel = () => {
    setSelectedList("unread");
    setClockNow(null);
    useNotificationCenterStore.getState().closePanel();
  };

  const markAllRead = async () => {
    if (isMarkingAll || visibleUnreadCount === 0) return;
    setIsMarkingAll(true);
    try {
      await onMarkAllRead();
    } finally {
      setIsMarkingAll(false);
    }
  };

  const readListCount = selectedList === "read" ? readCount : visibleUnreadCount;
  const emptyCopy = selectedList === "read" ? "No read notifications" : "No notifications yet";
  const hasNoItemsInSection = readListCount === 0;
  const shouldShowEmptyMessage = !isLoading && !isLoadingMore && !error && (hasNoItemsInSection || !hasMore);
  const showCenteredEmptyList = visibleEvents.length === 0 && shouldShowEmptyMessage;
  const panelMinHeight = showCenteredEmptyList ? panelLayout.emptyMinHeight : undefined;

  return <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
    {visibleBanner && bannerPresentation ? <View pointerEvents="box-none" style={[styles.bannerLayer, { top: insets.top + 8 + bannerTopInset }]}>
      <View accessibilityLiveRegion="polite" style={styles.banner}>
        <View style={styles.bannerIcon}>
          <SymbolView accessibilityElementsHidden name={{ ios: "pills.fill", android: "medication", web: "medication" }} size={19} tintColor={colors.primary} />
        </View>
        <View style={styles.bannerCopy}>
          <Text style={styles.bannerTitle}>{bannerPresentation.primaryMessage}</Text>
          <Text style={styles.bannerMessage}>{bannerPresentation.secondaryMessage}</Text>
          {bannerPresentation.supportingMessage ? <Text style={styles.bannerMessage}>{bannerPresentation.supportingMessage}</Text> : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss in-app notification" onPress={() => useNotificationCenterStore.getState().dismissCurrentBanner(accountUid)} style={styles.bannerClose}>
          <SymbolView accessibilityElementsHidden name={{ ios: "xmark", android: "close", web: "close" }} size={18} tintColor={colors.textSecondary} />
        </Pressable>
      </View>
    </View> : null}

    <Modal
      visible={panelIsVisible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={closePanel}
    >
      <View style={styles.modalRoot}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close notifications" onPress={closePanel} style={[StyleSheet.absoluteFill, styles.scrim]} />
        <View pointerEvents="box-none" style={[styles.panelPlacement, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 12 }]}>
          <View style={[styles.panel, { maxHeight: panelLayout.maxHeight, minHeight: panelMinHeight, width: panelLayout.width }]}>
            <View style={styles.panelHeader}>
              <View style={styles.panelHeaderCopy}>
                <Text accessibilityRole="header" style={styles.panelTitle}>Notifications</Text>
                <Text style={styles.panelCount}>{visibleUnreadCount} unread · {totalCount} total</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={selectedList === "read" ? "Return to unread notifications" : `Show ${readCount} already read notifications`}
                accessibilityState={{ selected: selectedList === "read" }}
                onPress={() => setSelectedList((current) => current === "read" ? "unread" : "read")}
                style={({ pressed }) => [styles.readSectionTouchTarget, pressed && styles.actionPressed]}
              >
                <View style={[styles.readSectionCapsule, selectedList === "read" && styles.readSectionCapsuleSelected]}>
                  {selectedList === "read" ? <>
                    <SymbolView accessibilityElementsHidden name={{ ios: "arrow.left", android: "arrow_back", web: "arrow_back" }} size={13} tintColor={colors.primary} />
                    <Text style={[styles.readSectionButtonText, styles.readSectionButtonTextSelected]}>Notifications</Text>
                  </> : <>
                    <View accessible={false} style={styles.doubleCheckIcon}>
                      <SymbolView accessibilityElementsHidden name={{ ios: "checkmark", android: "check", web: "check" }} size={12} tintColor={colors.primary} />
                      <SymbolView accessibilityElementsHidden style={styles.overlappedCheckIcon} name={{ ios: "checkmark", android: "check", web: "check" }} size={12} tintColor={colors.primary} />
                    </View>
                    <Text style={styles.readSectionButtonText}>Already Read</Text>
                  </>}
                </View>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Close notifications" onPress={closePanel} style={styles.closeButton}>
                <SymbolView accessibilityElementsHidden name={{ ios: "xmark", android: "close", web: "close" }} size={20} tintColor={colors.textSecondary} />
              </Pressable>
            </View>

            {error ? <View style={styles.errorBox}>
              <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Retry loading notifications" onPress={onReload} style={styles.retryButton}><Text style={styles.retryText}>Retry</Text></Pressable>
            </View> : null}

            {isLoading && safeEvents.length === 0 ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : null}
            <FlatList
              data={visibleEvents}
              keyExtractor={(event) => event.id}
              extraData={selectedList}
              renderItem={({ item }) => <NotificationHistoryItem
                event={item}
                selectedProfileId={selectedProfileId}
                hideMedicationName={hideMedicationName}
                now={clockNow ?? 0}
                onMarkRead={onMarkRead}
              />}
              ListHeaderComponent={selectedList === "unread" && visibleUnreadCount > 0 ? <View style={styles.listHeaderActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Mark all ${visibleUnreadCount} notifications as read`}
                  accessibilityState={{ disabled: isMarkingAll, busy: isMarkingAll }}
                  disabled={isMarkingAll}
                  onPress={() => void markAllRead()}
                  style={({ pressed }) => [styles.markAllButton, pressed && !isMarkingAll && styles.actionPressed]}
                >
                  <Text style={[styles.markAllText, isMarkingAll && styles.actionDisabledText]}>{isMarkingAll ? "Saving…" : "Mark all as read"}</Text>
                </Pressable>
              </View> : null}
              style={showCenteredEmptyList ? styles.emptyNotificationList : [styles.notificationList, { maxHeight: panelLayout.listMaxHeight }]}
              contentContainerStyle={showCenteredEmptyList ? styles.emptyListContent : styles.listContent}
              contentInsetAdjustmentBehavior="automatic"
              onEndReached={() => { if (hasMore && !isLoadingMore) onLoadMore(); }}
              onEndReachedThreshold={0.35}
              ListEmptyComponent={shouldShowEmptyMessage ? <View style={styles.emptyState}>
                <SymbolView accessibilityElementsHidden name={{ ios: selectedList === "read" ? "checkmark.circle" : "bell.badge", android: selectedList === "read" ? "check_circle" : "notifications_none", web: selectedList === "read" ? "check_circle" : "notifications_none" }} size={24} tintColor={colors.textMuted} />
                <Text style={styles.emptyTitle}>{emptyCopy}</Text>
              </View> : isLoadingMore || hasMore ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : null}
              ListFooterComponent={isLoadingMore ? <ActivityIndicator color={colors.primary} style={styles.footerLoader} /> : null}
            />
          </View>
        </View>
      </View>
    </Modal>
  </View>;
}

function NotificationHistoryItem({
  event,
  selectedProfileId,
  hideMedicationName,
  now,
  onMarkRead,
}: {
  event: NotificationEvent;
  selectedProfileId: string | null;
  hideMedicationName: boolean;
  now: number;
  onMarkRead: (event: NotificationEvent) => Promise<void>;
}) {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const presentation = formatNotificationPresentation(event, selectedProfileId, hideMedicationName);
  const isUnread = !event.readAt;
  const [isMarkingRead, setIsMarkingRead] = useState(false);

  const markRead = async () => {
    if (!isUnread || isMarkingRead) return;
    setIsMarkingRead(true);
    try {
      await onMarkRead(event);
    } finally {
      setIsMarkingRead(false);
    }
  };

  return <View style={[styles.notificationRow, isUnread && styles.notificationRowUnread]}>
    <View style={styles.notificationCopy}>
      <View style={styles.primaryMessageRow}>
        <View accessible={false} style={styles.messageBullet} />
        <Text style={styles.notificationTitle}>{presentation.primaryMessage}</Text>
      </View>
      <Text style={styles.notificationMessage}>{presentation.secondaryMessage}</Text>
      {presentation.supportingMessage ? <Text style={styles.notificationInstruction}>{presentation.supportingMessage}</Text> : null}
      <Text style={styles.notificationTime}>
        {event.readAt ? <><Text style={styles.readAtLabel}>Read at:</Text> {formatNotificationTimestamp(event.readAt, now)}</> : formatNotificationTimestamp(event.observedAt, now)}
      </Text>
    </View>
    {isUnread ? <Pressable
      accessibilityRole="button"
      accessibilityLabel="Mark notification as read"
      accessibilityHint="Moves this notification to Already Read and does not change medication records."
      accessibilityState={{ disabled: isMarkingRead, busy: isMarkingRead }}
      disabled={isMarkingRead}
      onPress={() => void markRead()}
      style={({ pressed }) => [styles.markReadButton, pressed && !isMarkingRead && styles.markReadButtonPressed, isMarkingRead && styles.markReadButtonDisabled]}
    >
      {isMarkingRead ? <ActivityIndicator size="small" color={colors.primary} /> : <SymbolView accessibilityElementsHidden name={{ ios: "checkmark", android: "check", web: "check" }} size={19} tintColor={colors.primary} />}
    </Pressable> : null}
  </View>;
}

const createStyles = (colors: AppColorTokens) => StyleSheet.create({
  bellButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  bellPressed: { opacity: 0.68 },
  bellBadge: { position: "absolute", top: 3, right: 1, minWidth: 17, height: 17, paddingHorizontal: 4, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: colors.danger, borderWidth: 1, borderColor: colors.background },
  bellBadgeText: { color: colors.onPrimary, fontSize: 9, lineHeight: 12, fontWeight: "800", fontVariant: ["tabular-nums"] },
  modalRoot: { flex: 1 },
  scrim: { backgroundColor: `${colors.scrim}66` },
  panelPlacement: { flex: 1, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  panel: { flexShrink: 1, borderRadius: 18, overflow: "hidden", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, boxShadow: "0 10px 30px rgba(0, 0, 0, 0.22)" },
  panelHeader: { minHeight: 66, flexDirection: "row", alignItems: "center", gap: 4, paddingLeft: 13, paddingRight: 6 },
  panelHeaderCopy: { flex: 1, minWidth: 0 },
  panelTitle: { fontSize: 19, lineHeight: 25, fontWeight: "700", color: colors.textPrimary },
  panelCount: { marginTop: 1, fontSize: 12.5, lineHeight: 17, color: colors.textSecondary },
  closeButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  readSectionTouchTarget: { minWidth: 44, minHeight: 48, alignItems: "center", justifyContent: "center" },
  readSectionCapsule: { minHeight: 32, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: 8, borderRadius: ui.radius.chip, borderWidth: 1, borderColor: colors.outlineBorder, backgroundColor: colors.surface },
  readSectionCapsuleSelected: { backgroundColor: colors.surfaceSubtle },
  readSectionButtonText: { color: colors.textSecondary, fontSize: 12.5, lineHeight: 17, fontWeight: "700" },
  readSectionButtonTextSelected: { color: colors.primary },
  doubleCheckIcon: { flexDirection: "row", alignItems: "center" },
  overlappedCheckIcon: { marginLeft: -6 },
  listHeaderActions: { alignItems: "flex-end", paddingHorizontal: 9, paddingTop: 2 },
  markAllButton: { minHeight: 38, justifyContent: "center", paddingHorizontal: 7 },
  markAllText: { color: colors.primary, fontSize: 12.5, lineHeight: 17, fontWeight: "700" },
  actionPressed: { opacity: 0.68 },
  actionDisabledText: { color: colors.textMuted },
  notificationList: { flexGrow: 0, flexShrink: 1 },
  emptyNotificationList: { flex: 1 },
  listContent: { paddingHorizontal: 9, paddingVertical: 9, gap: 7 },
  emptyListContent: { flexGrow: 1, alignItems: "stretch", justifyContent: "center", paddingHorizontal: 10, paddingVertical: 8 },
  notificationRow: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  notificationRowUnread: { backgroundColor: colors.surfaceSubtle, borderColor: colors.borderStrong },
  primaryMessageRow: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
  messageBullet: { width: 6, height: 6, marginTop: 7, borderRadius: 3, backgroundColor: colors.primary },
  notificationCopy: { flex: 1, minWidth: 0, gap: 2 },
  notificationTitle: { flex: 1, flexShrink: 1, fontSize: 15, lineHeight: 20, fontWeight: "700", color: colors.textPrimary },
  notificationMessage: { fontSize: 12.5, lineHeight: 17, color: colors.textSecondary },
  notificationInstruction: { fontSize: 12.5, lineHeight: 17, color: colors.textSecondary },
  notificationTime: { marginTop: 2, fontSize: 11, lineHeight: 15, color: colors.textMuted },
  readAtLabel: { fontWeight: "700", color: colors.textSecondary },
  markReadButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 24, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  markReadButtonPressed: { backgroundColor: colors.primarySoft },
  markReadButtonDisabled: { opacity: 0.6 },
  emptyState: { alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 12, paddingVertical: 12 },
  emptyTitle: { color: colors.textPrimary, fontSize: 14, lineHeight: 19, fontWeight: "700", textAlign: "center" },
  loader: { paddingVertical: 18 },
  footerLoader: { paddingVertical: 14 },
  errorBox: { margin: 10, padding: 10, borderRadius: 10, backgroundColor: colors.dangerSurface, gap: 5 },
  errorText: { color: colors.dangerForeground, fontSize: 13, lineHeight: 19 },
  retryButton: { alignSelf: "flex-start", minHeight: 40, justifyContent: "center", paddingHorizontal: 8 },
  retryText: { color: colors.dangerForeground, fontSize: 14, fontWeight: "700" },
  bannerLayer: { position: "absolute", left: 0, right: 0, zIndex: 3000, alignItems: "center", paddingHorizontal: 12 },
  banner: { width: "100%", maxWidth: 560, minHeight: 82, flexDirection: "row", alignItems: "flex-start", gap: 9, paddingVertical: 10, paddingHorizontal: 11, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, boxShadow: "0 5px 18px rgba(0, 0, 0, 0.18)" },
  bannerIcon: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: colors.primarySoft },
  bannerCopy: { flex: 1, gap: 2 },
  bannerTitle: { color: colors.textPrimary, fontSize: 14, lineHeight: 19, fontWeight: "700" },
  bannerMessage: { color: colors.textSecondary, fontSize: 12.5, lineHeight: 17 },
  bannerClose: { width: ui.touch.minimum, height: ui.touch.minimum, alignItems: "center", justifyContent: "center", borderRadius: 12 },
});
