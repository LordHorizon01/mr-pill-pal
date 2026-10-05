import { motion } from "../../components/motion-tokens";

export const DEFAULT_LOADING_REVEAL_DELAY_MS = motion.duration.skeletonRevealDelay;
export const DEFAULT_LOADING_MINIMUM_VISIBLE_MS = motion.duration.skeletonMinVisible;

export type LoadingTimerHandle = ReturnType<typeof setTimeout>;

export type DelayedLoadingScheduler = {
  now: () => number;
  setTimeout: (callback: () => void, delayMs: number) => LoadingTimerHandle;
  clearTimeout: (handle: LoadingTimerHandle) => void;
};

export type DelayedLoadingOptions = {
  revealDelayMs?: number;
  minimumVisibleMs?: number;
  scheduler?: DelayedLoadingScheduler;
  onVisibilityChange: (visible: boolean) => void;
};

const systemScheduler: DelayedLoadingScheduler = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle),
};

/** Coordinates delayed loader visibility without coupling the policy to React. */
export class DelayedLoadingController {
  private readonly revealDelayMs: number;
  private readonly minimumVisibleMs: number;
  private readonly scheduler: DelayedLoadingScheduler;
  private readonly onVisibilityChange: (visible: boolean) => void;
  private revealTimer: LoadingTimerHandle | null = null;
  private hideTimer: LoadingTimerHandle | null = null;
  private visibleSince: number | null = null;
  private isLoading = false;
  private isVisible = false;
  private isDisposed = false;
  private revision = 0;

  constructor(options: DelayedLoadingOptions) {
    this.revealDelayMs = Math.max(0, options.revealDelayMs ?? DEFAULT_LOADING_REVEAL_DELAY_MS);
    this.minimumVisibleMs = Math.max(0, options.minimumVisibleMs ?? DEFAULT_LOADING_MINIMUM_VISIBLE_MS);
    this.scheduler = options.scheduler ?? systemScheduler;
    this.onVisibilityChange = options.onVisibilityChange;
  }

  setLoading(isLoading: boolean): void {
    this.isDisposed = false;
    this.isLoading = isLoading;
    const revision = ++this.revision;

    if (isLoading) {
      this.clearTimer("hide");
      if (this.isVisible) return;

      this.clearTimer("reveal");
      this.revealTimer = this.scheduler.setTimeout(() => {
        if (this.isDisposed || !this.isLoading || revision !== this.revision) return;
        this.revealTimer = null;
        this.isVisible = true;
        this.visibleSince = this.scheduler.now();
        this.onVisibilityChange(true);
      }, this.revealDelayMs);
      return;
    }

    this.clearTimer("reveal");
    if (!this.isVisible || this.visibleSince === null) return;

    this.clearTimer("hide");
    const elapsed = Math.max(0, this.scheduler.now() - this.visibleSince);
    const remaining = Math.max(0, this.minimumVisibleMs - elapsed);
    if (remaining === 0) {
      this.isVisible = false;
      this.visibleSince = null;
      this.onVisibilityChange(false);
      return;
    }
    this.hideTimer = this.scheduler.setTimeout(() => {
      if (this.isDisposed || this.isLoading || revision !== this.revision) return;
      this.hideTimer = null;
      this.isVisible = false;
      this.visibleSince = null;
      this.onVisibilityChange(false);
    }, remaining);
  }

  dispose(): void {
    this.isDisposed = true;
    this.revision += 1;
    this.isLoading = false;
    this.clearTimer("reveal");
    this.clearTimer("hide");
    this.isVisible = false;
    this.visibleSince = null;
  }

  private clearTimer(kind: "reveal" | "hide"): void {
    const timer = kind === "reveal" ? this.revealTimer : this.hideTimer;
    if (timer === null) return;
    this.scheduler.clearTimeout(timer);
    if (kind === "reveal") this.revealTimer = null;
    else this.hideTimer = null;
  }
}
