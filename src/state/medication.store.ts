import { create } from "zustand";
import { getSafeDatabaseErrorMessage } from "@/database/database";

import {
  addMedication,
  archiveMedicationSafely,
  editMedication,
  getAllMedications,
  restoreMedicationSafely,
  removeMedication,
} from "@/features/medications/medication.service";

import {
  CreateMedicationInput,
  Medication,
  MedicationListFilter,
  UpdateMedicationInput,
} from "@/features/medications/medication.types";
import { createAsyncRequestGuard } from "@/state/async-request.domain";

const medicationLoadGuard = createAsyncRequestGuard();

interface MedicationState {
  profileId: string | null;
  medications: Medication[];
  isLoading: boolean;
  error: string | null;

  loadMedications: (filter?: MedicationListFilter) => Promise<void>;

  createMedication: (
    input: CreateMedicationInput
  ) => Promise<Medication>;

  updateMedication: (
    id: string,
    input: UpdateMedicationInput
  ) => Promise<void>;

  deleteMedication: (id: string) => Promise<void>;
  archiveMedication: (id: string) => Promise<void>;
  restoreMedication: (id: string) => Promise<void>;

  clearError: () => void;
  setProfile: (profileId: string | null) => void;
}

export const useMedicationStore = create<MedicationState>((set) => ({
  profileId: null,
  medications: [],
  isLoading: false,
  error: null,

  loadMedications: async (filter = "active") => {
    const requestRevision = medicationLoadGuard.begin();
    const profileId = useMedicationStore.getState().profileId;
    if (!profileId) { if (medicationLoadGuard.isCurrent(requestRevision)) set({ medications: [], isLoading: false, error: null }); return; }
    set({
      isLoading: true,
      error: null,
    });

    try {
      const medications = await getAllMedications(profileId, filter);
      if (!medicationLoadGuard.isCurrent(requestRevision)) return;

      set({
        medications,
        isLoading: false,
      });
    } catch (error) {
      if (!medicationLoadGuard.isCurrent(requestRevision)) return;
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
    const profileId = useMedicationStore.getState().profileId;
    if (!profileId) throw new Error("Choose a profile before adding medication.");
    set({ error: null });

    try {
      const medication = await addMedication(profileId, input);

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
    const profileId = useMedicationStore.getState().profileId;
    if (!profileId) throw new Error("Choose a profile before editing medication.");
    set({ error: null });

    try {
      await editMedication(profileId, id, input);

      const updatedMedication = await getAllMedications(profileId);

      set({
        medications: updatedMedication,
      });
    } catch (error) {
      const message = getSafeDatabaseErrorMessage(
        error,
        "Could not update this medication. Please try again.",
      );

      try {
        const medications = await getAllMedications(profileId);

        set({ medications, error: message });
      } catch {
        set({ error: message });
      }

      throw error;
    }
  },

  deleteMedication: async (id) => {
    const profileId = useMedicationStore.getState().profileId;
    if (!profileId) throw new Error("Choose a profile before deleting medication.");
    set({ error: null });

    try {
      await removeMedication(profileId, id);

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

  archiveMedication: async (id) => {
    const profileId = useMedicationStore.getState().profileId;
    if (!profileId) throw new Error("Choose a profile before archiving medication.");
    try { await archiveMedicationSafely(profileId, id); set((state) => ({ medications: state.medications.filter((medication) => medication.id !== id) })); }
    catch (error) { set({ error: getSafeDatabaseErrorMessage(error, "Could not archive this medication. Please try again.") }); throw error; }
  },

  restoreMedication: async (id) => {
    const profileId = useMedicationStore.getState().profileId;
    if (!profileId) throw new Error("Choose a profile before restoring medication.");
    try { await restoreMedicationSafely(profileId, id); set((state) => ({ medications: state.medications.filter((medication) => medication.id !== id) })); }
    catch (error) { set({ error: getSafeDatabaseErrorMessage(error, "Could not restore this medication. Please try again.") }); throw error; }
  },

  clearError: () => {
    set({ error: null });
  },
  setProfile: (profileId) => { medicationLoadGuard.invalidate(); set({ profileId, medications: [], error: null, isLoading: false }); },
}));
