/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { useAppTheme } from '@/components/app-theme-provider';

export function useTheme() {
  const { colors } = useAppTheme();
  return {
    text: colors.textPrimary,
    background: colors.background,
    backgroundElement: colors.surface,
    backgroundSelected: colors.surfaceMuted,
    textSecondary: colors.textSecondary,
  };
}
