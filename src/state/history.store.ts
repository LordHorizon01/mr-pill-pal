import { create } from "zustand";
import { getSafeDatabaseErrorMessage } from "@/database/database";
import { getHistory } from "@/features/history/history.service";
import { deleteHistoryRecord as deleteHistoryRecordInService } from "@/features/history/history.service";
import { HistoryDose, HistoryQuery } from "@/features/history/history.types";
import { toLocalDateString } from "@/features/doses/dose.domain";
import { useDoseStore } from "@/state/dose.store";
import { createAsyncRequestGuard } from "@/state/async-request.domain";

const historyLoadGuard = createAsyncRequestGuard();

interface HistoryState { profileId: string | null; doses: HistoryDose[]; isLoading: boolean; deletingDoseId: string | null; error: string | null; query: HistoryQuery; loadHistory: (query?: HistoryQuery) => Promise<void>; deleteHistoryRecord: (dose: HistoryDose) => Promise<void>; clearError: () => void; setProfile: (profileId: string | null) => void; }
export const useHistoryStore = create<HistoryState>((set, get) => ({
  profileId: null, doses: [], isLoading: false, deletingDoseId: null, error: null, query: {},
  loadHistory: async (query) => { const requestRevision = historyLoadGuard.begin(); const nextQuery = query ?? get().query; const profileId = get().profileId; if (!profileId) { if (historyLoadGuard.isCurrent(requestRevision)) set({ doses: [], isLoading: false, error: null, query: nextQuery }); return; } set({ isLoading: true, error: null, query: nextQuery }); try { const doses = await getHistory(profileId, nextQuery); if (historyLoadGuard.isCurrent(requestRevision)) set({ doses, isLoading: false }); } catch (error) { if (historyLoadGuard.isCurrent(requestRevision)) set({ error: getSafeDatabaseErrorMessage(error, "History couldn't be loaded. Please try again."), isLoading: false }); } },
  deleteHistoryRecord: async (dose) => {
    if (dose.status === "pending") { set({ error: "Only completed history records can be deleted." }); return; }
    set({ deletingDoseId: dose.id, error: null });
    try {
      await deleteHistoryRecordInService(get().profileId!, dose.id);
      set((state) => ({ doses: state.doses.filter((item) => item.id !== dose.id), deletingDoseId: null }));
      if (dose.scheduledDate === toLocalDateString()) void useDoseStore.getState().loadDoses(toLocalDateString());
    } catch (error) { set({ deletingDoseId: null, error: getSafeDatabaseErrorMessage(error, "Couldn't delete this history record. Please try again.") }); throw error; }
  },
  clearError: () => set({ error: null }), setProfile: (profileId) => { historyLoadGuard.invalidate(); set({ profileId, doses: [], query: {}, error: null, isLoading: false, deletingDoseId: null }); },
}));
