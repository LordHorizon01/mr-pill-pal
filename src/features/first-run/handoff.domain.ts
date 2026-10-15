import type { PrimerPermissionState } from "./first-run.domain";

export const FIRST_RUN_HANDOFF_MINIMUM_MS = 800;
export const PROFILE_SETUP_LOADING_MINIMUM_MS = 1_000;
export const PROFILE_SETUP_LOADING_REDUCED_MINIMUM_MS = 180;
export const PROFILE_SETUP_READY_VISIBLE_MS = 700;
export const PROFILE_SETUP_READY_REDUCED_VISIBLE_MS = 180;
export const PROFILE_SETUP_HOME_TRANSITION_MS = 420;

export function getRemainingProfileSetupLoadingMs(
  startedAt: number,
  now: number,
  reduceMotion: boolean,
): number {
  const minimum = reduceMotion ? PROFILE_SETUP_LOADING_REDUCED_MINIMUM_MS : PROFILE_SETUP_LOADING_MINIMUM_MS;
  return Math.max(0, minimum - Math.max(0, now - startedAt));
}

/** Minimum display time for the handoff surface, after accounting for real work. */
export function getRemainingFirstRunHandoffMs(
  startedAt: number,
  now: number,
  reduceMotion: boolean,
): number {
  if (reduceMotion) return 0;
  const elapsed = Math.max(0, now - startedAt);
  return Math.max(0, FIRST_RUN_HANDOFF_MINIMUM_MS - elapsed);
}

export function getFirstRunHandoffDestination(
  permission: PrimerPermissionState,
): "primer" | "auth" {
  return permission === "granted" ? "auth" : "primer";
}
