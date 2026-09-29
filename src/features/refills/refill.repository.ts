import { runDatabaseOperation, runExclusiveDatabaseTransaction } from "@/database/database";

import { assertRefillTrackingEnabled, calculateRefillAddition, isStockUnit } from "./refill.domain";
import { InventoryEventType, MedicationInventory, RecordRefillInput, RecordRefillResult, RefillTrackingInput, StockHistoryEvent } from "./refill.types";

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

type InventoryEventRow = {
  id: string;
  profile_id: string;
  medication_id: string;
  dose_id: string | null;
  operation_id: string | null;
  event_type: InventoryEventType;
  quantity_delta: number;
  quantity_before: number;
  quantity_after: number;
  unit_snapshot: string | null;
  created_at: string;
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

function mapStockHistoryEvent(row: InventoryEventRow): StockHistoryEvent {
  return {
    id: row.id,
    profileId: row.profile_id,
    medicationId: row.medication_id,
    doseId: row.dose_id ?? undefined,
    operationId: row.operation_id ?? undefined,
    type: row.event_type,
    quantityDelta: row.quantity_delta,
    quantityBefore: row.quantity_before,
    quantityAfter: row.quantity_after,
    unitSnapshot: row.unit_snapshot && isStockUnit(row.unit_snapshot) ? row.unit_snapshot : undefined,
    createdAt: row.created_at,
  };
}

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

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

export async function recordMedicationRefill(
  profileId: string,
  medicationId: string,
  input: RecordRefillInput,
): Promise<RecordRefillResult> {
  requireProfile(profileId);
  return runExclusiveDatabaseTransaction(async (db) => {
    const inventory = await db.getFirstAsync<InventoryRow>(
      `SELECT inventory.*
       FROM medication_inventory AS inventory
       INNER JOIN medications AS medication ON medication.id = inventory.medication_id
       WHERE inventory.profile_id = ? AND inventory.medication_id = ? AND medication.profile_id = ?`,
      [profileId, medicationId, profileId],
    );
    if (!inventory) throw new Error("Refill tracking was not found for this medication.");
    assertRefillTrackingEnabled(inventory.tracking_enabled === 1);

    const previousEvent = await db.getFirstAsync<InventoryEventRow>(
      `SELECT * FROM inventory_events
       WHERE profile_id = ? AND medication_id = ? AND operation_id = ? AND event_type = 'refill_addition'`,
      [profileId, medicationId, input.operationId],
    );
    if (previousEvent) {
      return { inventory: mapInventory(inventory), event: mapStockHistoryEvent(previousEvent), wasAlreadyRecorded: true };
    }

    const calculation = calculateRefillAddition(inventory.current_quantity, input.quantityAdded);
    const now = new Date().toISOString();
    const event: StockHistoryEvent = {
      id: newId(),
      profileId,
      medicationId,
      operationId: input.operationId,
      type: "refill_addition",
      quantityDelta: calculation.quantityAdded,
      quantityBefore: calculation.quantityBefore,
      quantityAfter: calculation.quantityAfter,
      unitSnapshot: inventory.unit,
      createdAt: now,
    };

    await db.runAsync(
      `INSERT INTO inventory_events (id, profile_id, medication_id, operation_id, event_type, quantity_delta, quantity_before, quantity_after, unit_snapshot, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [event.id, profileId, medicationId, input.operationId, event.type, event.quantityDelta, event.quantityBefore, event.quantityAfter, event.unitSnapshot ?? null, now],
    );
    const update = await db.runAsync(
      `UPDATE medication_inventory
       SET current_quantity = ?, updated_at = ?
       WHERE medication_id = ? AND profile_id = ? AND tracking_enabled = 1 AND current_quantity = ?`,
      [calculation.quantityAfter, now, medicationId, profileId, calculation.quantityBefore],
    );
    if (update.changes !== 1) throw new Error("Stock changed before this refill could be saved. Refresh and try again.");

    const saved = await db.getFirstAsync<InventoryRow>(
      "SELECT * FROM medication_inventory WHERE medication_id = ? AND profile_id = ?",
      [medicationId, profileId],
    );
    if (!saved) throw new Error("Refill stock could not be saved.");
    return { inventory: mapInventory(saved), event, wasAlreadyRecorded: false };
  });
}

export async function getMedicationStockHistory(
  profileId: string,
  medicationId: string,
  limit = 100,
): Promise<StockHistoryEvent[]> {
  requireProfile(profileId);
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 200);
  return runDatabaseOperation(async (db) => {
    const rows = await db.getAllAsync<InventoryEventRow>(
      `SELECT * FROM inventory_events
       WHERE profile_id = ? AND medication_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
      [profileId, medicationId, safeLimit],
    );
    return rows.map(mapStockHistoryEvent);
  });
}
