export const ui = {
  colors: {
    background: "#FFFFFF",
    surface: "#F7FAFC",
    primary: "#17365D",
    text: "#182230",
    muted: "#52616B",
    border: "#D6DEE6",
    danger: "#A12727",
    dangerSurface: "#FDECEC",
    successSurface: "#DCF3E3",
    warningSurface: "#F7E8C8",
    pendingSurface: "#E6EFF8",
    surfaceElevated: "#FFFFFF",
    card: "#FFFFFF",
    inputBackground: "#FFFFFF",
    borderStrong: "#8FA0AF",
    textPrimary: "#182230",
    textSecondary: "#52616B",
    textMuted: "#6B7B86",
    textInverse: "#FFFFFF",
    onPrimary: "#FFFFFF",
    success: "#176B3A",
    warning: "#8A5A00",
    placeholder: "#61717C",
    divider: "#D6DEE6",
    disabledBackground: "#E7EDF2",
    disabledText: "#667783",
    primaryBackground: "#17365D",
    primaryForeground: "#FFFFFF",
    secondaryBackground: "#E6EFF8",
    secondaryForeground: "#17365D",
    selectedBackground: "#17365D",
    selectedForeground: "#FFFFFF",
    cardBackground: "#FFFFFF",
    cardForeground: "#182230",
    inputForeground: "#182230",
    badgeTakenBackground: "#DCF3E3",
    badgeTakenForeground: "#14532D",
    badgeSkippedBackground: "#F7E8C8",
    badgeSkippedForeground: "#6B4300",
    badgeMissedBackground: "#FDECEC",
    badgeMissedForeground: "#8A1C24",
    badgePendingBackground: "#E6EFF8",
    badgePendingForeground: "#17365D",
    badgeUpcomingBackground: "#EEF2F6",
    badgeUpcomingForeground: "#40505F",
    badgeActiveBackground: "#DCF3E3",
    badgeActiveForeground: "#14532D",
    badgePausedBackground: "#F7E8C8",
    badgePausedForeground: "#6B4300",
    badgeExpiredBackground: "#FDECEC",
    badgeExpiredForeground: "#8A1C24",
    dangerBackground: "#FDECEC",
    dangerForeground: "#8A1C24",
    outlineBorder: "#8FA0AF",
    outlineForeground: "#17365D",
  },
  spacing: { screen: 16, section: 24, card: 16, compact: 10 },
  radius: { card: 16, button: 12, chip: 999 },
  touch: { minimum: 48 },
} as const;

export type AppearancePreference = "system" | "light" | "dark";
export type AppColorTokens = Record<keyof typeof ui.colors, string>;

export const darkUiColors: AppColorTokens = {
  background: "#111827",
  surface: "#1F2937",
  primary: "#A9CCF4",
  text: "#F8FAFC",
  muted: "#CBD5E1",
  border: "#475569",
  danger: "#FCA5A5",
  dangerSurface: "#4A2025",
  successSurface: "#1D3B2A",
  warningSurface: "#4A381D",
  pendingSurface: "#1D354C",
  surfaceElevated: "#283548",
  card: "#1F2937",
  inputBackground: "#111C2B",
  borderStrong: "#94A3B8",
  textPrimary: "#F8FAFC",
  textSecondary: "#CBD5E1",
  textMuted: "#AAB9C9",
  textInverse: "#0F172A",
  onPrimary: "#0F172A",
  success: "#86E0A4",
  warning: "#F5C96E",
  placeholder: "#AAB9C9",
  divider: "#475569",
  disabledBackground: "#334155",
  disabledText: "#94A3B8",
  primaryBackground: "#A9CCF4",
  primaryForeground: "#0F172A",
  secondaryBackground: "#1D354C",
  secondaryForeground: "#BFDBFE",
  selectedBackground: "#A9CCF4",
  selectedForeground: "#0F172A",
  cardBackground: "#1F2937",
  cardForeground: "#F8FAFC",
  inputForeground: "#F8FAFC",
  badgeTakenBackground: "#1D3B2A",
  badgeTakenForeground: "#B8F5C9",
  badgeSkippedBackground: "#4A381D",
  badgeSkippedForeground: "#FFE2A6",
  badgeMissedBackground: "#4A2025",
  badgeMissedForeground: "#FFD1D5",
  badgePendingBackground: "#1D354C",
  badgePendingForeground: "#BFDBFE",
  badgeUpcomingBackground: "#293747",
  badgeUpcomingForeground: "#D3DDEA",
  badgeActiveBackground: "#1D3B2A",
  badgeActiveForeground: "#B8F5C9",
  badgePausedBackground: "#4A381D",
  badgePausedForeground: "#FFE2A6",
  badgeExpiredBackground: "#4A2025",
  badgeExpiredForeground: "#FFD1D5",
  dangerBackground: "#4A2025",
  dangerForeground: "#FFD1D5",
  outlineBorder: "#94A3B8",
  outlineForeground: "#A9CCF4",
};

export function resolveAppearance(preference: AppearancePreference, systemScheme: "light" | "dark" | "unspecified" | null | undefined): "light" | "dark" {
  return preference === "system" ? (systemScheme === "dark" ? "dark" : "light") : preference;
}

function channelToLinear(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

/** Relative-luminance contrast ratio for six-digit hexadecimal UI colors. */
export function getColorContrastRatio(background: string, foreground: string): number {
  const luminance = (value: string) => {
    const hex = value.replace("#", "");
    if (!/^[0-9A-Fa-f]{6}$/.test(hex)) throw new Error(`Expected a six-digit hex color, received ${value}.`);
    const [red, green, blue] = [0, 2, 4].map((offset) => channelToLinear(Number.parseInt(hex.slice(offset, offset + 2), 16)));
    return red * 0.2126 + green * 0.7152 + blue * 0.0722;
  };
  const first = luminance(background);
  const second = luminance(foreground);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}
