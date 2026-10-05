import { motion } from "../../components/motion-tokens";

export type ContentLoadingPresentation =
  | "waiting"
  | "skeleton"
  | "content"
  | "branded";
export type RefreshTrigger =
  | "user-pull"
  | "focus"
  | "foreground"
  | "scope-change";

export interface ContentLoadingState {
  isLoading: boolean;
  hasUsableData: boolean;
  delayedLoadingVisible: boolean;
  isBlocking?: boolean;
}

/**
 * Keep matching cached content on screen during refresh. A skeleton is reserved
 * for a genuinely new scope and is only allowed after the shared reveal delay.
 */
export function getContentLoadingPresentation({
  isLoading,
  hasUsableData,
  delayedLoadingVisible,
  isBlocking = false,
}: ContentLoadingState): ContentLoadingPresentation {
  if (isBlocking) return "branded";
  if (hasUsableData || !isLoading) return "content";
  return delayedLoadingVisible ? "skeleton" : "waiting";
}

export function getTabContentFadeConfig(reducedMotion: boolean): {
  fromOpacity: number;
  duration: number;
} {
  return {
    fromOpacity: 0.88,
    duration: reducedMotion
      ? motion.duration.tabContentReducedMotion
      : motion.duration.tabContent,
  };
}

/** Native pull indicators are feedback for a gesture, not background loading. */
export function shouldShowNativePullRefreshIndicator(
  trigger: RefreshTrigger,
  requestPending: boolean,
): boolean {
  return trigger === "user-pull" && requestPending;
}

export function shouldShowScopeSkeleton(input: {
  isLoading: boolean;
  hasMatchingData: boolean;
  delayedLoadingVisible: boolean;
  hasError?: boolean;
}): boolean {
  if (input.hasError) return false;
  if (input.hasMatchingData || !input.isLoading) return false;
  return input.delayedLoadingVisible;
}

export function shouldRetainContentDuringRefresh(
  hasUsableData: boolean,
  isLoading: boolean,
): boolean {
  return hasUsableData && isLoading;
}