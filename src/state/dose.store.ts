import { create } from "zustand";

import { getSafeDatabaseErrorMessage } from "@/database/database";
import {
  getDosesForDate,
  markSkipped,
  markTaken,
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
  doses: TodayDose[];
  isLoading: boolean;
  updatingDoseId: string | null;
  error: string | null;
  loadDoses: (date?: string) => Promise<void>;
  setSelectedDate: (date: string) => void;
  recordTaken: (id: string) => Promise<void>;
  recordSkipped: (id: string) => Promise<void>;
  clearError: () => void;
  setProfile: (profileId: string | null) => void;
}

export const useDoseStore = create<DoseState>((set, get) => ({
  profileId: null,
  selectedDate: toLocalDateString(),
  doses: [],
  isLoading: false,
  updatingDoseId: null,
  error: null,

  loadDoses: async (date) => {
    const requestRevision = doseLoadGuard.begin();
    if (!get().profileId) { set({ doses: [], isLoading: false, error: null }); return; }
    const selectedDate = date ?? get().selectedDate;
    set({ isLoading: true, error: null, selectedDate });

    try {
      const doses = await getDosesForDate(get().profileId!, selectedDate);
      if (!doseLoadGuard.isCurrent(requestRevision)) return;
      set({ doses, isLoading: false });
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

  clearError: () => set({ error: null }),
  setProfile: (profileId) => {
    doseLoadGuard.invalidate();
    set({ profileId, doses: [], selectedDate: toLocalDateString(), error: null, isLoading: false, updatingDoseId: null });
  },
}));
