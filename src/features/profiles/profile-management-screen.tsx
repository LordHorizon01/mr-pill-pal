import { useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ProfileBackHeader } from "@/components/app-back-header";
import { ProfileAvatarPicker } from "@/components/profile-avatar-picker";
import { AppColorTokens, getButtonColorRoles, ui } from "@/components/ui-tokens";
import { useAppTheme } from "@/components/app-theme-provider";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { buildProfileUpdateInput, getProfileDisplayName, normalizeProfileInput } from "@/features/profiles/profile.domain";
import { Profile, ProfileGender, ProfileRelationship, ProfileSetupDetails, ProfileType, ProfileReminderPreference, ProfileRelationshipKind, CreateProfileInput } from "@/features/profiles/profile.types";
import { useProfileStore } from "@/state/profile.store";
import { ThemedButton, ThemedChip } from "@/components/themed-ui";
import { ProfileCreationWizard } from "@/features/profiles/profile-creation-wizard";
import { createProfileEditDraft, getLegacyPrimaryProfileSetupDetails, relationshipForDraft } from "@/features/profiles/profile-creation.domain";
import { createPrimaryProfileId, toggleOptionalProfileChoice } from "@/features/profiles/profile-setup.domain";
import { getAccountProfileSetupProgress } from "@/features/auth/auth.service";

const relationships: ProfileRelationship[] = ["Self", "Mother", "Father", "Child", "Spouse", "Family member", "Other"];

export default function ProfileManagementScreen() {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const profiles = useProfileStore((state) => state.profiles);
  const accountUid = useProfileStore((state) => state.accountUid);
  const selected = useProfileStore((state) => state.selectedProfileId);
  const select = useProfileStore((state) => state.selectProfile);
  const create = useProfileStore((state) => state.createProfile);
  const update = useProfileStore((state) => state.updateProfile);
  const deactivate = useProfileStore((state) => state.deactivateProfile);
  const saving = useProfileStore((state) => state.isSaving);
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [relationship, setRelationship] = useState<ProfileRelationship>("Family member");
  const [adding, setAdding] = useState(mode === "add");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null | undefined>(undefined);
  const [pendingAvatarUri, setPendingAvatarUri] = useState<string | null>(null);
  const [profileSetupDetails, setProfileSetupDetails] = useState<ProfileSetupDetails>({});
  const [error, setError] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [savingForm, setSavingForm] = useState(false);
  const saveLock = useRef(false);
  const editingProfile = profiles.find((profile) => profile.id === editingId) ?? null;
  const busy = saving || savingForm;

  function resetForm() {
    setName("");
    setNickname("");
    setDateOfBirth("");
    setRelationship("Family member");
    setAdding(false);
    setEditingId(null);
    setAvatarUrl(undefined);
    setPendingAvatarUri(null);
    setProfileSetupDetails({});
    setError(null);
    setShowDatePicker(false);
  }

  function closeEditor() {
    setEditingId(null);
    setAvatarUrl(undefined);
    setPendingAvatarUri(null);
    setProfileSetupDetails({});
    setError(null);
    setShowDatePicker(false);
  }

  function hasEditChanges() {
    if (!editingProfile) return false;
    const fallbackName = editingProfile.profileSetupDetails?.systemFallbacks?.fullName === editingProfile.fullName
      ? editingProfile.fullName
      : "";
    return (name.trim() || fallbackName) !== editingProfile.fullName
      || nickname.trim() !== (editingProfile.nickname ?? "")
      || dateOfBirth !== editingProfile.dateOfBirth
      || relationship !== editingProfile.relationship
      || avatarUrl !== editingProfile.avatarUrl
      || pendingAvatarUri !== null
      || JSON.stringify(profileSetupDetails) !== JSON.stringify(editingProfile.profileSetupDetails ?? {});
  }

  function hasAddChanges() {
    return Boolean(name.trim() || nickname.trim() || dateOfBirth.trim() || relationship !== "Family member");
  }

  async function save() {
    if (busy || saveLock.current) return;
    saveLock.current = true;
    setSavingForm(true);
    try {
      setError(null);
      const current = editingProfile;
      const normalized = normalizeProfileInput({
        fullName: name.trim() || (current && profileSetupDetails.systemFallbacks?.fullName === current.fullName ? current.fullName : name),
        nickname,
        dateOfBirth,
        relationship,
        avatarUrl,
        medicalDetails: current?.medicalDetails,
        profileSetupDetails,
      });
      if (editingId && !current) throw new Error("This profile is no longer available.");
      if (!editingId || !current) throw new Error("Choose a profile to edit before saving changes.");
      {
        const committedAvatar = pendingAvatarUri
          ? await persistSelectedPhoto(pendingAvatarUri, current)
          : normalized.avatarUrl;
        await update(editingId, buildProfileUpdateInput(current, { ...normalized, avatarUrl: committedAvatar }));
        closeEditor();
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save this profile.");
    } finally {
      saveLock.current = false;
      setSavingForm(false);
    }
  }

  async function edit(profile: Profile) {
    const draft = createProfileEditDraft(profile);
    let loadError: string | null = null;
    if (!profile.profileSetupDetails && profile.id === createPrimaryProfileId(profile.accountUid)) {
      saveLock.current = true;
      setSavingForm(true);
      try {
        const progress = await getAccountProfileSetupProgress(profile.accountUid, true);
        draft.profileSetupDetails = getLegacyPrimaryProfileSetupDetails(profile, progress.draft) ?? draft.profileSetupDetails;
      } catch {
        loadError = "Older setup answers could not be loaded. Connect to the internet and reopen Edit profile to try again.";
      } finally {
        saveLock.current = false;
        setSavingForm(false);
      }
    }
    setEditingId(profile.id);
    setAdding(false);
    setName(draft.fullName);
    setNickname(draft.nickname);
    setDateOfBirth(draft.dateOfBirth);
    setRelationship(draft.relationship);
    setAvatarUrl(draft.avatarUrl ?? undefined);
    setProfileSetupDetails(draft.profileSetupDetails);
    setPendingAvatarUri(null);
    setError(loadError);
    setShowDatePicker(false);
  }

  async function saveNewProfile(input: CreateProfileInput) {
    if (busy || saveLock.current) throw new Error("A profile save is already in progress.");
    saveLock.current = true;
    setSavingForm(true);
    try {
      if (!accountUid) throw new Error("Sign in before adding a profile.");
      let avatar = input.avatarUrl;
      if (avatar && !avatar.startsWith("default:") && !avatar.startsWith("preset:")) {
        avatar = await persistNewProfilePhoto(avatar, accountUid);
      }
      await create({ ...input, avatarUrl: avatar });
      resetForm();
    } finally {
      saveLock.current = false;
      setSavingForm(false);
    }
  }

  function leaveProfiles() {
    if (busy || saveLock.current) return;
    const leave = () => {
      if (router.canGoBack()) router.back();
      else router.replace("/(tabs)/profile" as never);
    };
    if (!adding || !hasAddChanges()) {
      leave();
      return;
    }
    Alert.alert("Discard changes?", "Your profile changes have not been saved.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: leave },
    ]);
  }

  function requestCancel() {
    if (busy || saveLock.current) return;
    if (editingId) {
      if (!hasEditChanges()) {
        closeEditor();
        return;
      }
      Alert.alert("Discard changes?", "Your profile changes have not been saved.", [
        { text: "Keep editing", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: closeEditor },
      ]);
      return;
    }
    if (!hasAddChanges()) {
      resetForm();
      return;
    }
    Alert.alert("Discard profile?", "Your entered information has not been saved.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: resetForm },
    ]);
  }

  async function choosePhoto() {
    try {
      setError(null);
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.9 });
      if (result.canceled) return;
      const uri = result.assets[0]?.uri;
      if (!uri) return;
      setAvatarUrl(uri);
      setPendingAvatarUri(uri);
      setProfileSetupDetails((current) => ({ ...current, answerStates: { ...current.answerStates, avatar: "answered" } }));
    } catch {
      setError("Couldn't use that photo. Choose another image or select an avatar.");
    }
  }

  function getEditValidationError(): string | null {
    if (!editingProfile) return "This profile is no longer available.";
    if (profileSetupDetails.profileType === "care_for" && relationship === "Self") {
      return "Choose a relationship for this profile, or leave profile type unanswered.";
    }
    try {
      const fallbackName = profileSetupDetails.systemFallbacks?.fullName === editingProfile.fullName
        ? editingProfile.fullName
        : "";
      normalizeProfileInput({ fullName: name.trim() || fallbackName, nickname, dateOfBirth, relationship, avatarUrl, medicalDetails: editingProfile.medicalDetails, profileSetupDetails });
      return null;
    } catch (reason) {
      return reason instanceof Error ? reason.message : "Enter valid profile information to continue.";
    }
  }

  const dateValue = dateOfBirth ? localDateFromString(dateOfBirth) : new Date(2000, 0, 1, 12);
  const avatarChoice = profileSetupDetails.answerStates?.avatar === "unanswered" || profileSetupDetails.answerStates?.avatar === "skipped"
    ? null
    : avatarUrl ?? null;
  const editValidationError = editingId ? getEditValidationError() : null;
  if (adding) {
    return <ProfileCreationWizard
      existingNames={profiles.map((profile) => profile.fullName)}
      onCancel={resetForm}
      onSave={saveNewProfile}
    />;
  }

  return <>
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <ProfileBackHeader title="Manage Profiles" onBack={leaveProfiles} edgeAligned contentInset={8} />
      <View style={styles.pageContent}>
      <Text style={styles.subheading}>Add more profiles and switch across them</Text>
      <LocalProfileButton label="Add profile" tone="primary" accessibilityLabel="Add a profile" onPress={() => setAdding(true)} colors={colors} style={styles.addButton} />
      <Text accessibilityRole="header" style={styles.listHeading}>Existing profiles</Text>
      {profiles.filter((profile) => profile.isActive).map((profile) => (
        <View key={profile.id} style={[styles.card, selected === profile.id && styles.selected]}>
          <View style={styles.cardTop}>
            <View style={styles.copy}>
              <Text style={styles.name}>{getProfileDisplayName(profile)}</Text>
              {profile.profileSetupDetails?.systemFallbacks?.fullName === profile.fullName ? <Text style={styles.helper}>Temporary app label</Text> : null}
              <Text style={styles.meta}>{profile.relationship} · {profile.role === "SELF" ? "My profile" : "Dependent profile"}</Text>
              {selected === profile.id ? <Text style={styles.current}>Current profile</Text> : null}
            </View>
            {selected === profile.id ? null : <ThemedButton size="compact" tone="outline" label="Switch" accessibilityLabel={`Switch to ${getProfileDisplayName(profile)}`} textStyle={styles.actionText} disabled={busy} onPress={() => void select(profile.id)} />}
          </View>
          <View style={styles.cardActions}>
            <ThemedButton size="compact" tone="outline" label="Edit" accessibilityLabel={`Edit ${getProfileDisplayName(profile)}`} textStyle={styles.actionText} disabled={busy} onPress={() => edit(profile)} style={styles.cardAction} />
            <ThemedButton
              size="compact"
              tone="danger"
              label="Deactivate"
              accessibilityLabel={`Deactivate ${getProfileDisplayName(profile)}`}
              textStyle={styles.dangerActionText}
              disabled={profiles.filter((item) => item.isActive).length <= 1 || busy}
              onPress={() => Alert.alert("Deactivate profile?", `${getProfileDisplayName(profile)} will no longer receive future reminders. Existing medication and history are kept.`, [
                { text: "Cancel", style: "cancel" },
                { text: "Deactivate", style: "destructive", onPress: () => void deactivate(profile.id).catch(() => undefined) },
              ])}
              style={styles.cardAction}
            />
            <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${getProfileDisplayName(profile)} - unavailable until safe cleanup is approved`} accessibilityHint="Profile deletion is deferred because profile data cleanup is not available." accessibilityState={{ disabled: true }} disabled style={styles.deleteProfileAction}>
              <Text style={styles.deleteProfileActionText}>Delete</Text>
            </Pressable>
          </View>
        </View>
      ))}
      {profiles.every((profile) => !profile.isActive) ? <Text style={styles.emptyText}>No active profiles are available.</Text> : null}
      </View>
    </ScrollView>
    <Modal
      visible={Boolean(editingProfile)}
      transparent
      animationType={reduceMotion ? "none" : "slide"}
      statusBarTranslucent={Platform.OS === "android"}
      onRequestClose={requestCancel}
    >
      <View style={styles.modalScrim}>
        <Pressable accessible={false} disabled={busy} onPress={requestCancel} style={StyleSheet.absoluteFill} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.sheet}>
          <View accessibilityViewIsModal style={[styles.sheetInner, { paddingTop: Math.max(insets.top + 6, 14), paddingBottom: Math.max(insets.bottom, 8) }]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleGroup}>
                <Text accessibilityRole="header" style={styles.modalTitle}>Edit profile</Text>
                <Text numberOfLines={1} style={styles.modalSubtitle}>{editingProfile ? getProfileDisplayName(editingProfile) : ""}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close edit profile" accessibilityState={{ disabled: busy }} disabled={busy} onPress={requestCancel} style={[styles.closeButton, busy && styles.disabledControl]}>
                <SymbolView accessibilityElementsHidden name={{ ios: "xmark", android: "close", web: "close" }} size={22} tintColor={colors.textPrimary} />
              </Pressable>
            </View>
            <ScrollView
              style={styles.editorScroll}
              contentContainerStyle={styles.editorContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
            >
              <ProfileAvatarPicker
                value={avatarChoice}
                disabled={busy}
                onChange={(value) => {
                  setAvatarUrl(value);
                  setPendingAvatarUri(null);
                  setProfileSetupDetails((current) => ({ ...current, answerStates: { ...current.answerStates, avatar: value ? "answered" : "unanswered" } }));
                }}
                onChoosePhoto={() => void choosePhoto()}
              />
              <Text style={styles.label}>Full name *</Text>
              {profileSetupDetails.systemFallbacks?.fullName === editingProfile?.fullName && !name ? <Text style={styles.helper}>This is an app-generated profile label. Add a name here when you want to replace it.</Text> : null}
              <TextInput accessibilityLabel="Profile full name" editable={!busy} value={name} onChangeText={(value) => {
                setName(value);
                setProfileSetupDetails((current) => {
                  const { fullName: _fallback, ...systemFallbacks } = current.systemFallbacks ?? {};
                  return { ...current, systemFallbacks, answerStates: { ...current.answerStates, fullName: value.trim() ? "answered" : "unanswered" } };
                });
              }} placeholder="Full name" placeholderTextColor={colors.placeholder} autoCapitalize="words" style={styles.input} />
              <Text style={styles.label}>Nickname (optional)</Text>
              <TextInput accessibilityLabel="Profile nickname" editable={!busy} value={nickname} onChangeText={(value) => {
                setNickname(value);
                setProfileSetupDetails((current) => ({ ...current, answerStates: { ...current.answerStates, nickname: value.trim() ? "answered" : "unanswered" } }));
              }} placeholder="Nickname" placeholderTextColor={colors.placeholder} autoCapitalize="words" style={styles.input} />
              <Text style={styles.label}>Date of birth (optional)</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Date of birth: ${dateOfBirth || "not answered"}`} accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => setShowDatePicker(true)} style={styles.dateInput}>
                <Text style={dateOfBirth ? styles.dateValue : styles.datePlaceholder}>{dateOfBirth || "YYYY-MM-DD"}</Text>
                <Text style={styles.dateAction}>Choose date</Text>
              </Pressable>
              {showDatePicker ? <DateTimePicker value={dateValue} mode="date" maximumDate={new Date()} onValueChange={(_event, value) => {
                if (value) {
                  setDateOfBirth(toLocalDateString(value));
                  setProfileSetupDetails((current) => ({ ...current, answerStates: { ...current.answerStates, dateOfBirth: "answered" } }));
                }
                setShowDatePicker(false);
              }} onDismiss={() => setShowDatePicker(false)} /> : null}
              <Text style={styles.label}>Gender (optional)</Text>
              <View style={styles.chips}>
                <ThemedChip label="Not answered" selected={!profileSetupDetails.gender} disabled={busy} onPress={() => setProfileSetupDetails((current) => ({ ...current, gender: null, genderOther: null, answerStates: { ...current.answerStates, gender: "unanswered" } }))} />
                {(["woman", "man", "nonbinary", "prefer_not_to_say", "other"] as ProfileGender[]).map((value) => <ThemedChip key={value} label={value === "prefer_not_to_say" ? "Prefer not to say" : value === "nonbinary" ? "Non-binary" : value === "woman" ? "Woman" : value === "man" ? "Man" : "Other"} selected={profileSetupDetails.gender === value} disabled={busy} onPress={() => setProfileSetupDetails((current) => { const selection = toggleOptionalProfileChoice(current.gender ?? null, value); return { ...current, gender: selection.value, genderOther: selection.value === "other" ? current.genderOther : null, answerStates: { ...current.answerStates, gender: selection.status } }; })} accessibilityLabel={`Gender ${value}`} />)}
              </View>
              {profileSetupDetails.gender === "other" ? <TextInput accessibilityLabel="Gender details, optional" editable={!busy} value={profileSetupDetails.genderOther ?? ""} onChangeText={(genderOther) => setProfileSetupDetails((current) => ({ ...current, genderOther }))} placeholder="Gender details (optional)" placeholderTextColor={colors.placeholder} style={styles.input} /> : null}
              <Text style={styles.label}>Profile type (optional)</Text>
              <View style={styles.chips}>
                <ThemedChip label="Not answered" selected={!profileSetupDetails.profileType} disabled={busy} onPress={() => { setProfileSetupDetails((current) => ({ ...current, profileType: null, relationshipKind: null, relationshipOther: null, answerStates: { ...current.answerStates, profileType: "unanswered", relationship: "unanswered" } })); setRelationship("Family member"); }} />
                {([{ value: "me", label: "Me" }, { value: "care_for", label: "Someone I care for" }] as { value: ProfileType; label: string }[]).map(({ value, label }) => <ThemedChip key={value} label={label} selected={profileSetupDetails.profileType === value} disabled={busy} onPress={() => {
                  const selection = toggleOptionalProfileChoice(profileSetupDetails.profileType ?? null, value);
                  const keepRelationship = selection.value === "care_for" && profileSetupDetails.profileType === "care_for";
                  setProfileSetupDetails((current) => ({ ...current, profileType: selection.value, relationshipKind: keepRelationship ? current.relationshipKind : null, relationshipOther: keepRelationship ? current.relationshipOther : null, answerStates: { ...current.answerStates, profileType: selection.status, relationship: selection.value === "me" ? "derived" : keepRelationship ? current.answerStates?.relationship ?? "unanswered" : "unanswered" } }));
                  if (selection.value === null || selection.value === "care_for" && profileSetupDetails.profileType === "me") setRelationship("Family member");
                  else if (selection.value === "me") setRelationship("Self");
                }} />)}
              </View>
              <Text style={styles.label}>Relationship in this profile</Text>
              {profileSetupDetails.profileType === "me" ? <Text style={styles.helper}>Self, from your profile type selection.</Text> : <View style={styles.chips}>{relationships.filter((item) => profileSetupDetails.profileType !== "care_for" || item !== "Self").map((item) => <ThemedChip key={item} label={item} selected={item === relationship} disabled={busy} onPress={() => {
                setRelationship(item);
                setProfileSetupDetails((current) => ({ ...current, relationshipKind: null, relationshipOther: item === "Other" ? current.relationshipOther : null, answerStates: { ...current.answerStates, relationship: "answered" } }));
              }} accessibilityLabel={`${item} relationship${item === relationship ? ", selected" : ""}`} />)}</View>}
              {profileSetupDetails.profileType !== "me" ? <>
                <Text style={styles.label}>Relationship detail (onboarding, optional)</Text>
                <View style={styles.chips}>
                  <ThemedChip label="Not answered" selected={!profileSetupDetails.relationshipKind} disabled={busy} onPress={() => { setProfileSetupDetails((current) => ({ ...current, relationshipKind: null, relationshipOther: null, answerStates: { ...current.answerStates, relationship: "unanswered" } })); setRelationship(relationshipForDraft("care_for", null)); }} />
                  {(["parent", "partner", "child", "relative", "friend", "other"] as ProfileRelationshipKind[]).map((value) => <ThemedChip key={value} label={value[0].toUpperCase() + value.slice(1)} selected={profileSetupDetails.relationshipKind === value} disabled={busy} onPress={() => {
                    const selection = toggleOptionalProfileChoice(profileSetupDetails.relationshipKind ?? null, value);
                    setProfileSetupDetails((current) => ({ ...current, relationshipKind: selection.value, relationshipOther: selection.value === "other" ? current.relationshipOther : null, answerStates: { ...current.answerStates, relationship: selection.status } }));
                    setRelationship(selection.value ? relationshipForDraft("care_for", selection.value) : relationshipForDraft("care_for", null));
                  }} />)}
                </View>
              </> : null}
              {relationship === "Other" || profileSetupDetails.relationshipKind === "other" ? <TextInput accessibilityLabel="Relationship details, optional" editable={!busy} value={profileSetupDetails.relationshipOther ?? ""} onChangeText={(relationshipOther) => setProfileSetupDetails((current) => ({ ...current, relationshipOther }))} placeholder="Relationship details (optional)" placeholderTextColor={colors.placeholder} style={styles.input} /> : null}
              <Text style={styles.label}>Reminder preference (optional)</Text>
              <Text style={styles.helper}>Saved on this profile only; existing reminders are not changed.</Text>
              <View style={styles.chips}>
                <ThemedChip label="Not answered" selected={!profileSetupDetails.reminderPreference} disabled={busy} onPress={() => setProfileSetupDetails((current) => ({ ...current, reminderPreference: null, answerStates: { ...current.answerStates, reminderPreference: "unanswered" } }))} />
                {([{ value: "sound_vibration", label: "Sound + vibration" }, { value: "sound", label: "Sound" }, { value: "vibration", label: "Vibration" }, { value: "quiet", label: "Quiet" }] as { value: ProfileReminderPreference; label: string }[]).map(({ value, label }) => <ThemedChip key={value} label={label} selected={profileSetupDetails.reminderPreference === value} disabled={busy} onPress={() => setProfileSetupDetails((current) => { const selection = toggleOptionalProfileChoice(current.reminderPreference ?? null, value); return { ...current, reminderPreference: selection.value, answerStates: { ...current.answerStates, reminderPreference: selection.status } }; })} />)}
              </View>
              {error || editValidationError ? <Text accessibilityRole="alert" style={styles.error}>{error ?? editValidationError}</Text> : null}
            </ScrollView>
            <View style={styles.modalActions}>
              <LocalProfileButton label="Cancel" tone="outline" accessibilityLabel="Cancel profile editing" disabled={busy} onPress={requestCancel} colors={colors} style={styles.modalButton} />
              <LocalProfileButton label={busy ? "Saving..." : "Save changes"} tone="primary" accessibilityLabel="Save profile changes" disabled={busy || Boolean(editValidationError) || !hasEditChanges()} onPress={() => void save()} colors={colors} style={styles.modalButton} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  </>;
}

async function persistSelectedPhoto(uri: string, profile: Profile): Promise<string> {
  if (!FileSystem.documentDirectory) return uri;
  const directory = `${FileSystem.documentDirectory}profile-avatars/`;
  const directoryInfo = await FileSystem.getInfoAsync(directory);
  if (!directoryInfo.exists) await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const extension = uri.split(".").pop()?.split("?")[0]?.replace(/[^a-zA-Z0-9]/g, "") || "jpg";
  const target = `${directory}${encodeURIComponent(profile.accountUid)}-${encodeURIComponent(profile.id)}-edit-${Date.now()}.${extension}`;
  await FileSystem.copyAsync({ from: uri, to: target });
  return target;
}

async function persistNewProfilePhoto(uri: string, accountUid: string): Promise<string> {
  if (!FileSystem.documentDirectory) return uri;
  const directory = `${FileSystem.documentDirectory}profile-avatars/`;
  if (uri.startsWith(directory)) return uri;
  const directoryInfo = await FileSystem.getInfoAsync(directory);
  if (!directoryInfo.exists) await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const extension = uri.split(".").pop()?.split("?")[0]?.replace(/[^a-zA-Z0-9]/g, "") || "jpg";
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const target = `${directory}${encodeURIComponent(accountUid)}-new-${suffix}.${extension}`;
  await FileSystem.copyAsync({ from: uri, to: target });
  return target;
}

function toLocalDateString(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function localDateFromString(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

const createStyles = (colors: AppColorTokens) => StyleSheet.create({
  page: { flexGrow: 1, paddingTop: 0, paddingBottom: 120, backgroundColor: colors.background },
  pageContent: { paddingHorizontal: ui.spacing.screen },
  subheading: { marginTop: ui.spacing.sm, fontSize: 15, lineHeight: 21, fontWeight: "600", color: colors.textPrimary },
  addButton: { alignSelf: "center", minHeight: 48, marginTop: ui.spacing.sm, paddingHorizontal: 18, borderRadius: 11 },
  listHeading: { marginTop: ui.spacing.md, fontSize: 16, fontWeight: "700", color: colors.textPrimary },
  card: { marginTop: ui.spacing.sm, padding: 13, borderWidth: 1, borderColor: colors.border, borderTopColor: colors.borderStrong, borderRadius: ui.radius.card, backgroundColor: colors.cardBackground },
  selected: { borderColor: colors.primary, borderWidth: 2 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: ui.spacing.xs },
  copy: { flex: 1, flexShrink: 1 },
  name: { fontSize: 16, lineHeight: 21, fontWeight: "700", color: colors.cardForeground },
  meta: { marginTop: 3, fontSize: 14, lineHeight: 19, color: colors.textSecondary },
  current: { marginTop: 5, fontSize: 13, fontWeight: "700", color: colors.primary },
  cardActions: { flexDirection: "row", flexWrap: "nowrap", alignItems: "center", gap: ui.spacing.xs, marginTop: ui.spacing.xs },
  cardAction: { minHeight: 48, paddingHorizontal: 14 },
  deleteProfileAction: { minHeight: 48, minWidth: 48, alignItems: "center", justifyContent: "center", paddingHorizontal: 4, opacity: 0.58 },
  deleteProfileActionText: { fontSize: 14, lineHeight: 22, fontWeight: "700", color: colors.dangerForeground },
  actionText: { fontSize: 14, fontWeight: "700" },
  dangerActionText: { fontSize: 14, fontWeight: "700" },
  emptyText: { marginTop: ui.spacing.sm, color: colors.textSecondary, fontSize: 14 },
  label: { marginTop: 8, fontSize: 14, lineHeight: 19, fontWeight: "700", color: colors.textPrimary },
  helper: { fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  input: { minHeight: 48, paddingHorizontal: 13, borderWidth: 1, borderColor: colors.outlineBorder, borderRadius: ui.radius.button, color: colors.inputForeground, backgroundColor: colors.inputBackground },
  dateInput: { minHeight: 52, paddingHorizontal: 13, borderWidth: 1, borderColor: colors.outlineBorder, borderRadius: ui.radius.button, backgroundColor: colors.inputBackground, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  dateValue: { fontSize: 16, color: colors.inputForeground },
  datePlaceholder: { fontSize: 16, color: colors.placeholder },
  dateAction: { fontSize: 14, fontWeight: "700", color: colors.outlineForeground },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 2 },
  error: { padding: 12, borderRadius: ui.radius.button, backgroundColor: colors.dangerBackground, color: colors.dangerForeground, overflow: "hidden" },
  formActions: { flexDirection: "row", gap: 10, marginTop: 10 },
  cancelButton: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", paddingHorizontal: 12, borderRadius: ui.radius.button, borderWidth: 1, borderColor: colors.outlineBorder, backgroundColor: colors.inputBackground },
  saveButton: { backgroundColor: colors.primaryBackground, borderColor: colors.primaryBackground },
  modalScrim: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.42)" },
  sheet: { width: "100%", height: "94%", maxHeight: "94%", alignSelf: "center", overflow: "hidden", borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: colors.background },
  sheetInner: { flex: 1 },
  modalHeader: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: ui.spacing.screen, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  modalTitleGroup: { flex: 1, minWidth: 0 },
  modalTitle: { fontSize: 20, lineHeight: 25, fontWeight: "700", color: colors.textPrimary },
  modalSubtitle: { marginTop: 1, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  closeButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSubtle },
  disabledControl: { opacity: 0.55 },
  editorScroll: { flex: 1 },
  editorContent: { paddingHorizontal: ui.spacing.screen, paddingTop: 8, paddingBottom: 18, gap: 5 },
  modalActions: { flexDirection: "row", gap: 10, paddingHorizontal: ui.spacing.screen, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  modalButton: { flex: 1, minHeight: 48, marginTop: 0, paddingHorizontal: 10, borderRadius: ui.radius.button },
});

function LocalProfileButton({
  label,
  tone,
  accessibilityLabel,
  disabled = false,
  onPress,
  colors,
  style,
}: {
  label: string;
  tone: "primary" | "outline";
  accessibilityLabel: string;
  disabled?: boolean;
  onPress: () => void;
  colors: AppColorTokens;
  style?: object;
}) {
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel}
    accessibilityState={{ disabled, busy: label === "Saving..." }}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => {
      const roles = getButtonColorRoles(tone, disabled ? "disabled" : pressed ? "pressed" : "default");
      return [
        { minHeight: 48, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, borderRadius: 11, borderWidth: tone === "outline" || disabled ? 1 : 0 },
        { backgroundColor: colors[roles.background], borderColor: colors[roles.border] },
        style,
      ];
    }}
  >
    <Text style={{ color: colors[getButtonColorRoles(tone, disabled ? "disabled" : "default").foreground], textAlign: "center", fontSize: 15, lineHeight: 20, fontWeight: "700" }}>{label}</Text>
  </Pressable>;
}
