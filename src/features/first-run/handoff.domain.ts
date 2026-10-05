import type { PrimerPermissionState } from "./first-run.domain";

export const FIRST_RUN_HANDOFF_MINIMUM_MS = 800;

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
