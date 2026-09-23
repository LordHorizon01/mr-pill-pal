import {
  MedicationInventory,
  RefillStockState,
  RefillTrackingInput,
  STOCK_UNITS,
  StockUnit,
} from "./refill.types";

const MAX_INVENTORY_QUANTITY = 1_000_000;
const INVENTORY_PRECISION = 1_000;

export interface TakenInventoryConsumption {
  quantityBefore: number;
  quantityDelta: number;
  quantityAfter: number;
}

function normalizeQuantity(value: number, label: string, minimum: number): number {
  if (!Number.isFinite(value)) throw new Error(`${label} must be a valid number.`);
  if (value < minimum) {
    throw new Error(`${label} must be ${minimum === 0 ? "zero or more" : "greater than zero"}.`);
  }
  if (value > MAX_INVENTORY_QUANTITY) {
    throw new Error(`${label} must be ${MAX_INVENTORY_QUANTITY.toLocaleString()} or less.`);
  }
  const normalized = Math.round(value * INVENTORY_PRECISION) / INVENTORY_PRECISION;
  if (minimum > 0 && normalized <= 0) {
    throw new Error(`${label} must be greater than zero at the supported precision.`);
  }
  return normalized;
}

export function isStockUnit(value: string): value is StockUnit {
  return (STOCK_UNITS as readonly string[]).includes(value);
}

/** Validates user-entered inventory values. It never derives values from dosage text. */
export function validateRefillTrackingInput(input: RefillTrackingInput): RefillTrackingInput {
  if (!isStockUnit(input.unit)) throw new Error("Choose a stock unit.");
  return {
    trackingEnabled: Boolean(input.trackingEnabled),
    currentQuantity: normalizeQuantity(input.currentQuantity, "Current quantity", 0),
    unit: input.unit,
    consumptionPerTaken: normalizeQuantity(input.consumptionPerTaken, "Used per Taken dose", Number.MIN_VALUE),
    lowStockThreshold: normalizeQuantity(input.lowStockThreshold, "Low-stock warning", 0),
  };
}

export function getRefillStockState(
  inventory: Pick<MedicationInventory, "trackingEnabled" | "currentQuantity" | "lowStockThreshold">,
): RefillStockState {
  if (!inventory.trackingEnabled) return "disabled";
  return inventory.currentQuantity <= inventory.lowStockThreshold ? "low" : "normal";
}

export function formatStockQuantity(quantity: number, unit: StockUnit): string {
  return `${quantity} ${unit}`;
}

/**
 * Calculates the inventory change for an already-authorized Taken transition.
 * Inventory is approximate, so a low or zero quantity never blocks the dose.
 */
export function calculateTakenInventoryConsumption(
  currentQuantity: number,
  consumptionPerTaken: number,
): TakenInventoryConsumption {
  const quantityBefore = normalizeQuantity(currentQuantity, "Current quantity", 0);
  const used = normalizeQuantity(consumptionPerTaken, "Used per Taken dose", Number.MIN_VALUE);
  const quantityAfter = Math.max(0, Math.round((quantityBefore - used) * INVENTORY_PRECISION) / INVENTORY_PRECISION);

  return {
    quantityBefore,
    quantityDelta: Math.round((quantityAfter - quantityBefore) * INVENTORY_PRECISION) / INVENTORY_PRECISION,
    quantityAfter,
  };
}
