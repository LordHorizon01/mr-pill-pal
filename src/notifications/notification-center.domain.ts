import {
  NotificationCategory,
  NotificationEvent,
  NotificationObservation,
  NotificationObservationSource,
  NotificationPresentation,
} from "./notification-center.types";

type NotificationEnvelope = {
  request?: {
    identifier?: string;
    content?: {
      title?: string | null;
      body?: string | null;
      data?: unknown;
    };
  };
};

function cleanString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** Converts only Mr. Pill Pal notification payloads with a verifiable profile and medication scope. */
export function parseNotificationObservation(notification: NotificationEnvelope): NotificationObservation | null {
  const request = notification.request;
  const content = request?.content;
  const data = asRecord(content?.data);
  const profileId = cleanString(data?.profileId);
  const medicationId = cleanString(data?.medicationId);
  const nativeNotificationId = cleanString(request?.identifier);
  if (!profileId || !medicationId || !nativeNotificationId) return null;

  const category: NotificationCategory = data?.kind === "low_stock" ? "low_stock" : "medication_reminder";
  const scheduleId = cleanString(data?.scheduleId);
  if (category === "medication_reminder" && !scheduleId) return null;

  return {
    category,
    profileId,
    medicationId,
    ...(scheduleId ? { scheduleId } : {}),
    ...(cleanString(data?.doseId) ? { doseOccurrenceId: cleanString(data?.doseId) } : {}),
    ...(cleanString(data?.scheduledDate) ? { scheduledDate: cleanString(data?.scheduledDate) } : {}),
    ...(cleanString(data?.scheduledTime) ? { scheduledTime: cleanString(data?.scheduledTime) } : {}),
    nativeNotificationId,
    title: cleanString(content?.title) ?? (category === "low_stock" ? "Refill reminder" : "Medication reminder"),
    message: cleanString(content?.body) ?? "Open Mr. Pill Pal to review this notification.",
  };
}

/** Stable occurrence identity; each one-time scheduled dose remains a separate history event. */
export function getNotificationEventKey(accountUid: string, observation: NotificationObservation): string {
  const hasOccurrence = observation.category === "medication_reminder" &&
    Boolean(observation.scheduledDate && observation.scheduledTime);
  return JSON.stringify([
    accountUid,
    observation.profileId,
    observation.medicationId,
    observation.scheduleId ?? null,
    observation.doseOccurrenceId ?? null,
    hasOccurrence ? observation.scheduledDate : null,
    hasOccurrence ? observation.scheduledTime : null,
    observation.category,
    hasOccurrence ? null : observation.nativeNotificationId,
  ]);
}

export function mergeObservationSources(
  existing: NotificationObservationSource[],
  next: NotificationObservationSource,
): NotificationObservationSource[] {
  return existing.includes(next) ? existing : [...existing, next];
}

export function getUnreadBadgeLabel(unreadCount: number): string | null {
  if (!Number.isFinite(unreadCount) || unreadCount <= 0) return null;
  return unreadCount > 99 ? "99+" : String(Math.floor(unreadCount));
}

export const NOTIFICATION_READ_RETENTION_MS = 48 * 60 * 60 * 1000;

/** Returns the inclusive read-at cutoff for expired history entries. */
export function getNotificationReadExpiryCutoff(now = Date.now()): string {
  return new Date(now - NOTIFICATION_READ_RETENTION_MS).toISOString();
}

/** Pure retention rule, injectable with a fixed clock for deterministic tests. */
export function isReadNotificationExpired(readAt: string | null | undefined, now = Date.now()): boolean {
  if (!readAt) return false;
  const timestamp = Date.parse(readAt);
  return Number.isFinite(timestamp) && timestamp <= now - NOTIFICATION_READ_RETENTION_MS;
}

function getProfileLabel(event: NotificationEvent): string {
  if (event.profileRelationship === "Mother" || event.profileRelationship === "Father") {
    return event.profileRelationship;
  }
  return event.profileDisplayName;
}

function stripProfilePrefix(message: string, event: NotificationEvent): string {
  const prefixes = [event.profileDisplayName, event.profileRelationship]
    .map((value) => value.trim())
    .filter(Boolean);
  for (const prefix of prefixes) {
    const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const cleaned = message.replace(new RegExp(`^${escapedPrefix}\\s*[-:–]\\s*`, "i"), "").trim();
    if (cleaned !== message) return cleaned;
  }
  const reminderBody = message.replace(/^.+?\s+-\s+(?=Time to take\b)/i, "").trim();
  if (reminderBody !== message) return reminderBody;
  return message.trim();
}

/** Formats private/cross-profile messages for the current user without changing selected-profile state. */
export function formatNotificationPresentation(
  event: NotificationEvent,
  selectedProfileId: string | null,
  hideMedicationName: boolean,
): NotificationPresentation {
  const isForAnotherProfile = !selectedProfileId || event.profileId !== selectedProfileId;
  const profileLabel = getProfileLabel(event);

  const isMedicationReminder = event.category === "medication_reminder";
  const privatePrimary = isMedicationReminder ? "Medication reminder" : "Refill reminder";
  const message = stripProfilePrefix(event.message, event);
  const isGenericReminderBody = /^(?:reminder for\b|it is time for a medication reminder\b|open mr\. pill pal to review this notification\b)/i.test(message);
  const primaryMessage = hideMedicationName || isGenericReminderBody || !message
    ? privatePrimary
    : message;
  const secondaryMessage = `Medication for ${profileLabel}`;
  const supportingMessage = isForAnotherProfile
    ? `Switch to ${profileLabel}'s profile to ${isMedicationReminder ? "manage this reminder" : "review stock"}.`
    : !isMedicationReminder && (hideMedicationName || isGenericReminderBody)
      ? "Medication stock is running low. Open Mr. Pill Pal to review it."
      : undefined;

  return {
    primaryMessage,
    secondaryMessage,
    ...(supportingMessage ? { supportingMessage } : {}),
    isForAnotherProfile,
  };
}

export function formatNotificationTimestamp(timestamp: string, now = Date.now()): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Recently";
  const elapsed = Math.max(0, now - date.getTime());
  if (elapsed < 10_000) return "Just now";
  if (elapsed < 60_000) return `${Math.floor(elapsed / 1_000)} sec ago`;
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} min ago`;
  if (elapsed < 86_400_000) {
    const hours = Math.floor(elapsed / 3_600_000);
    return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  }
  const days = Math.floor(elapsed / 86_400_000);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
