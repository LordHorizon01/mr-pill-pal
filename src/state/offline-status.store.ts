import { create } from "zustand";

type OfflineStatusState = {
  isOffline: boolean;
  setOffline: (isOffline: boolean) => void;
  dismiss: () => void;
};

export const useOfflineStatusStore = create<OfflineStatusState>((set) => ({
  isOffline: false,
  setOffline: (isOffline) => set({ isOffline }),
  dismiss: () => set({ isOffline: false }),
}));
