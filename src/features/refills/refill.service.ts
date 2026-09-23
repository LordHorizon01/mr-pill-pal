import { getMedication } from "@/features/medications/medication.service";
import { validateRefillTrackingInput } from "./refill.domain";
import { getMedicationInventory, saveMedicationInventory } from "./refill.repository";
import { MedicationInventory, RefillTrackingInput } from "./refill.types";

async function requireMedicationForProfile(profileId: string, medicationId: string): Promise<void> {
  if (!profileId.trim()) throw new Error("Choose a profile before managing refill tracking.");
  if (!medicationId.trim()) throw new Error("Medication ID is required.");
  if (!(await getMedication(profileId, medicationId))) throw new Error("Medication not found.");
}

export async function getRefillTracking(profileId: string, medicationId: string): Promise<MedicationInventory | null> {
  await requireMedicationForProfile(profileId, medicationId);
  return getMedicationInventory(profileId, medicationId);
}

export async function saveRefillTracking(profileId: string, medicationId: string, input: RefillTrackingInput): Promise<MedicationInventory> {
  await requireMedicationForProfile(profileId, medicationId);
  return saveMedicationInventory(profileId, medicationId, validateRefillTrackingInput(input));
}
