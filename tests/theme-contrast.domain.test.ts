import assert from "node:assert/strict";
import test from "node:test";

import { darkUiColors, getColorContrastRatio, ui } from "../src/components/ui-tokens";

const requiredPairs = [
  ["background", "textPrimary"], ["cardBackground", "cardForeground"], ["cardBackground", "textSecondary"],
  ["selectedBackground", "selectedForeground"], ["primaryBackground", "primaryForeground"],
  ["inputBackground", "inputForeground"], ["badgeTakenBackground", "badgeTakenForeground"],
  ["badgeSkippedBackground", "badgeSkippedForeground"], ["badgeMissedBackground", "badgeMissedForeground"],
  ["badgePendingBackground", "badgePendingForeground"], ["badgeUpcomingBackground", "badgeUpcomingForeground"],
  ["dangerBackground", "dangerForeground"],
] as const;

test("light and dark semantic text pairs meet the normal-text contrast target", () => {
  for (const [mode, colors] of [["light", ui.colors], ["dark", darkUiColors]] as const) {
    for (const [backgroundKey, foregroundKey] of requiredPairs) {
      const ratio = getColorContrastRatio(colors[backgroundKey], colors[foregroundKey]);
      assert.ok(ratio >= 4.5, `${mode} ${backgroundKey}/${foregroundKey} is ${ratio.toFixed(2)}:1`);
    }
  }
});

test("the known screenshot failures use a dark foreground on dark-mode light-blue primary surfaces", () => {
  assert.equal(darkUiColors.selectedBackground, darkUiColors.primaryBackground);
  assert.equal(darkUiColors.selectedForeground, darkUiColors.primaryForeground);
  assert.notEqual(darkUiColors.selectedForeground.toLowerCase(), "#ffffff");
  assert.ok(getColorContrastRatio(darkUiColors.primaryBackground, darkUiColors.primaryForeground) >= 4.5);
});
