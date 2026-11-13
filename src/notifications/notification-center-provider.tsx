import { type ReactNode, useCallback, useEffect } from "react";
import { AppState, View } from "react-native";
import * as Notifications from "expo-notifications";
import { useAuthStore } from "@/state/auth.store";
import { useNotificationCenterStore } from "@/state/notification-center.store";
import {
  getNotificationHistoryPage,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  recordNotificationObservation,
} from "./notification-history.repository";
import { parseNotificationObservation } from "./notification-center.domain";
import { NotificationEvent, NotificationObservationSource } from "./notification-center.types";
import { NotificationCenterOverlay } from "./notification-center-ui";

const HISTORY_PAGE_SIZE = 30;

type Props = {
  accountUid: string;
  bannerTopInset?: number;
  children: ReactNode;
};

/** One authenticated-app coordinator owns Expo notification listeners for all tabs and routes. */
export function NotificationCenterProvider({ accountUid, bannerTopInset = 0, children }: Props) {
  const activeAccountUid = useNotificationCenterStore((state) => state.accountUid);
  const isPanelOpen = useNotificationCenterStore((state) => state.isPanelOpen);
  const authenticatedUid = useAuthStore((state) => state.user?.uid ?? null);

  const isCurrentAccount = useCallback(() =>
    authenticatedUid === accountUid && useAuthStore.getState().user?.uid === accountUid,
  [accountUid, authenticatedUid]);

  const loadFirstPage = useCallback(async () => {
    if (!isCurrentAccount()) return;
    const store = useNotificationCenterStore.getState();
    store.setLoading(accountUid, true);
    try {
      const page = await getNotificationHistoryPage(accountUid, 0, HISTORY_PAGE_SIZE);
      if (isCurrentAccount()) useNotificationCenterStore.getState().setHistoryPage(accountUid, page);
    } catch {
      if (isCurrentAccount()) useNotificationCenterStore.getState().setError(accountUid, "Notification history could not be loaded. Try again.");
    }
  }, [accountUid, isCurrentAccount]);

  const loadMore = useCallback(async () => {
    const store = useNotificationCenterStore.getState();
    if (!isCurrentAccount() || store.accountUid !== accountUid || store.isLoadingMore || !store.hasMore) return;
    const offset = store.events.length;
    store.setLoadingMore(accountUid, true);
    try {
      const page = await getNotificationHistoryPage(accountUid, offset, HISTORY_PAGE_SIZE);
      if (isCurrentAccount()) {
        useNotificationCenterStore.getState().appendHistoryPage(accountUid, page.events);
        useNotificationCenterStore.setState({ unreadCount: page.unreadCount, totalCount: page.totalCount });
      }
    } catch {
      if (isCurrentAccount()) useNotificationCenterStore.getState().setError(accountUid, "Older notifications could not be loaded. Try again.");
    }
  }, [accountUid, isCurrentAccount]);

  const markRead = useCallback(async (eventId: string) => {
    if (!isCurrentAccount()) return;
    try {
      await markNotificationAsRead(accountUid, eventId);
      useNotificationCenterStore.getState().applyReadState(accountUid, eventId, new Date().toISOString());
      await loadFirstPage();
    } catch {
      useNotificationCenterStore.getState().setError(accountUid, "This notification could not be marked as read.");
    }
  }, [accountUid, isCurrentAccount, loadFirstPage]);

  const markAllRead = useCallback(async () => {
    if (!isCurrentAccount()) return;
    try {
      await markAllNotificationsAsRead(accountUid);
      useNotificationCenterStore.getState().applyAllReadState(accountUid, new Date().toISOString());
      await loadFirstPage();
    } catch {
      useNotificationCenterStore.getState().setError(accountUid, "Notifications could not be marked as read.");
    }
  }, [accountUid, isCurrentAccount, loadFirstPage]);

  useEffect(() => {
    if (!accountUid || authenticatedUid !== accountUid) {
      useNotificationCenterStore.getState().clearAccount();
      return;
    }

    useNotificationCenterStore.getState().activateAccount(accountUid);
    let current = true;
    let ingestionQueue: Promise<void> = Promise.resolve();

    const processNotification = async (
      notification: Notifications.Notification,
      source: NotificationObservationSource,
      showBanner: boolean,
      refreshHistory: boolean,
    ) => {
      if (!current || !isCurrentAccount()) return;
      const observation = parseNotificationObservation(notification);
      if (!observation) return;

      const result = await recordNotificationObservation(accountUid, observation, source);
      if (!result || !current || !isCurrentAccount()) return;
      if (refreshHistory) {
        const page = await getNotificationHistoryPage(accountUid, 0, HISTORY_PAGE_SIZE);
        if (!current || !isCurrentAccount()) return;
        useNotificationCenterStore.getState().setHistoryPage(accountUid, page);
      }
      if (showBanner && AppState.currentState === "active") {
        useNotificationCenterStore.getState().enqueueBanner(accountUid, result.event);
      }
    };

    const queueNotification = (
      notification: Notifications.Notification,
      source: NotificationObservationSource,
      showBanner: boolean,
      refreshHistory = true,
    ): Promise<void> => {
      const next = ingestionQueue.then(() => processNotification(notification, source, showBanner, refreshHistory));
      ingestionQueue = next.catch(() => undefined);
      return next;
    };

    const reconcilePresentedNotifications = async () => {
      if (!current || !isCurrentAccount()) return;
      try {
        const notifications = await Notifications.getPresentedNotificationsAsync();
        for (const notification of notifications) {
          await queueNotification(notification, "presented_on_resume", false, false);
        }
      } catch {
        // The on-device history remains available if the system tray cannot be inspected.
      }
      await loadFirstPage();
    };

    const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
      void queueNotification(notification, "foreground_received", AppState.currentState === "active").catch(() => undefined);
    });
    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      // Store the event but do not route, switch profiles, or change dose status.
      void queueNotification(response.notification, "notification_response", false).catch(() => undefined);
    });
    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void reconcilePresentedNotifications();
    });

    void Notifications.getLastNotificationResponseAsync().then(async (response) => {
      if (!response?.notification || !current || !isCurrentAccount()) return;
      await queueNotification(response.notification, "notification_response", false);
      const latestResponse = await Notifications.getLastNotificationResponseAsync();
      const isSameResponse = latestResponse?.actionIdentifier === response.actionIdentifier &&
        latestResponse.notification.request.identifier === response.notification.request.identifier;
      if (current && isCurrentAccount() && isSameResponse) await Notifications.clearLastNotificationResponseAsync();
    }).catch(() => undefined);

    void reconcilePresentedNotifications();
    return () => {
      current = false;
      receivedSubscription.remove();
      responseSubscription.remove();
      appStateSubscription.remove();
      useNotificationCenterStore.getState().clearAccount(accountUid);
    };
  }, [accountUid, authenticatedUid, isCurrentAccount, loadFirstPage]);

  useEffect(() => {
    if (!isPanelOpen || activeAccountUid !== accountUid || !isCurrentAccount()) return;
    void loadFirstPage();
  }, [accountUid, activeAccountUid, isPanelOpen, isCurrentAccount, loadFirstPage]);

  const canShow = activeAccountUid === accountUid && authenticatedUid === accountUid;
  return <View style={{ flex: 1 }}>
    {children}
    {canShow ? <NotificationCenterOverlay
      accountUid={accountUid}
      bannerTopInset={bannerTopInset}
      onReload={() => void loadFirstPage()}
      onLoadMore={() => void loadMore()}
      onMarkRead={(event: NotificationEvent) => void markRead(event.id)}
      onMarkAllRead={() => void markAllRead()}
    /> : null}
  </View>;
}
