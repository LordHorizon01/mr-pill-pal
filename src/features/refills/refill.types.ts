export const STOCK_UNITS = ["tablets", "capsules", "ml", "units"] as const;

export type StockUnit = (typeof STOCK_UNITS)[number];
export type RefillStockState = "disabled" | "normal" | "low";

export interface MedicationInventory {
  medicationId: string;
  profileId: string;
  trackingEnabled: boolean;
  currentQuantity: number;
  unit: StockUnit;
  consumptionPerTaken: number;
  lowStockThreshold: number;
  createdAt: string;
  updatedAt: string;
}

export interface RefillTrackingInput {
  trackingEnabled: boolean;
  currentQuantity: number;
  unit: StockUnit;
  consumptionPerTaken: number;
  lowStockThreshold: number;
}
