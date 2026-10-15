import { createContext, ReactNode, useContext, useMemo } from "react";
import { useColorScheme, View } from "react-native";

import { AppearancePreference, AppColorTokens, darkUiColors, resolveAppearance, UiThemeTokens, ui } from "@/components/ui-tokens";
import { useSettingsStore } from "@/state/settings.store";

type ThemeMode = "light" | "dark";
type AppTheme = {
  preference: AppearancePreference;
  mode: ThemeMode;
  colors: AppColorTokens;
  tokens: UiThemeTokens;
};

const AppThemeContext = createContext<AppTheme>({
  preference: "system",
  mode: "light",
  colors: ui.colors,
  tokens: { ...ui, colors: ui.colors },
});

const paletteFor = (mode: ThemeMode) => mode === "dark" ? darkUiColors : ui.colors;

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const preference = useSettingsStore((state) => state.appearancePreference);
  const systemScheme = useColorScheme();
  const mode = resolveAppearance(preference, systemScheme);
  const colors = paletteFor(mode);
  const tokens = useMemo(() => ({ ...ui, colors }), [colors]);
  const value = useMemo(() => ({ preference, mode, colors, tokens }), [
    colors,
    mode,
    preference,
    tokens,
  ]);

  return <AppThemeContext.Provider value={value}>
    <View style={{ flex: 1, backgroundColor: colors.background }}>{children}</View>
  </AppThemeContext.Provider>;
}

export function useAppTheme(): AppTheme {
  return useContext(AppThemeContext);
}

/** Resolve semantic color roles from the currently selected palette. */
export function useAppThemeColorStyle(colorRoles: Record<string, keyof AppColorTokens>) {
  const { colors } = useAppTheme();
  const style: Record<string, string> = {};
  for (const property in colorRoles) style[property] = colors[colorRoles[property]];
  return style;
}
