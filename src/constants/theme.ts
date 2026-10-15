/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';
import { AppColorTokens, darkUiColors, ui } from '@/components/ui-tokens';

function legacyColors(colors: AppColorTokens) {
  return {
    text: colors.textPrimary,
    background: colors.background,
    backgroundElement: colors.surface,
    backgroundSelected: colors.surfaceMuted,
    textSecondary: colors.textSecondary,
  };
}

export const Colors = {
  // Compatibility shape for older components; palette values live in ui-tokens.
  light: legacyColors(ui.colors),
  dark: legacyColors(darkUiColors),
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  // Legacy names are kept for existing starter components; new UI should use ui.spacing.
  half: 2,
  one: ui.spacing.xxs,
  two: ui.spacing.xs,
  three: ui.spacing.md,
  four: ui.spacing.xl,
  five: ui.spacing.xxl,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
