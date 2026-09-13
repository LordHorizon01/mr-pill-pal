import { create } from "zustand";
import { AuthUser, logTransientAccountStateCleared, observeAuthState, reloadCurrentUser, requiresEmailVerification, signOutCurrentAccount, signOutUnverifiedUser, toAuthMessage } from "@/features/auth/auth.service";

export type AuthPhase = "loading" | "configuration_required" | "unauthenticated" | "verification_required" | "profile_setup_required" | "authenticated";

type AuthState = {
  phase: AuthPhase; user: AuthUser | null; error: string | null; initialized: boolean;
  start: () => () => void; refreshVerification: () => Promise<boolean>; leaveUnverifiedSession: () => Promise<void>; leaveProfileSetup: () => Promise<void>; setProfileReady: (ready: boolean) => void;
  clearError: () => void; logout: () => Promise<void>; reset: () => void;
};

function phaseFor(user: AuthUser | null): AuthPhase { return !user ? "unauthenticated" : requiresEmailVerification(user) ? "verification_required" : "profile_setup_required"; }

export const useAuthStore = create<AuthState>((set, get) => ({
  phase: "loading", user: null, error: null, initialized: false,
  start: () => {
    try {
      return observeAuthState((user) => set({ user, phase: phaseFor(user), initialized: true, error: null }));
    } catch (error) { set({ phase: "configuration_required", initialized: true, error: toAuthMessage(error, "Firebase is not configured on this build yet.") }); return () => undefined; }
  },
  refreshVerification: async () => {
    try { const user = await reloadCurrentUser(); const verified = user ? !requiresEmailVerification(user) : false; set({ user, phase: phaseFor(user), error: null }); return verified; }
    catch (error) { const message = toAuthMessage(error, "We could not check verification yet. Please try again."); set({ error: message }); throw new Error(message); }
  },
  leaveUnverifiedSession: async () => {
    try { await signOutUnverifiedUser(); set({ phase: "unauthenticated", user: null, error: null, initialized: true }); }
    catch (error) { const message = toAuthMessage(error, "We could not return to sign-in safely. Please try again."); set({ error: message }); throw new Error(message); }
  },
  leaveProfileSetup: async () => {
    try {
      await signOutCurrentAccount();
      try {
        const { useProfileStore } = await import("@/state/profile.store");
        await useProfileStore.getState().clearForLogout();
        logTransientAccountStateCleared();
      } catch {
        // Firebase is already signed out. Do not keep an onboarding user trapped because local cleanup failed.
      }
      set({ phase: "unauthenticated", user: null, error: null, initialized: true });
    } catch (error) {
      const message = toAuthMessage(error, "We could not return to sign-in safely. Please try again.");
      set({ error: message });
      throw new Error(message);
    }
  },
  setProfileReady: (ready) => { const user = get().user; if (!user) return; set({ phase: ready ? "authenticated" : "profile_setup_required" }); },
  clearError: () => set({ error: null }),
  logout: async () => {
    const user = get().user;
    try {
      if (user) {
        const { cancelAccountReminderNotifications } = await import("@/features/schedules/schedule.service");
        await cancelAccountReminderNotifications(user.uid);
      }
      await signOutCurrentAccount();
      const { useProfileStore } = await import("@/state/profile.store");
      await useProfileStore.getState().clearForLogout();
      logTransientAccountStateCleared();
    } catch (error) { set({ error: toAuthMessage(error, "We could not sign out safely. Please try again.") }); throw error; }
  },
  reset: () => set({ phase: "unauthenticated", user: null, error: null, initialized: true }),
}));
