import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { getNextDoseEmptyMessage } from "../src/features/doses/home-empty-state.domain";

const today = "2026-11-14";
const homeScreen = readFileSync(resolve(process.cwd(), "src/app/(tabs)/index.tsx"), "utf8");

function emptyMessage(overrides: Partial<Parameters<typeof getNextDoseEmptyMessage>[0]> = {}) {
  return getNextDoseEmptyMessage({
    doseDataReady: true,
    hasError: false,
    hasUpcomingDose: false,
    selectedDate: today,
    todayDate: today,
    ...overrides,
  });
}

test("an empty current schedule shows the exact today copy even without medication records", () => {
  assert.equal(emptyMessage(), "No more medications scheduled for today.");
});

test("profiles with no schedules and schedules whose doses are all recorded use the same empty state", () => {
  const settledSchedules = [
    { scenario: "new profile with no medication records", pendingStatuses: [] },
    { scenario: "medications exist but no dose is scheduled", pendingStatuses: [] },
    { scenario: "all scheduled doses were taken", pendingStatuses: ["taken", "taken"] },
    { scenario: "all scheduled doses were skipped", pendingStatuses: ["skipped", "skipped"] },
    { scenario: "all scheduled doses are missed", pendingStatuses: ["missed"] },
  ];

  for (const { scenario, pendingStatuses } of settledSchedules) {
    const hasUpcomingDose = pendingStatuses.includes("pending");
    assert.equal(emptyMessage({ hasUpcomingDose }), "No more medications scheduled for today.", scenario);
  }
});

test("pending doses suppress the empty state", () => {
  assert.equal(emptyMessage({ hasUpcomingDose: true }), null);
});

test("loading, unresolved profile data, and dose errors never show an early empty state", () => {
  assert.equal(emptyMessage({ doseDataReady: false }), null);
  assert.equal(emptyMessage({ hasError: true }), null);
});

test("another selected carousel date uses date-neutral wording", () => {
  assert.equal(emptyMessage({ selectedDate: "2026-11-15" }), "No medications scheduled for this day.");
});

test("Home Add medication remains accessible and opens the existing medication flow with a compact plus icon", () => {
  assert.match(homeScreen, /accessibilityLabel="Add medication" onPress=\{\(\) => router\.push\("\/medications"\)\}/);
  assert.match(homeScreen, /name=\{\{ ios: "plus", android: "add", web: "add" \}\} size=\{14\}/);
  assert.match(homeScreen, /addMedicationCapsule: \{[^}]*minHeight: 32[^}]*gap: 4/);
  assert.match(homeScreen, /getNextDoseEmptyMessage\(/);
  assert.doesNotMatch(homeScreen, /hasCurrentDoseContent && visibleDoses\.length > 0/);
});
