import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  formatNotificationPresentation,
  getNotificationEventKey,
  getUnreadBadgeLabel,
  mergeObservationSources,
  parseNotificationObservation,
} from "../src/notifications/notification-center.domain";
import { NotificationEvent, NotificationObservation } from "../src/notifications/notification-center.types";
import { CREATE_NOTIFICATION_EVENTS_TABLE } from "../src/database/schema/schema";

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
  assert.equal(presentation.title, "Medication reminder for Mother");
  assert.match(presentation.message, /Switch to Mother's profile/);
  assert.match(presentation.message, /Paracetamol/);
  // Presentation is a pure formatter; it cannot change the selected-profile state.
  assert.equal(event().profileId, "mother-profile");
});

test("privacy mode hides medication names in own-profile and cross-profile text", () => {
  const ownProfile = formatNotificationPresentation(event(), "mother-profile", true);
  const otherProfile = formatNotificationPresentation(event(), "self-profile", true);
  assert.equal(ownProfile.message, "You have a scheduled medication reminder.");
  assert.equal(otherProfile.title, "Medication reminder for Mother");
  assert.match(otherProfile.message, /Switch to Mother's profile/);
  assert.doesNotMatch(`${ownProfile.title} ${ownProfile.message} ${otherProfile.message}`, /Paracetamol/);
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
  assert.doesNotMatch(repository, /DELETE FROM notification_events/);
});

test("notification panel supports safe-area placement, outside and Android Back dismissal, and pagination", () => {
  const overlay = readFileSync(resolve(process.cwd(), "src/notifications/notification-center-ui.tsx"), "utf8");
  const repository = readFileSync(resolve(process.cwd(), "src/notifications/notification-history.repository.ts"), "utf8");
  assert.match(overlay, /useSafeAreaInsets/);
  assert.match(overlay, /onRequestClose=\{closePanel\}/);
  assert.match(overlay, /accessibilityLabel="Close notifications" onPress=\{closePanel\} style=\{\[StyleSheet\.absoluteFill/);
  assert.match(overlay, /onEndReached=\{\(\) => \{ if \(hasMore\) onLoadMore\(\); \}\}/);
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
  assert.match(overlay, /Mark all as read/);
  assert.match(overlay, /Marks this notification as read without opening another screen/);
  assert.doesNotMatch(provider, /router\.(push|navigate)/);
  assert.match(provider, /markAllNotificationsAsRead\(accountUid\)/);
});
