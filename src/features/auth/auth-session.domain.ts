export const GOOGLE_PROVIDER_ID = "google.com";

export type ProviderDataLike = { providerId?: string | null } | null | undefined;

export type AccountSignOutPlan = {
  signOutGoogleSdk: boolean;
  signOutFirebase: true;
  clearTransientState: true;
};

/**
 * A profile switch stays inside the current Firebase account. It must never
 * clear either account authentication session.
 */
export function profileSwitchKeepsAccountSession(): true {
  return true;
}

export function buildAccountSignOutPlan(providerData: readonly ProviderDataLike[] | null | undefined): AccountSignOutPlan {
  return {
    signOutGoogleSdk: Boolean(providerData?.some((provider) => provider?.providerId === GOOGLE_PROVIDER_ID)),
    signOutFirebase: true,
    clearTransientState: true,
  };
}
