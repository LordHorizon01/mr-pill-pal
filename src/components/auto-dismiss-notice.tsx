import { useEffect, useRef } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { AppColorTokens, ui } from "./ui-tokens";
import { useAppTheme } from "./app-theme-provider";
import { SUCCESS_NOTICE_DURATION_MS } from "@/features/settings/success-notice.domain";

export function AutoDismissNotice({
  message,
  onDismiss,
}: {
  message: string | null;
  onDismiss: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!message) {
      return;
    }

    const timer = setTimeout(() => onDismissRef.current(), SUCCESS_NOTICE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [message]);

  if (!message) {
    return null;
  }

  return <Pressable accessibilityRole="button" accessibilityLabel={`${message}. Dismiss message.`} accessibilityLiveRegion="polite" onPress={onDismiss} style={styles.notice}><Text style={styles.text}>{message}</Text></Pressable>;
}

const createStyles = (colors: AppColorTokens) => StyleSheet.create({
  notice: {
    marginTop: 16,
    padding: 14,
    borderRadius: ui.radius.button,
    backgroundColor: colors.badgeTakenBackground,
  },
  text: { color: colors.badgeTakenForeground, fontWeight: "700" },
});
