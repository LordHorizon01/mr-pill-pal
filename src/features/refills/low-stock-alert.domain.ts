import { MedicationInventory, RefillAlertStatus } from "./refill.types";

export type LowStockEpisodeInput = {
  trackingEnabled: boolean;
  medicationIsActive: boolean;
  medicationIsArchived: boolean;
  currentQuantity: number;
  lowStockThreshold: number;
  previousEpisodeActive: boolean;
  previousAlertStatus: RefillAlertStatus;
};

export type LowStockEpisodeDecision = {
  isLow: boolean;
  episodeActive: boolean;
  alertStatus: RefillAlertStatus;
  shouldCheckDelivery: boolean;
};

export function isLowStock(inventory: Pick<MedicationInventory, "trackingEnabled" | "currentQuantity" | "lowStockThreshold">): boolean {
  return inventory.trackingEnabled && inventory.currentQuantity <= inventory.lowStockThreshold;
}

/**
 * A low-stock episode begins only when an eligible medication crosses from
 * normal to low. It stays active until the quantity becomes normal again.
 */
export function decideLowStockEpisode(input: LowStockEpisodeInput): LowStockEpisodeDecision {
  const eligible = input.trackingEnabled && input.medicationIsActive && !input.medicationIsArchived;
  if (!eligible) return { isLow: false, episodeActive: false, alertStatus: "inactive", shouldCheckDelivery: false };

  const low = input.currentQuantity <= input.lowStockThreshold;
  if (!low) return { isLow: false, episodeActive: false, alertStatus: "normal", shouldCheckDelivery: false };

  if (!input.previousEpisodeActive) return { isLow: true, episodeActive: true, alertStatus: "pending", shouldCheckDelivery: true };

  return {
    isLow: true,
    episodeActive: true,
    alertStatus: input.previousAlertStatus,
    shouldCheckDelivery: input.previousAlertStatus === "pending" || input.previousAlertStatus === "permission_required",
  };
}

export function getLowStockNotificationContent(input: {
  medicationName: string;
  quantity: number;
  unit: string;
  hideMedicationName: boolean;
}): { title: string; body: string } {
  if (input.hideMedicationName) {
    return { title: "Refill reminder", body: "Recorded medication stock is running low. Open Mr. Pill Pal to review it." };
  }
  return {
    title: "Refill soon",
    body: `${input.medicationName} has ${formatLowStockQuantity(input.quantity, input.unit)} recorded.`,
  };
}

function formatLowStockQuantity(quantity: number, unit: string): string {
  const value = Number.isInteger(quantity) ? String(quantity) : String(Number(quantity.toFixed(3)));
  return `${value} ${unit}`;
}
