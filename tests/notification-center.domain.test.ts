import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  formatNotificationPresentation,
  formatNotificationTimestamp,
  getNotificationReadExpiryCutoff,
  getNotificationEventKey,
  getUnreadBadgeLabel,
  isReadNotificationExpired,
  mergeObservationSources,
  parseNotificationObservation,
} from "../src/notifications/notification-center.domain";
import { NotificationEvent, NotificationObservation } from "../src/notifications/notification-center.types";
import { CREATE_NOTIFICATION_EVENTS_TABLE } from "../src/database/schema/schema";
import { getNotificationPanelLayout } from "../src/notifications/notification-center-layout.domain";

const accountUid = "account-a";
const observation: NotificationObservation = {
  category: "medication_reminder",
  profileId: "mother-profile",
  medicationId: "med-1",
  scheduleId: "schedule-1",
  doseOccurrenceId: "dose-1",
  scheduledDate: "2026-11-13",
  scheduledTime: "09:00",
  nativeNotificationId: "native-1",
  title: "Medication Reminder",
  message: "Time to take Paracetamol",
};

function event(overrides: Partial<NotificationEvent> = {}): NotificationEvent {
  return {
    id: "event-1",
    eventKey: "event-key",
    accountUid,
    profileId: "mother-profile",
    profileDisplayName: "Maya",
    profileRelationship: "Mother",
    category: "medication_reminder",
    title: "Medication Reminder",
    message: "Time to take Paracetamol",
    medicationId: "med-1",
    scheduleId: "schedule-1",
    nativeNotificationId: "native-1",
    observedAt: "2026-11-13T09:01:00.000Z",
    deliverySources: ["foreground_received"],
    ...overrides,
  };
}

test("parses Mr. Pill Pal medication and low-stock events and ignores unscoped notifications", () => {
  const reminder = parseNotificationObservation({ request: { identifier: "native-1", content: { title: "Dose", body: "Take medicine", data: { profileId: "p1", medicationId: "m1", scheduleId: "s1" } } } });
  const lowStock = parseNotificationObservation({ request: { identifier: "native-2", content: { title: "Refill", body: "Low stock", data: { profileId: "p1", medicationId: "m1", kind: "low_stock" } } } });
  const unrelated = parseNotificationObservation({ request: { identifier: "other", content: { title: "Other app", data: {} } } });
  assert.equal(reminder?.category, "medication_reminder");
  assert.equal(lowStock?.category, "low_stock");
  assert.equal(unrelated, null);
});

test("duplicate sources share an event key while separate schedule occurrences remain distinct", () => {
  const sameOccurrence = { ...observation, nativeNotificationId: "a-different-observation-source-id" };
  assert.equal(getNotificationEventKey(accountUid, observation), getNotificationEventKey(accountUid, sameOccurrence));
  assert.notEqual(
    getNotificationEventKey(accountUid, observation),
    getNotificationEventKey(accountUid, { ...observation, scheduledDate: "2026-11-14" }),
  );
  assert.notEqual(
    getNotificationEventKey(accountUid, observation),
    getNotificationEventKey("account-b", observation),
  );
});

test("observation evidence merges without duplicate source entries", () => {
  const once = mergeObservationSources(["foreground_received"], "notification_response");
  assert.deepEqual(once, ["foreground_received", "notification_response"]);
  assert.deepEqual(mergeObservationSources(once, "notification_response"), once);
});

test("unread badge hides zero, shows exact counts, and caps values above 99", () => {
  assert.equal(getUnreadBadgeLabel(0), null);
  assert.equal(getUnreadBadgeLabel(1), "1");
  assert.equal(getUnreadBadgeLabel(12), "12");
  assert.equal(getUnreadBadgeLabel(99), "99");
  assert.equal(getUnreadBadgeLabel(100), "99+");
  assert.equal(getUnreadBadgeLabel(Number.NaN), null);
});

test("cross-profile reminders identify the profile and explicitly request a user-led switch", () => {
  const presentation = formatNotificationPresentation(event(), "self-profile", false);
  assert.equal(presentation.isForAnotherProfile, true);
  assert.equal(presentation.primaryMessage, "Time to take Paracetamol");
  assert.equal(presentation.secondaryMessage, "Medication for Mother");
  assert.match(presentation.supportingMessage ?? "", /Switch to Mother's profile to manage this reminder/);
  // Presentation is a pure formatter; it cannot change the selected-profile state.
  assert.equal(event().profileId, "mother-profile");
});

test("privacy mode hides medication names in own-profile and cross-profile text", () => {
  const ownProfile = formatNotificationPresentation(event(), "mother-profile", true);
  const otherProfile = formatNotificationPresentation(event(), "self-profile", true);
  assert.equal(ownProfile.primaryMessage, "Medication reminder");
  assert.equal(ownProfile.secondaryMessage, "Medication for Mother");
  assert.equal(otherProfile.primaryMessage, "Medication reminder");
  assert.equal(otherProfile.secondaryMessage, "Medication for Mother");
  assert.match(otherProfile.supportingMessage ?? "", /Switch to Mother's profile/);
  assert.doesNotMatch(`${ownProfile.primaryMessage} ${ownProfile.secondaryMessage} ${otherProfile.primaryMessage} ${otherProfile.secondaryMessage} ${otherProfile.supportingMessage}`, /Paracetamol/);
});

test("notification history table persists account scope, observation evidence, occurrence identity, and read state", () => {
  assert.match(CREATE_NOTIFICATION_EVENTS_TABLE, /account_uid TEXT NOT NULL/);
  assert.match(CREATE_NOTIFICATION_EVENTS_TABLE, /event_key TEXT NOT NULL/);
  assert.match(CREATE_NOTIFICATION_EVENTS_TABLE, /UNIQUE \(account_uid, event_key\)/);
  assert.match(CREATE_NOTIFICATION_EVENTS_TABLE, /scheduled_date TEXT/);
  assert.match(CREATE_NOTIFICATION_EVENTS_TABLE, /scheduled_time TEXT/);
  assert.match(CREATE_NOTIFICATION_EVENTS_TABLE, /observed_at TEXT NOT NULL/);
  assert.match(CREATE_NOTIFICATION_EVENTS_TABLE, /read_at TEXT/);
});

test("newly recorded events default to unread until a user marks them read", () => {
  const repository = readFileSync(resolve(process.cwd(), "src/notifications/notification-history.repository.ts"), "utf8");
  assert.match(repository, /delivery_sources_json, read_at\s+\) VALUES \([\s\S]*?NULL\)/);
});

test("history queries and read actions are scoped to the supplied authenticated account", () => {
  const repository = readFileSync(resolve(process.cwd(), "src/notifications/notification-history.repository.ts"), "utf8");
  assert.match(repository, /WHERE id = \? AND account_uid = \?/);
  assert.match(repository, /WHERE account_uid = \?\s+ORDER BY observed_at DESC/);
  assert.match(repository, /WHERE account_uid = \? AND id = \?/);
  assert.match(repository, /WHERE account_uid = \? AND read_at IS NULL/);
  assert.doesNotMatch(repository, /firestore|Firestore/);
});

test("persistent notification dismissal does not delete event history or modify dose state", () => {
  const overlay = readFileSync(resolve(process.cwd(), "src/notifications/notification-center-ui.tsx"), "utf8");
  const provider = readFileSync(resolve(process.cwd(), "src/notifications/notification-center-provider.tsx"), "utf8");
  assert.match(overlay, /dismissCurrentBanner/);
  assert.match(provider, /addNotificationReceivedListener/);
  assert.doesNotMatch(provider, /recordTaken|recordSkipped|selectProfile|router\.(push|navigate)/);
  assert.match(provider, /getPresentedNotificationsAsync/);
});

test("existing native reminder handler remains responsible for Android/system presentation", () => {
  const service = readFileSync(resolve(process.cwd(), "src/notifications/notification.service.ts"), "utf8");
  assert.match(service, /shouldShowBanner: true/);
  assert.match(service, /shouldShowList: true/);
  assert.match(service, /scheduleOneTimeMedicationReminder/);
});

test("one authenticated shell listener observes notifications independently of the active tab", () => {
  const layout = readFileSync(resolve(process.cwd(), "src/app/_layout.tsx"), "utf8");
  const provider = readFileSync(resolve(process.cwd(), "src/notifications/notification-center-provider.tsx"), "utf8");
  assert.match(layout, /<NotificationCenterProvider[\s\S]*?<AppDrawerProvider><Stack/);
  assert.match(provider, /addNotificationReceivedListener/);
  assert.match(provider, /addNotificationResponseReceivedListener/);
  assert.match(provider, /getLastNotificationResponseAsync/);
});

test("foreground banners are queued only for foreground receives and never schedule a second native alert", () => {
  const provider = readFileSync(resolve(process.cwd(), "src/notifications/notification-center-provider.tsx"), "utf8");
  const store = readFileSync(resolve(process.cwd(), "src/state/notification-center.store.ts"), "utf8");
  assert.match(provider, /AppState\.currentState === "active"/);
  assert.match(provider, /enqueueBanner\(accountUid, result\.event\)/);
  assert.doesNotMatch(provider, /scheduleNotificationAsync/);
  assert.match(store, /queuedBanners/);
  assert.match(store, /seenBannerIds/);
});

test("signed-out cleanup clears active account UI state without deleting durable history", () => {
  const provider = readFileSync(resolve(process.cwd(), "src/notifications/notification-center-provider.tsx"), "utf8");
  const store = readFileSync(resolve(process.cwd(), "src/state/notification-center.store.ts"), "utf8");
  const repository = readFileSync(resolve(process.cwd(), "src/notifications/notification-history.repository.ts"), "utf8");
  assert.match(provider, /clearAccount\(accountUid\)/);
  assert.match(store, /if \(accountUid && get\(\)\.accountUid !== accountUid\) return/);
  assert.doesNotMatch(provider, /DELETE FROM notification_events/);
  assert.match(repository, /DELETE FROM notification_events\s+WHERE account_uid = \? AND read_at IS NOT NULL AND read_at <= \?/);
});

test("notification panel supports safe-area placement, outside and Android Back dismissal, and pagination", () => {
  const overlay = readFileSync(resolve(process.cwd(), "src/notifications/notification-center-ui.tsx"), "utf8");
  const repository = readFileSync(resolve(process.cwd(), "src/notifications/notification-history.repository.ts"), "utf8");
  assert.match(overlay, /useSafeAreaInsets/);
  assert.match(overlay, /onRequestClose=\{closePanel\}/);
  assert.match(overlay, /accessibilityLabel="Close notifications" onPress=\{closePanel\} style=\{\[StyleSheet\.absoluteFill/);
  assert.match(overlay, /onEndReached=\{\(\) => \{ if \(hasMore && !isLoadingMore\) onLoadMore\(\); \}\}/);
  assert.match(repository, /LIMIT \? OFFSET \?/);
});

test("bell, unread badge, panel, and banner consume the app's current theme tokens", () => {
  const overlay = readFileSync(resolve(process.cwd(), "src/notifications/notification-center-ui.tsx"), "utf8");
  const header = readFileSync(resolve(process.cwd(), "src/components/screen-header.tsx"), "utf8");
  assert.match(overlay, /useAppTheme\(\)/);
  assert.match(overlay, /colors\.danger/);
  assert.match(overlay, /colors\.surface/);
  assert.match(overlay, /colors\.textPrimary/);
  assert.match(header, /rightAccessory/);
  assert.match(header, /homeRightAccessory/);
});

test("Home notification bell exposes an accessible large touch target and a capped persisted count", () => {
  const overlay = readFileSync(resolve(process.cwd(), "src/notifications/notification-center-ui.tsx"), "utf8");
  const home = readFileSync(resolve(process.cwd(), "src/app/(tabs)/index.tsx"), "utf8");
  assert.match(overlay, /accessibilityLabel=\{badgeLabel \? `Open notifications,/);
  assert.match(overlay, /bellButton: \{ width: 48, height: 48/);
  assert.match(home, /rightAccessory=\{<NotificationBellButton \/>\}/);
});

test("individual read actions and Mark all as read remain in the panel without routing", () => {
  const overlay = readFileSync(resolve(process.cwd(), "src/notifications/notification-center-ui.tsx"), "utf8");
  const provider = readFileSync(resolve(process.cwd(), "src/notifications/notification-center-provider.tsx"), "utf8");
  const store = readFileSync(resolve(process.cwd(), "src/state/notification-center.store.ts"), "utf8");
  assert.match(overlay, /Mark all as read/);
  assert.match(overlay, /Mark notification as read/);
  assert.match(overlay, /does not change medication records/);
  assert.doesNotMatch(provider, /router\.(push|navigate)/);
  assert.match(provider, /markAllNotificationsAsRead\(accountUid, readAt\)/);
  assert.match(store, /if \(!event \|\| event\.readAt\) return/);
  assert.match(store, /unreadCount: Math\.max\(0, state\.unreadCount - 1\)/);
  assert.match(store, /unreadCount: 0/);
});

test("read notification retention is deterministic at the 48-hour boundary", () => {
  const readAt = Date.parse("2026-11-13T14:34:00.000Z");
  const expiry = readAt + 48 * 60 * 60 * 1000;
  assert.equal(isReadNotificationExpired(new Date(readAt).toISOString(), expiry - 1), false);
  assert.equal(isReadNotificationExpired(new Date(readAt).toISOString(), expiry), true);
  assert.equal(isReadNotificationExpired(new Date(readAt).toISOString(), expiry + 1), true);
  assert.equal(isReadNotificationExpired(null, expiry + 86_400_000), false);
  assert.equal(getNotificationReadExpiryCutoff(expiry), new Date(readAt).toISOString());
});

test("expiry SQL deletes only expired read rows for the supplied account", () => {
  const repository = readFileSync(resolve(process.cwd(), "src/notifications/notification-history.repository.ts"), "utf8");
  assert.match(repository, /DELETE FROM notification_events\s+WHERE account_uid = \? AND read_at IS NOT NULL AND read_at <= \?/);
  assert.match(repository, /getNotificationReadExpiryCutoff\(now\)/);
  assert.match(repository, /expiredReadCleanupByAccount/);
  assert.doesNotMatch(repository, /DELETE FROM (?:medications|dose_records|inventory_events|schedules)/);
});

test("initialization, app resume, panel opening, and open-panel interval run local expiry cleanup", () => {
  const provider = readFileSync(resolve(process.cwd(), "src/notifications/notification-center-provider.tsx"), "utf8");
  assert.match(provider, /cleanupExpiredReadNotificationHistory\(accountUid\)/);
  assert.match(provider, /void reconcilePresentedNotifications\(\)/);
  assert.match(provider, /AppState\.addEventListener\("change"/);
  assert.match(provider, /setInterval\(\(\) => \{/);
  assert.match(provider, /if \(removedCount > 0\)\s*\{\s*const refreshedPage = await getNotificationHistoryPage\(accountUid, 0/);
  assert.match(provider, /if \(!isPanelOpen \|\| activeAccountUid !== accountUid/);
  assert.match(provider, /pendingReadOperations/);
});

test("read timestamps persist in the existing column without a database migration", () => {
  const repository = readFileSync(resolve(process.cwd(), "src/notifications/notification-history.repository.ts"), "utf8");
  const schema = readFileSync(resolve(process.cwd(), "src/database/schema/schema.ts"), "utf8");
  const database = readFileSync(resolve(process.cwd(), "src/database/database.ts"), "utf8");
  assert.match(schema, /read_at TEXT/);
  assert.match(repository, /UPDATE notification_events SET read_at = COALESCE\(read_at, \?\)/);
  assert.match(repository, /WHERE account_uid = \? AND read_at IS NULL/);
  assert.doesNotMatch(database, /ALTER TABLE notification_events/);
});

test("notification card hierarchy uses medication message first and profile detail second", () => {
  const presentation = formatNotificationPresentation(event({ message: "Maya - Time to take Paracetamol" }), "mother-profile", false);
  assert.equal(presentation.primaryMessage, "Time to take Paracetamol");
  assert.equal(presentation.secondaryMessage, "Medication for Mother");
  const overlay = readFileSync(resolve(process.cwd(), "src/notifications/notification-center-ui.tsx"), "utf8");
  assert.match(overlay, /notificationTitle\}\>\{presentation\.primaryMessage\}/);
  assert.match(overlay, /notificationMessage\}\>\{presentation\.secondaryMessage\}/);
  assert.match(overlay, /notificationInstruction\}\>\{presentation\.supportingMessage\}/);
});

test("notification controls keep read/unread views in the panel without marking on open", () => {
  const overlay = readFileSync(resolve(process.cwd(), "src/notifications/notification-center-ui.tsx"), "utf8");
  assert.match(overlay, /onPress=\{\(\) => useNotificationCenterStore\.getState\(\)\.openPanel\(\)\}/);
  assert.match(overlay, /setSelectedList\(\(current\) => current === "read" \? "unread" : "read"\)/);
  assert.match(overlay, /<Text style=\{\[styles\.readSectionButtonText, styles\.readSectionButtonTextSelected\]\}>Notifications<\/Text>/);
  assert.match(overlay, /<Text style=\{styles\.readSectionButtonText\}>Already Read<\/Text>/);
  assert.match(overlay, /data=\{visibleEvents\}/);
  assert.match(overlay, /Mark all \$\{visibleUnreadCount\} notifications as read/);
  assert.match(overlay, /readSectionTouchTarget: \{ minWidth: 44, minHeight: 48/);
  assert.match(overlay, /readSectionCapsule: \{ minHeight: 32, flexDirection: "row"/);
  assert.match(overlay, /<View accessible=\{false\} style=\{styles\.doubleCheckIcon\}>/);
  assert.doesNotMatch(overlay, /panelActions/);
  assert.match(overlay, /onRequestClose=\{closePanel\}/);
  assert.match(overlay, /accessibilityLabel="Close notifications" onPress=\{closePanel\}/);
});

test("the unread check action is account-scoped, accessible, and applies local read state after persistence", () => {
  const overlay = readFileSync(resolve(process.cwd(), "src/notifications/notification-center-ui.tsx"), "utf8");
  const provider = readFileSync(resolve(process.cwd(), "src/notifications/notification-center-provider.tsx"), "utf8");
  const markUpdate = provider.indexOf("await markNotificationAsRead(accountUid, eventId, readAt)");
  const applyState = provider.indexOf("applyReadState(accountUid, eventId");
  assert.match(overlay, /accessibilityLabel="Mark notification as read"/);
  assert.match(overlay, /markReadButton: \{ width: 48, height: 48/);
  assert.ok(markUpdate >= 0 && applyState > markUpdate);
  assert.match(provider, /pendingReadOperations\.current\.has\(eventId\)/);
  assert.match(provider, /markNotificationAsRead\(accountUid, eventId, readAt\)/);
});

test("notification card copy has no delivery-observation labels and long text can wrap", () => {
  const overlay = readFileSync(resolve(process.cwd(), "src/notifications/notification-center-ui.tsx"), "utf8");
  assert.doesNotMatch(overlay, /Observed while app was running|Opened from a system notification|Observed in the system tray/);
  assert.doesNotMatch(overlay, /numberOfLines=\{[23]\} style=\{styles\.(notificationTitle|notificationMessage|bannerTitle|bannerMessage)\}/);
  assert.match(overlay, /notificationInstruction: \{ fontSize/);
});

test("notification empty states contain only the requested short copy and icon", () => {
  const overlay = readFileSync(resolve(process.cwd(), "src/notifications/notification-center-ui.tsx"), "utf8");
  assert.match(overlay, /"No notifications yet"/);
  assert.match(overlay, /"No read notifications"/);
  assert.doesNotMatch(overlay, /No notification events yet|History includes app-observed events|New medication reminders and low-stock alerts observed on this device/);
  assert.match(overlay, /emptyState: \{ alignItems: "center"/);
  assert.match(overlay, /emptyListContent: \{ flexGrow: 1, alignItems: "stretch", justifyContent: "center"/);
  assert.match(overlay, /emptyNotificationList: \{ flex: 1/);
});

test("notification panel layout stays portrait-oriented, safe-area centered, and responsive", () => {
  const regular = getNotificationPanelLayout(390, 844, 24, 24);
  assert.equal(regular.width, 328);
  assert.equal(regular.emptyMinHeight, 370);
  assert.ok(regular.emptyMinHeight > regular.width);
  assert.ok(regular.maxHeight / (844 - 24 - 24 - 22) >= 0.70);
  assert.ok(regular.maxHeight / (844 - 24 - 24 - 22) <= 0.75);

  const narrow = getNotificationPanelLayout(320, 568, 24, 24);
  assert.equal(narrow.width, 288);
  assert.equal(narrow.emptyMinHeight, narrow.maxHeight);

  const overlay = readFileSync(resolve(process.cwd(), "src/notifications/notification-center-ui.tsx"), "utf8");
  assert.match(overlay, /getNotificationPanelLayout\(width, height, insets\.top, insets\.bottom\)/);
  assert.match(overlay, /panelPlacement: \{ flex: 1, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" \}/);
  assert.match(overlay, /paddingTop: insets\.top \+ 10, paddingBottom: insets\.bottom \+ 12/);
  assert.match(overlay, /minHeight: panelMinHeight/);
});

test("Already Read is in the header before Close and Mark all as read is a conditional list action", () => {
  const overlay = readFileSync(resolve(process.cwd(), "src/notifications/notification-center-ui.tsx"), "utf8");
  const headerStart = overlay.indexOf("<View style={styles.panelHeader}>");
  const errorStart = overlay.indexOf("{error ? <View style={styles.errorBox}>", headerStart);
  const header = overlay.slice(headerStart, errorStart);
  assert.ok(header.indexOf("readSectionTouchTarget") >= 0);
  assert.ok(header.indexOf("closeButton") > header.indexOf("readSectionTouchTarget"));
  assert.match(overlay, /ListHeaderComponent=\{selectedList === "unread" && visibleUnreadCount > 0/);
  assert.match(overlay, /Mark all as read/);
  assert.doesNotMatch(header, /Mark all as read/);
  assert.match(overlay, /style=\{showCenteredEmptyList \? styles\.emptyNotificationList/);
});

test("notification history scroll, read timestamps, profile copy, and pill banner icon are preserved", () => {
  const overlay = readFileSync(resolve(process.cwd(), "src/notifications/notification-center-ui.tsx"), "utf8");
  const historyItemStart = overlay.indexOf("function NotificationHistoryItem(");
  const stylesStart = overlay.indexOf("\nconst createStyles", historyItemStart);
  const historyItem = overlay.slice(historyItemStart, stylesStart);
  assert.match(overlay, /<FlatList/);
  assert.match(overlay, /onEndReached=\{\(\) => \{ if \(hasMore && !isLoadingMore\) onLoadMore\(\); \}\}/);
  assert.doesNotMatch(historyItem, /numberOfLines=/);
  assert.match(overlay, /presentation\.supportingMessage/);
  assert.match(overlay, /event\.readAt \? <><Text style=\{styles\.readAtLabel\}>Read at:<\/Text>/);
  assert.match(overlay, /ios: "pills\.fill", android: "medication", web: "medication"/);
});

test("Android launcher and medication notification icons use existing branded runtime assets", () => {
  const expo = JSON.parse(readFileSync(resolve(process.cwd(), "app.json"), "utf8")).expo;
  const launcherIcon = "./assets/brand/runtime/android/launcher/App icon master/mpp-app-icon-master - 1024 x 1024.png";
  const adaptiveForeground = "./assets/brand/runtime/android/adaptive/Android adaptive icon - forground + background layer/mpp-adaptive-foreground+backround - 1024 x 1024.png";
  const monochromeIcon = "./assets/brand/runtime/android/adaptive/Android monochrome themed icon/mpp-monochrome-icon - 1024 x 1024.png";
  const notificationIcon = "./assets/brand/runtime/android/notification/mpp-notification-icon-white-96x96.png";
  const notificationPlugin = expo.plugins.find((plugin: unknown) => Array.isArray(plugin) && plugin[0] === "expo-notifications");

  assert.equal(expo.android.package, "com.anonymous.mrpillpal");
  assert.equal(expo.android.icon, launcherIcon);
  assert.equal(expo.android.adaptiveIcon.foregroundImage, adaptiveForeground);
  assert.equal(expo.android.adaptiveIcon.monochromeImage, monochromeIcon);
  assert.equal(expo.android.adaptiveIcon.backgroundColor, "#FAF3E8");
  assert.equal(notificationPlugin?.[1]?.icon, notificationIcon);
  assert.equal(notificationPlugin?.[1]?.color, "#0A5A54");
  assert.equal(expo.ios.icon, "./assets/expo.icon");
  assert.equal(expo.icon, "./assets/images/icon.png");

  for (const path of [launcherIcon, adaptiveForeground, monochromeIcon, notificationIcon]) {
    assert.equal(existsSync(resolve(process.cwd(), path)), true, `missing configured icon: ${path}`);
  }

  const iconBuffer = readFileSync(resolve(process.cwd(), notificationIcon));
  assert.equal(iconBuffer.readUInt32BE(16), 96);
  assert.equal(iconBuffer.readUInt32BE(20), 96);
  const service = readFileSync(resolve(process.cwd(), "src/notifications/notification.service.ts"), "utf8");
  assert.match(service, /MEDICATION_CHANNEL_ID = "medication-reminders-v3"/);
});

test("read labels use relative time and share one panel clock", () => {
  const now = Date.parse("2026-11-13T14:34:00.000Z");
  assert.equal(formatNotificationTimestamp(new Date(now - 5_000).toISOString(), now), "Just now");
  assert.equal(formatNotificationTimestamp(new Date(now - 40_000).toISOString(), now), "40 sec ago");
  assert.equal(formatNotificationTimestamp(new Date(now - 5 * 60_000).toISOString(), now), "5 min ago");
  assert.equal(formatNotificationTimestamp(new Date(now - 2 * 3_600_000).toISOString(), now), "2 hrs ago");
  const overlay = readFileSync(resolve(process.cwd(), "src/notifications/notification-center-ui.tsx"), "utf8");
  assert.match(overlay, /<Text style=\{styles\.readAtLabel\}>Read at:<\/Text>/);
  assert.match(overlay, /const \[clockNow, setClockNow\] = useState<number \| null>\(null\)/);
  assert.match(overlay, /setInterval\(updateClock, 30_000\)/);
});

test("Home and Settings presentation refinements preserve their actions", () => {
  const home = readFileSync(resolve(process.cwd(), "src/app/(tabs)/index.tsx"), "utf8");
  const homeEmptyState = readFileSync(resolve(process.cwd(), "src/features/doses/home-empty-state.domain.ts"), "utf8");
  const settings = readFileSync(resolve(process.cwd(), "src/app/(tabs)/settings.tsx"), "utf8");
  assert.doesNotMatch(home, /You&apos;re all caught up|You're all caught up/);
  assert.match(homeEmptyState, /No more medications scheduled for today\./);
  assert.match(home, /getNextDoseEmptyMessage\(/);
  assert.match(home, /accessibilityLabel="Add medication" onPress=\{\(\) => router\.push\("\/medications"\)\}/);
  assert.match(home, /name=\{\{ ios: "plus", android: "add", web: "add" \}\}/);
  assert.match(home, /addMedicationTouchTarget: \{ minHeight: 48/);
  assert.match(home, /addMedicationCapsule: \{[^}]*borderRadius: 999/);
  assert.doesNotMatch(settings, /Account lifecycle|DEFERRED - BACKEND APPROVAL REQUIRED|Temporarily deactivate account|Permanently delete account/);
  assert.match(settings, /accessibilityLabel="Sign out"[\s\S]*?logout\(\)/);
});

test("Home bell is in the logo row above the divider and reserves narrow-screen width", () => {
  const header = readFileSync(resolve(process.cwd(), "src/components/screen-header.tsx"), "utf8");
  assert.match(header, /width - homeBrandInset \* 2 - \(rightAccessory \? 56 : 0\)/);
  assert.match(header, /homeRightAccessory, \{ right: homeBrandInset, top: 0 \}/);
  assert.match(header, /homeCopy, \{ left: wordmarkStartX, right: rightAccessory \? 72 : 16/);
});
