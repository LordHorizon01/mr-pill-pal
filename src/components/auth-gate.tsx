import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, BackHandler, Image, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import Animated, { Easing, FadeIn, FadeInLeft, FadeInRight } from "react-native-reanimated";
import { Easing as PressEasing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { AuthOperation, canStartAuthOperation, isAuthOperationActive, resendCooldownLabel } from "@/features/auth/auth-ui.domain";
import { clearPendingGoogleCredential, getAccountProfileSetupProgress, GoogleLinkRequiredError, linkPendingGoogleCredentialWithPassword, resendVerificationEmail, saveAccountProfileSetupDraft, signInWithEmail, signInWithGoogle, signUpWithEmail, startAccountProfileSetup, toAuthMessage } from "@/features/auth/auth.service";
import { AccountProfileGender, AccountProfileSetupDraft, AccountProfileSetupStep, nextTemporaryProfileName } from "@/features/profiles/profile-setup.domain";
import { useAuthStore } from "@/state/auth.store";
import { useProfileStore } from "@/state/profile.store";
import { AppColorTokens, ui } from "@/components/ui-tokens";
import { useAppTheme } from "@/components/app-theme-provider";
import { AppBackHeader } from "@/components/app-back-header";
import { ProfileSetupWizard } from "@/components/profile-setup-wizard";
import { profileSetupColors } from "@/components/ui-tokens";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { ProfileSetupShell } from "@/components/profile-setup-shell";

const RESEND_COOLDOWN_SECONDS = 30;
const genderChoices: ReadonlyArray<{ value: AccountProfileGender; label: string }> = [
  { value: "woman", label: "Woman" }, { value: "man", label: "Man" }, { value: "nonbinary", label: "Non-binary" }, { value: "prefer_not_to_say", label: "Prefer not to say" }, { value: "other", label: "Other" },
];

export function AuthGate({ onReplayFirstRun }: { onReplayFirstRun: () => Promise<void> }) {
  const phase = useAuthStore((state) => state.phase);
  const user = useAuthStore((state) => state.user);
  const refreshVerification = useAuthStore((state) => state.refreshVerification);
  const leaveUnverifiedSession = useAuthStore((state) => state.leaveUnverifiedSession);
  const leaveProfileSetup = useAuthStore((state) => state.leaveProfileSetup);
  const profiles = useProfileStore((state) => state.profiles);
  const [isRegistering, setIsRegistering] = useState(false);
  const [authFormOpen, setAuthFormOpen] = useState(false);
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [confirmPassword, setConfirmPassword] = useState("");
  const [operation, setOperation] = useState<AuthOperation>(null); const [message, setMessage] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null); const [resendSeconds, setResendSeconds] = useState(0);
  const [googleLinkEmail, setGoogleLinkEmail] = useState<string | null>(null); const [isReplayingFirstRun, setIsReplayingFirstRun] = useState(false);
  const [setupStep, setSetupStep] = useState<AccountProfileSetupStep>("name"); const [name, setName] = useState(""); const [gender, setGender] = useState<AccountProfileGender | null>(null); const [genderOther, setGenderOther] = useState(""); const [setupReady, setSetupReady] = useState(false); const [transitionDirection, setTransitionDirection] = useState<"forward" | "back">("forward");
  const { mode } = useAppTheme(); const colors = useAuthColors(); const styles = createStyles(colors); const reduceMotion = useReducedMotion();
  const exitInProgress = useRef(false); const operationBusy = operation !== null; const setupBusy = operation === "profile-setup";

  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(null), 3500); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => { if (!resendSeconds) return; const timer = setInterval(() => setResendSeconds((seconds) => Math.max(0, seconds - 1)), 1000); return () => clearInterval(timer); }, [resendSeconds > 0]);
  useEffect(() => {
    if (phase !== "profile_setup_required" || !user) return;
    let current = true;
    void getAccountProfileSetupProgress(user.uid).then(async (progress) => {
      if (progress.state === "NOT_STARTED") await startAccountProfileSetup(user.uid);
      if (!current) return;
      setName(progress.draft.displayName ?? ""); setGender(progress.draft.gender); setGenderOther(progress.draft.genderOther ?? ""); setSetupStep(progress.draft.activeStep); setSetupReady(true);
    }).catch((error) => { if (current) setMessage(toAuthMessage(error, "We couldn't load your profile setup. Please try again.")); });
    return () => { current = false; };
  }, [phase, user?.uid]);
  useEffect(() => {
    if (phase !== "verification_required" && phase !== "profile_setup_required" && !(phase === "unauthenticated" && isRegistering)) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (phase === "verification_required") void leaveVerification();
      else if (phase === "profile_setup_required") requestLeaveFirstProfileSetup();
      else if (!operationBusy) { setIsRegistering(false); setMessage(null); setPassword(""); setConfirmPassword(""); }
      return true;
    });
    return () => subscription.remove();
  }, [isRegistering, operationBusy, phase]);

  async function run(next: Exclude<AuthOperation, null>, action: () => Promise<void>) {
    if (!canStartAuthOperation(operation)) return;
    setOperation(next); setMessage(null);
    try { await action(); } catch (error) {
      if (error instanceof GoogleLinkRequiredError) { setGoogleLinkEmail(error.email); setPassword(""); }
      else setMessage(toAuthMessage(error, "Something went wrong. Please try again."));
    } finally { setOperation(null); }
  }
  async function leaveVerification() {
    if (exitInProgress.current) return; exitInProgress.current = true;
    try { await run("leave-unverified-session", async () => { await leaveUnverifiedSession(); setIsRegistering(false); setPassword(""); setConfirmPassword(""); }); } finally { exitInProgress.current = false; }
  }
  async function leaveFirstProfileSetup() {
    if (exitInProgress.current) return; exitInProgress.current = true;
    try { await run("leave-profile-setup", leaveProfileSetup); } finally { exitInProgress.current = false; }
  }
  function requestLeaveFirstProfileSetup() {
    if (operationBusy) return;
    Alert.alert("Leave profile setup?", "Your saved progress will be here when you sign in again.", [{ text: "Continue setup", style: "cancel" }, { text: "Sign out", style: "destructive", onPress: () => void leaveFirstProfileSetup() }]);
  }
  async function saveSetup(next: AccountProfileSetupStep, values: Partial<AccountProfileSetupDraft> = {}) {
    if (!user || setupBusy) return;
    await run("profile-setup", async () => {
      const draft: AccountProfileSetupDraft = {
        displayName: values.displayName ?? (name.trim() || null),
        gender: values.gender === undefined ? gender : values.gender,
        genderOther: values.genderOther === undefined ? (gender === "other" ? genderOther.trim() || null : null) : values.genderOther,
        dateOfBirth: null, avatarUri: null, avatarPreset: null, profileType: null, relationship: null, relationshipOther: null, reminderPreference: null,
        activeStep: next,
      };
      await saveAccountProfileSetupDraft(user.uid, draft);
      setName(draft.displayName ?? ""); setGender(draft.gender); setGenderOther(draft.genderOther ?? "");
      if (next !== setupStep) { setTransitionDirection(next === "gender" ? "forward" : "back"); setSetupStep(next); }
    });
  }
  function continueName() { void saveSetup("gender", { displayName: name.trim() || nextTemporaryProfileName(profiles.map((profile) => profile.fullName)) }); }
  function skipName() { void saveSetup("gender", { displayName: nextTemporaryProfileName(profiles.map((profile) => profile.fullName)) }); }
  function continueGender() { if (gender === "other" && !genderOther.trim()) { setMessage("Tell us how you describe your gender, or choose another option."); return; } void saveSetup("gender").then(() => setNotice("Saved. More profile questions will be added in the next setup step.")); }
  function skipGender() { void saveSetup("gender", { gender: null, genderOther: null }).then(() => setNotice("Skipped for now. You can change this in a later setup step.")); }
  function requestFirstRunReplay() { Alert.alert("Replay introduction for QA?", "This resets only the introduction and notification-primer choices. Your account and medication data stay on this device.", [{ text: "Cancel", style: "cancel" }, { text: "Reset and replay", onPress: () => { setIsReplayingFirstRun(true); void onReplayFirstRun().catch(() => Alert.alert("Could not reset introduction", "Please try again.")).finally(() => setIsReplayingFirstRun(false)); } }]); }

  if (phase === "configuration_required") return <Gate><Text style={styles.title}>Firebase setup is needed</Text><Text style={styles.body}>This development build needs the Firebase Android configuration before sign-in can be used. Follow FIREBASE_SETUP.md, then rebuild the Android development app.</Text></Gate>;
  if (phase === "verification_required") return <Gate><AppBackHeader title="Verify your email" onBack={() => void leaveVerification()} disabled={operationBusy} /><Text style={styles.body}>We sent a verification link to {user?.email ?? "your email"}. Open the link, then return here.</Text>{message ? <Message text={message} /> : null}{notice ? <Text style={styles.notice}>{notice}</Text> : null}<Action label="I've verified my email" loadingLabel="Checking..." active={isAuthOperationActive(operation, "verify-email-refresh")} disabled={operationBusy} onPress={() => void run("verify-email-refresh", async () => { const verified = await refreshVerification(); if (!verified) setMessage("Your email is not verified yet. Open the verification link, then try again."); })} /><Action secondary label={resendCooldownLabel(resendSeconds)} loadingLabel="Sending..." active={isAuthOperationActive(operation, "resend-email")} disabled={operationBusy || resendSeconds > 0} onPress={() => void run("resend-email", async () => { await resendVerificationEmail(); setResendSeconds(RESEND_COOLDOWN_SECONDS); setNotice("Verification email sent."); })} /><TextButton label="Use a different email" disabled={operationBusy} onPress={() => void leaveVerification()} /></Gate>;
  if (phase === "profile_setup_required") return <ProfileSetupWizard onExit={() => void leaveProfileSetup()} />;
  if (googleLinkEmail) return <Gate><AppBackHeader title="Link your Google sign-in" onBack={() => { if (!operationBusy) { clearPendingGoogleCredential(); setGoogleLinkEmail(null); setPassword(""); } }} disabled={operationBusy} /><Text style={styles.body}>This Google email already belongs to an email-and-password account. Confirm its password to add Google sign-in to the same account.</Text><Field label="Email" value={googleLinkEmail} editable={false} selectTextOnFocus={false} /><Field label="Password" value={password} onChangeText={setPassword} placeholder="Your existing account password" secureTextEntry />{message ? <Message text={message} /> : null}<Action label="Continue with password" loadingLabel="Linking..." active={isAuthOperationActive(operation, "google-link")} disabled={operationBusy} onPress={() => void run("google-link", () => linkPendingGoogleCredentialWithPassword(googleLinkEmail, password))} /><TextButton label="Cancel" disabled={operationBusy} onPress={() => { clearPendingGoogleCredential(); setGoogleLinkEmail(null); setPassword(""); setMessage(null); }} /></Gate>;
  if (!authFormOpen) return <AuthLanding busy={operationBusy} googleBusy={isAuthOperationActive(operation,"google")} onGoogle={() => void run("google",async()=>{await signInWithGoogle();})} onEmail={() => { setIsRegistering(true); setAuthFormOpen(true); setMessage(null); }} onSignIn={() => { setIsRegistering(false); setAuthFormOpen(true); setMessage(null); }} />;
  return <AuthFormLayout title={isRegistering ? "Create your account" : "Sign in"} onBack={() => { if (!operationBusy) { setAuthFormOpen(false); setMessage(null); setPassword(""); setConfirmPassword(""); } }}>
    <View style={[authStyles.formSurface,{backgroundColor:profileSetupColors[mode].surface,borderColor:profileSetupColors[mode].border}]}>
      <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" />
      <Field label="Password" value={password} onChangeText={setPassword} placeholder="At least 8 characters" secureTextEntry />
      {isRegistering ? <Field label="Confirm password" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Repeat password" secureTextEntry /> : null}
      {message ? <Message text={message} /> : null}
      <Action label={isRegistering ? "Create account" : "Sign in"} loadingLabel={isRegistering ? "Creating account..." : "Signing in..."} active={isRegistering ? isAuthOperationActive(operation, "email-signup") : isAuthOperationActive(operation, "email-login")} disabled={operationBusy} onPress={() => void run(isRegistering ? "email-signup" : "email-login", () => isRegistering ? signUpWithEmail(email, password, confirmPassword) : signInWithEmail(email, password))} />
      <TextButton label={isRegistering ? "Already have an account? Sign in" : "Create a new account"} disabled={operationBusy} onPress={() => { setIsRegistering(!isRegistering); setMessage(null); }} />
      {__DEV__ && phase === "unauthenticated" && !isRegistering ? <TextButton label={isReplayingFirstRun ? "Resetting introduction..." : "Replay introduction (development)"} disabled={isReplayingFirstRun} onPress={requestFirstRunReplay} /> : null}
    </View>
    <Action secondary label="Continue with Google" loadingLabel="Connecting..." active={isAuthOperationActive(operation, "google")} disabled={operationBusy} onPress={() => void run("google", async () => { await signInWithGoogle(); })} />
  </AuthFormLayout>;
}

const entryHero = require("../../assets/ui/screens/auth-entry/png/auth-entry-hero.png");
function AuthLanding({ busy, googleBusy, onGoogle, onEmail, onSignIn }: { busy:boolean;googleBusy:boolean;onGoogle:()=>void;onEmail:()=>void;onSignIn:()=>void }) {
  const {mode}=useAppTheme(); const c=profileSetupColors[mode]; const {height}=useWindowDimensions();
  return <SafeAreaView style={[authStyles.page,{backgroundColor:c.canvas}]}><ScrollView contentContainerStyle={authStyles.landing}>
    <Text style={[authStyles.kicker,{color:c.textSecondary}]}>Start your journey with</Text><Text accessibilityRole="header" style={[authStyles.brand,{color:c.primary}]}>Mr. Pill Pal</Text>
    <Image source={entryHero} resizeMode="contain" accessible={false} style={{width:"100%",maxWidth:310,aspectRatio:4/3,maxHeight:Math.min(height*.34,235),marginTop:12}}/>
    <View style={authStyles.landingActions}>
      <Action label="Continue with Google" loadingLabel="Connecting..." active={googleBusy} disabled={busy} secondary onPress={onGoogle} />
      <Action label="Continue with email" loadingLabel="Opening..." active={false} disabled={busy} onPress={onEmail} />
    </View>
    <Pressable accessibilityRole="button" disabled={busy} onPress={onSignIn} style={authStyles.signin}><Text style={[authStyles.signinText,{color:c.textSecondary}]}>Already have an account? <Text style={{color:c.primary,fontWeight:"700"}}>Sign in</Text></Text></Pressable>
    <Text style={[authStyles.quiet,{color:c.textMuted}]}>Private by design  •  Core features work offline</Text>
  </ScrollView></SafeAreaView>;
}
function AuthFormLayout({title,onBack,children}:{title:string;onBack:()=>void;children:React.ReactNode}) {
  const {mode}=useAppTheme(); const c=profileSetupColors[mode]; const {height}=useWindowDimensions(); const [keyboard,setKeyboard]=useState(false);
  useEffect(()=>{const a=Keyboard.addListener(Platform.OS==="ios"?"keyboardWillShow":"keyboardDidShow",()=>setKeyboard(true));const b=Keyboard.addListener(Platform.OS==="ios"?"keyboardWillHide":"keyboardDidHide",()=>setKeyboard(false));return()=>{a.remove();b.remove();};},[]);
  return <SafeAreaView style={[authStyles.page,{backgroundColor:c.canvas}]}><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==="ios"?"padding":undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={authStyles.formScroll}><Pressable accessibilityRole="button" accessibilityLabel="Back to authentication choices" onPress={onBack} style={authStyles.back}><Text style={{color:c.primary,fontWeight:"700"}}>Back</Text></Pressable><Text style={[authStyles.kicker,{color:c.textSecondary}]}>Start your journey with</Text><Text accessibilityRole="header" style={[authStyles.brand,{color:c.primary}]}>Mr. Pill Pal</Text><Image source={entryHero} resizeMode="contain" accessible={false} style={{alignSelf:"center",width:"100%",maxWidth:keyboard?180:210,aspectRatio:4/3,maxHeight:Math.min(height*(keyboard?.17:.23),keyboard?135:160),marginTop:7}}/><Text accessibilityRole="header" style={[authStyles.formTitle,{color:c.text}]}>{title}</Text>{children}</ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
const authStyles=StyleSheet.create({page:{flex:1},landing:{flexGrow:1,justifyContent:"center",alignItems:"center",paddingHorizontal:24,paddingVertical:24},landingActions:{width:"100%",maxWidth:420,gap:0,marginTop:12},kicker:{fontSize:19,fontWeight:"600",textAlign:"center"},brand:{fontSize:32,lineHeight:40,fontWeight:"800",textAlign:"center",marginTop:2},primary:{width:"100%",maxWidth:420,minHeight:54,borderRadius:16,alignItems:"center",justifyContent:"center",marginTop:12},primaryText:{fontSize:16,fontWeight:"700"},secondary:{width:"100%",maxWidth:420,minHeight:54,borderRadius:16,borderWidth:1,alignItems:"center",justifyContent:"center",marginTop:10},secondaryText:{fontSize:16,fontWeight:"700"},signin:{minHeight:48,justifyContent:"center",marginTop:4},signinText:{fontSize:14},quiet:{fontSize:12,marginTop:10},formScroll:{flexGrow:1,justifyContent:"center",paddingHorizontal:20,paddingVertical:14},back:{minHeight:44,justifyContent:"center",alignSelf:"flex-start"},formTitle:{fontSize:22,lineHeight:28,fontWeight:"700",textAlign:"center",marginTop:4,marginBottom:8},formSurface:{padding:22,borderRadius:20,borderWidth:1,gap:2}});

function ProfileSetupScreen({ ready, step, name, gender, genderOther, message, notice, busy, direction, reduceMotion, onNameChange, onGenderChange, onOtherChange, onContinueName, onSkipName, onContinueGender, onSkipGender, onBack }: { ready: boolean; step: AccountProfileSetupStep; name: string; gender: AccountProfileGender | null; genderOther: string; message: string | null; notice: string | null; busy: boolean; direction: "forward" | "back"; reduceMotion: boolean; onNameChange: (value: string) => void; onGenderChange: (value: AccountProfileGender) => void; onOtherChange: (value: string) => void; onContinueName: () => void; onSkipName: () => void; onContinueGender: () => void; onSkipGender: () => void; onBack: () => void; }) {
  const { colors } = useAppTheme(); const styles = createStyles(colors);
  const entering = useMemo(() => reduceMotion ? FadeIn.duration(160) : (direction === "forward" ? FadeInRight : FadeInLeft).duration(320).withInitialValues({ transform: [{ translateX: direction === "forward" ? 10 : -10 }] }).easing(Easing.bezier(0.2, 0, 0, 1)), [direction, reduceMotion]);
  if (!ready) return <SafeAreaView style={[styles.loadingPage, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.primary} /><Text style={styles.loadingText}>Preparing your profile setup...</Text></SafeAreaView>;
  const isName = step === "name";
  return <ProfileSetupShell step={isName ? 1 : 2} totalSteps={2} onBack={onBack} onSkip={isName ? onSkipName : onSkipGender} backDisabled={busy} skipDisabled={busy} visual={<SetupVisual step={step} />}><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.setupBody}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.setupScroll}><Animated.View key={step} entering={entering} style={styles.question}>
    {isName ? <><Text style={styles.eyebrow}>YOUR PROFILE</Text><Text style={styles.setupTitle}>What should we call you?</Text><Text style={styles.setupBodyText}>This helps us make your reminders and daily plan feel personal.</Text><Field label="Your name" value={name} onChangeText={onNameChange} placeholder="For example, Asha Sharma" autoCapitalize="words" /></> : <><Text style={styles.eyebrow}>ABOUT YOU</Text><Text style={styles.setupTitle}>How do you describe your gender?</Text><Text style={styles.setupBodyText}>Optional. This will not change your medication guidance.</Text><View style={styles.genderGrid}>{genderChoices.map((choice) => <Pressable key={choice.value} accessibilityRole="radio" accessibilityLabel={choice.label} accessibilityState={{ checked: gender === choice.value, disabled: busy }} disabled={busy} onPress={() => onGenderChange(choice.value)} style={[styles.genderChoice, { backgroundColor: gender === choice.value ? colors.secondaryBackground : colors.cardBackground, borderColor: gender === choice.value ? colors.primary : colors.borderStrong }]}><Text style={[styles.genderChoiceText, { color: colors.textPrimary }]}>{choice.label}</Text>{gender === choice.value ? <Text style={[styles.checkmark, { color: colors.primary }]}>✓</Text> : null}</Pressable>)}</View>{gender === "other" ? <Field label="Tell us in your own words" value={genderOther} onChangeText={onOtherChange} placeholder="Your description" autoCapitalize="sentences" /> : null}</>}
    {message ? <Message text={message} /> : null}{notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}
  </Animated.View></ScrollView><Action label={isName ? "Continue" : "Save and continue"} loadingLabel="Saving..." active={busy} disabled={busy} onPress={isName ? onContinueName : onContinueGender} /></KeyboardAvoidingView></ProfileSetupShell>;
}

function SetupVisual({ step }: { step: AccountProfileSetupStep }) { const { colors } = useAppTheme(); return <View accessible accessibilityRole="image" accessibilityLabel={step === "name" ? "A profile card waiting for your name" : "A profile card showing a few ways to describe yourself"} style={[setupVisualStyles.frame, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}><View style={[setupVisualStyles.avatar, { backgroundColor: colors.accent }]} /><View style={setupVisualStyles.lines}><View style={[setupVisualStyles.line, { backgroundColor: colors.primary, width: step === "name" ? "54%" : "72%" }]} /><View style={[setupVisualStyles.line, { backgroundColor: colors.borderStrong, width: "88%" }]} /></View><View style={[setupVisualStyles.badge, { backgroundColor: colors.successSurface }]}><Text style={[setupVisualStyles.badgeText, { color: colors.success }]}>{step === "name" ? "Profile" : "Optional"}</Text></View></View>; }
const setupVisualStyles = StyleSheet.create({ frame: { alignSelf: "center", width: "100%", maxWidth: 280, minHeight: 110, padding: ui.spacing.md, borderRadius: ui.radius.card, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: 12 }, avatar: { width: 52, height: 52, borderRadius: 26 }, lines: { flex: 1, gap: 8 }, line: { height: 8, borderRadius: 999 }, badge: { position: "absolute", right: 12, bottom: 10, paddingHorizontal: 9, paddingVertical: 4, borderRadius: ui.radius.pill }, badgeText: { fontSize: 11, fontWeight: "800" } });

function useAuthColors(): AppColorTokens {
  const { mode, colors: appColors } = useAppTheme();
  const c = profileSetupColors[mode];
  return useMemo(() => ({ ...appColors,
    background:c.canvas, backgroundSubtle:c.surfaceSubtle, surface:c.surface, surfaceRaised:c.surfaceElevated, surfaceMuted:c.surfaceSubtle,
    primary:c.primary, primaryPressed:c.primaryStrong, onPrimary:c.onPrimary, accent:c.accent, support:c.sage,
    textPrimary:c.textPrimary, textSecondary:c.textSecondary, textMuted:c.textMuted, textInverse:c.onPrimary,
    border:c.border, borderStrong:c.borderStrong, divider:c.border, focus:c.primary,
    success:c.success, warning:c.warning, danger:c.danger, placeholder:c.textSecondary,
    disabledBackground:c.surfaceSubtle, disabledText:c.textMuted, inputBackground:c.surfaceSubtle, inputForeground:c.textPrimary,
    secondaryBackground:c.surfaceMint, secondaryForeground:c.primaryStrong, selectedBackground:c.primary, selectedForeground:c.onPrimary,
    cardBackground:c.surface, cardForeground:c.textPrimary, dangerBackground:c.dangerSurface, dangerForeground:c.danger,
    successSurface:c.successSurface, warningSurface:c.warningSurface, dangerSurface:c.dangerSurface,
    badgeTakenBackground:c.successSurface, badgeTakenForeground:c.success, outlineBorder:c.borderStrong, outlineForeground:c.primary,
    primaryBackground:c.primary, primaryForeground:c.onPrimary,
  }), [appColors, c]);
}

function Gate({ children }: { children: React.ReactNode }) { const colors=useAuthColors(); const styles = createStyles(colors); return <SafeAreaView edges={["top", "bottom"]} style={styles.page}><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.page}><ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled"><View style={styles.card}>{children}</View></ScrollView></KeyboardAvoidingView></SafeAreaView>; }
function Field({ label, onFocus, onBlur, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) { const colors=useAuthColors(); const styles = createStyles(colors); const [focused,setFocused]=useState(false); return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} style={[styles.input,focused&&{borderColor:colors.focus,borderWidth:1.5}]} placeholderTextColor={colors.placeholder} autoCapitalize="none" onFocus={(event)=>{setFocused(true);onFocus?.(event);}} onBlur={(event)=>{setFocused(false);onBlur?.(event);}} {...props} /></View>; }
function Message({ text }: { text: string }) { const colors=useAuthColors(); return <Text accessibilityRole="alert" style={createStyles(colors).error}>{text}</Text>; }
function TextButton({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) { const colors=useAuthColors(); const styles = createStyles(colors); return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={styles.switch}><Text style={styles.switchText}>{label}</Text></Pressable>; }
function Action({ label, loadingLabel, active, disabled, secondary, onPress }: { label: string; loadingLabel: string; active: boolean; disabled: boolean; secondary?: boolean; onPress: () => void }) { const colors=useAuthColors(); const styles = createStyles(colors); const pressed=useSharedValue(0); const pressStyle=useAnimatedStyle(()=>({opacity:1-pressed.value*.08,transform:[{scale:1-pressed.value*.008}]})); return <Animated.View style={pressStyle}><Pressable accessibilityRole="button" accessibilityState={{ busy: active, disabled }} disabled={disabled} onPressIn={()=>{pressed.value=withTiming(1,{duration:120,easing:PressEasing.bezier(.2,0,0,1)});}} onPressOut={()=>{pressed.value=withTiming(0,{duration:120,easing:PressEasing.bezier(.2,0,0,1)});}} onPress={onPress} style={[styles.action,secondary&&styles.secondary,{backgroundColor:secondary?colors.cardBackground:colors.primary,borderColor:colors.border,borderRadius:16,minHeight:54},disabled&&styles.disabled]}>{active?<><ActivityIndicator color={secondary?colors.primary:colors.primaryForeground}/><Text style={secondary?styles.secondaryText:styles.actionText}>{loadingLabel}</Text></>:<Text style={secondary?styles.secondaryText:styles.actionText}>{label}</Text>}</Pressable></Animated.View>; }
const createStyles = (colors: AppColorTokens) => StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background }, scrollContent: { flexGrow: 1, justifyContent: "center", padding: ui.spacing.screen }, card: { width: "100%", maxWidth: 480, alignSelf: "center", padding: ui.spacing.card, borderRadius: ui.radius.card, backgroundColor: colors.cardBackground, borderWidth: 1, borderColor: colors.border, borderTopColor: colors.borderStrong },
  brand: { fontSize: 19, fontWeight: "800", color: colors.primary }, title: { marginTop: 8, fontSize: 27, lineHeight: 35, fontWeight: "800", color: colors.cardForeground, flexShrink: 1 }, body: { marginTop: 16, fontSize: 16, lineHeight: 23, color: colors.textSecondary }, field: { marginTop: 16 }, label: { fontSize: 15, fontWeight: "700", color: colors.textPrimary }, input: { minHeight: 48, marginTop: 6, paddingHorizontal: 13, borderRadius: ui.radius.button, borderWidth: 1, borderColor: colors.outlineBorder, fontSize: 16, color: colors.inputForeground, backgroundColor: colors.inputBackground },
  action: { minHeight: 48, flexDirection: "row", gap: 9, justifyContent: "center", alignItems: "center", marginTop: 16, paddingHorizontal: 16, borderRadius: ui.radius.button, backgroundColor: colors.primaryBackground }, actionText: { fontSize: 16, fontWeight: "800", color: colors.primaryForeground }, secondary: { backgroundColor: colors.inputBackground, borderWidth: 1, borderColor: colors.outlineBorder }, secondaryText: { fontSize: 16, fontWeight: "800", color: colors.outlineForeground }, disabled: { opacity: .55 }, switch: { minHeight: 44, justifyContent: "center", alignItems: "center", marginTop: 12 }, switchText: { fontSize: 15, fontWeight: "700", color: colors.outlineForeground }, error: { marginTop: 14, padding: 12, borderRadius: ui.radius.button, backgroundColor: colors.dangerBackground, color: colors.dangerForeground, fontSize: 15, lineHeight: 21 }, notice: { marginTop: 14, padding: 12, borderRadius: ui.radius.button, backgroundColor: colors.badgeTakenBackground, color: colors.badgeTakenForeground, fontSize: 15, fontWeight: "700" },
  loadingPage: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }, loadingText: { fontSize: 15, color: colors.textSecondary }, setupBody: { flex: 1 }, setupScroll: { flexGrow: 1, justifyContent: "center", paddingBottom: ui.spacing.md }, question: { flex: 1, justifyContent: "center" }, eyebrow: { fontSize: 12, lineHeight: 18, fontWeight: "800", letterSpacing: 1, color: colors.primary }, setupTitle: { marginTop: 8, fontSize: 29, lineHeight: 37, fontWeight: "800", color: colors.textPrimary }, setupBodyText: { marginTop: 8, fontSize: 16, lineHeight: 23, color: colors.textSecondary }, genderGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: ui.spacing.lg }, genderChoice: { minHeight: 52, width: "47%", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 13, borderWidth: 1, borderRadius: ui.radius.medium }, genderChoiceText: { fontSize: 15, fontWeight: "700" }, checkmark: { fontSize: 17, fontWeight: "900" },
});
