import { DoseStatus } from "../doses/dose.types";

export type MedicationReportRangePreset = "7" | "30" | "90";

export type MedicationReportLifecycleStatus = "Active" | "Paused" | "Archived" | "Current status unavailable";

export type MedicationReportSourceProfile = {
  id: string;
  fullName: string;
  nickname?: string;
};

export type MedicationReportSourceMedication = {
  id: string;
  profileId: string;
  name: string;
  dosage: string;
  isActive: boolean;
  archivedAt?: string;
};

export type MedicationReportSourceDose = {
  profileId: string;
  medicationId: string;
  scheduledDate: string;
  status: DoseStatus;
  medicationName?: string;
  medicationDosage?: string;
};

export type MedicationReportSource = {
  profile: MedicationReportSourceProfile | null;
  medications: MedicationReportSourceMedication[];
  doses: MedicationReportSourceDose[];
};

export type MedicationReportRange = {
  preset: MedicationReportRangePreset;
  startDate: string;
  endDate: string;
  label: string;
};

export type MedicationReportCounts = {
  taken: number;
  skipped: number;
  missed: number;
  unresolvedPast: number;
  eligible: number;
  adherence: number | null;
};

export type MedicationAdherenceReportMedication = MedicationReportCounts & {
  medicationId: string;
  medicationName: string;
  medicationDosage: string;
  lifecycleStatus: MedicationReportLifecycleStatus;
  hasRelevantRecords: boolean;
};

export type MedicationAdherenceReport = MedicationReportCounts & {
  profileId: string;
  profileName: string;
  range: MedicationReportRange;
  generatedAt: string;
  medications: MedicationAdherenceReportMedication[];
};
