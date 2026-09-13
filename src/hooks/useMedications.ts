import { useMedicationStore } from "@/state/medication.store";

export function useMedications() {
  const medications = useMedicationStore(
    (state) => state.medications
  );

  const isLoading = useMedicationStore(
    (state) => state.isLoading
  );

  const error = useMedicationStore(
    (state) => state.error
  );

  const loadMedications = useMedicationStore(
    (state) => state.loadMedications
  );

  const createMedication = useMedicationStore(
    (state) => state.createMedication
  );

  const updateMedication = useMedicationStore(
    (state) => state.updateMedication
  );

  const deleteMedication = useMedicationStore(
    (state) => state.deleteMedication
  );
  const archiveMedication = useMedicationStore((state) => state.archiveMedication);
  const restoreMedication = useMedicationStore((state) => state.restoreMedication);

  const clearError = useMedicationStore(
    (state) => state.clearError
  );

  return {
    medications,
    isLoading,
    error,
    loadMedications,
    createMedication,
    updateMedication,
    deleteMedication,
    archiveMedication,
    restoreMedication,
    clearError,
  };
}
