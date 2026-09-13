import { addDaysToLocalDate, toLocalDateString, validateLocalDate } from "@/features/doses/dose.domain";
import { deleteFinalizedHistoryDose, getDetailedInsights, getHistoryDose, getInsightsCounts, queryHistory } from "./history.repository";
import { DetailedInsights, HistoryGroup, HistoryQuery, InsightRange, InsightsSummary } from "./history.types";

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

export function groupHistoryByLocalDate(doses: Awaited<ReturnType<typeof getHistory>>): HistoryGroup[] {
  const today = toLocalDateString(); const yesterday = addDaysToLocalDate(today, -1);
  const groups = new Map<string, typeof doses>();
  doses.forEach((dose) => groups.set(dose.scheduledDate, [...(groups.get(dose.scheduledDate) ?? []), dose]));
  return [...groups.entries()].map(([date, data]) => ({ date, data, label: date === today ? "Today" : date === yesterday ? "Yesterday" : new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) }));
}

export async function getLastSevenDayInsights(profileId: string): Promise<InsightsSummary> {
  const today = toLocalDateString(); return getInsightsCounts(profileId, addDaysToLocalDate(today, -6), today);
}

export async function getRoutineInsights(profileId: string, range: InsightRange): Promise<DetailedInsights> {
  const today = toLocalDateString();
  const fromDate = range === "all" ? null : addDaysToLocalDate(today, -(Number(range) - 1));
  return getDetailedInsights(profileId, fromDate, today, today);
}
