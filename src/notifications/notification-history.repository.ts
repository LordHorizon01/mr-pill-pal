import { runDatabaseOperation, runExclusiveDatabaseTransaction } from "@/database/database";
import { getNotificationEventKey, getNotificationReadExpiryCutoff, mergeObservationSources } from "./notification-center.domain";
import {
  NotificationEvent,
  NotificationHistoryPage,
  NotificationObservation,
  NotificationObservationSource,
} from "./notification-center.types";

type NotificationEventRow = {
  id: string;
  event_key: string;
  account_uid: string;
  profile_id: string;
  profile_display_name: string;
  profile_relationship: string;
  category: NotificationEvent["category"];
  title: string;
  message: string;
  medication_id: string | null;
  schedule_id: string | null;
  dose_occurrence_id: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  native_notification_id: string;
  observed_at: string;
  delivery_sources_json: string;
  read_at: string | null;
};

type ProfileOwnerRow = {
  id: string;
  full_name: string;
  nickname: string | null;
  relationship: string;
};

const DEFAULT_PAGE_SIZE = 30;
const expiredReadCleanupByAccount = new Map<string, Promise<number>>();

function parseSources(value: string): NotificationObservationSource[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((source): source is NotificationObservationSource =>
      source === "foreground_received" || source === "notification_response" || source === "presented_on_resume",
    );
  } catch {
    return [];
  }
}

function mapEvent(row: NotificationEventRow): NotificationEvent {
  return {
    id: row.id,
    eventKey: row.event_key,
    accountUid: row.account_uid,
    profileId: row.profile_id,
    profileDisplayName: row.profile_display_name,
    profileRelationship: row.profile_relationship,
    category: row.category,
    title: row.title,
    message: row.message,
    ...(row.medication_id ? { medicationId: row.medication_id } : {}),
    ...(row.schedule_id ? { scheduleId: row.schedule_id } : {}),
    ...(row.dose_occurrence_id ? { doseOccurrenceId: row.dose_occurrence_id } : {}),
    ...(row.scheduled_date ? { scheduledDate: row.scheduled_date } : {}),
    ...(row.scheduled_time ? { scheduledTime: row.scheduled_time } : {}),
    nativeNotificationId: row.native_notification_id,
    observedAt: row.observed_at,
    deliverySources: parseSources(row.delivery_sources_json),
    ...(row.read_at ? { readAt: row.read_at } : {}),
  };
}

/**
 * Saves only notification payloads tied to a profile owned by accountUid.
 * The account owner is read from local SQLite rather than trusted from payload data.
 */
export async function recordNotificationObservation(
  accountUid: string,
  observation: NotificationObservation,
  source: NotificationObservationSource,
  observedAt = new Date().toISOString(),
): Promise<{ event: NotificationEvent; isNew: boolean } | null> {
  if (!accountUid.trim()) return null;
  const eventKey = getNotificationEventKey(accountUid, observation);

  return runExclusiveDatabaseTransaction(async (db) => {
    const profile = await db.getFirstAsync<ProfileOwnerRow>(
      `SELECT id, full_name, nickname, relationship
       FROM local_profiles
       WHERE id = ? AND account_uid = ?`,
      [observation.profileId, accountUid],
    );
    if (!profile) return null;

    const existing = await db.getFirstAsync<NotificationEventRow>(
      `SELECT * FROM notification_events WHERE account_uid = ? AND event_key = ?`,
      [accountUid, eventKey],
    );
    if (existing) {
      const sources = mergeObservationSources(parseSources(existing.delivery_sources_json), source);
      await db.runAsync(
        `UPDATE notification_events SET delivery_sources_json = ? WHERE account_uid = ? AND event_key = ?`,
        [JSON.stringify(sources), accountUid, eventKey],
      );
      return { event: { ...mapEvent(existing), deliverySources: sources }, isNew: false };
    }

    const displayName = profile.nickname?.trim() || profile.full_name;
    await db.runAsync(
      `INSERT INTO notification_events (
         id, event_key, account_uid, profile_id, profile_display_name, profile_relationship,
         category, title, message, medication_id, schedule_id, dose_occurrence_id,
         scheduled_date, scheduled_time, native_notification_id, observed_at,
         delivery_sources_json, read_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      [
        eventKey,
        eventKey,
        accountUid,
        profile.id,
        displayName,
        profile.relationship,
        observation.category,
        observation.title,
        observation.message,
        observation.medicationId,
        observation.scheduleId ?? null,
        observation.doseOccurrenceId ?? null,
        observation.scheduledDate ?? null,
        observation.scheduledTime ?? null,
        observation.nativeNotificationId,
        observedAt,
        JSON.stringify([source]),
      ],
    );

    return {
      event: {
        id: eventKey,
        eventKey,
        accountUid,
        profileId: profile.id,
        profileDisplayName: displayName,
        profileRelationship: profile.relationship,
        category: observation.category,
        title: observation.title,
        message: observation.message,
        medicationId: observation.medicationId,
        ...(observation.scheduleId ? { scheduleId: observation.scheduleId } : {}),
        ...(observation.doseOccurrenceId ? { doseOccurrenceId: observation.doseOccurrenceId } : {}),
        ...(observation.scheduledDate ? { scheduledDate: observation.scheduledDate } : {}),
        ...(observation.scheduledTime ? { scheduledTime: observation.scheduledTime } : {}),
        nativeNotificationId: observation.nativeNotificationId,
        observedAt,
        deliverySources: [source],
      },
      isNew: true,
    };
  });
}

export async function getNotificationHistoryPage(
  accountUid: string,
  offset = 0,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<NotificationHistoryPage> {
  if (!accountUid.trim()) return { events: [], unreadCount: 0, totalCount: 0 };
  return runDatabaseOperation(async (db) => {
    const rows = await db.getAllAsync<NotificationEventRow>(
      `SELECT * FROM notification_events
       WHERE account_uid = ?
       ORDER BY observed_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [accountUid, pageSize, Math.max(0, offset)],
    );
    const counts = await db.getFirstAsync<{ unread_count: number; total_count: number }>(
      `SELECT
         COALESCE(SUM(CASE WHEN read_at IS NULL THEN 1 ELSE 0 END), 0) AS unread_count,
         COUNT(*) AS total_count
       FROM notification_events WHERE account_uid = ?`,
      [accountUid],
    );
    return {
      events: rows.map(mapEvent),
      unreadCount: counts?.unread_count ?? 0,
      totalCount: counts?.total_count ?? 0,
    };
  });
}

/** Deletes only this account's read history whose read_at is at least 48 hours old. */
export function cleanupExpiredReadNotificationHistory(accountUid: string, now = Date.now()): Promise<number> {
  if (!accountUid.trim()) return Promise.resolve(0);
  const pending = expiredReadCleanupByAccount.get(accountUid);
  if (pending) return pending;

  const cutoff = getNotificationReadExpiryCutoff(now);
  let operation: Promise<number>;
  operation = runDatabaseOperation(async (db) => {
    const result = await db.runAsync(
      `DELETE FROM notification_events
       WHERE account_uid = ? AND read_at IS NOT NULL AND read_at <= ?`,
      [accountUid, cutoff],
    );
    return result.changes;
  }).finally(() => {
    if (expiredReadCleanupByAccount.get(accountUid) === operation) expiredReadCleanupByAccount.delete(accountUid);
  });
  expiredReadCleanupByAccount.set(accountUid, operation);
  return operation;
}

export async function markNotificationAsRead(accountUid: string, eventId: string, readAt = new Date().toISOString()): Promise<void> {
  if (!accountUid.trim() || !eventId.trim()) return;
  await runDatabaseOperation(async (db) => {
    await db.runAsync(
      `UPDATE notification_events SET read_at = COALESCE(read_at, ?)
       WHERE account_uid = ? AND id = ?`,
      [readAt, accountUid, eventId],
    );
  });
}

export async function markAllNotificationsAsRead(accountUid: string, readAt = new Date().toISOString()): Promise<void> {
  if (!accountUid.trim()) return;
  await runDatabaseOperation(async (db) => {
    await db.runAsync(
      `UPDATE notification_events SET read_at = ?
       WHERE account_uid = ? AND read_at IS NULL`,
      [readAt, accountUid],
    );
  });
}
