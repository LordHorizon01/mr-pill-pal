export interface Medication {
  id: string;
  name: string;
  dosage: string;
  instructions?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
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