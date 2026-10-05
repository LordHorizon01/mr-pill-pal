import { AccessibilityInfo, NativeEventSubscription } from "react-native";
import { useSyncExternalStore } from "react";

// Many screens and skeleton blocks consume this preference. Share one native
// listener rather than creating a separate AccessibilityInfo subscription per
// component.
let reduceMotionSnapshot = true;
let nativeSubscription: NativeEventSubscription | null = null;
let requestRevision = 0;
const subscribers = new Set<() => void>();

function publish(value: boolean): void {
  if (reduceMotionSnapshot === value) return;
  reduceMotionSnapshot = value;
  subscribers.forEach((notify) => notify());
}

function startListening(): void {
  if (nativeSubscription) return;
  const revision = ++requestRevision;
  nativeSubscription = AccessibilityInfo.addEventListener("reduceMotionChanged", publish);
  void AccessibilityInfo.isReduceMotionEnabled().then(
    (enabled) => {
      if (requestRevision === revision) publish(enabled);
    },
    () => {
      if (requestRevision === revision) publish(true);
    },
  );
}

function subscribe(notify: () => void): () => void {
  subscribers.add(notify);
  startListening();
  return () => {
    subscribers.delete(notify);
    if (subscribers.size === 0) {
      requestRevision += 1;
      nativeSubscription?.remove();
      nativeSubscription = null;
    }
  };
}

function getSnapshot(): boolean {
  return reduceMotionSnapshot;
}

/** Starts in the reduced-motion-safe state until the OS setting is resolved. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
