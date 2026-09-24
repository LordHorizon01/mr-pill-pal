export const STOCK_UNITS = ["tablets", "capsules", "ml", "units"] as const;

export type StockUnit = (typeof STOCK_UNITS)[number];
export type RefillStockState = "disabled" | "normal" | "low";
export type RefillAlertStatus = "normal" | "pending" | "alerted" | "permission_required" | "scheduling_failed" | "inactive";
export type InventoryEventType =
  | "dose_consumption"
  | "dose_consumption_reversal"
  | "dose_consumption_reapplied"
  | "refill_addition";

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

export interface StockHistoryEvent {
  id: string;
  profileId: string;
  medicationId: string;
  doseId?: string;
  operationId?: string;
  type: InventoryEventType;
  quantityDelta: number;
  quantityBefore: number;
  quantityAfter: number;
  /** Undefined for a legacy event created before unit snapshots were added. */
  unitSnapshot?: StockUnit;
  createdAt: string;
}

export interface RecordRefillInput {
  quantityAdded: number;
  operationId: string;
}

export interface RecordRefillResult {
  inventory: MedicationInventory;
  event: StockHistoryEvent;
  wasAlreadyRecorded: boolean;
}

export interface RefillAlertState {
  profileId: string;
  medicationId: string;
  episodeActive: boolean;
  alertStatus: RefillAlertStatus;
  nativeNotificationId?: string;
  attemptedAt?: string;
  alertedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LowStockAlertCandidate {
  profileId: string;
  medicationId: string;
  medicationName: string;
  inventory: MedicationInventory;
  isLow: boolean;
  episodeActive: boolean;
  alertStatus: RefillAlertStatus;
  shouldCheckDelivery: boolean;
  notificationIdToCancel?: string;
}
