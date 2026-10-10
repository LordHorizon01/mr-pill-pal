import assert from "node:assert/strict";
import test from "node:test";

import {
  getHomeDateCarouselDates,
  getHomeDateCarouselIndex,
  getHomeDateIndexFromOffset,
  getHomeDateOffsetForIndex,
  isHomeDateToday,
} from "../src/features/doses/home-date-carousel.domain";

test("Home date range keeps today at its center and exposes a bounded 181-day window", () => {
  const dates = getHomeDateCarouselDates("2026-10-10");
  assert.equal(dates.length, 181);
  assert.equal(dates[90], "2026-10-10");
  assert.equal(dates[0], "2026-07-12");
  assert.equal(dates[180], "2027-01-08");
  assert.equal(new Set(dates).size, dates.length);
});

test("local date keys map to carousel indexes across month and year boundaries", () => {
  assert.equal(getHomeDateCarouselIndex("2026-10-09", "2026-10-10"), 89);
  assert.equal(getHomeDateCarouselIndex("2026-10-10", "2026-10-10"), 90);
  assert.equal(getHomeDateCarouselIndex("2026-10-11", "2026-10-10"), 91);
  assert.equal(getHomeDateCarouselIndex("2027-01-08", "2026-10-10"), 180);
  assert.throws(() => getHomeDateCarouselIndex("2026-07-11", "2026-10-10"), RangeError);
});

test("today styling is independent from the selected date", () => {
  assert.equal(isHomeDateToday("2026-10-10", "2026-10-10"), true);
  assert.equal(isHomeDateToday("2026-10-09", "2026-10-10"), false);
  assert.notEqual(getHomeDateCarouselIndex("2026-10-09", "2026-10-10"), getHomeDateCarouselIndex("2026-10-10", "2026-10-10"));
});

test("scroll offsets snap to the nearest clamped item and indexes return centered offsets", () => {
  assert.equal(getHomeDateIndexFromOffset(0, 72, 181), 0);
  assert.equal(getHomeDateIndexFromOffset(90, 72, 181), 1);
  assert.equal(getHomeDateIndexFromOffset(180, 72, 181), 3);
  assert.equal(getHomeDateIndexFromOffset(99_000, 72, 181), 180);
  assert.equal(getHomeDateOffsetForIndex(90, 72), 6_480);
});
