export type DoseStatus =
  | "pending"
  | "taken"
  | "skipped"
  | "missed";

export interface DoseRecord {
  id: string;
  medicationId: string;
  scheduleId: string;
  scheduledAt: string;
  status: DoseStatus;
  takenAt?: string;
  createdAt: string;
  updatedAt: string;
}