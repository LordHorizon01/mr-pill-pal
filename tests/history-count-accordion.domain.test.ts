import assert from "node:assert/strict";
import test from "node:test";
import { createHistoryAccordionSections, resetExpandedHistoryDate } from "../src/features/history/history-accordion.domain";

type Record = { id: string };

function group(ids: string[]) {
  return [{ date: "2026-09-11", label: "Today", data: ids.map((id) => ({ id })) }];
}

test("collapsed history keeps the filtered record count while rendering no cards", () => {
  const source = group(["a", "b", "c", "d", "e", "f"]);
  const [section] = createHistoryAccordionSections(source, null);

  assert.equal(section.recordCount, 6);
  assert.deepEqual(section.data, []);
  assert.equal(source[0].data.length, 6);
});

test("opening, closing, and resetting an accordion never changes its source records", () => {
  const source = group(["a", "b", "c"]);
  const [opened] = createHistoryAccordionSections(source, "2026-09-11");
  const [closed] = createHistoryAccordionSections(source, resetExpandedHistoryDate());

  assert.equal(opened.recordCount, 3);
  assert.equal(opened.data.length, 3);
  assert.equal(closed.recordCount, 3);
  assert.deepEqual(closed.data, []);
  assert.deepEqual(source[0].data.map((record) => record.id), ["a", "b", "c"]);
});

test("counts use the currently filtered group for status, medication, and date results", () => {
  assert.equal(createHistoryAccordionSections(group(["t1", "t2", "t3", "t4", "t5"]), null)[0].recordCount, 5);
  assert.equal(createHistoryAccordionSections(group(["s1"]), null)[0].recordCount, 1);
  assert.equal(createHistoryAccordionSections(group(["m1", "m2"]), null)[0].recordCount, 2);
  assert.equal(createHistoryAccordionSections(group(["d1", "d2", "d3"]), null)[0].recordCount, 3);
});

test("a refreshed group after one deletion shows the new count and empty groups disappear", () => {
  const remaining = group(["a", "b", "c", "d", "e"]);
  assert.equal(createHistoryAccordionSections(remaining, null)[0].recordCount, 5);
  assert.deepEqual(createHistoryAccordionSections([], null), []);
});
