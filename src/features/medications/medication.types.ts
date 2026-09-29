export interface MedicationInventorySummary {
  medicationId: string;
  profileId: string;
  trackingEnabled: boolean;
  currentQuantity: number;
  unit: "tablets" | "capsules" | "ml" | "units";
  consumptionPerTaken: number;
  lowStockThreshold: number;
  createdAt: string;
  updatedAt: string;
}

export interface Medication {
  id: string;
  profileId: string;
  name: string;
  dosage: string;
  instructions?: string;
  notes?: string;
  isActive: boolean;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
  refillInventory?: MedicationInventorySummary;
}

export interface CreateMedicationInput {
  name: string;
  dosage: string;
  instructions?: string;
  notes?: string;
}

export interface UpdateMedicationInput {
  name?: string;
  dosage?: string;
  instructions?: string;
  notes?: string;
  isActive?: boolean;
}

export type MedicationListFilter = "active" | "paused" | "archived" | "all";
