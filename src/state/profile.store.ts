import { create } from "zustand";
import { getSafeDatabaseErrorMessage } from "@/database/database";
import { getCurrentAuthenticatedUser, toAuthMessage } from "@/features/auth/auth.service";
import { getRestorableProfiles, mergeRemoteProfilesSafely, restoreSelectedProfile, withStartupTimeout } from "@/features/auth/offline-startup.domain";
import { createRemoteProfile, deactivateRemoteProfile, listRemoteProfiles, markRemoteProfileSetupComplete, updateRemoteProfile } from "@/features/profiles/profile-cloud.repository";
import { getProfileSetupDiagnostic, getProfileSetupMessage, ProfileSetupError, resolveProfileCreationId } from "@/features/profiles/profile-setup.domain";
import { adoptLegacyData, clearPendingProfileCreation, getLegacyAdoptionDeferred, getLocalProfile, getLocalProfiles, getPendingProfileCreation, getSelectedProfileId, hasLegacyUnassignedData, saveLegacyAdoptionDeferred, saveLocalProfile, savePendingProfileCreation, saveSelectedProfileId } from "@/features/profiles/profile.repository";
import { normalizeProfileInput } from "@/features/profiles/profile.domain";
import { CreateProfileInput, Profile, UpdateProfileInput } from "@/features/profiles/profile.types";
import { createAsyncRequestGuard } from "@/state/async-request.domain";

const profileLoadGuard = createAsyncRequestGuard();
const profileSelectionGuard = createAsyncRequestGuard();
let pendingProfileSelection: { accountUid: string; profileId: string; revision: number } | null = null;

function isAuthenticatedAccount(accountUid: string): boolean {
  try {
    getCurrentAuthenticatedUser(accountUid);
    return true;
  } catch {
    return false;
  }
}

type ProfileState = {
  accountUid: string | null; profiles: Profile[]; selectedProfileId: string | null; isLoading: boolean; isSaving: boolean; error: string | null; needsLegacyAdoption: boolean;
  loadForAccount: (accountUid: string) => Promise<boolean>; refreshForAccount: (accountUid: string) => Promise<boolean>; selectProfile: (profileId: string) => Promise<void>; createProfile: (input: CreateProfileInput, options?: { deferAuthReady?: boolean }) => Promise<Profile>; updateProfile: (profileId: string, input: UpdateProfileInput) => Promise<void>; deactivateProfile: (profileId: string) => Promise<void>; adoptLegacy: () => Promise<void>; deferLegacyAdoption: () => Promise<void>; clearForLogout: () => Promise<void>; clearError: () => void;
};

async function syncProfileScopedStores(profileId: string | null, canApply: () => boolean = () => true): Promise<void> {
  const { useMedicationStore } = await import("@/state/medication.store"); const { useDoseStore } = await import("@/state/dose.store"); const { useHistoryStore } = await import("@/state/history.store"); const { useScheduleStore } = await import("@/state/schedule.store");
  if (!canApply()) return;
  useMedicationStore.getState().setProfile(profileId); useDoseStore.getState().setProfile(profileId); useHistoryStore.getState().setProfile(profileId); useScheduleStore.getState().setProfile(profileId);
}

let activeProfileCreation: Promise<Profile> | null = null;

function logProfileSetupFailure(error: unknown): void {
  if (!__DEV__) return;
  const diagnostic = getProfileSetupDiagnostic(error);
  console.warn("[ProfileSetup] createProfile failed", diagnostic);
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  accountUid: null, profiles: [], selectedProfileId: null, isLoading: false, isSaving: false, error: null, needsLegacyAdoption: false,
  loadForAccount: async (accountUid) => {
    getCurrentAuthenticatedUser(accountUid);
    profileSelectionGuard.invalidate();
    pendingProfileSelection = null;
    const requestRevision = profileLoadGuard.begin();
    set({ isLoading: true, isSaving: false, error: null, accountUid, profiles: [], selectedProfileId: null, needsLegacyAdoption: false });
    try {
      const profiles = getRestorableProfiles(await getLocalProfiles(accountUid, true), accountUid);
      getCurrentAuthenticatedUser(accountUid);
      const selected = await getSelectedProfileId(accountUid);
      getCurrentAuthenticatedUser(accountUid);
      const usable = restoreSelectedProfile(profiles, accountUid, selected);
      const needsLegacyAdoption = Boolean(usable) && await hasLegacyUnassignedData() && !(await getLegacyAdoptionDeferred(accountUid));
      getCurrentAuthenticatedUser(accountUid);
      if (!profileLoadGuard.isCurrent(requestRevision)) return false;
      await saveSelectedProfileId(accountUid, usable?.id ?? null);
      getCurrentAuthenticatedUser(accountUid);
      if (!profileLoadGuard.isCurrent(requestRevision)) return false;
      await syncProfileScopedStores(usable?.id ?? null, () => profileLoadGuard.isCurrent(requestRevision) && get().accountUid === accountUid && isAuthenticatedAccount(accountUid));
      getCurrentAuthenticatedUser(accountUid);
      if (!profileLoadGuard.isCurrent(requestRevision)) return false;
      set({ profiles, selectedProfileId: usable?.id ?? null, needsLegacyAdoption, isLoading: false });
      return Boolean(usable);
    } catch (error) { if (profileLoadGuard.isCurrent(requestRevision)) set({ isLoading: false, error: getSafeDatabaseErrorMessage(error, "Could not load profiles. Please try again.") }); return false; }
  },
  refreshForAccount: async (accountUid) => {
    getCurrentAuthenticatedUser(accountUid);
    const requestRevision = profileLoadGuard.begin();
    const remoteProfiles = await withStartupTimeout(listRemoteProfiles(accountUid), "Cloud profile refresh");
    getCurrentAuthenticatedUser(accountUid);
    if (!profileLoadGuard.isCurrent(requestRevision) || get().accountUid !== accountUid) return false;

    const localProfiles = getRestorableProfiles(await getLocalProfiles(accountUid, true), accountUid);
    getCurrentAuthenticatedUser(accountUid);
    if (!profileLoadGuard.isCurrent(requestRevision) || get().accountUid !== accountUid) return false;
    const mergedProfiles = mergeRemoteProfilesSafely(localProfiles, remoteProfiles, accountUid);
    const localById = new Map(localProfiles.map((profile) => [profile.id, profile]));
    for (const remote of remoteProfiles) {
      if (remote.accountUid !== accountUid) continue;
      const local = localById.get(remote.id);
      const remoteUpdatedAt = Date.parse(remote.updatedAt) || 0;
      const localUpdatedAt = local ? Date.parse(local.updatedAt) || 0 : -1;
      if (!local || remoteUpdatedAt > localUpdatedAt) {
        if (!profileLoadGuard.isCurrent(requestRevision) || get().accountUid !== accountUid) return false;
        await saveLocalProfile(remote);
        getCurrentAuthenticatedUser(accountUid);
      }
    }

    if (!profileLoadGuard.isCurrent(requestRevision) || get().accountUid !== accountUid) return false;
    const storedProfileId = get().selectedProfileId ?? await getSelectedProfileId(accountUid);
    getCurrentAuthenticatedUser(accountUid);
    const selected = restoreSelectedProfile(mergedProfiles, accountUid, storedProfileId);
    if (selected?.id !== storedProfileId) {
      await saveSelectedProfileId(accountUid, selected?.id ?? null);
      getCurrentAuthenticatedUser(accountUid);
    }
    if (!profileLoadGuard.isCurrent(requestRevision) || get().accountUid !== accountUid) return false;
    if (selected?.id !== get().selectedProfileId) {
      await syncProfileScopedStores(selected?.id ?? null, () => profileLoadGuard.isCurrent(requestRevision) && get().accountUid === accountUid && isAuthenticatedAccount(accountUid));
      getCurrentAuthenticatedUser(accountUid);
    }
    if (!profileLoadGuard.isCurrent(requestRevision) || get().accountUid !== accountUid) return false;
    set({ profiles: mergedProfiles, selectedProfileId: selected?.id ?? null });
    return Boolean(selected);
  },
  selectProfile: async (profileId) => {
    const accountUid = get().accountUid;
    if (!accountUid) throw new Error("Sign in before switching profiles.");
    getCurrentAuthenticatedUser(accountUid);
    const pendingSelection = pendingProfileSelection;
    if (get().selectedProfileId === profileId && (!pendingSelection || pendingSelection.accountUid !== accountUid || pendingSelection.profileId === profileId)) return;
    const requestRevision = profileSelectionGuard.begin();
    pendingProfileSelection = { accountUid, profileId, revision: requestRevision };
    set({ isSaving: true, error: null });
    try {
      const profile = await getLocalProfile(accountUid, profileId);
      if (!profile || !profile.isActive) throw new Error("This profile is not available for this account.");
      if (!profileSelectionGuard.isCurrent(requestRevision) || get().accountUid !== accountUid) return;
      await saveSelectedProfileId(accountUid, profileId);
      if (!profileSelectionGuard.isCurrent(requestRevision) || get().accountUid !== accountUid) return;
      await syncProfileScopedStores(profileId, () => profileSelectionGuard.isCurrent(requestRevision) && get().accountUid === accountUid && isAuthenticatedAccount(accountUid));
      if (!profileSelectionGuard.isCurrent(requestRevision) || get().accountUid !== accountUid) return;
      set({ selectedProfileId: profileId, isSaving: false });
    } catch (error) {
      if (!profileSelectionGuard.isCurrent(requestRevision)) return;
      set({ isSaving: false, error: toAuthMessage(error, "Could not switch profiles. Please try again.") });
      throw error;
    } finally {
      if (pendingProfileSelection?.revision === requestRevision) pendingProfileSelection = null;
    }
  },
  createProfile: async (input, options) => {
    if (activeProfileCreation) return activeProfileCreation;
    const accountUid = get().accountUid;
    if (!accountUid) throw new Error("Sign in before adding a profile.");

    const operation = (async () => {
      set({ isSaving: true, error: null });
      try {
        let normalized;
        try {
          normalized = normalizeProfileInput(input);
        } catch (error) {
          throw new ProfileSetupError("validate-form", error);
        }
        const pending = await getPendingProfileCreation(accountUid);
        const isFirstProfile = get().profiles.length === 0 && !get().selectedProfileId;
        const profileId = resolveProfileCreationId({
          accountUid,
          isFirstProfile,
          pendingProfileId: pending?.profileId,
        });
        await savePendingProfileCreation(accountUid, { profileId, input: normalized });
        const profile = await createRemoteProfile(accountUid, normalized, profileId);
        try {
          await saveLocalProfile(profile);
        } catch (error) {
          throw new ProfileSetupError("persist-local-profile", error);
        }
        await markRemoteProfileSetupComplete(accountUid);

        const wasUnselected = !get().selectedProfileId;
        const selectedProfileId = get().selectedProfileId ?? profile.id;
        try {
          if (wasUnselected) {
            await saveSelectedProfileId(accountUid, profile.id);
            await syncProfileScopedStores(profile.id);
          }
        } catch (error) {
          throw new ProfileSetupError("select-profile", error);
        }
        await clearPendingProfileCreation(accountUid);
        const profiles = [...get().profiles.filter((item) => item.id !== profile.id), profile];
        set({ profiles, selectedProfileId, isSaving: false });
        if (wasUnselected && !options?.deferAuthReady) {
          const { useAuthStore } = await import("@/state/auth.store");
          useAuthStore.getState().setProfileReady(true);
        }
        return profile;
      } catch (error) {
        logProfileSetupFailure(error);
        set({ isSaving: false, error: getProfileSetupMessage(error) });
        throw error;
      }
    })();
    activeProfileCreation = operation;
    try {
      return await operation;
    } finally {
      if (activeProfileCreation === operation) activeProfileCreation = null;
    }
  },
  updateProfile: async (profileId, input) => {
    const accountUid = get().accountUid; if (!accountUid) throw new Error("Sign in before editing a profile."); set({ isSaving: true, error: null });
    try { const normalized = normalizeProfileInput(input); await updateRemoteProfile(accountUid, profileId, normalized); const existing = await getLocalProfile(accountUid, profileId); if (existing) await saveLocalProfile({ ...existing, ...normalized, updatedAt: new Date().toISOString() }); const profiles = await getLocalProfiles(accountUid, true); set({ profiles, isSaving: false }); }
    catch (error) { set({ isSaving: false, error: getProfileSetupMessage(error, "Could not update this profile. Please try again.") }); throw error; }
  },
  deactivateProfile: async (profileId) => {
    const accountUid = get().accountUid; if (!accountUid) throw new Error("Sign in before deactivating a profile."); set({ isSaving: true, error: null });
    try { if (get().profiles.filter((profile) => profile.isActive).length <= 1) throw new Error("Keep one active profile for this account."); const { cancelProfileReminderNotifications } = await import("@/features/schedules/schedule.service"); await cancelProfileReminderNotifications(profileId); await deactivateRemoteProfile(accountUid, profileId); const existing = await getLocalProfile(accountUid, profileId); if (existing) await saveLocalProfile({ ...existing, isActive: false, updatedAt: new Date().toISOString() }); const profiles = await getLocalProfiles(accountUid, true); const selectedProfileId = get().selectedProfileId === profileId ? profiles.find((profile) => profile.isActive)?.id ?? null : get().selectedProfileId; if (selectedProfileId) await get().selectProfile(selectedProfileId); set({ profiles, selectedProfileId, isSaving: false }); }
    catch (error) { set({ isSaving: false, error: toAuthMessage(error, "Could not deactivate this profile. Please try again.") }); throw error; }
  },
  adoptLegacy: async () => { const profileId = get().selectedProfileId; if (!profileId) return; await adoptLegacyData(profileId); set({ needsLegacyAdoption: false }); },
  deferLegacyAdoption: async () => { const accountUid = get().accountUid; if (!accountUid) return; await saveLegacyAdoptionDeferred(accountUid); set({ needsLegacyAdoption: false }); },
  clearForLogout: async () => {
    const requestRevision = profileLoadGuard.begin();
    profileSelectionGuard.invalidate();
    pendingProfileSelection = null;
    const accountUid = get().accountUid;
    try {
      if (accountUid) await saveSelectedProfileId(accountUid, null);
    } catch {
      if (__DEV__) console.warn("[AuthSignOut]", { stage: "selected-profile-clear", code: "local-write-failed" });
    }
    try {
      await syncProfileScopedStores(null, () => profileLoadGuard.isCurrent(requestRevision) && get().accountUid === accountUid);
    } finally {
      // Always clear visible account data so Account B cannot inherit Account A
      // state even when a local persistence write is temporarily unavailable.
      if (profileLoadGuard.isCurrent(requestRevision) && get().accountUid === accountUid) {
        set({ accountUid: null, profiles: [], selectedProfileId: null, needsLegacyAdoption: false, error: null });
      }
    }
  },
  clearError: () => set({ error: null }),
}));
