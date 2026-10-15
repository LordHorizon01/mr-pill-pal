import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, BackHandler, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import DateTimePicker, { DateTimePickerChangeEvent } from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import { AppBackHeader } from "@/components/app-back-header";
import { ProfileAvatarPicker } from "@/components/profile-avatar-picker";
import { useAppTheme } from "@/components/app-theme-provider";
import { getButtonColorRoles, ui } from "@/components/ui-tokens";
import { AdditionalProfileDraft, AdditionalProfileStep, buildAdditionalProfileInput, createBlankAdditionalProfileDraft } from "@/features/profiles/profile-creation.domain";
import { nextTemporaryProfileName, toggleOptionalProfileChoice } from "@/features/profiles/profile-setup.domain";
import { CreateProfileInput, ProfileAnswerField, ProfileGender, ProfileRelationshipKind, ProfileReminderPreference } from "@/features/profiles/profile.types";

type Props = {
  existingNames: readonly string[];
  onCancel: () => void;
  onSave: (input: CreateProfileInput) => Promise<void>;
};

const baseSteps: AdditionalProfileStep[] = ["name", "gender", "dateOfBirth", "avatar", "profileType", "relationship", "reminderPreference", "review"];
const genderChoices: { value: ProfileGender; label: string }[] = [
  { value: "woman", label: "Woman" }, { value: "man", label: "Man" }, { value: "nonbinary", label: "Non-binary" },
  { value: "prefer_not_to_say", label: "Prefer not to say" }, { value: "other", label: "Other" },
];
const relationshipChoices: { value: ProfileRelationshipKind; label: string }[] = [
  { value: "parent", label: "Parent" }, { value: "partner", label: "Partner" }, { value: "child", label: "Child" },
  { value: "relative", label: "Relative" }, { value: "friend", label: "Friend" }, { value: "other", label: "Other" },
];
const reminderChoices: { value: ProfileReminderPreference; label: string }[] = [
  { value: "sound_vibration", label: "Sound + vibration" }, { value: "sound", label: "Sound" },
  { value: "vibration", label: "Vibration" }, { value: "quiet", label: "Quiet" },
];

const stepCopy: Record<AdditionalProfileStep, { title: string; support: string }> = {
  name: { title: "Name", support: "Optional. Leave blank if you prefer; the existing profile policy will assign a temporary label when saved." },
  gender: { title: "Gender", support: "Optional. This answer is saved only to this profile and does not affect medication guidance." },
  dateOfBirth: { title: "Date of birth", support: "Optional. No date is selected unless you choose one." },
  avatar: { title: "Profile photo", support: "Optional. Choose a built-in avatar or a photo stored on this device." },
  profileType: { title: "Profile type", support: "Optional. Choose who this profile is for." },
  relationship: { title: "Relationship", support: "Optional. This step appears when the profile is for someone you care for." },
  reminderPreference: { title: "Reminder preference", support: "Optional. Saved on this profile only; it will not change existing reminder schedules." },
  review: { title: "Review profile", support: "Check the answers and any skipped or unanswered fields before saving." },
};

export function ProfileCreationWizard({ existingNames, onCancel, onSave }: Props) {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const [draft, setDraft] = useState<AdditionalProfileDraft>(createBlankAdditionalProfileDraft);
  const [step, setStep] = useState<AdditionalProfileStep>("name");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const saveLock = useRef(false);
  const steps = useMemo(() => baseSteps.filter((item) => item !== "relationship" || draft.profileType === "care_for"), [draft.profileType]);
  const stepIndex = Math.max(0, steps.indexOf(step));
  const copy = stepCopy[step];
  const hasDraftInput = Boolean(draft.fullName.trim() || draft.nickname.trim() || draft.dateOfBirth || draft.gender || draft.avatarUrl || draft.profileType || draft.relationshipKind || draft.relationshipOther.trim() || draft.reminderPreference);

  function goPrevious() {
    if (stepIndex > 0) {
      setError(null);
      setStep(steps[stepIndex - 1]);
      return;
    }
    requestCancel();
  }

  function requestCancel() {
    if (busy || saveLock.current) return;
    if (!hasDraftInput) {
      onCancel();
      return;
    }
    Alert.alert("Discard profile?", "Your answers have not been saved.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: onCancel },
    ]);
  }

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (busy) return true;
      const index = steps.indexOf(step);
      if (index > 0) {
        setError(null);
        setStep(steps[index - 1]);
      } else if (!hasDraftInput) {
        onCancel();
      } else {
        Alert.alert("Discard profile?", "Your answers have not been saved.", [
          { text: "Keep editing", style: "cancel" },
          { text: "Discard", style: "destructive", onPress: onCancel },
        ]);
      }
      return true;
    });
    return () => subscription.remove();
  }, [busy, hasDraftInput, onCancel, step, steps]);

  function next() {
    if (busy || step === "review") return;
    const nextIndex = steps.indexOf(step) + 1;
    if (nextIndex >= steps.length) return;
    setError(null);
    setStep(steps[nextIndex]);
  }

  function skipCurrent() {
    if (busy) return;
    const skippedFields: ProfileAnswerField[] = step === "name"
      ? ["fullName", "nickname"]
      : step === "gender" ? ["gender"]
        : step === "dateOfBirth" ? ["dateOfBirth"]
          : step === "avatar" ? ["avatar"]
            : step === "profileType" ? ["profileType"]
              : step === "relationship" ? ["relationship"]
                : step === "reminderPreference" ? ["reminderPreference"]
                  : [];
    setDraft((current) => ({
      ...current,
      answerStates: { ...current.answerStates, ...Object.fromEntries(skippedFields.map((field) => [field, "skipped"])) },
    }));
    next();
  }

  function isCurrentStepEmpty(): boolean {
    if (step === "name") return !draft.fullName.trim() && !draft.nickname.trim();
    if (step === "gender") return draft.gender === null;
    if (step === "dateOfBirth") return !draft.dateOfBirth;
    if (step === "avatar") return !draft.avatarUrl;
    if (step === "profileType") return draft.profileType === null;
    if (step === "relationship") return draft.relationshipKind === null && !draft.relationshipOther.trim();
    if (step === "reminderPreference") return draft.reminderPreference === null;
    return false;
  }

  async function choosePhoto() {
    try {
      setError(null);
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.9 });
      const uri = result.canceled ? null : result.assets[0]?.uri ?? null;
      if (!uri) return;
      setDraft((current) => ({ ...current, avatarUrl: uri, answerStates: { ...current.answerStates, avatar: "answered" } }));
    } catch {
      setError("Couldn't use that photo. Choose another image or select an avatar.");
    }
  }

  async function save() {
    if (busy || saveLock.current) return;
    saveLock.current = true;
    setBusy(true);
    setError(null);
    try {
      await onSave(buildAdditionalProfileInput(draft, existingNames));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save this profile.");
    } finally {
      saveLock.current = false;
      setBusy(false);
    }
  }

  const dateValue = draft.dateOfBirth ? new Date(`${draft.dateOfBirth}T12:00:00`) : new Date(2000, 0, 1, 12);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <AppBackHeader title="Add profile" onBack={goPrevious} disabled={busy} />
      <KeyboardAvoidingView style={styles.body} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.scrollContent}
        >
          <Text style={styles.progress}>Step {stepIndex + 1} of {steps.length} - {copy.title}</Text>
          <View style={styles.contentCard}>
            <Text accessibilityRole="header" style={styles.heading}>{copy.title}</Text>
            <Text style={styles.support}>{copy.support}</Text>
            {step === "name" ? <View style={styles.fields}>
              <Text style={styles.label}>Full name (optional)</Text>
              <TextInput accessibilityLabel="Profile full name, optional" editable={!busy} value={draft.fullName} onChangeText={(fullName) => setDraft((current) => ({ ...current, fullName, answerStates: { ...current.answerStates, fullName: fullName.trim() ? "answered" : "unanswered" } }))} placeholder="Enter full name" placeholderTextColor={colors.placeholder} autoCapitalize="words" returnKeyType="next" style={styles.input} />
              <Text style={styles.label}>Nickname (optional)</Text>
              <TextInput accessibilityLabel="Profile nickname, optional" editable={!busy} value={draft.nickname} onChangeText={(nickname) => setDraft((current) => ({ ...current, nickname, answerStates: { ...current.answerStates, nickname: nickname.trim() ? "answered" : "unanswered" } }))} placeholder="Enter nickname" placeholderTextColor={colors.placeholder} autoCapitalize="words" returnKeyType="done" style={styles.input} />
            </View> : null}
            {step === "gender" ? <ChoiceGrid
              selected={draft.gender}
              options={genderChoices}
              onSelect={(gender) => setDraft((current) => {
                const selection = toggleOptionalProfileChoice(current.gender, gender);
                return { ...current, gender: selection.value, genderOther: selection.value === "other" ? current.genderOther : "", answerStates: { ...current.answerStates, gender: selection.status } };
              })}
            /> : null}
            {step === "dateOfBirth" ? <View style={styles.fields}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Choose date of birth${draft.dateOfBirth ? `, ${draft.dateOfBirth}` : ", not selected"}`}
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={() => setShowDatePicker(true)}
                style={styles.dateButton}
              >
                <Text style={[styles.dateText, !draft.dateOfBirth && styles.placeholder]}>{draft.dateOfBirth || "YYYY-MM-DD"}</Text>
                <Text style={styles.dateAction}>Choose date</Text>
              </Pressable>
              {showDatePicker ? <DateTimePicker value={dateValue} mode="date" maximumDate={new Date()} onValueChange={(_event: DateTimePickerChangeEvent, value?: Date) => {
                if (value) setDraft((current) => ({ ...current, dateOfBirth: `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`, answerStates: { ...current.answerStates, dateOfBirth: "answered" } }));
                setShowDatePicker(false);
              }} onDismiss={() => setShowDatePicker(false)} /> : null}
            </View> : null}
            {step === "avatar" ? <ProfileAvatarPicker
              value={draft.avatarUrl}
              disabled={busy}
              onChange={(avatarUrl) => setDraft((current) => ({ ...current, avatarUrl, answerStates: { ...current.answerStates, avatar: avatarUrl ? "answered" : "unanswered" } }))}
              onChoosePhoto={() => void choosePhoto()}
            /> : null}
            {step === "profileType" ? <ChoiceGrid
              selected={draft.profileType}
              options={[{ value: "me", label: "Me" }, { value: "care_for", label: "Someone I care for" }]}
              onSelect={(profileType) => setDraft((current) => {
                const selection = toggleOptionalProfileChoice(current.profileType, profileType);
                const keepRelationship = selection.value === "care_for" && current.profileType === "care_for";
                return {
                  ...current,
                  profileType: selection.value,
                  relationshipKind: keepRelationship ? current.relationshipKind : null,
                  relationshipOther: keepRelationship ? current.relationshipOther : "",
                  answerStates: {
                    ...current.answerStates,
                    profileType: selection.status,
                    relationship: selection.value === "me" ? "derived" : keepRelationship ? current.answerStates.relationship : "unanswered",
                  },
                };
              })}
            /> : null}
            {step === "relationship" ? <View style={styles.fields}>
              <ChoiceGrid
                selected={draft.relationshipKind}
                options={relationshipChoices}
                onSelect={(relationshipKind) => setDraft((current) => {
                  const selection = toggleOptionalProfileChoice(current.relationshipKind, relationshipKind);
                  return { ...current, relationshipKind: selection.value, relationshipOther: selection.value === "other" ? current.relationshipOther : "", answerStates: { ...current.answerStates, relationship: selection.status } };
                })}
              />
              {draft.relationshipKind === "other" ? <TextInput accessibilityLabel="Relationship details, optional" editable={!busy} value={draft.relationshipOther} onChangeText={(relationshipOther) => setDraft((current) => ({ ...current, relationshipOther }))} placeholder="Relationship details (optional)" placeholderTextColor={colors.placeholder} style={styles.input} /> : null}
            </View> : null}
            {step === "reminderPreference" ? <View style={styles.fields}>
              <ChoiceGrid
                selected={draft.reminderPreference}
                options={reminderChoices}
                onSelect={(reminderPreference) => setDraft((current) => {
                  const selection = toggleOptionalProfileChoice(current.reminderPreference, reminderPreference);
                  return { ...current, reminderPreference: selection.value, answerStates: { ...current.answerStates, reminderPreference: selection.status } };
                })}
              />
              <Text style={styles.footnote}>This profile preference is stored separately. It does not change reminders already scheduled on this device.</Text>
            </View> : null}
            {step === "review" ? <ReviewList draft={draft} fallbackName={nextTemporaryProfileName(existingNames)} colors={colors} /> : null}
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          </View>
        </ScrollView>
        <View style={styles.footer}>
          {step === "review" ? <View style={styles.footerRow}>
            <LocalButton label="Cancel" tone="outline" disabled={busy} onPress={requestCancel} colors={colors} />
            <LocalButton label={busy ? "Saving..." : "Save profile"} tone="primary" disabled={busy} onPress={() => void save()} colors={colors} />
          </View> : <>
            <View style={styles.footerRow}>
              {stepIndex > 0 ? <LocalButton label="Back" tone="outline" disabled={busy} onPress={goPrevious} colors={colors} /> : <View style={styles.buttonSpacer} />}
              <LocalButton label="Continue" tone="primary" disabled={busy} onPress={next} colors={colors} />
            </View>
            {isCurrentStepEmpty() ? <Pressable accessibilityRole="button" accessibilityLabel="Skip this optional answer" accessibilityState={{ disabled: busy }} disabled={busy} onPress={skipCurrent} style={styles.skipButton}><Text style={styles.skipText}>Skip</Text></Pressable> : null}
          </>}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function ChoiceGrid<T extends string>({ selected, options, onSelect }: { selected: T | null; options: { value: T; label: string }[]; onSelect: (value: T) => void }) {
  const { colors } = useAppTheme();
  return <View accessibilityRole="radiogroup" style={stylesShared.grid}>
    {options.map((option) => {
      const checked = selected === option.value;
      return <Pressable
        key={option.value}
        accessibilityRole="radio"
        accessibilityLabel={option.label}
        accessibilityState={{ checked, selected: checked }}
        onPress={() => onSelect(option.value)}
        style={[stylesShared.choice, { borderColor: checked ? colors.primary : colors.borderStrong, backgroundColor: checked ? colors.primarySoft : colors.surfaceSubtle }]}
      >
        <Text style={[stylesShared.choiceLabel, { color: colors.textPrimary }]}>{option.label}</Text>
      </Pressable>;
    })}
  </View>;
}

function ReviewList({ draft, fallbackName, colors }: { draft: AdditionalProfileDraft; fallbackName: string; colors: ReturnType<typeof useAppTheme>["colors"] }) {
  const line = (field: ProfileAnswerField, value: string) => {
    const state = draft.answerStates[field];
    return state === "answered" || state === "derived" ? value : state === "skipped" ? "Skipped" : "Not answered";
  };
  const genderLabel = draft.gender === "woman" ? "Woman" : draft.gender === "man" ? "Man" : draft.gender === "nonbinary" ? "Non-binary" : draft.gender === "prefer_not_to_say" ? "Prefer not to say" : draft.gender === "other" ? `Other${draft.genderOther.trim() ? ` - ${draft.genderOther.trim()}` : ""}` : "";
  const photoLabel = draft.avatarUrl?.startsWith("preset:")
    ? `Preset ${Number(draft.avatarUrl.slice(-2))}`
    : draft.avatarUrl === "default:neutral" ? "Neutral avatar"
      : draft.avatarUrl === "default:male" ? "Male avatar"
        : draft.avatarUrl === "default:female" ? "Female avatar"
          : draft.avatarUrl ? "Photo from device" : "Neutral preview only";
  const profileTypeLabel = draft.profileType === "me" ? "Me" : draft.profileType === "care_for" ? "Someone I care for" : "";
  const relation = draft.profileType === "me"
    ? "Self (from the Me choice)"
    : draft.relationshipKind ? `${draft.relationshipKind[0].toUpperCase()}${draft.relationshipKind.slice(1)}${draft.relationshipKind === "other" && draft.relationshipOther.trim() ? ` - ${draft.relationshipOther.trim()}` : ""}`
      : `${draft.answerStates.relationship === "skipped" ? "Skipped" : "Not answered"} - saved as Family member for compatibility`;
  return <View style={stylesShared.reviewList}>
    <ReviewRow label="Full name" value={draft.fullName.trim() || `${line("fullName", "")} - app label ${fallbackName}`} colors={colors} />
    <ReviewRow label="Nickname" value={line("nickname", draft.nickname.trim())} colors={colors} />
    <ReviewRow label="Gender" value={line("gender", genderLabel)} colors={colors} />
    <ReviewRow label="Date of birth" value={line("dateOfBirth", draft.dateOfBirth)} colors={colors} />
    <ReviewRow label="Profile photo" value={line("avatar", photoLabel)} colors={colors} />
    <ReviewRow label="Profile type" value={line("profileType", profileTypeLabel)} colors={colors} />
    <ReviewRow label="Relationship" value={relation} colors={colors} />
    <ReviewRow label="Reminder preference" value={line("reminderPreference", draft.reminderPreference?.replaceAll("_", " + ") ?? "")} colors={colors} />
    <Text style={[stylesShared.reviewNote, { color: colors.textSecondary }]}>Saving this profile will not restart first-time setup or alter existing reminder schedules.</Text>
  </View>;
}

function ReviewRow({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useAppTheme>["colors"] }) {
  return <View style={[stylesShared.reviewRow, { borderBottomColor: colors.border }]}><Text style={[stylesShared.reviewLabel, { color: colors.textSecondary }]}>{label}</Text><Text style={[stylesShared.reviewValue, { color: colors.textPrimary }]}>{value || "Not answered"}</Text></View>;
}

function LocalButton({ label, tone, disabled, onPress, colors }: { label: string; tone: "primary" | "outline"; disabled: boolean; onPress: () => void; colors: ReturnType<typeof useAppTheme>["colors"] }) {
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled, busy: label === "Saving..." }}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => {
      const roles = getButtonColorRoles(tone, disabled ? "disabled" : pressed ? "pressed" : "default");
      return [stylesShared.button, { backgroundColor: colors[roles.background], borderColor: colors[roles.border] }, pressed && !disabled && stylesShared.pressed];
    }}
  >
    <Text style={[stylesShared.buttonText, { color: colors[getButtonColorRoles(tone, disabled ? "disabled" : "default").foreground] }]}>{label}</Text>
  </Pressable>;
}

const stylesShared = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: { minWidth: 84, minHeight: 48, flexGrow: 1, flexBasis: "43%", borderWidth: 1, borderRadius: 11, justifyContent: "center", paddingHorizontal: 12, paddingVertical: 8 },
  choiceLabel: { textAlign: "center", fontSize: 14, lineHeight: 19, fontWeight: "600" },
  reviewList: { gap: 0, marginTop: 8 },
  reviewRow: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth },
  reviewLabel: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  reviewValue: { flex: 1.3, textAlign: "right", fontSize: 14, lineHeight: 19 },
  reviewNote: { marginTop: 10, fontSize: 13, lineHeight: 18 },
  button: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  buttonText: { textAlign: "center", fontSize: 14, lineHeight: 19, fontWeight: "700" },
  pressed: { opacity: 0.8 },
});

const createStyles = (colors: ReturnType<typeof useAppTheme>["colors"]) => StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1 },
  scrollContent: { padding: ui.spacing.screen, gap: 8, paddingBottom: 18 },
  progress: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  contentCard: { gap: 10, padding: ui.spacing.card, borderWidth: 1, borderColor: colors.border, borderRadius: ui.radius.card, backgroundColor: colors.surfaceRaised },
  heading: { color: colors.textPrimary, fontSize: 20, lineHeight: 26, fontWeight: "700" },
  support: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  fields: { gap: 9 },
  label: { color: colors.textPrimary, fontSize: 14, lineHeight: 19, fontWeight: "700", marginTop: 4 },
  input: { minHeight: 48, paddingHorizontal: 13, borderWidth: 1, borderColor: colors.outlineBorder, borderRadius: 11, color: colors.inputForeground, backgroundColor: colors.inputBackground, fontSize: 15 },
  dateButton: { minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingHorizontal: 13, borderWidth: 1, borderColor: colors.outlineBorder, borderRadius: 11, backgroundColor: colors.inputBackground },
  dateText: { color: colors.inputForeground, fontSize: 15, lineHeight: 20 },
  dateAction: { color: colors.outlineForeground, fontSize: 14, lineHeight: 19, fontWeight: "700" },
  placeholder: { color: colors.placeholder },
  footnote: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  error: { marginTop: 8, padding: 10, borderRadius: 10, color: colors.dangerForeground, backgroundColor: colors.dangerBackground, fontSize: 13, lineHeight: 18 },
  footer: { gap: 4, padding: ui.spacing.screen, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.background },
  footerRow: { flexDirection: "row", gap: 10 },
  buttonSpacer: { flex: 1 },
  skipButton: { minHeight: 48, alignSelf: "center", alignItems: "center", justifyContent: "center", marginTop: ui.spacing.xs, paddingHorizontal: 16, borderWidth: 1, borderRadius: 11, borderColor: colors.borderStrong, backgroundColor: colors.primarySoft },
  skipText: { color: colors.primaryForeground, fontSize: 14, lineHeight: 19, fontWeight: "700" },
});
