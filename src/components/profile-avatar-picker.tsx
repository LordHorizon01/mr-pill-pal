import { Pressable, StyleSheet, Text, View } from "react-native";
import { ProfileAvatar } from "@/components/profile-avatar";
import { useAppTheme } from "@/components/app-theme-provider";
import { toggleOptionalProfileChoice } from "@/features/profiles/profile-setup.domain";

export const PROFILE_AVATAR_OPTIONS = [
  { value: "default:neutral", label: "Neutral" },
  { value: "default:male", label: "Male" },
  { value: "default:female", label: "Female" },
  ...Array.from({ length: 8 }, (_, index) => {
    const number = String(index + 1).padStart(2, "0");
    return { value: `preset:avatar-preset-${number}`, label: `Preset ${index + 1}` };
  }),
];

type Props = {
  value: string | null;
  onChange: (value: string | null) => void;
  onChoosePhoto: () => void;
  disabled?: boolean;
  title?: string;
};

export function ProfileAvatarPicker({ value, onChange, onChoosePhoto, disabled = false, title = "Profile photo" }: Props) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.root}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
      <View style={styles.previewRow}>
        <ProfileAvatar profile={value ? { avatarUrl: value } : null} size={72} />
        <Text style={[styles.previewLabel, { color: colors.textSecondary }]}>
          {value ? "Selected avatar preview" : "No avatar selected; neutral is shown as a preview"}
        </Text>
      </View>
      <View accessibilityRole="radiogroup" accessibilityLabel="Profile avatar choices" style={styles.grid}>
        {PROFILE_AVATAR_OPTIONS.map((option) => {
          const selected = value === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityLabel={`${option.label} avatar${selected ? ", selected" : ""}`}
              accessibilityState={{ checked: selected, selected, disabled }}
              disabled={disabled}
              onPress={() => onChange(toggleOptionalProfileChoice(value, option.value).value)}
              style={[
                styles.choice,
                {
                  borderColor: selected ? colors.primary : colors.borderStrong,
                  borderWidth: selected ? 2 : 1,
                  backgroundColor: selected ? colors.primarySoft : colors.surfaceSubtle,
                },
              ]}
            >
              <ProfileAvatar profile={{ avatarUrl: option.value }} size={46} />
              <Text style={[styles.choiceLabel, { color: colors.textPrimary }]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {value ? <Pressable
        accessibilityRole="button"
        accessibilityLabel={value.startsWith("default:") || value.startsWith("preset:") ? "Clear selected avatar" : "Remove selected profile photo"}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => onChange(null)}
        style={[styles.photoButton, { borderColor: colors.borderStrong, backgroundColor: colors.surfaceSubtle }]}
      ><Text style={[styles.photoButtonText, { color: colors.textPrimary }]}>{value.startsWith("default:") || value.startsWith("preset:") ? "Clear avatar" : "Remove photo"}</Text></Pressable> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Choose profile photo from device"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onChoosePhoto}
        style={({ pressed }) => [
          styles.photoButton,
          { borderColor: colors.outlineBorder, backgroundColor: colors.surfaceSubtle },
          pressed && !disabled && styles.pressed,
        ]}
      >
        <Text style={[styles.photoButtonText, { color: colors.outlineForeground }]}>Choose from device</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  title: { fontSize: 14, lineHeight: 19, fontWeight: "700" },
  previewRow: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: 12 },
  previewLabel: { flex: 1, fontSize: 13, lineHeight: 18 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "flex-start" },
  choice: { width: 66, minHeight: 78, alignItems: "center", justifyContent: "center", gap: 3, borderRadius: 12, paddingVertical: 4, paddingHorizontal: 2 },
  choiceLabel: { textAlign: "center", fontSize: 11, lineHeight: 15, fontWeight: "600", flexShrink: 1 },
  photoButton: { minHeight: 48, borderWidth: 1, borderRadius: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  photoButtonText: { textAlign: "center", fontSize: 14, lineHeight: 19, fontWeight: "700" },
  pressed: { opacity: 0.78 },
});
