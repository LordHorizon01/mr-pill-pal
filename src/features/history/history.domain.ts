import { DoseStatus } from "../doses/dose.types";

export function canDeleteHistoryStatus(status: DoseStatus): boolean {
  return status === "taken" || status === "skipped" || status === "missed";
}
