export type AuthFormLayoutMetrics = {
  compact: boolean;
  backHeight: number;
  horizontalPadding: number;
  verticalPadding: number;
  illustrationWidth: number;
  illustrationHeight: number;
  cardPadding: number;
};

const COMPACT_VIEWPORT_HEIGHT = 860;

export function getAuthFormLayout(
  availableHeight: number,
  keyboardVisible: boolean,
  fontScale: number,
): AuthFormLayoutMetrics {
  const height = Math.max(0, availableHeight);
  const compact = keyboardVisible || height < COMPACT_VIEWPORT_HEIGHT || fontScale >= 1.15;
  const veryShort = height < 520;

  return {
    compact,
    backHeight: 32,
    horizontalPadding: compact ? 16 : 20,
    verticalPadding: veryShort ? 4 : compact ? 8 : 14,
    illustrationWidth: compact ? 172 : 210,
    illustrationHeight: Math.max(
      72,
      Math.min(keyboardVisible ? 94 : compact ? 118 : 158, Math.floor(height * (keyboardVisible ? 0.16 : compact ? 0.17 : 0.2))),
    ),
    cardPadding: compact ? 14 : 22,
  };
}
