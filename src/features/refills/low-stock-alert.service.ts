import { cancelScheduledNotification, cancelScheduledNotifications, getScheduledNotificationIds, hasNotificationPermission, scheduleLowStockNotification } from "@/notifications/notification.service";
import { getHideMedicationName } from "@/features/settings/settings.repository";

import { getLowStockNotificationContent } from "./low-stock-alert.domain";
import {
  clearRefillAlertNotificationId,
  getLowStockMedicationIdsForAccount,
  getLowStockAlertNotificationsForAccount,
  getRefillAlertNotificationId,
  markLowStockAlertDelivered,
  markLowStockAlertPermissionRequired,
  markLowStockAlertSchedulingFailed,
  reconcileStoredLowStockEpisode,
  finalizeLowStockAlertsForAccountSignOut,
} from "./low-stock-alert.repository";
import { LowStockAlertCandidate } from "./refill.types";

const medicationOperations = new Map<string, Promise<void>>();
const accountOperations = new Map<string, Promise<void>>();

function medicationKey(profileId: string, medicationId: string): string {
  return `${profileId}:${medicationId}`;
}

async function cancelSavedNotification(candidate: LowStockAlertCandidate): Promise<void> {
  const notificationId = candidate.notificationIdToCancel;
  if (!notificationId) return;
  try {
    await cancelScheduledNotification(notificationId);
    await clearRefillAlertNotificationId(candidate.profileId, candidate.medicationId, notificationId);
  } catch {
    // A failed cancellation is retained in SQLite for a later safe retry.
  }
}

async function deliverIfNeeded(candidate: LowStockAlertCandidate): Promise<void> {
  if (!candidate.isLow || !candidate.episodeActive || !candidate.shouldCheckDelivery) return;
  let hasPermission = false;
  try {
    hasPermission = await hasNotificationPermission();
  } catch {
    await markLowStockAlertSchedulingFailed(candidate.profileId, candidate.medicationId);
    return;
  }
  if (!hasPermission) {
    await markLowStockAlertPermissionRequired(candidate.profileId, candidate.medicationId);
    return;
  }
  try {
    const hideMedicationName = await getHideMedicationName();
    const content = getLowStockNotificationContent({
      medicationName: candidate.medicationName,
      quantity: candidate.inventory.currentQuantity,
      unit: candidate.inventory.unit,
      hideMedicationName,
    });
    const notificationId = await scheduleLowStockNotification(content, candidate.profileId, candidate.medicationId);
    const stored = await markLowStockAlertDelivered(candidate.profileId, candidate.medicationId, notificationId);
    if (!stored) await cancelScheduledNotification(notificationId).catch(() => undefined);
  } catch {
    await markLowStockAlertSchedulingFailed(candidate.profileId, candidate.medicationId);
  }
}

async function reconcileOne(profileId: string, medicationId: string): Promise<void> {
  const candidate = await reconcileStoredLowStockEpisode(profileId, medicationId);
  if (!candidate) return;
  await cancelSavedNotification(candidate);
  await deliverIfNeeded(candidate);
}

/**
 * Safe derived-state reconciliation. It intentionally absorbs alert failures:
 * inventory writes are already committed and must remain authoritative.
 */
export function reconcileLowStockAlert(profileId: string, medicationId: string): Promise<void> {
  if (!profileId.trim() || !medicationId.trim()) return Promise.resolve();
  const key = medicationKey(profileId, medicationId);
  const existing = medicationOperations.get(key);
  if (existing) return existing;
  const operation = reconcileOne(profileId, medicationId).catch(() => undefined).finally(() => {
    if (medicationOperations.get(key) === operation) medicationOperations.delete(key);
  });
  medicationOperations.set(key, operation);
  return operation;
}

/** Reconciles every persisted inventory row for an account, not only the selected UI profile. */
export function reconcileLowStockAlertsForAccount(accountUid: string): Promise<void> {
  if (!accountUid.trim()) return Promise.resolve();
  const existing = accountOperations.get(accountUid);
  if (existing) return existing;
  const operation = (async () => {
    const medications = await getLowStockMedicationIdsForAccount(accountUid);
    for (const medication of medications) await reconcileLowStockAlert(medication.profileId, medication.medicationId);
  })().catch(() => undefined).finally(() => {
    if (accountOperations.get(accountUid) === operation) accountOperations.delete(accountUid);
  });
  accountOperations.set(accountUid, operation);
  return operation;
}

/** Cancels private inventory alerts before sign-out, while preserving their episode for the next sign-in. */
export async function cancelLowStockAlertsForAccount(accountUid: string): Promise<void> {
  const alerts = await getLowStockAlertNotificationsForAccount(accountUid);
  const notificationIds = [...new Set(alerts.map((alert) => alert.notificationId))];
  const scheduledIds = new Set(await getScheduledNotificationIds());
  if (notificationIds.length > 0) await cancelScheduledNotifications(notificationIds);
  await finalizeLowStockAlertsForAccountSignOut(accountUid, scheduledIds);
}

/** Used before destructive medication removal so a saved native refill notification cannot be orphaned. */
export async function cancelLowStockAlertForMedication(profileId: string, medicationId: string): Promise<void> {
  const notificationId = await getRefillAlertNotificationId(profileId, medicationId);
  if (!notificationId) return;
  await cancelScheduledNotification(notificationId);
  await clearRefillAlertNotificationId(profileId, medicationId, notificationId);
}
