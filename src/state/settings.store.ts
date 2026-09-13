import { create } from "zustand";
import { getSafeDatabaseErrorMessage } from "@/database/database";

import {
  getAppearancePreference,
  getHideMedicationName,
  saveAppearancePreference,
  saveHideMedicationName,
} from "@/features/settings/settings.repository";
import { refreshAllReminderPrivacy } from "@/features/schedules/schedule.service";

interface SettingsState {
  hideMedicationName: boolean;
  appearancePreference: "system" | "light" | "dark";
  isLoading: boolean;
  error: string | null;
  loadSettings: () => Promise<void>;
  setHideMedicationName: (hideMedicationName: boolean) => Promise<void>;
  setAppearancePreference: (preference: "system" | "light" | "dark") => Promise<void>;
  clearError: () => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  hideMedicationName: false,
  appearancePreference: "system",
  isLoading: false,
  error: null,

  loadSettings: async () => {
    set({ isLoading: true, error: null });

    try {
      const [hideMedicationName, appearancePreference] = await Promise.all([getHideMedicationName(), getAppearancePreference()]);
      set({ hideMedicationName, appearancePreference, isLoading: false });
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

  setAppearancePreference: async (appearancePreference) => {
    set({ isLoading: true, error: null });
    try {
      await saveAppearancePreference(appearancePreference);
      set({ appearancePreference, isLoading: false });
    } catch (error) {
      const message = getSafeDatabaseErrorMessage(error, "Could not update appearance. Please try again.");
      set({ isLoading: false, error: message });
      throw error;
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
