import { useCallback, useRef, useState } from "react";

import { shouldShowNativePullRefreshIndicator } from "@/features/loading/content-loading.domain";

/** Keeps the native spinner tied only to an explicit user pull gesture. */
export function useUserPullRefresh(refreshAction: () => Promise<void>) {
  const [userPullRefreshing, setUserPullRefreshing] = useState(false);
  const inProgress = useRef(false);

  const onRefresh = useCallback(async () => {
    if (inProgress.current) return;
    inProgress.current = true;
    setUserPullRefreshing(true);
    try {
      await refreshAction();
    } catch {
      // Store/service layers own user-safe error state; always release the gesture indicator.
    } finally {
      inProgress.current = false;
      setUserPullRefreshing(false);
    }
  }, [refreshAction]);

  return {
    refreshing: shouldShowNativePullRefreshIndicator("user-pull", userPullRefreshing),
    onRefresh,
  };
}
