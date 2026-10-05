import assert from "node:assert/strict";
import test from "node:test";

import {
  FIRST_RUN_HANDOFF_MINIMUM_MS,
  getFirstRunHandoffDestination,
  getRemainingFirstRunHandoffMs,
} from "../src/features/first-run/handoff.domain";

test("handoff keeps its branded surface visible for 800ms when work is fast", () => {
  assert.equal(FIRST_RUN_HANDOFF_MINIMUM_MS, 800);
  assert.equal(getRemainingFirstRunHandoffMs(100, 100, false), 800);
  assert.equal(getRemainingFirstRunHandoffMs(100, 600, false), 300);
});

test("handoff does not add time when real readiness already took long enough", () => {
  assert.equal(getRemainingFirstRunHandoffMs(100, 1_000, false), 0);
  assert.equal(getRemainingFirstRunHandoffMs(1_000, 900, false), 800);
});

test("reduced motion does not wait just to display a transition", () => {
  assert.equal(getRemainingFirstRunHandoffMs(100, 100, true), 0);
});

test("granted notifications continue to auth and other permission states show the primer", () => {
  assert.equal(getFirstRunHandoffDestination("granted"), "auth");
  assert.equal(getFirstRunHandoffDestination("not_requested"), "primer");
  assert.equal(getFirstRunHandoffDestination("denied"), "primer");
  assert.equal(getFirstRunHandoffDestination("unavailable"), "primer");
});
