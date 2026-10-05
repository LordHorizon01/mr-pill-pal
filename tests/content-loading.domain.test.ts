import assert from "node:assert/strict";
import test from "node:test";

import {
  getContentLoadingPresentation,
  getTabContentFadeConfig,
  shouldShowNativePullRefreshIndicator,
  shouldRetainContentDuringRefresh,
  shouldShowScopeSkeleton,
} from "../src/features/loading/content-loading.domain";
import { motion } from "../src/components/motion-tokens";

test("new data waits for the reveal threshold before showing a skeleton", () => {
  assert.equal(getContentLoadingPresentation({ isLoading: true, hasUsableData: false, delayedLoadingVisible: false }), "waiting");
  assert.equal(getContentLoadingPresentation({ isLoading: true, hasUsableData: false, delayedLoadingVisible: true }), "skeleton");
});

test("quick initial completion goes directly to content without a skeleton flash", () => {
  assert.equal(getContentLoadingPresentation({ isLoading: false, hasUsableData: false, delayedLoadingVisible: false }), "content");
});

test("matching cached content remains visible during a background refresh", () => {
  assert.equal(getContentLoadingPresentation({ isLoading: true, hasUsableData: true, delayedLoadingVisible: true }), "content");
  assert.equal(shouldRetainContentDuringRefresh(true, true), true);
  assert.equal(shouldRetainContentDuringRefresh(false, true), false);
});

test("only a genuinely blocking operation selects the branded loading surface", () => {
  assert.equal(getContentLoadingPresentation({ isLoading: true, hasUsableData: false, delayedLoadingVisible: true, isBlocking: true }), "branded");
  assert.equal(getContentLoadingPresentation({ isLoading: true, hasUsableData: false, delayedLoadingVisible: true, isBlocking: false }), "skeleton");
});

test("scope skeleton is shown only for a delayed new-scope load", () => {
  assert.equal(shouldShowScopeSkeleton({ isLoading: true, hasMatchingData: true, delayedLoadingVisible: true }), false);
  assert.equal(shouldShowScopeSkeleton({ isLoading: false, hasMatchingData: false, delayedLoadingVisible: true }), false);
  assert.equal(shouldShowScopeSkeleton({ isLoading: true, hasMatchingData: false, delayedLoadingVisible: false }), false);
  assert.equal(shouldShowScopeSkeleton({ isLoading: true, hasMatchingData: false, delayedLoadingVisible: true }), true);
  assert.equal(shouldShowScopeSkeleton({ isLoading: true, hasMatchingData: false, delayedLoadingVisible: true, hasError: true }), false);
});

test("tab re-entry uses an opacity-only fade and reduced motion stays short", () => {
  assert.deepEqual(getTabContentFadeConfig(false), { fromOpacity: 0.88, duration: 300 });
  assert.deepEqual(getTabContentFadeConfig(true), { fromOpacity: 0.88, duration: 160 });
  assert.equal(motion.duration.tabContent, 300);
});

test("native pull spinner is limited to an active user pull, not focus or foreground refresh", () => {
  assert.equal(shouldShowNativePullRefreshIndicator("user-pull", true), true);
  assert.equal(shouldShowNativePullRefreshIndicator("user-pull", false), false);
  assert.equal(shouldShowNativePullRefreshIndicator("focus", true), false);
  assert.equal(shouldShowNativePullRefreshIndicator("foreground", true), false);
  assert.equal(shouldShowNativePullRefreshIndicator("scope-change", true), false);
});

test("skeleton reveal and content crossfade use the final stabilization timings", () => {
  assert.equal(motion.duration.skeletonRevealDelay, 300);
  assert.equal(motion.duration.skeletonMinVisible, 300);
  assert.equal(motion.duration.skeletonCrossfade, 280);
});
