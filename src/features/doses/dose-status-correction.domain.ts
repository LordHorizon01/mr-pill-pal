import { DoseStatus } from "./dose.types";

export type DoseStatusCorrectionTarget = "taken" | "skipped";

export function canCorrectDoseStatus(
  current: DoseStatus,
  target: DoseStatusCorrectionTarget,
): boolean {
  return (current === "taken" && target === "skipped") ||
    (current === "skipped" && target === "taken");
}

/** Restores the exact stock quantity that was deducted, never the current setting. */
export function getReversedInventoryQuantity(appliedQuantity: number): number {
  return Math.max(0, appliedQuantity);
}
