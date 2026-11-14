export type NotificationCategory = "medication_reminder" | "low_stock";
export type NotificationObservationSource = "foreground_received" | "notification_response" | "presented_on_resume";

export type NotificationObservation = {
  category: NotificationCategory;
  profileId: string;
  medicationId: string;
  scheduleId?: string;
  doseOccurrenceId?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  nativeNotificationId: string;
  title: string;
  message: string;
};

export type NotificationEvent = {
  id: string;
  eventKey: string;
  accountUid: string;
  profileId: string;
  profileDisplayName: string;
  profileRelationship: string;
  category: NotificationCategory;
  title: string;
  message: string;
  medicationId?: string;
  scheduleId?: string;
  doseOccurrenceId?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  nativeNotificationId: string;
  observedAt: string;
  deliverySources: NotificationObservationSource[];
  readAt?: string;
};

export type NotificationHistoryPage = {
  events: NotificationEvent[];
  unreadCount: number;
  totalCount: number;
};

export type NotificationPresentation = {
  primaryMessage: string;
  secondaryMessage: string;
  supportingMessage?: string;
  isForAnotherProfile: boolean;
};
