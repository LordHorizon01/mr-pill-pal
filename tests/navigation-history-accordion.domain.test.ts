import assert from "node:assert/strict";
import test from "node:test";
import { DRAWER_TAB_DESTINATIONS, getSelectedDrawerDestination, PRIMARY_TAB_NAMES, PROFILE_SHEET_DESTINATIONS } from "../src/features/navigation/navigation.domain";
import { resetExpandedHistoryDate, toggleExpandedHistoryDate } from "../src/features/history/history-accordion.domain";

test("five primary tabs retain Profile while profile management and Settings stay secondary", () => {
  assert.deepEqual(PRIMARY_TAB_NAMES, ["Home", "Medications", "History", "Insights", "Profile"]);
  assert.deepEqual(PROFILE_SHEET_DESTINATIONS, ["Manage profiles", "Settings"]);
});
test("drawer destinations match the five tabs and select the active tab by Expo Router segments", () => {
  assert.deepEqual(DRAWER_TAB_DESTINATIONS.map(({ label }) => label), PRIMARY_TAB_NAMES);
  assert.deepEqual(DRAWER_TAB_DESTINATIONS.map(({ route }) => route), [
    "/(tabs)/index", "/(tabs)/medications", "/(tabs)/history", "/(tabs)/insights", "/(tabs)/profile",
  ]);
  assert.equal(getSelectedDrawerDestination(["(tabs)", "index"]), "home");
  assert.equal(getSelectedDrawerDestination(["(tabs)", "medications"]), "medications");
  assert.equal(getSelectedDrawerDestination(["(tabs)", "history"]), "history");
  assert.equal(getSelectedDrawerDestination(["(tabs)", "insights"]), "insights");
  assert.equal(getSelectedDrawerDestination(["(tabs)", "profile"]), "profile");
  assert.equal(getSelectedDrawerDestination(["(tabs)", "settings"]), null);
  assert.equal(getSelectedDrawerDestination(["dose-detail"]), null);
});
test("History accordion starts and returns collapsed, with only one date open", () => {
  assert.equal(resetExpandedHistoryDate(), null);
  assert.equal(toggleExpandedHistoryDate(null, "2026-09-11"), "2026-09-11");
  assert.equal(toggleExpandedHistoryDate("2026-09-11", "2026-09-10"), "2026-09-10");
  assert.equal(toggleExpandedHistoryDate("2026-09-10", "2026-09-10"), null);
});
