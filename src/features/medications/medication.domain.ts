import { Medication, UpdateMedicationInput } from "./medication.types";

export function hasMedicationChanges(medication: Medication, input: UpdateMedicationInput): boolean {
  return (input.name !== undefined && input.name.trim() !== medication.name) ||
    (input.dosage !== undefined && input.dosage.trim() !== medication.dosage) ||
    (input.instructions !== undefined && input.instructions?.trim() !== medication.instructions) ||
    (input.notes !== undefined && input.notes?.trim() !== medication.notes) ||
    (input.isActive !== undefined && input.isActive !== medication.isActive);
}
