import assert from "node:assert/strict";
import test from "node:test";

import {
  assertRefillTrackingEnabled,
  calculateRefillAddition,
  calculateTakenInventoryConsumption,
  getRefillStockState,
  calculateStockCorrection,
  validateCorrectStockInput,
  validateStockCorrection,
  validateRefillAddition,
  validateRefillTrackingInput,
} from "../src/features/refills/refill.domain";

const valid = {
  trackingEnabled: true,
  currentQuantity: 30,
  unit: "tablets" as const,
  consumptionPerTaken: 1,
  lowStockThreshold: 5,
};

test("valid refill settings support zero and decimal inventory quantities", () => {
  assert.deepEqual(validateRefillTrackingInput({ ...valid, currentQuantity: 0 }), { ...valid, currentQuantity: 0 });
  assert.equal(validateRefillTrackingInput({ ...valid, currentQuantity: 12.3456 }).currentQuantity, 12.346);
});

test("refill validation rejects unsafe or negative quantities", () => {
  assert.throws(() => validateRefillTrackingInput({ ...valid, currentQuantity: -1 }), /Current quantity/);
  assert.throws(() => validateRefillTrackingInput({ ...valid, consumptionPerTaken: 0 }), /Used per Taken dose/);
  assert.throws(() => validateRefillTrackingInput({ ...valid, consumptionPerTaken: -1 }), /Used per Taken dose/);
  assert.throws(() => validateRefillTrackingInput({ ...valid, consumptionPerTaken: 0.0001 }), /supported precision/);
  assert.throws(() => validateRefillTrackingInput({ ...valid, lowStockThreshold: -1 }), /Low-stock warning/);
  assert.throws(() => validateRefillTrackingInput({ ...valid, currentQuantity: Number.NaN }), /valid number/);
  assert.throws(() => validateRefillTrackingInput({ ...valid, currentQuantity: Number.POSITIVE_INFINITY }), /valid number/);
});

test("low stock is derived from user-entered inventory only", () => {
  assert.equal(getRefillStockState({ trackingEnabled: true, currentQuantity: 6, lowStockThreshold: 5 }), "normal");
  assert.equal(getRefillStockState({ trackingEnabled: true, currentQuantity: 5, lowStockThreshold: 5 }), "low");
  assert.equal(getRefillStockState({ trackingEnabled: true, currentQuantity: 0, lowStockThreshold: 5 }), "low");
  assert.equal(getRefillStockState({ trackingEnabled: false, currentQuantity: 0, lowStockThreshold: 5 }), "disabled");
});

test("Taken consumption uses the configured quantity and keeps decimal stock precise", () => {
  assert.deepEqual(calculateTakenInventoryConsumption(10.5, 2.5), {
    quantityBefore: 10.5,
    quantityDelta: -2.5,
    quantityAfter: 8,
  });
  assert.deepEqual(calculateTakenInventoryConsumption(1, 0.333), {
    quantityBefore: 1,
    quantityDelta: -0.333,
    quantityAfter: 0.667,
  });
});

test("Taken consumption clamps approximate stock at zero without blocking intake", () => {
  assert.deepEqual(calculateTakenInventoryConsumption(0.5, 1), {
    quantityBefore: 0.5,
    quantityDelta: -0.5,
    quantityAfter: 0,
  });
  assert.deepEqual(calculateTakenInventoryConsumption(0, 1), {
    quantityBefore: 0,
    quantityDelta: 0,
    quantityAfter: 0,
  });
});

test("a refill adds a validated quantity without allowing an unbounded new total", () => {
  assert.deepEqual(calculateRefillAddition(3, 30), { quantityBefore: 3, quantityAdded: 30, quantityAfter: 33 });
  assert.deepEqual(calculateRefillAddition(2.5, 0.1254), { quantityBefore: 2.5, quantityAdded: 0.125, quantityAfter: 2.625 });
  assert.throws(() => calculateRefillAddition(1_000_000, 0.001), /New stock/);
});

test("refill additions reject blank-equivalent, zero, negative, and non-finite values", () => {
  assert.throws(() => validateRefillAddition(Number("")), /greater than zero/);
  assert.throws(() => validateRefillAddition(0), /greater than zero/);
  assert.throws(() => validateRefillAddition(-1), /greater than zero/);
  assert.throws(() => validateRefillAddition(Number.NaN), /valid number/);
  assert.throws(() => validateRefillAddition(Number.POSITIVE_INFINITY), /valid number/);
  assert.throws(() => validateRefillAddition(1_000_001), /or less/);
});

test("disabled refill tracking rejects stock additions before a mutation can start", () => {
  assert.throws(() => assertRefillTrackingEnabled(false), /Enable refill tracking/);
  assert.doesNotThrow(() => assertRefillTrackingEnabled(true));
});

test("manual stock corrections accept zero and exact three-decimal quantities", () => {
  assert.equal(validateStockCorrection(0), 0);
  assert.equal(validateStockCorrection(12.345), 12.345);
  assert.deepEqual(validateCorrectStockInput({ quantity: 4.25, operationId: "correction-1" }), { quantity: 4.25, operationId: "correction-1" });
});

test("manual stock corrections reject invalid, negative, excessive, and over-precise quantities", () => {
  assert.throws(() => validateStockCorrection(Number.NaN), /valid number/);
  assert.throws(() => validateStockCorrection(Number.POSITIVE_INFINITY), /valid number/);
  assert.throws(() => validateStockCorrection(-0.001), /zero or more/);
  assert.throws(() => validateStockCorrection(1_000_001), /or less/);
  assert.throws(() => validateStockCorrection(1.0001), /three decimal places/);
  assert.throws(() => validateCorrectStockInput({ quantity: 1, operationId: "  " }), /operation ID/);
});

test("manual stock correction calculates signed audit deltas and leaves no-op quantities unchanged", () => {
  assert.deepEqual(calculateStockCorrection(8, 5.5), { quantityBefore: 8, quantityDelta: -2.5, quantityAfter: 5.5 });
  assert.deepEqual(calculateStockCorrection(5.5, 8), { quantityBefore: 5.5, quantityDelta: 2.5, quantityAfter: 8 });
  assert.equal(calculateStockCorrection(0, 0), null);
  assert.equal(calculateStockCorrection(5, 5), null);
});
