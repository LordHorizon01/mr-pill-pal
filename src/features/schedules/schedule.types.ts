export type ScheduleType = "one_time" | "recurring";

export type ReminderStatus =
  | "active"
  | "paused"
  | "permission_required"
  | "scheduling_failed"
  | "expired";

export interface MedicationSchedule {
  id: string;
  profileId: string;
  medicationId: string;
  type: ScheduleType;
  time: string;
  startDate: string;
  endDate?: string;
  repeatDays?: number[];
  notificationId?: string;
  notificationIds?: string[];
  isActive: boolean;
  reminderStatus: ReminderStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateScheduleInput {
  profileId?: string;
  medicationId: string;
  type: ScheduleType;
  time: string;
  startDate: string;
  endDate?: string;
  repeatDays?: number[];
}

export interface UpdateScheduleInput {
  time: string;
  startDate: string;
  endDate?: string;
  repeatDays?: number[];
}

export interface ReminderAttentionItem {
  scheduleId: string;
  medicationId: string;
  medicationName: string;
  time: string;
  reminderStatus: Extract<ReminderStatus, "permission_required" | "scheduling_failed">;
}

export interface ReminderSettingsOverview {
  permissionGranted: boolean;
  health: "working" | "permission_required" | "attention_required";
  affectedSchedules: ReminderAttentionItem[];
}
