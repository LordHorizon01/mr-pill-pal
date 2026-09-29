import { AnchoredActionMenu } from "@/components/anchored-action-menu";
import { AnchoredMenuAnchor } from "@/components/anchored-action-menu.domain";
import { Medication } from "./medication.types";

export function MedicationOverflowSheet({ medication, anchor, onArchive, onDelete, onClose }: { medication: Medication | null; anchor: AnchoredMenuAnchor | null; onArchive: () => void; onDelete: () => void; onClose: () => void }) {
  return <AnchoredActionMenu visible={Boolean(medication)} anchor={anchor} accessibilityLabel={`Medication actions for ${medication?.name ?? "medication"}`} onDismiss={onClose} items={[
    ...(!medication?.archivedAt ? [{ id: "archive", label: "Archive", accessibilityLabel: `Archive ${medication?.name}`, onPress: onArchive }] : []),
    { id: "delete", label: "Delete Medication", tone: "danger", accessibilityLabel: `Delete medication ${medication?.name}`, onPress: onDelete },
    { id: "cancel", label: "Cancel", accessibilityLabel: "Cancel medication actions", onPress: () => undefined },
  ]} />;
}
