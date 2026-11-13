import { useEffect } from "react";
import {
  ActivityIndicator,
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
import { NotificationEvent } from "./notification-center.types";

type OverlayProps = {
  accountUid: string;
  bannerTopInset: number;
  onReload: () => void;
  onLoadMore: () => void;
  onMarkRead: (event: NotificationEvent) => void;
  onMarkAllRead: () => void;
};

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
  const safeEvents = activeAccountUid === accountUid && userUid === accountUid
    ? events.filter((event) => event.accountUid === accountUid)
    : [];
  const visibleUnreadCount = activeAccountUid === accountUid && userUid === accountUid ? unreadCount : 0;
  const visibleBanner = activeAccountUid === accountUid && userUid === accountUid && currentBanner?.accountUid === accountUid
    ? currentBanner
    : null;
  const panelMaxHeight = Math.max(220, height - insets.top - insets.bottom - 36);

  useEffect(() => {
    if (!visibleBanner) return;
    const timeout = setTimeout(() => useNotificationCenterStore.getState().dismissCurrentBanner(accountUid), 6500);
    return () => clearTimeout(timeout);
  }, [accountUid, visibleBanner]);

  const dismissBanner = () => useNotificationCenterStore.getState().dismissCurrentBanner(accountUid);
  const closePanel = () => useNotificationCenterStore.getState().closePanel();

  return <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
    {visibleBanner ? <View pointerEvents="box-none" style={[styles.bannerLayer, { top: insets.top + 8 + bannerTopInset }]}>
      <View accessibilityLiveRegion="polite" style={styles.banner}>
        <View style={styles.bannerIcon}><Text accessibilityElementsHidden style={styles.bannerIconText}>✦</Text></View>
        <View style={styles.bannerCopy}>
          <Text numberOfLines={2} style={styles.bannerTitle}>{formatNotificationPresentation(visibleBanner, selectedProfileId, hideMedicationName).title}</Text>
          <Text numberOfLines={3} style={styles.bannerMessage}>{formatNotificationPresentation(visibleBanner, selectedProfileId, hideMedicationName).message}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss in-app notification" onPress={dismissBanner} style={styles.bannerClose}>
          <SymbolView accessibilityElementsHidden name={{ ios: "xmark", android: "close", web: "close" }} size={18} tintColor={colors.textSecondary} />
        </Pressable>
      </View>
    </View> : null}

    <Modal
      visible={isPanelOpen && activeAccountUid === accountUid && userUid === accountUid}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={closePanel}
    >
      <View style={styles.modalRoot}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close notifications" onPress={closePanel} style={[StyleSheet.absoluteFill, styles.scrim]} />
        <View pointerEvents="box-none" style={[styles.panelPlacement, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 12 }]}>
          <View style={[styles.panel, { maxHeight: panelMaxHeight, width: Math.min(width - 32, 440) }]}>
            <View style={styles.panelHeader}>
              <View style={styles.panelHeaderCopy}>
                <Text accessibilityRole="header" style={styles.panelTitle}>Notifications</Text>
                <Text style={styles.panelCount}>{visibleUnreadCount} unread · {totalCount} total</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close notifications" onPress={closePanel} style={styles.closeButton}>
                <SymbolView accessibilityElementsHidden name={{ ios: "xmark", android: "close", web: "close" }} size={20} tintColor={colors.textSecondary} />
              </Pressable>
            </View>
            <View style={styles.panelActions}>
              {visibleUnreadCount > 0 ? <Pressable accessibilityRole="button" accessibilityLabel={`Mark all ${visibleUnreadCount} notifications as read`} onPress={onMarkAllRead} style={styles.markAllButton}>
                <Text style={styles.markAllText}>Mark all as read</Text>
              </Pressable> : <View />}
              <Text style={styles.observedNote}>History includes app-observed events and alerts still shown in the system tray.</Text>
            </View>

            {error ? <View style={styles.errorBox}>
              <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Retry loading notifications" onPress={onReload} style={styles.retryButton}><Text style={styles.retryText}>Retry</Text></Pressable>
            </View> : null}

            {isLoading && safeEvents.length === 0 ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : null}
            {!isLoading && !error && safeEvents.length === 0 ? <View style={styles.emptyState}>
              <SymbolView accessibilityElementsHidden name={{ ios: "bell.badge", android: "notifications_none", web: "notifications_none" }} size={28} tintColor={colors.textMuted} />
              <Text style={styles.emptyTitle}>No notification events yet</Text>
              <Text style={styles.emptyMessage}>New medication reminders and low-stock alerts observed on this device will appear here.</Text>
            </View> : null}
            <FlatList
              data={safeEvents}
              keyExtractor={(event) => event.id}
              renderItem={({ item }) => <NotificationHistoryItem
                event={item}
                selectedProfileId={selectedProfileId}
                hideMedicationName={hideMedicationName}
                onMarkRead={onMarkRead}
              />}
              contentContainerStyle={safeEvents.length ? styles.listContent : undefined}
              contentInsetAdjustmentBehavior="automatic"
              onEndReached={() => { if (hasMore) onLoadMore(); }}
              onEndReachedThreshold={0.35}
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
  onMarkRead,
}: {
  event: NotificationEvent;
  selectedProfileId: string | null;
  hideMedicationName: boolean;
  onMarkRead: (event: NotificationEvent) => void;
}) {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const presentation = formatNotificationPresentation(event, selectedProfileId, hideMedicationName);
  const isUnread = !event.readAt;
  const observationLabel = event.deliverySources.includes("foreground_received")
    ? "Observed while app was running"
    : event.deliverySources.includes("notification_response")
      ? "Opened from a system notification"
      : "Observed in the system tray";
  const row = <View style={[styles.notificationRow, isUnread && styles.notificationRowUnread]}>
    <View style={[styles.unreadDot, isUnread ? styles.unreadDotVisible : styles.unreadDotHidden]} />
    <View style={styles.notificationCopy}>
      <Text numberOfLines={2} style={[styles.notificationTitle, !isUnread && styles.notificationTitleRead]}>{presentation.title}</Text>
      <Text style={styles.notificationMessage}>{presentation.message}</Text>
      <Text style={styles.notificationTime}>{observationLabel} · {formatNotificationTimestamp(event.observedAt)}</Text>
    </View>
    {isUnread ? <Text style={styles.unreadLabel}>Unread</Text> : null}
  </View>;

  if (!isUnread) return row;
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={`Mark as read: ${presentation.title}`}
    accessibilityHint="Marks this notification as read without opening another screen"
    onPress={() => onMarkRead(event)}
    style={({ pressed }) => [pressed && styles.notificationRowPressed]}
  >{row}</Pressable>;
}

const createStyles = (colors: AppColorTokens) => StyleSheet.create({
  bellButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  bellPressed: { opacity: 0.68 },
  bellBadge: { position: "absolute", top: 3, right: 1, minWidth: 17, height: 17, paddingHorizontal: 4, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: colors.danger, borderWidth: 1, borderColor: colors.background },
  bellBadgeText: { color: colors.onPrimary, fontSize: 9, lineHeight: 12, fontWeight: "800", fontVariant: ["tabular-nums"] },
  modalRoot: { flex: 1 },
  scrim: { backgroundColor: `${colors.scrim}66` },
  panelPlacement: { flex: 1, paddingHorizontal: 16, alignItems: "flex-end", justifyContent: "flex-start" },
  panel: { flexShrink: 1, borderRadius: 18, overflow: "hidden", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, boxShadow: "0 10px 30px rgba(0, 0, 0, 0.22)" },
  panelHeader: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12, paddingLeft: 18, paddingRight: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  panelHeaderCopy: { flex: 1 },
  panelTitle: { fontSize: 20, lineHeight: 27, fontWeight: "700", color: colors.textPrimary },
  panelCount: { marginTop: 1, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  closeButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  panelActions: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: colors.border },
  markAllButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 2 },
  markAllText: { color: colors.primary, fontSize: 14, fontWeight: "700" },
  observedNote: { flexShrink: 1, textAlign: "right", color: colors.textMuted, fontSize: 11, lineHeight: 15 },
  listContent: { padding: 10, gap: 8 },
  notificationRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, minHeight: 74, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  notificationRowUnread: { backgroundColor: colors.surfaceSubtle, borderColor: colors.borderStrong },
  notificationRowPressed: { opacity: 0.82 },
  unreadDot: { width: 9, height: 9, marginTop: 5, borderRadius: 5 },
  unreadDotVisible: { backgroundColor: colors.primary },
  unreadDotHidden: { backgroundColor: "transparent" },
  notificationCopy: { flex: 1, gap: 3 },
  notificationTitle: { fontSize: 15, lineHeight: 20, fontWeight: "700", color: colors.textPrimary },
  notificationTitleRead: { fontWeight: "600", color: colors.textSecondary },
  notificationMessage: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  notificationTime: { marginTop: 2, fontSize: 11, lineHeight: 15, color: colors.textMuted },
  unreadLabel: { alignSelf: "center", color: colors.primary, fontSize: 10, fontWeight: "700" },
  emptyState: { alignItems: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 30 },
  emptyTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "700", textAlign: "center" },
  emptyMessage: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, textAlign: "center" },
  loader: { paddingVertical: 24 },
  footerLoader: { paddingVertical: 16 },
  errorBox: { margin: 12, padding: 12, borderRadius: 10, backgroundColor: colors.dangerSurface, gap: 6 },
  errorText: { color: colors.dangerForeground, fontSize: 13, lineHeight: 19 },
  retryButton: { alignSelf: "flex-start", minHeight: 40, justifyContent: "center", paddingHorizontal: 8 },
  retryText: { color: colors.dangerForeground, fontSize: 14, fontWeight: "700" },
  bannerLayer: { position: "absolute", left: 0, right: 0, zIndex: 3000, alignItems: "center", paddingHorizontal: 12 },
  banner: { width: "100%", maxWidth: 560, minHeight: 82, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, boxShadow: "0 5px 18px rgba(0, 0, 0, 0.18)" },
  bannerIcon: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: colors.primarySoft },
  bannerIconText: { color: colors.primary, fontSize: 18, fontWeight: "700" },
  bannerCopy: { flex: 1, gap: 2 },
  bannerTitle: { color: colors.textPrimary, fontSize: 14, lineHeight: 19, fontWeight: "700" },
  bannerMessage: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  bannerClose: { width: ui.touch.minimum, height: ui.touch.minimum, alignItems: "center", justifyContent: "center", borderRadius: 12 },
});
