import { createContext, ReactNode, useContext, useMemo } from "react";
import { useColorScheme } from "react-native";
import { AppearancePreference, AppColorTokens, darkUiColors, resolveAppearance, ui } from "@/components/ui-tokens";
import { useSettingsStore } from "@/state/settings.store";

type AppTheme = {
  preference: AppearancePreference;
  mode: "light" | "dark";
  colors: AppColorTokens;
};

const AppThemeContext = createContext<AppTheme>({ preference: "system", mode: "light", colors: ui.colors });

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const preference = useSettingsStore((state) => state.appearancePreference);
  const systemScheme = useColorScheme();
  const mode = resolveAppearance(preference, systemScheme);
  const value = useMemo(() => ({ preference, mode, colors: mode === "dark" ? darkUiColors : ui.colors }), [mode, preference]);
  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}

export function useAppTheme(): AppTheme {
  return useContext(AppThemeContext);
}
