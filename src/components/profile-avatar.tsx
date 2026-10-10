import { useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import type { ImageSourcePropType } from "react-native";
import { Profile } from "@/features/profiles/profile.types";
import { useAppTheme } from "@/components/app-theme-provider";

const neutralAvatar = require("../../assets/ui/shared/png/avatar-neutral.png");
const maleAvatar = require("../../assets/ui/shared/png/avatar-male.png");
const femaleAvatar = require("../../assets/ui/shared/png/avatar-female.png");
const presetAvatars: Record<string, ImageSourcePropType> = {
  "avatar-preset-01": require("../../assets/ui/shared/avatars/avatar-preset-01.png"),
  "avatar-preset-02": require("../../assets/ui/shared/avatars/avatar-preset-02.png"),
  "avatar-preset-03": require("../../assets/ui/shared/avatars/avatar-preset-03.png"),
  "avatar-preset-04": require("../../assets/ui/shared/avatars/avatar-preset-04.png"),
  "avatar-preset-05": require("../../assets/ui/shared/avatars/avatar-preset-05.png"),
  "avatar-preset-06": require("../../assets/ui/shared/avatars/avatar-preset-06.png"),
  "avatar-preset-07": require("../../assets/ui/shared/avatars/avatar-preset-07.png"),
  "avatar-preset-08": require("../../assets/ui/shared/avatars/avatar-preset-08.png"),
};

export function getProfileAvatarSource(profile: Profile | null): ImageSourcePropType {
  const value = profile?.avatarUrl?.trim();
  if (!value) return neutralAvatar;
  if (value.startsWith("preset:")) return presetAvatars[value.slice("preset:".length)] ?? neutralAvatar;
  if (value === "default:male") return maleAvatar;
  if (value === "default:female") return femaleAvatar;
  if (value === "default:neutral") return neutralAvatar;
  return { uri: value };
}

export function ProfileAvatar({ profile, size = 42 }: { profile: Profile | null; size?: number }) {
  const { colors } = useAppTheme();
  const avatarUrl = profile?.avatarUrl?.trim() ?? null;
  const uri = avatarUrl && !avatarUrl.startsWith("preset:") && !avatarUrl.startsWith("default:") ? avatarUrl : null;
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const source = uri && failedUri === uri ? neutralAvatar : getProfileAvatarSource(profile);
  return (
    <View accessible={false} style={[styles.frame, { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}>
      <Image accessibilityElementsHidden source={source} resizeMode={source === neutralAvatar ? "contain" : "cover"} style={StyleSheet.absoluteFill} onError={() => { if (uri) setFailedUri(uri); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: "hidden", borderWidth: 1, alignItems: "center", justifyContent: "center" },
});