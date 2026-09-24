import { getMedication } from "@/features/medications/medication.service";
import { validateRecordRefillInput, validateRefillTrackingInput } from "./refill.domain";
import { getMedicationInventory, getMedicationStockHistory, recordMedicationRefill, saveMedicationInventory } from "./refill.repository";
import { MedicationInventory, RecordRefillInput, RecordRefillResult, RefillTrackingInput, StockHistoryEvent } from "./refill.types";
import { reconcileLowStockAlert } from "./low-stock-alert.service";

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
  const inventory = await saveMedicationInventory(profileId, medicationId, validateRefillTrackingInput(input));
  void reconcileLowStockAlert(profileId, medicationId);
  return inventory;
}

export async function recordRefill(profileId: string, medicationId: string, input: RecordRefillInput): Promise<RecordRefillResult> {
  await requireMedicationForProfile(profileId, medicationId);
  const result = await recordMedicationRefill(profileId, medicationId, validateRecordRefillInput(input));
  if (!result.wasAlreadyRecorded) void reconcileLowStockAlert(profileId, medicationId);
  return result;
}

export async function getStockHistory(profileId: string, medicationId: string): Promise<StockHistoryEvent[]> {
  await requireMedicationForProfile(profileId, medicationId);
  return getMedicationStockHistory(profileId, medicationId);
}
