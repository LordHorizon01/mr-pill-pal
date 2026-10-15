export const PRIMARY_TAB_NAMES = ["Home", "Medications", "History", "Insights", "Profile"] as const;
export const PROFILE_SHEET_DESTINATIONS = ["Manage profiles", "Settings"] as const;

export const DRAWER_TAB_DESTINATIONS = [
  { key: "home", label: "Home", route: "/(tabs)/index", ios: "house.fill", android: "home" },
  { key: "medications", label: "Medications", route: "/(tabs)/medications", ios: "pills.fill", android: "medication" },
  { key: "history", label: "History", route: "/(tabs)/history", ios: "clock.arrow.circlepath", android: "history" },
  { key: "insights", label: "Insights", route: "/(tabs)/insights", ios: "chart.bar.xaxis", android: "monitoring" },
  { key: "profile", label: "Profile", route: "/(tabs)/profile", ios: "person.crop.circle.fill", android: "account_circle" },
] as const;

export type DrawerDestination = (typeof DRAWER_TAB_DESTINATIONS)[number]["key"];

/** Maps the existing tabs file segments to the matching drawer active row. */
export function getSelectedDrawerDestination(segments: readonly string[]): DrawerDestination | null {
  if (!segments.includes("(tabs)")) return null;
  const route = segments[segments.length - 1];
  if (!route || route === "(tabs)" || route === "index") return "home";
  return DRAWER_TAB_DESTINATIONS.find((destination) => destination.key === route)?.key ?? null;
}
