import { addDaysToLocalDate, toLocalDateString, validateLocalDate } from "@/features/doses/dose.domain";
import { deleteFinalizedHistoryDose, getDetailedInsights, getHistoryDose, getInsightsCounts, queryHistory } from "./history.repository";
import { DetailedInsights, HistoryQuery, InsightRange, InsightsSummary } from "./history.types";
export { groupHistoryByLocalDate } from "./history.domain";

export async function getHistory(profileId: string, query: HistoryQuery = {}) {
  const today = toLocalDateString();
  if (query.fromDate) validateLocalDate(query.fromDate);
  if (query.toDate) validateLocalDate(query.toDate);
  return queryHistory(profileId, query, today);
}

export async function getHistoryDetail(profileId: string, id: string) { return getHistoryDose(profileId, id); }

export async function deleteHistoryRecord(profileId: string, id: string): Promise<void> {
  if (!id.trim()) throw new Error("History record ID is required.");
  await deleteFinalizedHistoryDose(profileId, id);
}

export async function getLastSevenDayInsights(profileId: string): Promise<InsightsSummary> {
  const today = toLocalDateString(); return getInsightsCounts(profileId, addDaysToLocalDate(today, -6), today);
}

export async function getRoutineInsights(profileId: string, range: InsightRange): Promise<DetailedInsights> {
  const today = toLocalDateString();
  const fromDate = range === "all" ? null : addDaysToLocalDate(today, -(Number(range) - 1));
  return getDetailedInsights(profileId, fromDate, today, today);
}
