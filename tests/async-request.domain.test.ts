import assert from "node:assert/strict";
import test from "node:test";

import { createAsyncRequestGuard } from "../src/state/async-request.domain";

test("a newer profile-scoped load makes an older load result stale", () => {
  const guard = createAsyncRequestGuard();
  const profileALoad = guard.begin();
  const profileBLoad = guard.begin();

  assert.equal(guard.isCurrent(profileALoad), false);
  assert.equal(guard.isCurrent(profileBLoad), true);
});

test("profile or account reset invalidates the active load", () => {
  const guard = createAsyncRequestGuard();
  const request = guard.begin();
  guard.invalidate();

  assert.equal(guard.isCurrent(request), false);
});

test("rapid profile A to B to A selection leaves only the final A request current", () => {
  const guard = createAsyncRequestGuard();
  const firstA = guard.begin();
  const profileB = guard.begin();
  const finalA = guard.begin();

  assert.equal(guard.isCurrent(firstA), false);
  assert.equal(guard.isCurrent(profileB), false);
  assert.equal(guard.isCurrent(finalA), true);
});
