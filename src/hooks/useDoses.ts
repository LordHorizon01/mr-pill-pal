import { useDoseStore } from "@/state/dose.store";

export function useDoses() {
  return {
    selectedDate: useDoseStore((state) => state.selectedDate),
    doses: useDoseStore((state) => state.doses),
    isLoading: useDoseStore((state) => state.isLoading),
    updatingDoseId: useDoseStore((state) => state.updatingDoseId),
    error: useDoseStore((state) => state.error),
    loadDoses: useDoseStore((state) => state.loadDoses),
    setSelectedDate: useDoseStore((state) => state.setSelectedDate),
    recordTaken: useDoseStore((state) => state.recordTaken),
    recordSkipped: useDoseStore((state) => state.recordSkipped),
    clearError: useDoseStore((state) => state.clearError),
  };
}
