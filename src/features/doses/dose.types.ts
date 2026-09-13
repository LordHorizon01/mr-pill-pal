export type DoseStatus = "pending" | "taken" | "skipped" | "missed";

export interface DoseRecord {
  id: string;
  profileId: string;
  medicationId: string;
  scheduleId: string;
  scheduledDate: string;
  scheduledTime: string;
  scheduledAt: string;
  status: DoseStatus;
  takenAt?: string;
  notes?: string;
  medicationName?: string;
  medicationDosage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TodayDose extends DoseRecord {
  medicationName: string;
  medicationDosage: string;
}

export interface CreateDoseOccurrenceInput {
  profileId: string;
  medicationId: string;
  scheduleId: string;
  scheduledDate: string;
  scheduledTime: string;
  medicationName: string;
  medicationDosage: string;
}
