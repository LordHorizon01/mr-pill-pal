export type ScheduleType = "one_time" | "recurring";

export type ReminderStatus =
  | "active"
  | "paused"
  | "permission_required"
  | "scheduling_failed"
  | "expired";

export interface MedicationSchedule {
  id: string;
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
  medicationId: string;
  type: ScheduleType;
  time: string;
  startDate: string;
  endDate?: string;
  repeatDays?: number[];
}
