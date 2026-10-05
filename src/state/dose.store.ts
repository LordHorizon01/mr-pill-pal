import { create } from "zustand";

import { getSafeDatabaseErrorMessage } from "@/database/database";
import {
  getDosesForDate,
  markSkipped,
  markTaken,
  correctDoseStatus,
  toLocalDateString,
} from "@/features/doses/dose.service";
import { TodayDose } from "@/features/doses/dose.types";
import { createAsyncRequestGuard } from "@/state/async-request.domain";

const doseLoadGuard = createAsyncRequestGuard();

function getSafeDoseErrorMessage(error: unknown, fallback: string): string {
  const safeDatabaseMessage = getSafeDatabaseErrorMessage(error, fallback);

  const safeDoseMessages = new Set([
    "Dose record not found.",
    "Future doses cannot be recorded yet.",
    "This dose has already been recorded.",
    "This dose was changed before it could be saved. Refresh and try again.",
  ]);

  return safeDoseMessages.has(safeDatabaseMessage)
    ? safeDatabaseMessage
    : fallback;
}

interface DoseState {
  profileId: string | null;
  selectedDate: string;
  loadedDate: string | null;
  doses: TodayDose[];
  isLoading: boolean;
  updatingDoseId: string | null;
  error: string | null;
  loadDoses: (date?: string) => Promise<void>;
  setSelectedDate: (date: string) => void;
  recordTaken: (id: string) => Promise<void>;
  recordSkipped: (id: string) => Promise<void>;
  correctStatus: (id: string, target: "taken" | "skipped") => Promise<void>;
  clearError: () => void;
  setProfile: (profileId: string | null) => void;
}

export const useDoseStore = create<DoseState>((set, get) => ({
  profileId: null,
  selectedDate: toLocalDateString(),
  loadedDate: null,
  doses: [],
  isLoading: false,
  updatingDoseId: null,
  error: null,

  loadDoses: async (date) => {
    const requestRevision = doseLoadGuard.begin();
    const profileId = get().profileId;
    if (!profileId) { set({ doses: [], loadedDate: null, isLoading: false, error: null }); return; }
    const selectedDate = date ?? get().selectedDate;
    set({ isLoading: true, error: null, selectedDate });

    try {
      const doses = await getDosesForDate(profileId, selectedDate);
      if (!doseLoadGuard.isCurrent(requestRevision)) return;
      set({ doses, loadedDate: selectedDate, isLoading: false });
    } catch (error) {
      if (!doseLoadGuard.isCurrent(requestRevision)) return;
      set({
        isLoading: false,
        error: getSafeDoseErrorMessage(
          error,
          "Could not load today's doses right now. Please try again.",
        ),
      });
    }
  },

  setSelectedDate: (selectedDate) => set({ selectedDate }),

  recordTaken: async (id) => {
    if (get().updatingDoseId) {
      return;
    }

    set({ updatingDoseId: id, error: null });

    try {
      await markTaken(get().profileId!, id);
      await get().loadDoses();
    } catch (error) {
      set({
        error: getSafeDoseErrorMessage(
          error,
          "Could not record this dose as taken. Please try again.",
        ),
      });
    } finally {
      set({ updatingDoseId: null });
    }
  },

  recordSkipped: async (id) => {
    if (get().updatingDoseId) {
      return;
    }

    set({ updatingDoseId: id, error: null });

    try {
      await markSkipped(get().profileId!, id);
      await get().loadDoses();
    } catch (error) {
      set({
        error: getSafeDoseErrorMessage(
          error,
          "Could not record this dose as skipped. Please try again.",
        ),
      });
    } finally {
      set({ updatingDoseId: null });
    }
  },

  correctStatus: async (id, target) => {
    if (get().updatingDoseId) return;
    set({ updatingDoseId: id, error: null });
    try {
      await correctDoseStatus(get().profileId!, id, target);
      await get().loadDoses();
    } catch (error) {
      set({ error: getSafeDoseErrorMessage(error, "Could not update this dose status. Please try again.") });
    } finally {
      set({ updatingDoseId: null });
    }
  },

  clearError: () => set({ error: null }),
  setProfile: (profileId) => {
    doseLoadGuard.invalidate();
    set({ profileId, doses: [], loadedDate: null, selectedDate: toLocalDateString(), error: null, isLoading: false, updatingDoseId: null });
  },
}));
