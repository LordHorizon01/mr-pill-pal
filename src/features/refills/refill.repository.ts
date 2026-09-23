import { runDatabaseOperation } from "@/database/database";

import { MedicationInventory, RefillTrackingInput } from "./refill.types";

type InventoryRow = {
  medication_id: string;
  profile_id: string;
  tracking_enabled: number;
  current_quantity: number;
  unit: MedicationInventory["unit"];
  consumption_per_taken: number;
  low_stock_threshold: number;
  created_at: string;
  updated_at: string;
};

function requireProfile(profileId: string): void {
  if (!profileId.trim()) throw new Error("Choose a profile before managing refill tracking.");
}

function mapInventory(row: InventoryRow): MedicationInventory {
  return {
    medicationId: row.medication_id,
    profileId: row.profile_id,
    trackingEnabled: row.tracking_enabled === 1,
    currentQuantity: row.current_quantity,
    unit: row.unit,
    consumptionPerTaken: row.consumption_per_taken,
    lowStockThreshold: row.low_stock_threshold,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getMedicationInventory(profileId: string, medicationId: string): Promise<MedicationInventory | null> {
  requireProfile(profileId);
  return runDatabaseOperation(async (db) => {
    const row = await db.getFirstAsync<InventoryRow>(
      "SELECT * FROM medication_inventory WHERE medication_id = ? AND profile_id = ?",
      [medicationId, profileId],
    );
    return row ? mapInventory(row) : null;
  });
}

export async function getMedicationInventorySummaries(
  profileId: string,
  medicationIds: string[],
): Promise<Record<string, MedicationInventory>> {
  requireProfile(profileId);
  if (!medicationIds.length) return {};
  const placeholders = medicationIds.map(() => "?").join(", ");
  return runDatabaseOperation(async (db) => {
    const rows = await db.getAllAsync<InventoryRow>(
      `SELECT * FROM medication_inventory WHERE profile_id = ? AND medication_id IN (${placeholders})`,
      [profileId, ...medicationIds],
    );
    return Object.fromEntries(rows.map((row) => {
      const inventory = mapInventory(row);
      return [inventory.medicationId, inventory];
    }));
  });
}

export async function saveMedicationInventory(
  profileId: string,
  medicationId: string,
  input: RefillTrackingInput,
): Promise<MedicationInventory> {
  requireProfile(profileId);
  const now = new Date().toISOString();
  return runDatabaseOperation(async (db) => {
    const result = await db.runAsync(
      `INSERT INTO medication_inventory (medication_id, profile_id, tracking_enabled, current_quantity, unit, consumption_per_taken, low_stock_threshold, created_at, updated_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM medications WHERE id = ? AND profile_id = ?)
       ON CONFLICT(medication_id) DO UPDATE SET
         tracking_enabled = excluded.tracking_enabled,
         current_quantity = excluded.current_quantity,
         unit = excluded.unit,
         consumption_per_taken = excluded.consumption_per_taken,
         low_stock_threshold = excluded.low_stock_threshold,
         updated_at = excluded.updated_at
       WHERE medication_inventory.profile_id = excluded.profile_id`,
      [medicationId, profileId, input.trackingEnabled ? 1 : 0, input.currentQuantity, input.unit, input.consumptionPerTaken, input.lowStockThreshold, now, now, medicationId, profileId],
    );
    if (result.changes !== 1) throw new Error("Medication not found for this profile.");
    const saved = await db.getFirstAsync<InventoryRow>(
      "SELECT * FROM medication_inventory WHERE medication_id = ? AND profile_id = ?",
      [medicationId, profileId],
    );
    if (!saved) throw new Error("Refill tracking could not be saved.");
    return mapInventory(saved);
  });
}
