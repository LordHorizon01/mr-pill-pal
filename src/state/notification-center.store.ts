import { create } from "zustand";
import { NotificationEvent, NotificationHistoryPage } from "@/notifications/notification-center.types";

type NotificationCenterState = {
  accountUid: string | null;
  events: NotificationEvent[];
  unreadCount: number;
  totalCount: number;
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  isPanelOpen: boolean;
  currentBanner: NotificationEvent | null;
  queuedBanners: NotificationEvent[];
  seenBannerIds: string[];
  activateAccount: (accountUid: string) => void;
  clearAccount: (accountUid?: string) => void;
  setHistoryPage: (accountUid: string, page: NotificationHistoryPage) => void;
  appendHistoryPage: (accountUid: string, events: NotificationEvent[]) => void;
  setLoading: (accountUid: string, loading: boolean) => void;
  setLoadingMore: (accountUid: string, loading: boolean) => void;
  setError: (accountUid: string, error: string | null) => void;
  applyReadState: (accountUid: string, eventId: string, readAt: string) => void;
  applyAllReadState: (accountUid: string, readAt: string) => void;
  openPanel: () => void;
  closePanel: () => void;
  enqueueBanner: (accountUid: string, event: NotificationEvent) => void;
  dismissCurrentBanner: (accountUid: string) => void;
};

const initialAccountState = {
  events: [] as NotificationEvent[],
  unreadCount: 0,
  totalCount: 0,
  hasMore: false,
  isLoading: false,
  isLoadingMore: false,
  error: null as string | null,
  isPanelOpen: false,
  currentBanner: null as NotificationEvent | null,
  queuedBanners: [] as NotificationEvent[],
  seenBannerIds: [] as string[],
};

export const useNotificationCenterStore = create<NotificationCenterState>((set, get) => ({
  accountUid: null,
  ...initialAccountState,
  activateAccount: (accountUid) => {
    if (get().accountUid === accountUid) return;
    set({ accountUid, ...initialAccountState });
  },
  clearAccount: (accountUid) => {
    if (accountUid && get().accountUid !== accountUid) return;
    set({ accountUid: null, ...initialAccountState });
  },
  setHistoryPage: (accountUid, page) => {
    if (get().accountUid !== accountUid) return;
    set({ events: page.events, unreadCount: page.unreadCount, totalCount: page.totalCount, hasMore: page.events.length < page.totalCount, isLoading: false, isLoadingMore: false, error: null });
  },
  appendHistoryPage: (accountUid, events) => {
    if (get().accountUid !== accountUid) return;
    const existing = get().events;
    const ids = new Set(existing.map((event) => event.id));
    const unique = events.filter((event) => !ids.has(event.id));
    const next = [...existing, ...unique];
    set({ events: next, hasMore: next.length < get().totalCount, isLoadingMore: false });
  },
  setLoading: (accountUid, isLoading) => {
    if (get().accountUid === accountUid) set({ isLoading });
  },
  setLoadingMore: (accountUid, isLoadingMore) => {
    if (get().accountUid === accountUid) set({ isLoadingMore });
  },
  setError: (accountUid, error) => {
    if (get().accountUid === accountUid) set({ error, isLoading: false, isLoadingMore: false });
  },
  applyReadState: (accountUid, eventId, readAt) => {
    const state = get();
    if (state.accountUid !== accountUid) return;
    const event = state.events.find((item) => item.id === eventId);
    if (!event || event.readAt) return;
    set({ events: state.events.map((item) => item.id === eventId ? { ...item, readAt } : item), unreadCount: Math.max(0, state.unreadCount - 1) });
  },
  applyAllReadState: (accountUid, readAt) => {
    const state = get();
    if (state.accountUid !== accountUid) return;
    set({ events: state.events.map((event) => event.readAt ? event : { ...event, readAt }), unreadCount: 0 });
  },
  openPanel: () => set({ isPanelOpen: true }),
  closePanel: () => set({ isPanelOpen: false }),
  enqueueBanner: (accountUid, event) => {
    if (get().accountUid !== accountUid || event.accountUid !== accountUid) return;
    const { currentBanner, queuedBanners, seenBannerIds } = get();
    if (seenBannerIds.includes(event.id)) return;
    const nextSeen = [...seenBannerIds, event.id].slice(-250);
    if (!currentBanner) set({ currentBanner: event, seenBannerIds: nextSeen });
    else set({ queuedBanners: [...queuedBanners, event], seenBannerIds: nextSeen });
  },
  dismissCurrentBanner: (accountUid) => {
    if (get().accountUid !== accountUid) return;
    const [next, ...queuedBanners] = get().queuedBanners;
    set({ currentBanner: next ?? null, queuedBanners });
  },
}));
