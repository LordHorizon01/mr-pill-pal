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

function getProfileLabel(event: NotificationEvent): string {
  if (event.profileRelationship === "Mother" || event.profileRelationship === "Father") {
    return event.profileRelationship;
  }
  return event.profileDisplayName;
}

/** Formats private/cross-profile messages for the current user without changing selected-profile state. */
export function formatNotificationPresentation(
  event: NotificationEvent,
  selectedProfileId: string | null,
  hideMedicationName: boolean,
): NotificationPresentation {
  const isForAnotherProfile = !selectedProfileId || event.profileId !== selectedProfileId;
  const profileLabel = getProfileLabel(event);

  if (event.category === "medication_reminder") {
    if (hideMedicationName) {
      return isForAnotherProfile
        ? {
            title: `Medication reminder for ${profileLabel}`,
            message: `Switch to ${profileLabel}'s profile to view the details.`,
            isForAnotherProfile,
          }
        : { title: "Medication reminder", message: "You have a scheduled medication reminder.", isForAnotherProfile };
    }
    return isForAnotherProfile
      ? {
          title: `Medication reminder for ${profileLabel}`,
          message: `${event.message} Switch to ${profileLabel}'s profile to manage this dose.`,
          isForAnotherProfile,
        }
      : { title: event.title, message: event.message, isForAnotherProfile };
  }

  if (hideMedicationName) {
    return isForAnotherProfile
      ? {
          title: `Refill reminder for ${profileLabel}`,
          message: `Medication stock is running low. Switch to ${profileLabel}'s profile to review it.`,
          isForAnotherProfile,
        }
      : { title: "Refill reminder", message: "Recorded medication stock is running low. Open Mr. Pill Pal to review it.", isForAnotherProfile };
  }
  return isForAnotherProfile
    ? {
        title: `Low stock warning for ${profileLabel}`,
        message: `${event.message} Switch to ${profileLabel}'s profile to review stock.`,
        isForAnotherProfile,
      }
    : { title: event.title, message: event.message, isForAnotherProfile };
}

export function formatNotificationTimestamp(timestamp: string, now = Date.now()): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Recently observed";
  const elapsed = Math.max(0, now - date.getTime());
  if (elapsed < 60_000) return "Just now";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} min ago`;
  if (elapsed < 86_400_000) return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: date.getFullYear() === new Date(now).getFullYear() ? undefined : "numeric" });
}
