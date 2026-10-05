import { Image, StyleSheet, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from "react-native";
import { ui } from "@/components/ui-tokens";

export type BrandAssetVariant = "simple" | "detailed" | "horizontal" | "compact";

const brandAssets: Record<BrandAssetVariant, { source: ImageSourcePropType; ratio: number; defaultHeight: number; label: string }> = {
  simple: {
    source: require("../../assets/brand/runtime/ui/Simplified standalone brand symbol/mpp-symbol-simple- 1024 x 1024.png"),
    ratio: 1,
    defaultHeight: 48,
    label: "Mr. Pill Pal symbol",
  },
  detailed: {
    source: require("../../assets/brand/runtime/ui/Detailed standalone brand symbol/mpp-symbol-detailed - 512 x 512.png"),
    ratio: 1,
    defaultHeight: 48,
    label: "Mr. Pill Pal detailed symbol",
  },
  horizontal: {
    source: require("../../assets/brand/runtime/ui/Primary Horizontal Logo/mpp-logo-horizontal-1200 x 400.png"),
    ratio: 3,
    defaultHeight: 56,
    label: "Mr. Pill Pal logo",
  },
  compact: {
    source: require("../../assets/brand/runtime/ui/Compact header lockup/mpp-logo-compact - 1600 x 500.png"),
    ratio: 3.2,
    defaultHeight: 48,
    label: "Mr. Pill Pal compact logo",
  },
};

export function BrandMark({
  variant = "simple",
  size,
  width,
  height,
  decorative = true,
  accessibilityLabel,
  surface = "light",
  style,
}: {
  variant?: BrandAssetVariant;
  /** Symbol size, or logo height when a lockup is selected. */
  size?: number;
  width?: number;
  height?: number;
  decorative?: boolean;
  accessibilityLabel?: string;
  /** Raster assets have a light opaque canvas; use a light tile on dark screens. */
  surface?: "light" | "dark";
  style?: StyleProp<ViewStyle>;
}) {
  const asset = brandAssets[variant];
  const resolvedHeight = height ?? size ?? asset.defaultHeight;
  const resolvedWidth = width ?? (size !== undefined && asset.ratio === 1 ? size : resolvedHeight * asset.ratio);
  const image = (
    <Image
      accessible={!decorative}
      accessibilityRole="image"
      accessibilityLabel={decorative ? undefined : accessibilityLabel ?? asset.label}
      source={asset.source}
      resizeMode="contain"
      style={{ width: resolvedWidth, height: resolvedHeight }}
    />
  );

  if (surface === "dark") {
    return <View style={[styles.darkSurfaceBacking, style]}>{image}</View>;
  }

  return <View style={style}>{image}</View>;
}

const styles = StyleSheet.create({
  darkSurfaceBacking: {
    alignSelf: "flex-start",
    padding: ui.spacing.xs,
    borderRadius: ui.radius.medium,
    backgroundColor: ui.colors.surfaceRaised,
  },
});
