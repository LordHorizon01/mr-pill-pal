export interface ReminderNotificationMetadata {
  profileId?: string;
  medicationId: string;
  scheduleId: string;
  doseId?: string;
  scheduledDate?: string;
  scheduledTime?: string;
}
