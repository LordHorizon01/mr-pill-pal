import assert from "node:assert/strict";
import test from "node:test";

import { decideLowStockEpisode, getLowStockNotificationContent, isLowStock } from "../src/features/refills/low-stock-alert.domain";

const initial = { trackingEnabled: true, medicationIsActive: true, medicationIsArchived: false, currentQuantity: 6, lowStockThreshold: 5, previousEpisodeActive: false, previousAlertStatus: "normal" as const };

test("low-stock boundaries are based only on persisted tracking, quantity, and threshold", () => {
  assert.equal(isLowStock({ trackingEnabled: true, currentQuantity: 6, lowStockThreshold: 5 }), false);
  assert.equal(isLowStock({ trackingEnabled: true, currentQuantity: 5, lowStockThreshold: 5 }), true);
  assert.equal(isLowStock({ trackingEnabled: true, currentQuantity: 4.999, lowStockThreshold: 5 }), true);
  assert.equal(isLowStock({ trackingEnabled: false, currentQuantity: 0, lowStockThreshold: 5 }), false);
});

test("one normal-to-low transition creates exactly one alert-eligible episode", () => {
  assert.deepEqual(decideLowStockEpisode(initial), { isLow: false, episodeActive: false, alertStatus: "normal", shouldCheckDelivery: false });
  const firstLow = decideLowStockEpisode({ ...initial, currentQuantity: 5 });
  assert.deepEqual(firstLow, { isLow: true, episodeActive: true, alertStatus: "pending", shouldCheckDelivery: true });
  assert.deepEqual(decideLowStockEpisode({ ...initial, currentQuantity: 4, previousEpisodeActive: true, previousAlertStatus: "alerted" }), { isLow: true, episodeActive: true, alertStatus: "alerted", shouldCheckDelivery: false });
});

test("refills reset only after stock becomes normal and a later crossing is eligible again", () => {
  assert.deepEqual(decideLowStockEpisode({ ...initial, currentQuantity: 4, previousEpisodeActive: true, previousAlertStatus: "alerted" }), { isLow: true, episodeActive: true, alertStatus: "alerted", shouldCheckDelivery: false });
  assert.deepEqual(decideLowStockEpisode({ ...initial, currentQuantity: 15, previousEpisodeActive: true, previousAlertStatus: "alerted" }), { isLow: false, episodeActive: false, alertStatus: "normal", shouldCheckDelivery: false });
  assert.deepEqual(decideLowStockEpisode({ ...initial, currentQuantity: 5, previousEpisodeActive: false, previousAlertStatus: "normal" }), { isLow: true, episodeActive: true, alertStatus: "pending", shouldCheckDelivery: true });
});

test("Taken to Skipped to Taken around the threshold creates a new episode only after the reset", () => {
  const takenAtThreshold = decideLowStockEpisode({ ...initial, currentQuantity: 5 });
  assert.equal(takenAtThreshold.shouldCheckDelivery, true);
  const skippedBackToNormal = decideLowStockEpisode({ ...initial, currentQuantity: 6, previousEpisodeActive: true, previousAlertStatus: "alerted" });
  assert.equal(skippedBackToNormal.episodeActive, false);
  const takenAgain = decideLowStockEpisode({ ...initial, currentQuantity: 5, previousEpisodeActive: skippedBackToNormal.episodeActive, previousAlertStatus: skippedBackToNormal.alertStatus });
  assert.deepEqual(takenAgain, { isLow: true, episodeActive: true, alertStatus: "pending", shouldCheckDelivery: true });
});

test("settings and lifecycle eligibility do not duplicate an active low-stock episode", () => {
  assert.deepEqual(decideLowStockEpisode({ ...initial, currentQuantity: 8, lowStockThreshold: 10 }), { isLow: true, episodeActive: true, alertStatus: "pending", shouldCheckDelivery: true });
  assert.deepEqual(decideLowStockEpisode({ ...initial, currentQuantity: 8, lowStockThreshold: 10, previousEpisodeActive: true, previousAlertStatus: "alerted" }), { isLow: true, episodeActive: true, alertStatus: "alerted", shouldCheckDelivery: false });
  assert.deepEqual(decideLowStockEpisode({ ...initial, currentQuantity: 5, previousEpisodeActive: true, previousAlertStatus: "permission_required" }), { isLow: true, episodeActive: true, alertStatus: "permission_required", shouldCheckDelivery: true });
  assert.deepEqual(decideLowStockEpisode({ ...initial, currentQuantity: 5, previousEpisodeActive: true, previousAlertStatus: "scheduling_failed" }), { isLow: true, episodeActive: true, alertStatus: "scheduling_failed", shouldCheckDelivery: false });
  assert.deepEqual(decideLowStockEpisode({ ...initial, currentQuantity: 5, previousEpisodeActive: true, previousAlertStatus: "alerted", medicationIsActive: false }), { isLow: false, episodeActive: false, alertStatus: "inactive", shouldCheckDelivery: false });
});

test("low-stock notification content respects the existing medication-name privacy setting", () => {
  const visible = getLowStockNotificationContent({ medicationName: "Paracetamol", quantity: 5, unit: "tablets", hideMedicationName: false });
  const privateContent = getLowStockNotificationContent({ medicationName: "Paracetamol", quantity: 5, unit: "tablets", hideMedicationName: true });
  assert.match(visible.title, /Refill soon/);
  assert.match(visible.body, /Paracetamol has 5 tablets/);
  assert.equal(privateContent.title, "Refill reminder");
  assert.doesNotMatch(privateContent.body, /Paracetamol|5 tablets/);
});
