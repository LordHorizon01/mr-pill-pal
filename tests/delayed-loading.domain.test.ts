import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_LOADING_MINIMUM_VISIBLE_MS,
  DEFAULT_LOADING_REVEAL_DELAY_MS,
  DelayedLoadingController,
  DelayedLoadingScheduler,
  LoadingTimerHandle,
} from "../src/features/loading/delayed-loading.domain";

class FakeScheduler implements DelayedLoadingScheduler {
  currentTime = 0;
  private nextId = 1;
  private timers = new Map<number, { dueAt: number; callback: () => void }>();

  now = () => this.currentTime;

  setTimeout = (callback: () => void, delayMs: number): LoadingTimerHandle => {
    const id = this.nextId++;
    this.timers.set(id, { dueAt: this.currentTime + delayMs, callback });
    return id as unknown as LoadingTimerHandle;
  };

  clearTimeout = (handle: LoadingTimerHandle): void => {
    this.timers.delete(handle as unknown as number);
  };

  advanceBy(milliseconds: number): void {
    const target = this.currentTime + milliseconds;
    while (true) {
      const due = [...this.timers.entries()]
        .filter(([, timer]) => timer.dueAt <= target)
        .sort((first, second) => first[1].dueAt - second[1].dueAt)[0];
      if (!due) break;
      const [id, timer] = due;
      this.timers.delete(id);
      this.currentTime = timer.dueAt;
      timer.callback();
    }
    this.currentTime = target;
  }
}

function setup() {
  const scheduler = new FakeScheduler();
  const changes: { visible: boolean; at: number }[] = [];
  const controller = new DelayedLoadingController({
    scheduler,
    onVisibilityChange: (visible) =>
      changes.push({ visible, at: scheduler.now() }),
  });
  return { controller, scheduler, changes };
}

test("fast operation finishes before reveal and never shows a loader", () => {
  const { controller, scheduler, changes } = setup();
  controller.setLoading(true);
  scheduler.advanceBy(90);
  controller.setLoading(false);
  scheduler.advanceBy(
    DEFAULT_LOADING_REVEAL_DELAY_MS + DEFAULT_LOADING_MINIMUM_VISIBLE_MS,
  );
  assert.deepEqual(changes, []);
});

test("loader appears after reveal delay and respects minimum visible time", () => {
  const { controller, scheduler, changes } = setup();
  controller.setLoading(true);
  scheduler.advanceBy(DEFAULT_LOADING_REVEAL_DELAY_MS);
  assert.deepEqual(changes, [
    { visible: true, at: DEFAULT_LOADING_REVEAL_DELAY_MS },
  ]);
  scheduler.advanceBy(225);
  controller.setLoading(false);
  scheduler.advanceBy(
    DEFAULT_LOADING_MINIMUM_VISIBLE_MS -
      (scheduler.currentTime - DEFAULT_LOADING_REVEAL_DELAY_MS) -
      1,
  );
  assert.equal(changes.length, 1);
  scheduler.advanceBy(1);
  assert.deepEqual(changes.at(-1), {
    visible: false,
    at: DEFAULT_LOADING_REVEAL_DELAY_MS + DEFAULT_LOADING_MINIMUM_VISIBLE_MS,
  });
});

test("the shared initial-skeleton policy uses a 300 ms reveal and minimum visibility", () => {
  assert.equal(DEFAULT_LOADING_REVEAL_DELAY_MS, 300);
  assert.equal(DEFAULT_LOADING_MINIMUM_VISIBLE_MS, 300);
});

test("long operation stays visible naturally and hides immediately after minimum duration", () => {
  const { controller, scheduler, changes } = setup();
  controller.setLoading(true);
  scheduler.advanceBy(3000);
  assert.deepEqual(changes, [
    { visible: true, at: DEFAULT_LOADING_REVEAL_DELAY_MS },
  ]);
  controller.setLoading(false);
  assert.deepEqual(changes.at(-1), { visible: false, at: 3000 });
});

test("a restarted operation cancels stale hide work and keeps the visible period stable", () => {
  const { controller, scheduler, changes } = setup();
  controller.setLoading(true);
  scheduler.advanceBy(DEFAULT_LOADING_REVEAL_DELAY_MS);
  scheduler.advanceBy(25);
  controller.setLoading(false);
  scheduler.advanceBy(50);
  controller.setLoading(true);
  scheduler.advanceBy(100);
  assert.equal(changes.length, 1);
  controller.setLoading(false);
  scheduler.advanceBy(
    DEFAULT_LOADING_MINIMUM_VISIBLE_MS -
      (scheduler.currentTime - DEFAULT_LOADING_REVEAL_DELAY_MS) -
      1,
  );
  assert.equal(changes.length, 1);
  scheduler.advanceBy(1);
  assert.equal(changes.length, 2);
  assert.equal(changes[1].visible, false);
});

test("restarting before reveal starts a fresh reveal window", () => {
  const { controller, scheduler, changes } = setup();
  controller.setLoading(true);
  scheduler.advanceBy(200);
  controller.setLoading(false);
  controller.setLoading(true);
  scheduler.advanceBy(DEFAULT_LOADING_REVEAL_DELAY_MS - 1);
  assert.deepEqual(changes, []);
  scheduler.advanceBy(1);
  assert.deepEqual(changes, [
    { visible: true, at: 200 + DEFAULT_LOADING_REVEAL_DELAY_MS },
  ]);
});

test("dispose cancels pending timers and does not publish later state", () => {
  const { controller, scheduler, changes } = setup();
  controller.setLoading(true);
  scheduler.advanceBy(100);
  controller.dispose();
  scheduler.advanceBy(1000);
  assert.deepEqual(changes, []);
});