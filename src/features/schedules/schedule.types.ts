export type ScheduleType = "one_time" | "recurring";

export interface MedicationSchedule {
  id: string;
  medicationId: string;
  type: ScheduleType;
  time: string;
  startDate: string;
  endDate?: string;
  repeatDays?: number[];
  isActive: boolean;
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