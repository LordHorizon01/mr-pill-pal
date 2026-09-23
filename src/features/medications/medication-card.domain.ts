export type MedicationCardOverflowAction = "archive" | "restore" | "delete";

export function getMedicationCardActionModel(isArchived: boolean): {
  primary: readonly ("schedule" | "edit" | "refill" | "restore")[];
  overflow: readonly MedicationCardOverflowAction[];
} {
  return isArchived
    ? { primary: ["restore"], overflow: ["delete"] }
    : { primary: ["schedule", "edit", "refill"], overflow: ["archive", "delete"] };
}
