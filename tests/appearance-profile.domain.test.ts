import assert from "node:assert/strict";
import test from "node:test";
import { darkUiColors, resolveAppearance, ui } from "../src/components/ui-tokens";
import { getHomeGreeting, getProfileGreetingName } from "../src/features/profiles/profile.domain";

test("Home greeting uses local morning, afternoon, and evening periods", () => {
  const profile = { fullName: "Kshitij Nigam", nickname: "Kshitij" };
  assert.equal(getHomeGreeting(profile, new Date(2026, 8, 13, 5, 0)), "Good morning, Kshitij");
  assert.equal(getHomeGreeting(profile, new Date(2026, 8, 13, 12, 0)), "Good afternoon, Kshitij");
  assert.equal(getHomeGreeting(profile, new Date(2026, 8, 13, 3, 0)), "Good evening, Kshitij");
});

test("Home greeting prefers nickname, falls back to first name, and never shows empty punctuation", () => {
  assert.equal(getProfileGreetingName({ fullName: "  Kshitij   Nigam ", nickname: "  Kshitij  " }), "Kshitij");
  assert.equal(getProfileGreetingName({ fullName: "  Kshitij   Nigam " }), "Kshitij");
  assert.equal(getHomeGreeting({ fullName: "   " }), "Good evening");
});

test("appearance resolves system preference and explicit theme choices predictably", () => {
  assert.equal(resolveAppearance("system", "dark"), "dark");
  assert.equal(resolveAppearance("system", "light"), "light");
  assert.equal(resolveAppearance("dark", "light"), "dark");
  assert.equal(resolveAppearance("light", "dark"), "light");
});

test("both appearance palettes provide semantic input and disabled-state tokens", () => {
  for (const palette of [ui.colors, darkUiColors]) {
    assert.ok(palette.inputBackground);
    assert.ok(palette.borderStrong);
    assert.ok(palette.placeholder);
    assert.ok(palette.disabledBackground);
    assert.ok(palette.disabledText);
    assert.ok(palette.onPrimary);
  }
});
