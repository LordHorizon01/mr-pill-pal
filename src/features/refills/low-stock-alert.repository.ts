import { runExclusiveDatabaseTransaction, runDatabaseOperation } from "@/database/database";
import type { SQLiteDatabase } from "expo-sqlite";

import { decideLowStockEpisode } from "./low-stock-alert.domain";
import { LowStockAlertCandidate, RefillAlertState, RefillAlertStatus } from "./refill.types";

type AlertRow = {
  profile_id: string;
  medication_id: string;
  episode_active: number;
  alert_status: RefillAlertStatus;
  native_notification_id: string | null;
  attempted_at: string | null;
  alerted_at: string | null;
  created_at: string;
  updated_at: string;
};

type InventoryMedicationRow = {
  medication_id: string;
  profile_id: string;
  tracking_enabled: number;
  current_quantity: number;
  unit: "tablets" | "capsules" | "ml" | "units";
  consumption_per_taken: number;
  low_stock_threshold: number;
  created_at: string;
  updated_at: string;
  medication_name: string;
  medication_is_active: number;
  medication_archived_at: string | null;
};

function mapState(row: AlertRow): RefillAlertState {
  return {
    profileId: row.profile_id,
    medicationId: row.medication_id,
    episodeActive: row.episode_active === 1,
    alertStatus: row.alert_status,
    nativeNotificationId: row.native_notification_id ?? undefined,
    attemptedAt: row.attempted_at ?? undefined,
    alertedAt: row.alerted_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCandidate(row: InventoryMedicationRow, state: RefillAlertState | null): LowStockAlertCandidate {
  const decision = decideLowStockEpisode({
    trackingEnabled: row.tracking_enabled === 1,
    medicationIsActive: row.medication_is_active === 1,
    medicationIsArchived: Boolean(row.medication_archived_at),
    currentQuantity: row.current_quantity,
    lowStockThreshold: row.low_stock_threshold,
    previousEpisodeActive: state?.episodeActive ?? false,
    previousAlertStatus: state?.alertStatus ?? "normal",
  });
  return {
    profileId: row.profile_id,
    medicationId: row.medication_id,
    medicationName: row.medication_name,
    inventory: {
      medicationId: row.medication_id,
      profileId: row.profile_id,
      trackingEnabled: row.tracking_enabled === 1,
      currentQuantity: row.current_quantity,
      unit: row.unit,
      consumptionPerTaken: row.consumption_per_taken,
      lowStockThreshold: row.low_stock_threshold,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    isLow: decision.isLow,
    episodeActive: decision.episodeActive,
    alertStatus: decision.alertStatus,
    shouldCheckDelivery: decision.shouldCheckDelivery,
    // A stale ID from a previously reset episode is cancelled before a new
    // low episode can schedule its own notification.
    notificationIdToCancel: (!decision.episodeActive || !state?.episodeActive)
      ? state?.nativeNotificationId
      : undefined,
  };
}

async function getInventoryMedicationRow(
  db: SQLiteDatabase,
  profileId: string,
  medicationId: string,
): Promise<InventoryMedicationRow | null> {
  return db.getFirstAsync<InventoryMedicationRow>(
    `SELECT inventory.*, medication.name AS medication_name, medication.is_active AS medication_is_active, medication.archived_at AS medication_archived_at
     FROM medication_inventory AS inventory
     INNER JOIN medications AS medication ON medication.id = inventory.medication_id AND medication.profile_id = inventory.profile_id
     WHERE inventory.profile_id = ? AND inventory.medication_id = ?`,
    [profileId, medicationId],
  );
}

async function getStateRow(
  db: SQLiteDatabase,
  profileId: string,
  medicationId: string,
): Promise<AlertRow | null> {
  return db.getFirstAsync<AlertRow>(
    "SELECT * FROM refill_alert_states WHERE profile_id = ? AND medication_id = ?",
    [profileId, medicationId],
  );
}

async function saveEpisodeState(
  db: SQLiteDatabase,
  candidate: LowStockAlertCandidate,
  existing: RefillAlertState | null,
): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO refill_alert_states (profile_id, medication_id, episode_active, alert_status, native_notification_id, attempted_at, alerted_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(profile_id, medication_id) DO UPDATE SET
       episode_active = excluded.episode_active,
       alert_status = excluded.alert_status,
       native_notification_id = excluded.native_notification_id,
       attempted_at = excluded.attempted_at,
       alerted_at = excluded.alerted_at,
       updated_at = excluded.updated_at`,
    [
      candidate.profileId,
      candidate.medicationId,
      candidate.episodeActive ? 1 : 0,
      candidate.alertStatus,
      candidate.episodeActive ? existing?.nativeNotificationId ?? null : existing?.nativeNotificationId ?? null,
      candidate.episodeActive ? existing?.attemptedAt ?? null : null,
      candidate.episodeActive && candidate.alertStatus === "alerted" ? existing?.alertedAt ?? null : null,
      existing?.createdAt ?? now,
      now,
    ],
  );
}

/** Re-evaluates one persisted episode. It never calls native notification APIs. */
export async function reconcileStoredLowStockEpisode(profileId: string, medicationId: string): Promise<LowStockAlertCandidate | null> {
  if (!profileId.trim() || !medicationId.trim()) return null;
  return runExclusiveDatabaseTransaction(async (db) => {
    const row = await getInventoryMedicationRow(db, profileId, medicationId);
    if (!row) return null;
    const savedState = await getStateRow(db, profileId, medicationId);
    const existing = savedState ? mapState(savedState) : null;
    const candidate = mapCandidate(row, existing);
    await saveEpisodeState(db, candidate, existing);
    return candidate;
  });
}

export async function getLowStockMedicationIdsForAccount(accountUid: string): Promise<Array<{ profileId: string; medicationId: string }>> {
  if (!accountUid.trim()) return [];
  return runDatabaseOperation(async (db) => db.getAllAsync<{ profile_id: string; medication_id: string }>(
    `SELECT inventory.profile_id, inventory.medication_id
     FROM medication_inventory AS inventory
     INNER JOIN local_profiles AS profile ON profile.id = inventory.profile_id
     WHERE profile.account_uid = ? AND profile.deleted_at IS NULL`,
    [accountUid],
  ).then((rows) => rows.map((row) => ({ profileId: row.profile_id, medicationId: row.medication_id }))));
}

export async function markLowStockAlertPermissionRequired(profileId: string, medicationId: string): Promise<void> {
  await runDatabaseOperation(async (db) => {
    await db.runAsync(
      `UPDATE refill_alert_states SET alert_status = 'permission_required', attempted_at = ?, updated_at = ?
       WHERE profile_id = ? AND medication_id = ? AND episode_active = 1 AND alert_status IN ('pending', 'permission_required')`,
      [new Date().toISOString(), new Date().toISOString(), profileId, medicationId],
    );
  });
}

/** Returns false when the episode became inactive before native scheduling completed. */
export async function markLowStockAlertDelivered(profileId: string, medicationId: string, nativeNotificationId: string): Promise<boolean> {
  return runDatabaseOperation(async (db) => {
    const now = new Date().toISOString();
    const result = await db.runAsync(
      `UPDATE refill_alert_states SET alert_status = 'alerted', native_notification_id = ?, attempted_at = ?, alerted_at = ?, updated_at = ?
       WHERE profile_id = ? AND medication_id = ? AND episode_active = 1 AND alert_status IN ('pending', 'permission_required')`,
      [nativeNotificationId, now, now, now, profileId, medicationId],
    );
    return result.changes === 1;
  });
}

export async function markLowStockAlertSchedulingFailed(profileId: string, medicationId: string): Promise<void> {
  await runDatabaseOperation(async (db) => {
    const now = new Date().toISOString();
    await db.runAsync(
      `UPDATE refill_alert_states SET alert_status = 'scheduling_failed', attempted_at = ?, updated_at = ?
       WHERE profile_id = ? AND medication_id = ? AND episode_active = 1 AND alert_status IN ('pending', 'permission_required')`,
      [now, now, profileId, medicationId],
    );
  });
}

export async function clearRefillAlertNotificationId(profileId: string, medicationId: string, notificationId: string): Promise<void> {
  await runDatabaseOperation(async (db) => {
    await db.runAsync(
      `UPDATE refill_alert_states SET native_notification_id = NULL, updated_at = ?
       WHERE profile_id = ? AND medication_id = ? AND native_notification_id = ?`,
      [new Date().toISOString(), profileId, medicationId, notificationId],
    );
  });
}

export async function getRefillAlertState(profileId: string, medicationId: string): Promise<RefillAlertState | null> {
  return runDatabaseOperation(async (db) => {
    const row = await getStateRow(db, profileId, medicationId);
    return row ? mapState(row) : null;
  });
}

export async function getRefillAlertNotificationId(profileId: string, medicationId: string): Promise<string | null> {
  const state = await getRefillAlertState(profileId, medicationId);
  return state?.nativeNotificationId ?? null;
}
