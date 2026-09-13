import { InsightsSummary } from "./history.types";

export function calculateRoutineAdherence(summary: InsightsSummary, unresolvedPast = 0): number | null {
  const eligible = summary.taken + summary.skipped + summary.missed + unresolvedPast;
  return eligible === 0 ? null : Math.round((summary.taken / eligible) * 100);
}
