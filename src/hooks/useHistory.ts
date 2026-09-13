import { useHistoryStore } from "@/state/history.store";

/** Subscribe to individual fields so unrelated History updates do not rerender every consumer. */
export function useHistory() {
  return {
    doses: useHistoryStore((state) => state.doses),
    isLoading: useHistoryStore((state) => state.isLoading),
    deletingDoseId: useHistoryStore((state) => state.deletingDoseId),
    error: useHistoryStore((state) => state.error),
    loadHistory: useHistoryStore((state) => state.loadHistory),
    deleteHistoryRecord: useHistoryStore((state) => state.deleteHistoryRecord),
    clearError: useHistoryStore((state) => state.clearError),
  };
}
