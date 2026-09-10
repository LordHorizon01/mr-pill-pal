import { create } from "zustand";
import { getSafeDatabaseErrorMessage } from "@/database/database";

import {
  addMedication,
  editMedication,
  getAllMedications,
  removeMedication,
} from "@/features/medications/medication.service";

import {
  CreateMedicationInput,
  Medication,
  UpdateMedicationInput,
} from "@/features/medications/medication.types";

interface MedicationState {
  medications: Medication[];
  isLoading: boolean;
  error: string | null;

  loadMedications: () => Promise<void>;

  createMedication: (
    input: CreateMedicationInput
  ) => Promise<Medication>;

  updateMedication: (
    id: string,
    input: UpdateMedicationInput
  ) => Promise<void>;

  deleteMedication: (id: string) => Promise<void>;

  clearError: () => void;
}

export const useMedicationStore = create<MedicationState>((set) => ({
  medications: [],
  isLoading: false,
  error: null,

  loadMedications: async () => {
    set({
      isLoading: true,
      error: null,
    });

    try {
      const medications = await getAllMedications();

      set({
        medications,
        isLoading: false,
      });
    } catch (error) {
      set({
        error: getSafeDatabaseErrorMessage(
          error,
          "Could not load medications right now. Please try again.",
        ),
        isLoading: false,
      });
    }
  },

  createMedication: async (input) => {
    set({ error: null });

    try {
      const medication = await addMedication(input);

      set((state) => ({
        medications: [medication, ...state.medications],
      }));

      return medication;
    } catch (error) {
      const message = getSafeDatabaseErrorMessage(
        error,
        "Could not save this medication. Please try again.",
      );

      set({ error: message });

      throw error;
    }
  },

  updateMedication: async (id, input) => {
    set({ error: null });

    try {
      await editMedication(id, input);

      const updatedMedication = await getAllMedications();

      set({
        medications: updatedMedication,
      });
    } catch (error) {
      const message = getSafeDatabaseErrorMessage(
        error,
        "Could not update this medication. Please try again.",
      );

      try {
        const medications = await getAllMedications();

        set({ medications, error: message });
      } catch {
        set({ error: message });
      }

      throw error;
    }
  },

  deleteMedication: async (id) => {
    set({ error: null });

    try {
      await removeMedication(id);

      set((state) => ({
        medications: state.medications.filter(
          (medication) => medication.id !== id
        ),
      }));
    } catch (error) {
      const message = getSafeDatabaseErrorMessage(
        error,
        "Could not delete this medication. Please try again.",
      );

      set({ error: message });

      throw error;
    }
  },

  clearError: () => {
    set({ error: null });
  },
}));
