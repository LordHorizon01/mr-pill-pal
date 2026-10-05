export type FirstRunPreferences = {
  onboardingComplete: boolean;
  notificationPrimerHandled: boolean;
};

export type PrimerPermissionState = "not_requested" | "granted" | "denied" | "unavailable";

export interface FirstRunPreferenceStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  hasLegacyAppData(): Promise<boolean>;
  resetFirstRunPreferences?(): Promise<void>;
}

export const FIRST_RUN_ONBOARDING_KEY = "onboarding_complete";
export const FIRST_RUN_NOTIFICATION_PRIMER_KEY = "notification_primer_handled";

/** Keeps onboarding and notification-primer choices as separate device preferences. */
export function createFirstRunPreferenceRepository(storage: FirstRunPreferenceStorage) {
  return {
    async load(hasAuthenticatedSession: boolean): Promise<FirstRunPreferences> {
      const savedOnboarding = await storage.get(FIRST_RUN_ONBOARDING_KEY);
      const savedPrimer = await storage.get(FIRST_RUN_NOTIFICATION_PRIMER_KEY);

      if (savedOnboarding === null) {
        const isReturningInstall = hasAuthenticatedSession || await storage.hasLegacyAppData();
        const migrated: FirstRunPreferences = {
          onboardingComplete: isReturningInstall,
          notificationPrimerHandled: isReturningInstall,
        };
        await storage.set(FIRST_RUN_ONBOARDING_KEY, String(migrated.onboardingComplete));
        await storage.set(FIRST_RUN_NOTIFICATION_PRIMER_KEY, String(migrated.notificationPrimerHandled));
        return migrated;
      }

      return {
        onboardingComplete: savedOnboarding === "true",
        notificationPrimerHandled: savedPrimer === "true",
      };
    },

    async completeOnboarding(): Promise<void> {
      await storage.set(FIRST_RUN_ONBOARDING_KEY, "true");
    },

    async markNotificationPrimerHandled(): Promise<void> {
      await storage.set(FIRST_RUN_NOTIFICATION_PRIMER_KEY, "true");
    },

    async resetForDevelopment(): Promise<void> {
      if (storage.resetFirstRunPreferences) {
        await storage.resetFirstRunPreferences();
        return;
      }

      await storage.set(FIRST_RUN_ONBOARDING_KEY, "false");
      await storage.set(FIRST_RUN_NOTIFICATION_PRIMER_KEY, "false");
    },
  };
}

export function shouldShowOnboarding(hasAuthenticatedSession: boolean, onboardingComplete: boolean): boolean {
  return !hasAuthenticatedSession && !onboardingComplete;
}

export function shouldShowNotificationPrimer(input: {
  hasAuthenticatedSession: boolean;
  onboardingComplete: boolean;
  notificationPrimerHandled: boolean;
  permission: PrimerPermissionState;
}): boolean {
  return !input.hasAuthenticatedSession && input.onboardingComplete && !input.notificationPrimerHandled && input.permission !== "granted";
}

export function canRequestPrimerPermission(permission: PrimerPermissionState, canAskAgain: boolean): boolean {
  return permission === "not_requested" || (permission === "denied" && canAskAgain);
}

export function shouldContinueAfterPermissionCheckFailure(): boolean {
  return true;
}
