import { DoseStatus } from "./dose.types";

/** Presentation-only rule: correction remains limited to finalized editable states. */
export function shouldShowDoseCorrectionOverflow(status: DoseStatus): boolean {
  return status === "taken" || status === "skipped";
}
