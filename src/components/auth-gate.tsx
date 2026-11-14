import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, BackHandler, Image, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import Animated, { Easing as PressEasing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { SymbolView } from "expo-symbols";
import { AuthOperation, canStartAuthOperation, isAuthOperationActive, resendCooldownLabel } from "@/features/auth/auth-ui.domain";
import { clearPendingGoogleCredential, GoogleLinkRequiredError, linkPendingGoogleCredentialWithPassword, resendVerificationEmail, signInWithEmail, signInWithGoogle, signUpWithEmail, toAuthMessage } from "@/features/auth/auth.service";
import { useAuthStore } from "@/state/auth.store";
import { AppColorTokens, profileSetupColors, ui } from "@/components/ui-tokens";
import { useAppTheme } from "@/components/app-theme-provider";
import { AppBackHeader } from "@/components/app-back-header";
import { ProfileSetupWizard } from "@/components/profile-setup-wizard";
import { getAuthFormLayout } from "@/features/auth/auth-form-layout.domain";

const RESEND_COOLDOWN_SECONDS = 30;
export function AuthGate({ onReplayFirstRun }: { onReplayFirstRun: () => Promise<void> }) {
  const phase = useAuthStore((state) => state.phase);
  const user = useAuthStore((state) => state.user);
  const refreshVerification = useAuthStore((state) => state.refreshVerification);
  const leaveUnverifiedSession = useAuthStore((state) => state.leaveUnverifiedSession);
  const leaveProfileSetup = useAuthStore((state) => state.leaveProfileSetup);
  const [isRegistering, setIsRegistering] = useState(false);
  const [authFormOpen, setAuthFormOpen] = useState(false);
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [confirmPassword, setConfirmPassword] = useState("");
  const [operation, setOperation] = useState<AuthOperation>(null); const [message, setMessage] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null); const [resendSeconds, setResendSeconds] = useState(0);
  const [googleLinkEmail, setGoogleLinkEmail] = useState<string | null>(null); const [isReplayingFirstRun, setIsReplayingFirstRun] = useState(false);
  const { mode } = useAppTheme(); const colors = useAuthColors(); const styles = createStyles(colors);
  const { height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const authFormLayout = getAuthFormLayout(height - insets.top - insets.bottom, false, fontScale);
  const exitInProgress = useRef(false); const operationBusy = operation !== null;

  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(null), 3500); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => { if (resendSeconds <= 0) return; const timer = setInterval(() => setResendSeconds((seconds) => Math.max(0, seconds - 1)), 1000); return () => clearInterval(timer); }, [resendSeconds]);

  const run = useCallback(async (next: Exclude<AuthOperation, null>, action: () => Promise<void>) => {
    if (!canStartAuthOperation(operation)) return;
    setOperation(next); setMessage(null);
    try { await action(); } catch (error) {
      if (error instanceof GoogleLinkRequiredError) { setGoogleLinkEmail(error.email); setPassword(""); }
      else setMessage(toAuthMessage(error, "Something went wrong. Please try again."));
    } finally { setOperation(null); }
  }, [operation]);
  const leaveVerification = useCallback(async () => {
    if (exitInProgress.current) return; exitInProgress.current = true;
    try { await run("leave-unverified-session", async () => { await leaveUnverifiedSession(); setIsRegistering(false); setPassword(""); setConfirmPassword(""); }); } finally { exitInProgress.current = false; }
  }, [leaveUnverifiedSession, run]);
  const leaveFirstProfileSetup = useCallback(async () => {
    if (exitInProgress.current) return; exitInProgress.current = true;
    try { await run("leave-profile-setup", leaveProfileSetup); } finally { exitInProgress.current = false; }
  }, [leaveProfileSetup, run]);
  const requestLeaveFirstProfileSetup = useCallback(() => {
    if (operationBusy) return;
    Alert.alert("Leave profile setup?", "Your saved progress will be here when you sign in again.", [{ text: "Continue setup", style: "cancel" }, { text: "Sign out", style: "destructive", onPress: () => void leaveFirstProfileSetup() }]);
  }, [leaveFirstProfileSetup, operationBusy]);

  useEffect(() => {
    if (phase !== "verification_required" && phase !== "profile_setup_required" && !(phase === "unauthenticated" && isRegistering)) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (phase === "verification_required") void leaveVerification();
      else if (phase === "profile_setup_required") requestLeaveFirstProfileSetup();
      else if (!operationBusy) { setIsRegistering(false); setMessage(null); setPassword(""); setConfirmPassword(""); }
      return true;
    });
    return () => subscription.remove();
  }, [isRegistering, leaveVerification, operationBusy, phase, requestLeaveFirstProfileSetup]);
  function requestFirstRunReplay() { Alert.alert("Replay introduction for QA?", "This resets only the introduction and notification-primer choices. Your account and medication data stay on this device.", [{ text: "Cancel", style: "cancel" }, { text: "Reset and replay", onPress: () => { setIsReplayingFirstRun(true); void onReplayFirstRun().catch(() => Alert.alert("Could not reset introduction", "Please try again.")).finally(() => setIsReplayingFirstRun(false)); } }]); }

  if (phase === "configuration_required") return <Gate><Text style={styles.title}>Firebase setup is needed</Text><Text style={styles.body}>This development build needs the Firebase Android configuration before sign-in can be used. Follow FIREBASE_SETUP.md, then rebuild the Android development app.</Text></Gate>;
  if (phase === "verification_required") return <Gate><AppBackHeader title="Verify your email" onBack={() => void leaveVerification()} disabled={operationBusy} /><Text style={styles.body}>We sent a verification link to {user?.email ?? "your email"}. Open the link, then return here.</Text>{message ? <Message text={message} /> : null}{notice ? <Text style={styles.notice}>{notice}</Text> : null}<Action label="I've verified my email" loadingLabel="Checking..." active={isAuthOperationActive(operation, "verify-email-refresh")} disabled={operationBusy} onPress={() => void run("verify-email-refresh", async () => { const verified = await refreshVerification(); if (!verified) setMessage("Your email is not verified yet. Open the verification link, then try again."); })} /><Action secondary label={resendCooldownLabel(resendSeconds)} loadingLabel="Sending..." active={isAuthOperationActive(operation, "resend-email")} disabled={operationBusy || resendSeconds > 0} onPress={() => void run("resend-email", async () => { await resendVerificationEmail(); setResendSeconds(RESEND_COOLDOWN_SECONDS); setNotice("Verification email sent."); })} /><TextButton label="Use a different email" disabled={operationBusy} onPress={() => void leaveVerification()} /></Gate>;
  if (phase === "profile_setup_required") return <ProfileSetupWizard onExit={() => void leaveProfileSetup()} />;
  if (googleLinkEmail) return <Gate><AppBackHeader title="Link your Google sign-in" onBack={() => { if (!operationBusy) { clearPendingGoogleCredential(); setGoogleLinkEmail(null); setPassword(""); } }} disabled={operationBusy} /><Text style={styles.body}>This Google email already belongs to an email-and-password account. Confirm its password to add Google sign-in to the same account.</Text><Field label="Email" value={googleLinkEmail} editable={false} selectTextOnFocus={false} /><PasswordField key={`google-link-password-${googleLinkEmail}`} label="Password" value={password} onChangeText={setPassword} placeholder="Your existing account password" />{message ? <Message text={message} /> : null}<Action label="Continue with password" loadingLabel="Linking..." active={isAuthOperationActive(operation, "google-link")} disabled={operationBusy} onPress={() => void run("google-link", () => linkPendingGoogleCredentialWithPassword(googleLinkEmail, password))} /><TextButton label="Cancel" disabled={operationBusy} onPress={() => { clearPendingGoogleCredential(); setGoogleLinkEmail(null); setPassword(""); setMessage(null); }} /></Gate>;
  if (!authFormOpen) return <AuthLanding busy={operationBusy} googleBusy={isAuthOperationActive(operation,"google")} onGoogle={() => void run("google",async()=>{await signInWithGoogle();})} onEmail={() => { setIsRegistering(true); setAuthFormOpen(true); setMessage(null); }} onSignIn={() => { setIsRegistering(false); setAuthFormOpen(true); setMessage(null); }} />;
  return <AuthFormLayout title={isRegistering ? "Create your account" : "Sign in"} layout={authFormLayout} onBack={() => { if (!operationBusy) { setAuthFormOpen(false); setMessage(null); setPassword(""); setConfirmPassword(""); } }}>
    <View style={[authStyles.formSurface, { padding: authFormLayout.cardPadding, backgroundColor: profileSetupColors[mode].surface, borderColor: profileSetupColors[mode].border }]}>
      <Field compact={authFormLayout.compact} label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" />
      <PasswordField compact={authFormLayout.compact} key={`email-password-${isRegistering ? "signup" : "signin"}`} label="Password" value={password} onChangeText={setPassword} placeholder="At least 8 characters" />
      {isRegistering ? <PasswordField compact={authFormLayout.compact} key="signup-confirm-password" label="Confirm password" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Repeat password" /> : null}
      {message ? <Message text={message} /> : null}
      <Action compact={authFormLayout.compact} label={isRegistering ? "Create account" : "Sign in"} loadingLabel={isRegistering ? "Creating account..." : "Signing in..."} active={isRegistering ? isAuthOperationActive(operation, "email-signup") : isAuthOperationActive(operation, "email-login")} disabled={operationBusy} onPress={() => void run(isRegistering ? "email-signup" : "email-login", () => isRegistering ? signUpWithEmail(email, password, confirmPassword) : signInWithEmail(email, password))} />
      <TextButton compact={authFormLayout.compact} label={isRegistering ? "Already have an account? Sign in" : "Create a new account"} disabled={operationBusy} onPress={() => { setIsRegistering(!isRegistering); setMessage(null); }} />
      {__DEV__ && phase === "unauthenticated" && !isRegistering ? <TextButton compact={authFormLayout.compact} label={isReplayingFirstRun ? "Resetting introduction..." : "Replay introduction (development)"} disabled={isReplayingFirstRun} onPress={requestFirstRunReplay} /> : null}
    </View>
    <Action compact={authFormLayout.compact} secondary label="Continue with Google" loadingLabel="Connecting..." active={isAuthOperationActive(operation, "google")} disabled={operationBusy} onPress={() => void run("google", async () => { await signInWithGoogle(); })} />
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
      <Action label="Continue with Email" loadingLabel="Opening..." active={false} disabled={busy} onPress={onEmail} />
    </View>
    <Pressable accessibilityRole="button" disabled={busy} onPress={onSignIn} style={authStyles.signin}><Text style={[authStyles.signinText,{color:c.textSecondary}]}>Already have an account? <Text style={{color:c.primary,fontWeight:"700"}}>Sign in</Text></Text></Pressable>
  </ScrollView></SafeAreaView>;
}
function AuthFormLayout({title,onBack,children,layout:baseLayout}:{title:string;onBack:()=>void;children:React.ReactNode;layout:ReturnType<typeof getAuthFormLayout>}) {
  const {mode}=useAppTheme(); const c=profileSetupColors[mode]; const {height,fontScale}=useWindowDimensions(); const insets=useSafeAreaInsets(); const [keyboard,setKeyboard]=useState(false); const [viewportHeight,setViewportHeight]=useState(0);
  const measuredHeight=viewportHeight||height-insets.top-insets.bottom;
  const layout=getAuthFormLayout(measuredHeight,keyboard,fontScale);
  useEffect(()=>{const a=Keyboard.addListener(Platform.OS==="ios"?"keyboardWillShow":"keyboardDidShow",()=>setKeyboard(true));const b=Keyboard.addListener(Platform.OS==="ios"?"keyboardWillHide":"keyboardDidHide",()=>setKeyboard(false));return()=>{a.remove();b.remove();};},[]);
  return <SafeAreaView style={[authStyles.page,{backgroundColor:c.canvas}]}><KeyboardAvoidingView onLayout={(event)=>setViewportHeight(Math.round(event.nativeEvent.layout.height))} style={{flex:1}} behavior={Platform.OS==="ios"?"padding":undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[authStyles.formScroll,{paddingHorizontal:baseLayout.horizontalPadding,paddingVertical:layout.verticalPadding}]}><Pressable accessibilityRole="button" accessibilityLabel="Back to authentication choices" hitSlop={8} onPress={onBack} style={[authStyles.back,{height:layout.backHeight,minHeight:layout.backHeight,paddingHorizontal:13,borderColor:c.border,backgroundColor:c.surface}]}><Text style={{color:c.primary,fontWeight:"700"}}>Back</Text></Pressable><Text style={[authStyles.kicker,{color:c.textSecondary}]}>Start your journey with</Text><Text accessibilityRole="header" style={[authStyles.brand,{color:c.primary}]}>Mr. Pill Pal</Text><Image source={entryHero} resizeMode="contain" accessible={false} style={{alignSelf:"center",width:"100%",maxWidth:layout.illustrationWidth,aspectRatio:4/3,maxHeight:layout.illustrationHeight,marginTop:5}}/><Text accessibilityRole="header" style={[authStyles.formTitle,{color:c.text},layout.compact&&authStyles.compactFormTitle]}>{title}</Text>{children}</ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
const authStyles=StyleSheet.create({page:{flex:1},landing:{flexGrow:1,justifyContent:"center",alignItems:"center",paddingHorizontal:24,paddingVertical:24},landingActions:{width:"100%",maxWidth:420,gap:0,marginTop:12},kicker:{fontSize:19,fontWeight:"600",textAlign:"center"},brand:{fontSize:32,lineHeight:40,fontWeight:"800",textAlign:"center",marginTop:2},primary:{width:"100%",maxWidth:420,minHeight:54,borderRadius:16,alignItems:"center",justifyContent:"center",marginTop:12},primaryText:{fontSize:16,fontWeight:"700"},secondary:{width:"100%",maxWidth:420,minHeight:54,borderRadius:16,borderWidth:1,alignItems:"center",justifyContent:"center",marginTop:10},secondaryText:{fontSize:16,fontWeight:"700"},signin:{minHeight:48,justifyContent:"center",marginTop:4},signinText:{fontSize:14},formScroll:{flexGrow:1,justifyContent:"center",paddingHorizontal:20,paddingVertical:14},back:{minWidth:48,justifyContent:"center",alignItems:"center",alignSelf:"flex-start",paddingHorizontal:12,borderWidth:1,borderRadius:9},formTitle:{fontSize:22,lineHeight:28,fontWeight:"700",textAlign:"center",marginTop:4,marginBottom:8},compactFormTitle:{marginTop:2,marginBottom:4},formSurface:{padding:22,borderRadius:20,borderWidth:1,gap:2}});

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
function Field({ label, onFocus, onBlur, inputRef, trailingAccessory, compact, ...props }: { label: string; inputRef?: React.Ref<TextInput>; trailingAccessory?: React.ReactNode; compact?: boolean } & React.ComponentProps<typeof TextInput>) {
  const colors = useAuthColors();
  const styles = createStyles(colors);
  const [focused, setFocused] = useState(false);
  const input = <TextInput
    ref={inputRef}
    accessibilityLabel={label}
    style={[styles.input, compact && styles.compactInput, trailingAccessory ? styles.inputWithAccessory : undefined, focused ? { borderColor: colors.focus, borderWidth: 1.5 } : undefined]}
    placeholderTextColor={colors.placeholder}
    autoCapitalize="none"
    onFocus={(event) => { setFocused(true); onFocus?.(event); }}
    onBlur={(event) => { setFocused(false); onBlur?.(event); }}
    {...props}
  />;

  return <View style={[styles.field, compact && styles.compactField]}>
    <Text style={styles.label}>{label}</Text>
    {trailingAccessory ? <View style={styles.inputAdornmentContainer}>
      {input}
      <View pointerEvents="box-none" style={styles.inputTrailing}>{trailingAccessory}</View>
    </View> : input}
  </View>;
}

function PasswordField({ label, value, onChangeText, onFocus, onBlur, onSelectionChange, compact, ...props }: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  compact?: boolean;
} & Omit<React.ComponentProps<typeof TextInput>, "value" | "onChangeText" | "secureTextEntry">) {
  const colors = useAuthColors();
  const styles = createStyles(colors);
  const [visible, setVisible] = useState(false);
  const inputRef = useRef<TextInput | null>(null);
  const hasFocus = useRef(false);
  const shouldRestoreFocus = useRef(false);
  const restoreFocusAfterVisibilityChange = useRef(false);
  const selection = useRef({ start: value.length, end: value.length });

  useEffect(() => {
    if (!restoreFocusAfterVisibilityChange.current) return;
    restoreFocusAfterVisibilityChange.current = false;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setNativeProps({ selection: selection.current });
    });
  }, [visible]);

  function toggleVisibility() {
    restoreFocusAfterVisibilityChange.current = shouldRestoreFocus.current;
    shouldRestoreFocus.current = false;
    setVisible((current) => !current);
  }

  return <Field
    label={label}
    compact={compact}
    value={value}
    onChangeText={onChangeText}
    secureTextEntry={!visible}
    inputRef={inputRef}
    onFocus={(event) => { hasFocus.current = true; onFocus?.(event); }}
    onBlur={(event) => { hasFocus.current = false; onBlur?.(event); }}
    onSelectionChange={(event) => { selection.current = event.nativeEvent.selection; onSelectionChange?.(event); }}
    trailingAccessory={<Pressable
      accessibilityRole="button"
      accessibilityLabel={visible ? "Hide password" : "Show password"}
      accessibilityState={{ selected: visible }}
      hitSlop={4}
      onPressIn={() => { shouldRestoreFocus.current = hasFocus.current; }}
      onPress={toggleVisibility}
      style={({ pressed }) => [styles.passwordVisibilityButton, pressed && styles.passwordVisibilityPressed]}
    ><SymbolView
      accessibilityElementsHidden
      name={{ ios: visible ? "eye.slash" : "eye", android: visible ? "visibility_off" : "visibility", web: visible ? "visibility_off" : "visibility" }}
      tintColor={colors.textSecondary}
      size={20}
    /></Pressable>}
    {...props}
  />;
}
function Message({ text }: { text: string }) { const colors=useAuthColors(); return <Text accessibilityRole="alert" style={createStyles(colors).error}>{text}</Text>; }
function TextButton({ label, disabled, onPress, compact }: { label: string; disabled: boolean; onPress: () => void; compact?: boolean }) { const colors=useAuthColors(); const styles = createStyles(colors); return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.switch, compact && styles.compactSwitch]}><Text style={styles.switchText}>{label}</Text></Pressable>; }
function Action({ label, loadingLabel, active, disabled, secondary, compact, onPress }: { label: string; loadingLabel: string; active: boolean; disabled: boolean; secondary?: boolean; compact?: boolean; onPress: () => void }) { const colors=useAuthColors(); const styles = createStyles(colors); const pressed=useSharedValue(0); const pressStyle=useAnimatedStyle(()=>({opacity:1-pressed.value*.08,transform:[{scale:1-pressed.value*.008}]})); return <Animated.View style={pressStyle}><Pressable accessibilityRole="button" accessibilityState={{ busy: active, disabled }} disabled={disabled} onPressIn={()=>{pressed.value=withTiming(1,{duration:120,easing:PressEasing.bezier(.2,0,0,1)});}} onPressOut={()=>{pressed.value=withTiming(0,{duration:120,easing:PressEasing.bezier(.2,0,0,1)});}} onPress={onPress} style={[styles.action,secondary&&styles.secondary,{backgroundColor:secondary?colors.cardBackground:colors.primary,borderColor:colors.border,borderRadius:16,minHeight:compact?48:54,marginTop:compact?10:16,paddingHorizontal:compact?14:16},disabled&&styles.disabled]}>{active?<><ActivityIndicator color={secondary?colors.primary:colors.primaryForeground}/><Text style={secondary?styles.secondaryText:styles.actionText}>{loadingLabel}</Text></>:<Text style={secondary?styles.secondaryText:styles.actionText}>{label}</Text>}</Pressable></Animated.View>; }
const createStyles = (colors: AppColorTokens) => StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background }, scrollContent: { flexGrow: 1, justifyContent: "center", padding: ui.spacing.screen }, card: { width: "100%", maxWidth: 480, alignSelf: "center", padding: ui.spacing.card, borderRadius: ui.radius.card, backgroundColor: colors.cardBackground, borderWidth: 1, borderColor: colors.border, borderTopColor: colors.borderStrong },
  brand: { fontSize: 19, fontWeight: "800", color: colors.primary }, title: { marginTop: 8, fontSize: 27, lineHeight: 35, fontWeight: "800", color: colors.cardForeground, flexShrink: 1 }, body: { marginTop: 16, fontSize: 16, lineHeight: 23, color: colors.textSecondary }, field: { marginTop: 16 }, compactField: { marginTop: 10 }, label: { fontSize: 15, fontWeight: "700", color: colors.textPrimary }, input: { minHeight: 48, marginTop: 6, paddingHorizontal: 13, borderRadius: ui.radius.button, borderWidth: 1, borderColor: colors.outlineBorder, fontSize: 16, color: colors.inputForeground, backgroundColor: colors.inputBackground }, compactInput: { marginTop: 4 }, inputAdornmentContainer: { position: "relative" }, inputWithAccessory: { paddingRight: 60 }, inputTrailing: { position: "absolute", top: 6, right: 2, bottom: 0, alignItems: "center", justifyContent: "center" }, passwordVisibilityButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 24 }, passwordVisibilityPressed: { backgroundColor: colors.surfaceSubtle },
  action: { minHeight: 48, flexDirection: "row", gap: 9, justifyContent: "center", alignItems: "center", marginTop: 16, paddingHorizontal: 16, borderRadius: ui.radius.button, backgroundColor: colors.primaryBackground }, actionText: { fontSize: 16, fontWeight: "800", color: colors.primaryForeground }, secondary: { backgroundColor: colors.inputBackground, borderWidth: 1, borderColor: colors.outlineBorder }, secondaryText: { fontSize: 16, fontWeight: "800", color: colors.outlineForeground }, disabled: { opacity: .55 }, switch: { minHeight: 44, justifyContent: "center", alignItems: "center", marginTop: 12 }, compactSwitch: { marginTop: 8 }, switchText: { fontSize: 15, fontWeight: "700", color: colors.outlineForeground }, error: { marginTop: 14, padding: 12, borderRadius: ui.radius.button, backgroundColor: colors.dangerBackground, color: colors.dangerForeground, fontSize: 15, lineHeight: 21 }, notice: { marginTop: 14, padding: 12, borderRadius: ui.radius.button, backgroundColor: colors.badgeTakenBackground, color: colors.badgeTakenForeground, fontSize: 15, fontWeight: "700" },
  loadingPage: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }, loadingText: { fontSize: 15, color: colors.textSecondary }, setupBody: { flex: 1 }, setupScroll: { flexGrow: 1, justifyContent: "center", paddingBottom: ui.spacing.md }, question: { flex: 1, justifyContent: "center" }, eyebrow: { fontSize: 12, lineHeight: 18, fontWeight: "800", letterSpacing: 1, color: colors.primary }, setupTitle: { marginTop: 8, fontSize: 29, lineHeight: 37, fontWeight: "800", color: colors.textPrimary }, setupBodyText: { marginTop: 8, fontSize: 16, lineHeight: 23, color: colors.textSecondary }, genderGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: ui.spacing.lg }, genderChoice: { minHeight: 52, width: "47%", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 13, borderWidth: 1, borderRadius: ui.radius.medium }, genderChoiceText: { fontSize: 15, fontWeight: "700" }, checkmark: { fontSize: 17, fontWeight: "900" },
});
