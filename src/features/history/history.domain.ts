import { addDaysToLocalDate, toLocalDateString } from "../doses/dose.domain";
import { DoseStatus } from "../doses/dose.types";
import { HistoryDose, HistoryGroup, HistoryQuery } from "./history.types";

export function getHistoryQueryKey(query: HistoryQuery): string {
  return JSON.stringify([
    query.status ?? "all",
    query.medicationId ?? null,
    query.fromDate ?? null,
    query.toDate ?? null,
    query.limit ?? null,
    query.offset ?? null,
  ]);
}

export function isHistoryQueryCurrent(loadedQueryKey: string | null, query: HistoryQuery): boolean {
  return loadedQueryKey !== null && loadedQueryKey === getHistoryQueryKey(query);
}

export function canDeleteHistoryStatus(status: DoseStatus): boolean {
  return status === "taken" || status === "skipped" || status === "missed";
}

/**
 * Groups the already ordered History result without repeatedly copying the
 * previous group array. A single date can contain many dose records, so an
 * append keeps the grouping work linear for larger local histories.
 */
export function groupHistoryByLocalDate(
  doses: readonly HistoryDose[],
  referenceDate = toLocalDateString(),
): HistoryGroup[] {
  const yesterday = addDaysToLocalDate(referenceDate, -1);
  const groups = new Map<string, HistoryDose[]>();

  for (const dose of doses) {
    const existing = groups.get(dose.scheduledDate);

    if (existing) {
      existing.push(dose);
    } else {
      groups.set(dose.scheduledDate, [dose]);
    }
  }

  return Array.from(groups, ([date, data]) => ({
    date,
    data,
    label: date === referenceDate
      ? "Today"
      : date === yesterday
        ? "Yesterday"
        : new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
          day: "numeric",
          month: "long",
          year: "numeric",
        }),
  }));
}
