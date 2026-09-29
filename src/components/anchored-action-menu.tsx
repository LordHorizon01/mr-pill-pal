import { useEffect, useMemo, useState } from "react";
import { LayoutChangeEvent, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { useAppTheme } from "@/components/app-theme-provider";
import { AnchoredMenuAnchor, getAnchoredMenuPlacement } from "@/components/anchored-action-menu.domain";
import { ui } from "@/components/ui-tokens";

export type AnchoredActionMenuItem = {
  id: string;
  label: string;
  accessibilityLabel: string;
  tone?: "default" | "danger";
  onPress: () => void;
};

type Props = {
  visible: boolean;
  anchor: AnchoredMenuAnchor | null;
  items: readonly AnchoredActionMenuItem[];
  accessibilityLabel: string;
  onDismiss: () => void;
};

const SCREEN_INSETS = { top: 28, right: ui.spacing.screen, bottom: 96, left: ui.spacing.screen };

export function AnchoredActionMenu({ visible, anchor, items, accessibilityLabel, onDismiss }: Props) {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const window = useWindowDimensions();
  const menuMaximumWidth = Math.max(1, window.width - SCREEN_INSETS.left - SCREEN_INSETS.right);
  const menuMinimumWidth = Math.min(192, menuMaximumWidth);
  const [menuSize, setMenuSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (!visible) setMenuSize(null);
  }, [visible]);

  const placement = useMemo(() => {
    if (!anchor || !menuSize) return null;
    return getAnchoredMenuPlacement(anchor, menuSize, window, SCREEN_INSETS);
  }, [anchor, menuSize, window]);

  function handleLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    if (!menuSize || menuSize.width !== width || menuSize.height !== height) setMenuSize({ width, height });
  }

  function select(item: AnchoredActionMenuItem) {
    onDismiss();
    item.onPress();
  }

  return (
    <Modal visible={visible && Boolean(anchor)} transparent animationType="fade" onRequestClose={onDismiss} statusBarTranslucent>
      <View style={styles.overlay}>
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.scrim]} />
        <Pressable accessibilityRole="button" accessibilityLabel={`Close ${accessibilityLabel}`} onPress={onDismiss} style={StyleSheet.absoluteFill} />
        <View
          accessibilityViewIsModal
          accessibilityLabel={accessibilityLabel}
          onLayout={handleLayout}
          style={[
            styles.menu,
            { minWidth: menuMinimumWidth, maxWidth: menuMaximumWidth },
            placement ? { left: placement.left, top: placement.top, opacity: 1 } : styles.hiddenMenu,
          ]}
        >
          {items.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={item.accessibilityLabel}
              onPress={() => select(item)}
              style={styles.action}
            >
              <Text style={item.tone === "danger" ? styles.dangerText : styles.actionText}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ReturnType<typeof useAppTheme>["colors"]) => StyleSheet.create({
  overlay: { flex: 1 },
  scrim: { backgroundColor: colors.background, opacity: 0.22 },
  menu: {
    position: "absolute",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: ui.radius.card,
    padding: 6,
    backgroundColor: colors.surfaceElevated,
    elevation: 12,
    shadowColor: colors.textPrimary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  hiddenMenu: { left: 0, top: 0, opacity: 0 },
  action: { minHeight: ui.touch.minimum, justifyContent: "center", paddingHorizontal: 14, paddingVertical: 8, borderRadius: ui.radius.button },
  actionText: { fontSize: 16, lineHeight: 22, fontWeight: "600", color: colors.textPrimary },
  dangerText: { fontSize: 16, lineHeight: 22, fontWeight: "700", color: colors.danger },
});
