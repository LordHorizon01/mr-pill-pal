import { Platform, StyleSheet, type TextProps } from 'react-native';
import Animated from 'react-native-reanimated';

import { Fonts, ThemeColor } from '@/constants/theme';
import { useAppTheme, useAppThemeColorStyle } from '@/components/app-theme-provider';
import { ui } from '@/components/ui-tokens';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'small' | 'smallBold' | 'subtitle' | 'link' | 'linkPrimary' | 'code';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  const { colors } = useAppTheme();
  const colorRole = themeColor === 'textSecondary' ? 'textSecondary' : themeColor === 'background' ? 'background' : themeColor === 'backgroundElement' ? 'surface' : themeColor === 'backgroundSelected' ? 'surfaceMuted' : type === 'linkPrimary' ? 'primary' : 'textPrimary';
  const animatedColor = useAppThemeColorStyle({ color: colorRole });

  return (
    <Animated.Text
      style={[
        { color: theme[themeColor ?? 'text'] },
        type === 'default' && styles.default,
        type === 'title' && styles.title,
        type === 'small' && styles.small,
        type === 'smallBold' && styles.smallBold,
        type === 'subtitle' && styles.subtitle,
        type === 'link' && styles.link,
        type === 'linkPrimary' && styles.linkPrimary,
        type === 'code' && styles.code,
        type === 'linkPrimary' && { color: colors.primary },
        style,
        animatedColor,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  small: {
    ...ui.typography.supporting,
  },
  smallBold: {
    ...ui.typography.label,
  },
  default: {
    ...ui.typography.body,
  },
  title: {
    ...ui.typography.pageTitle,
  },
  subtitle: {
    ...ui.typography.sectionTitle,
  },
  link: {
    ...ui.typography.supporting,
    lineHeight: 30,
  },
  linkPrimary: {
    ...ui.typography.supporting,
    lineHeight: 30,
  },
  code: {
    ...ui.typography.caption,
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
  },
});
