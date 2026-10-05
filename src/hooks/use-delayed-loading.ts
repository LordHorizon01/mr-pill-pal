import { useEffect, useRef, useState } from "react";

import {
  DEFAULT_LOADING_MINIMUM_VISIBLE_MS,
  DEFAULT_LOADING_REVEAL_DELAY_MS,
  DelayedLoadingController,
} from "@/features/loading/delayed-loading.domain";

export function useDelayedLoading(
  isLoading: boolean,
  options: { revealDelayMs?: number; minimumVisibleMs?: number } = {},
): boolean {
  const [isVisible, setIsVisible] = useState(false);
  const controllerRef = useRef<DelayedLoadingController | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = new DelayedLoadingController({ onVisibilityChange: setIsVisible });
  }

  const revealDelayMs = options.revealDelayMs ?? DEFAULT_LOADING_REVEAL_DELAY_MS;
  const minimumVisibleMs = options.minimumVisibleMs ?? DEFAULT_LOADING_MINIMUM_VISIBLE_MS;

  useEffect(() => {
    controllerRef.current?.setLoading(isLoading);
  }, [isLoading, minimumVisibleMs, revealDelayMs]);

  useEffect(() => () => controllerRef.current?.dispose(), []);

  return isVisible;
}
