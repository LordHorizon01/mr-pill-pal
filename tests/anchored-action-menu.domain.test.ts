import assert from "node:assert/strict";
import test from "node:test";

import { getAnchoredMenuPlacement, withContextMenuCancel } from "../src/components/anchored-action-menu.domain";
import { shouldShowDoseCorrectionOverflow } from "../src/features/doses/dose-card-presentation.domain";

const window = { width: 360, height: 800 };
const insets = { top: 28, right: 16, bottom: 96, left: 16 };

test("contextual action orders keep Cancel last without changing business actions", () => {
  assert.deepEqual(withContextMenuCancel(["archive", "delete"]), ["archive", "delete", "cancel"]);
  assert.deepEqual(withContextMenuCancel(["change-to-skipped"]), ["change-to-skipped", "cancel"]);
  assert.deepEqual(withContextMenuCancel(["change-to-taken"]), ["change-to-taken", "cancel"]);
});

test("anchored menu prefers a compact above-trigger position when it fits", () => {
  const placement = getAnchoredMenuPlacement({ x: 292, y: 440, width: 44, height: 44 }, { width: 208, height: 120 }, window, insets);

  assert.deepEqual(placement, { left: 128, top: 312, placement: "above" });
});

test("anchored menu safely falls back below and clamps near screen edges", () => {
  const placement = getAnchoredMenuPlacement({ x: 330, y: 34, width: 44, height: 44 }, { width: 208, height: 120 }, window, insets);

  assert.deepEqual(placement, { left: 136, top: 86, placement: "below" });
});

test("only finalized Taken and Skipped cards remain eligible for correction actions", () => {
  assert.equal(shouldShowDoseCorrectionOverflow("pending"), false);
  assert.equal(shouldShowDoseCorrectionOverflow("taken"), true);
  assert.equal(shouldShowDoseCorrectionOverflow("skipped"), true);
  assert.equal(shouldShowDoseCorrectionOverflow("missed"), false);
});
