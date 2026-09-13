import { TodayDose } from "../doses/dose.types";

export type HistoryStatusFilter = "all" | "taken" | "skipped" | "missed";

export interface HistoryQuery {
  status?: HistoryStatusFilter;
  medicationId?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

export type HistoryDose = TodayDose;

export interface HistoryGroup {
  date: string;
  label: string;
  data: HistoryDose[];
}

export interface InsightsSummary {
  taken: number;
  skipped: number;
  missed: number;
}

export type InsightRange = "7" | "30" | "90" | "all";

export interface MedicationInsight extends InsightsSummary {
  medicationId: string;
  medicationName: string;
}

export interface DailyInsight extends InsightsSummary {
  date: string;
}

export interface DetailedInsights extends InsightsSummary {
  eligible: number;
  unresolvedPast: number;
  byMedication: MedicationInsight[];
  trend: DailyInsight[];
}
