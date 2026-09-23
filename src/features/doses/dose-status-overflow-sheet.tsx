import { AnchoredMenuAnchor } from "@/components/anchored-action-menu.domain";
import { AnchoredActionMenu } from "@/components/anchored-action-menu";
import { TodayDose } from "./dose.types";

export function DoseStatusOverflowSheet({ dose, anchor, onCorrect, onClose }: { dose: TodayDose | null; anchor: AnchoredMenuAnchor | null; onCorrect: (target: "taken" | "skipped") => void; onClose: () => void }) {
  const target = dose?.status === "taken" ? "skipped" : "taken";
  const label = target === "taken" ? "Change to Taken" : "Change to Skipped";
  return <AnchoredActionMenu visible={Boolean(dose)} anchor={anchor} accessibilityLabel={`Dose actions for ${dose?.medicationName ?? "medication"}`} onDismiss={onClose} items={[
    { id: "correct", label, accessibilityLabel: `${label} for ${dose?.medicationName}`, onPress: () => onCorrect(target) },
    { id: "cancel", label: "Cancel", accessibilityLabel: "Cancel dose status actions", onPress: () => undefined },
  ]} />;
}
