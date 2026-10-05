import assert from "node:assert/strict";
import test from "node:test";

import { darkUiColors, getButtonColorRoles, getColorContrastRatio, ui } from "../src/components/ui-tokens";
import { getMotionDuration, motion } from "../src/components/motion-tokens";

const requiredPairs = [
  ["background", "textPrimary"], ["background", "textSecondary"], ["background", "textMuted"],
  ["backgroundSubtle", "textPrimary"], ["surface", "textPrimary"], ["surfaceRaised", "textPrimary"],
  ["surfaceRaised", "textSecondary"], ["surfaceRaised", "textMuted"], ["surfaceMuted", "textPrimary"],
  ["cardBackground", "cardForeground"], ["cardBackground", "textSecondary"], ["cardBackground", "textMuted"],
  ["selectedBackground", "selectedForeground"], ["primary", "onPrimary"], ["accent", "accentForeground"], ["primaryBackground", "primaryForeground"],
  ["inputBackground", "inputForeground"], ["badgeTakenBackground", "badgeTakenForeground"],
  ["badgeSkippedBackground", "badgeSkippedForeground"], ["badgeMissedBackground", "badgeMissedForeground"],
  ["badgePendingBackground", "badgePendingForeground"], ["badgeUpcomingBackground", "badgeUpcomingForeground"],
  ["badgeActiveBackground", "badgeActiveForeground"], ["badgePausedBackground", "badgePausedForeground"],
  ["badgeExpiredBackground", "badgeExpiredForeground"], ["secondaryBackground", "secondaryForeground"],
  ["dangerBackground", "dangerForeground"],
  ["chipBackground", "chipForeground"], ["chipSelectedBackground", "chipSelectedForeground"],
  ["chipPressedBackground", "chipPressedForeground"], ["chipSelectedPressedBackground", "chipSelectedPressedForeground"],
  ["chipDisabledBackground", "chipDisabledForeground"], ["inputBackground", "placeholder"],
  ["disabledBackground", "disabledText"], ["inputBackground", "outlineForeground"],
  ["background", "primary"], ["background", "muted"],
] as const;

test("light and dark palettes implement the same complete semantic and compatibility roles", () => {
  assert.deepEqual(Object.keys(darkUiColors).sort(), Object.keys(ui.colors).sort());
  for (const role of ["backgroundSubtle", "surface", "surfaceRaised", "surfaceMuted", "textPrimary", "textSecondary", "textMuted", "primary", "primaryPressed", "onPrimary", "accent", "support", "border", "divider", "focus", "scrim", "success", "warning", "danger", "pending", "taken", "skipped", "missed", "lowStock"] as const) {
    assert.ok(ui.colors[role], `light ${role} is defined`);
    assert.ok(darkUiColors[role], `dark ${role} is defined`);
  }
  assert.equal(ui.colors.primary, "#024A47");
  assert.equal(ui.colors.accent, "#FC6B44");
  assert.equal(ui.colors.support, "#658A63");
  assert.equal(ui.colors.background, "#FBF4E9");
});

test("light and dark semantic text pairs meet the normal-text contrast target", () => {
  for (const [mode, colors] of [["light", ui.colors], ["dark", darkUiColors]] as const) {
    for (const [backgroundKey, foregroundKey] of requiredPairs) {
      const ratio = getColorContrastRatio(colors[backgroundKey], colors[foregroundKey]);
      assert.ok(ratio >= 4.5, `${mode} ${backgroundKey}/${foregroundKey} is ${ratio.toFixed(2)}:1`);
    }
  }
});

test("selected and primary controls use the same accessible deep-teal brand treatment in both themes", () => {
  for (const [mode, colors] of [["light", ui.colors], ["dark", darkUiColors]] as const) {
    assert.equal(colors.selectedBackground, colors.primaryBackground);
    assert.equal(colors.selectedForeground, colors.primaryForeground);
    assert.equal(colors.chipSelectedBackground, colors.selectedBackground);
    assert.equal(colors.chipSelectedForeground, colors.selectedForeground);
    assert.ok(getColorContrastRatio(colors.chipSelectedBackground, colors.chipSelectedForeground) >= 4.5, `${mode} selected History/Insights/report chip`);
    assert.ok(getColorContrastRatio(colors.chipBackground, colors.chipForeground) >= 4.5, `${mode} unselected filter chip`);
    assert.ok(getColorContrastRatio(colors.chipDisabledBackground, colors.chipDisabledForeground) >= 4.5, `${mode} disabled filter chip`);
    assert.ok(getColorContrastRatio(colors.chipBackground, colors.chipBorder) >= 3, `${mode} unselected chip outline`);
    assert.ok(getColorContrastRatio(colors.primary, colors.onPrimary) >= 4.5);
    assert.ok(getColorContrastRatio(colors.disabledBackground, colors.disabledText) >= 4.5, `${mode} disabled button remains readable`);
    assert.ok(getColorContrastRatio(colors.inputBackground, colors.outlineForeground) >= 4.5, `${mode} secondary/outline action`);
    assert.ok(getColorContrastRatio(colors.inputBackground, colors.outlineBorder) >= 3, `${mode} outline button border`);
  }
});

test("dark unselected chips use a light foreground on their dark surface", () => {
  assert.notEqual(darkUiColors.chipForeground, "#000000");
  assert.ok(Number.parseInt(darkUiColors.chipForeground.slice(1), 16) > 0x808080, "dark-theme unselected chip foreground should be light, not black/dark");
  assert.ok(getColorContrastRatio(darkUiColors.chipBackground, darkUiColors.chipForeground) >= 4.5);
});

test("button variants keep readable foreground, fill, border, and disabled pairs in both themes", () => {
  const tones = ["primary", "secondary", "outline", "danger"] as const;
  const states = ["default", "pressed", "disabled"] as const;

  for (const [mode, colors] of [["light", ui.colors], ["dark", darkUiColors]] as const) {
    for (const tone of tones) {
      for (const state of states) {
        const roles = getButtonColorRoles(tone, state);
        const background = colors[roles.background];
        const foreground = colors[roles.foreground];
        const border = colors[roles.border];
        assert.ok(getColorContrastRatio(background, foreground) >= 4.5, `${mode} ${tone}/${state} label must stay readable`);
        if (tone !== "primary" || state === "disabled") {
          assert.ok(getColorContrastRatio(background, border) >= 3, `${mode} ${tone}/${state} border must remain visible`);
        }
      }
    }
    assert.equal(getButtonColorRoles("primary", "default").foreground, "onPrimary");
    assert.equal(getButtonColorRoles("outline", "disabled").foreground, "disabledText");
  }
});

test("status labels stay non-interactive and readable in both themes", () => {
  const statusPairs = [
    ["badgeActiveBackground", "badgeActiveForeground"],
    ["badgePendingBackground", "badgePendingForeground"],
    ["badgeTakenBackground", "badgeTakenForeground"],
    ["badgeSkippedBackground", "badgeSkippedForeground"],
    ["badgeMissedBackground", "badgeMissedForeground"],
  ] as const;
  for (const [mode, colors] of [["light", ui.colors], ["dark", darkUiColors]] as const) {
    for (const [background, foreground] of statusPairs) {
      assert.ok(getColorContrastRatio(colors[background], colors[foreground]) >= 4.5, `${mode} ${background}/${foreground}`);
    }
  }
});

test("typography, spacing, radius, elevation, and touch tokens are complete and practical", () => {
  const roles = ["display", "pageTitle", "sectionTitle", "cardTitle", "body", "bodyStrong", "supporting", "label", "button", "caption", "numeric"] as const;
  for (const role of roles) {
    const style = ui.typography[role];
    assert.ok(style.fontSize >= 12, `${role} should not become tiny`);
    assert.ok(style.lineHeight >= style.fontSize, `${role} line height should remain readable`);
    assert.ok(style.fontWeight.length > 0, `${role} weight is defined`);
  }
  assert.deepEqual([ui.spacing.xxs, ui.spacing.xs, ui.spacing.sm, ui.spacing.md, ui.spacing.lg, ui.spacing.xl, ui.spacing.xxl], [4, 8, 12, 16, 20, 24, 32]);
  assert.deepEqual([ui.radius.small, ui.radius.medium, ui.radius.large, ui.radius.pill], [8, 12, 16, 999]);
  assert.deepEqual(ui.elevation, { card: 0, raised: 1, overlay: 4 });
  assert.equal(ui.touch.minimum, 48);
});

test("motion durations stay within the calm product ranges and reduce appropriately", () => {
  assert.ok(motion.duration.feedback >= 100 && motion.duration.feedback <= 140);
  assert.ok(motion.duration.fast >= 140 && motion.duration.fast <= 180);
  assert.ok(motion.duration.standard >= 220 && motion.duration.standard <= 260);
  assert.ok(motion.duration.navigation >= 360 && motion.duration.navigation <= 400);
  assert.ok(motion.duration.deliberate >= 320 && motion.duration.deliberate <= 420);
  assert.ok(motion.duration.onboarding >= 500 && motion.duration.onboarding <= 700);
  assert.ok(motion.duration.illustrationLoop >= 1500 && motion.duration.illustrationLoop <= 3000);
  assert.ok(motion.duration.onboardingFeedback >= 80 && motion.duration.onboardingFeedback <= 100);
  assert.ok(motion.duration.state >= 250 && motion.duration.state <= 320);
  assert.ok(motion.duration.screen >= 340 && motion.duration.screen <= 380);
  assert.ok(motion.duration.contentEntrance >= 400 && motion.duration.contentEntrance <= 550);
  assert.ok(motion.duration.majorHandoff >= 700 && motion.duration.majorHandoff <= 1000);
  assert.equal(motion.duration.feedback, 140);
  assert.equal(motion.duration.stateChange, 280);
  assert.equal(motion.duration.contentUpdate, 320);
  assert.equal(motion.duration.tabContent, 300);
  assert.equal(motion.duration.tabContentReducedMotion, 160);
  assert.equal(motion.duration.navigation, 380);
  assert.equal(motion.duration.skeletonRevealDelay, 300);
  assert.equal(motion.duration.skeletonMinVisible, 300);
  assert.equal(motion.duration.skeletonCrossfade, 280);
  assert.equal(motion.duration.reducedMotionTransition, 220);
  assert.equal(motion.duration.loaderPulse, 1000);
  assert.equal(motion.duration.skeletonPulse, 1100);
  assert.equal(motion.duration.firstRunReducedTransition, 220);
  assert.equal(motion.duration.firstRunScreenExit, 360);
  assert.equal(motion.duration.firstRunPrimerEntrance, 480);
  assert.deepEqual(Object.keys(motion.easing).sort(), ["emphasized", "enter", "exit", "standard"]);
  assert.equal(getMotionDuration("navigation", false), motion.duration.navigation);
  assert.equal(getMotionDuration("navigation", true), 0);
});
