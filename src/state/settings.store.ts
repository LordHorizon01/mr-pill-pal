import { create } from "zustand";
import { getSafeDatabaseErrorMessage } from "@/database/database";

import {
  getHideMedicationName,
  saveHideMedicationName,
} from "@/features/settings/settings.repository";
import { refreshAllReminderPrivacy } from "@/features/schedules/schedule.service";

interface SettingsState {
  hideMedicationName: boolean;
  isLoading: boolean;
  error: string | null;
  loadSettings: () => Promise<void>;
  setHideMedicationName: (hideMedicationName: boolean) => Promise<void>;
  clearError: () => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  hideMedicationName: false,
  isLoading: false,
  error: null,

  loadSettings: async () => {
    set({ isLoading: true, error: null });

    try {
      const hideMedicationName = await getHideMedicationName();
      set({ hideMedicationName, isLoading: false });
    } catch (error) {
      set({
        isLoading: false,
        error: getSafeDatabaseErrorMessage(
          error,
          "Could not load privacy settings. Please try again.",
        ),
      });
    }
  },

  setHideMedicationName: async (hideMedicationName) => {
    set({ isLoading: true, error: null });

    try {
      await refreshAllReminderPrivacy(hideMedicationName);
      await saveHideMedicationName(hideMedicationName);
      set({ hideMedicationName, isLoading: false });
    } catch (error) {
      const message = getSafeDatabaseErrorMessage(
        error,
        "Could not update notification privacy. Please try again.",
      );

      set({ isLoading: false, error: message });
      throw error;
    }
  },

  clearError: () => set({ error: null }),
}));
