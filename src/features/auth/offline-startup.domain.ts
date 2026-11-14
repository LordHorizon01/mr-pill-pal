import type { AccountProfileSetupState } from "../profiles/profile-setup.domain";
import type { Profile } from "../profiles/profile.types";

export type OfflineStartupProfile = Pick<Profile, "id" | "accountUid" | "isActive" | "updatedAt"> &
  Partial<Pick<Profile, "deletedAt">>;

export type IdentityStartupPhase = "loading" | "unauthenticated" | "verification_required";

/**
 * A verified Firebase identity is not yet proof that this account needs first-profile setup.
 * Keep the destination unresolved until the account-scoped local setup gate has been read.
 */
export function resolveIdentityStartupPhase(
  hasAuthenticatedUser: boolean,
  requiresVerification: boolean,
): IdentityStartupPhase {
  if (!hasAuthenticatedUser) return "unauthenticated";
  return requiresVerification ? "verification_required" : "loading";
}

export function resolveLocalProfileSetupState(
  cachedState: AccountProfileSetupState | null,
  hasAccountProfile: boolean,
): AccountProfileSetupState {
  if (cachedState === "COMPLETED" || hasAccountProfile) return "COMPLETED";
  return cachedState ?? "NOT_STARTED";
}

export function getRestorableProfiles<T extends OfflineStartupProfile>(
  profiles: readonly T[],
  accountUid: string,
): T[] {
  return profiles.filter((profile) => profile.accountUid === accountUid && !profile.deletedAt);
}

export function restoreSelectedProfile<T extends OfflineStartupProfile>(
  profiles: readonly T[],
  accountUid: string,
  storedProfileId: string | null,
): T | null {
  const active = getRestorableProfiles(profiles, accountUid).filter((profile) => profile.isActive);
  return active.find((profile) => profile.id === storedProfileId) ?? active[0] ?? null;
}

function updatedAt(profile: OfflineStartupProfile): number {
  const parsed = Date.parse(profile.updatedAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Merge remote profile snapshots without deleting local rows. A cloud row only
 * replaces a local row when it belongs to this account and is strictly newer.
 */
export function mergeRemoteProfilesSafely<T extends OfflineStartupProfile>(
  localProfiles: readonly T[],
  remoteProfiles: readonly T[],
  accountUid: string,
): T[] {
  const merged = new Map<string, T>();
  for (const profile of localProfiles) {
    if (profile.accountUid === accountUid) merged.set(profile.id, profile);
  }
  for (const remote of remoteProfiles) {
    if (remote.accountUid !== accountUid) continue;
    const local = merged.get(remote.id);
    if (!local || updatedAt(remote) > updatedAt(local)) merged.set(remote.id, remote);
  }
  return [...merged.values()];
}

export function isCurrentAccountRequest(requestUid: string, activeUid: string | null): boolean {
  return requestUid.length > 0 && requestUid === activeUid;
}

export function canOpenAuthenticatedLocalApp(input: {
  databaseReady: boolean;
  authRestored: boolean;
  localAccountRestored: boolean;
  setupState: AccountProfileSetupState;
}): boolean {
  return input.databaseReady && input.authRestored && input.localAccountRestored && input.setupState === "COMPLETED";
}

export function isOfflineStartupFailure(error: unknown): boolean {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "").toLowerCase()
    : "";
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return /unavailable|network-request-failed|deadline-exceeded|startup-timeout|offline/.test(`${code} ${message}`);
}

export function isNetworkUnreachable(state: {
  isConnected?: boolean;
  isInternetReachable?: boolean | null;
}): boolean | null {
  if (typeof state.isInternetReachable === "boolean") return !state.isInternetReachable;
  if (typeof state.isConnected === "boolean") return !state.isConnected;
  return null;
}

export class StartupRequestTimeoutError extends Error {
  readonly code = "offline/startup-timeout";

  constructor(readonly operation: string) {
    super(`${operation} did not finish before the startup background timeout.`);
    this.name = "StartupRequestTimeoutError";
  }
}

export function withStartupTimeout<T>(
  operation: Promise<T>,
  operationName: string,
  timeoutMs = 7000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new StartupRequestTimeoutError(operationName)), timeoutMs);
  });
  return Promise.race([operation, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}
