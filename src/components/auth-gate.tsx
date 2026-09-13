import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, BackHandler, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { clearPendingGoogleCredential, GoogleLinkRequiredError, linkPendingGoogleCredentialWithPassword, resendVerificationEmail, signInWithEmail, signInWithGoogle, signUpWithEmail, toAuthMessage } from "@/features/auth/auth.service";
import { AuthOperation, canStartAuthOperation, hasProfileSetupDraft, isAuthOperationActive, resendCooldownLabel } from "@/features/auth/auth-ui.domain";
import { useAuthStore } from "@/state/auth.store";
import { useProfileStore } from "@/state/profile.store";
import { getProfileSetupMessage } from "@/features/profiles/profile-setup.domain";
import { ProfileRelationship } from "@/features/profiles/profile.types";
import { AppColorTokens, ui } from "@/components/ui-tokens";
import { useAppTheme } from "@/components/app-theme-provider";
import { AppBackHeader } from "@/components/app-back-header";
import { ThemedChip } from "@/components/themed-ui";
import { SafeAreaView } from "react-native-safe-area-context";

const relationships: ProfileRelationship[] = ["Self", "Mother", "Father", "Child", "Spouse", "Family member", "Other"];
const RESEND_COOLDOWN_SECONDS = 30;

export function AuthGate() {
  const phase = useAuthStore((state) => state.phase);
  const user = useAuthStore((state) => state.user);
  const refreshVerification = useAuthStore((state) => state.refreshVerification);
  const leaveUnverifiedSession = useAuthStore((state) => state.leaveUnverifiedSession);
  const leaveProfileSetup = useAuthStore((state) => state.leaveProfileSetup);
  const createProfile = useProfileStore((state) => state.createProfile);
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState(""); const [nickname, setNickname] = useState(""); const [dateOfBirth, setDateOfBirth] = useState(""); const [relationship, setRelationship] = useState<ProfileRelationship>("Self");
  const [operation, setOperation] = useState<AuthOperation>(null); const [message, setMessage] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null); const [resendSeconds, setResendSeconds] = useState(0);
  const [googleLinkEmail, setGoogleLinkEmail] = useState<string | null>(null);
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const exitInProgress = useRef(false);
  const operationBusy = operation !== null;

  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(null), 3000); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => { if (!resendSeconds) return; const timer = setInterval(() => setResendSeconds((seconds) => Math.max(0, seconds - 1)), 1000); return () => clearInterval(timer); }, [resendSeconds > 0]);
  async function run(next: Exclude<AuthOperation, null>, action: () => Promise<void>) {
    if (!canStartAuthOperation(operation)) return;
    setOperation(next); setMessage(null);
    try { await action(); } catch (error) {
      if (error instanceof GoogleLinkRequiredError) { setGoogleLinkEmail(error.email); setPassword(""); }
      else setMessage(next === "profile-create" ? getProfileSetupMessage(error) : toAuthMessage(error, "Something went wrong. Please try again."));
    } finally { setOperation(null); }
  }
  async function leaveVerification() {
    if (exitInProgress.current) return;
    exitInProgress.current = true;
    try { await run("leave-unverified-session", async () => { await leaveUnverifiedSession(); setIsRegistering(false); setPassword(""); setConfirmPassword(""); }); }
    finally { exitInProgress.current = false; }
  }
  async function leaveFirstProfileSetup() {
    if (exitInProgress.current) return;
    exitInProgress.current = true;
    try { await run("leave-profile-setup", async () => { await leaveProfileSetup(); setName(""); setNickname(""); setDateOfBirth(""); setRelationship("Self"); }); }
    finally { exitInProgress.current = false; }
  }
  function requestLeaveFirstProfileSetup() {
    if (operationBusy) return;
    const leave = () => void leaveFirstProfileSetup();
    if (!hasProfileSetupDraft({ fullName: name, nickname, dateOfBirth, relationship })) {
      leave();
      return;
    }
    Alert.alert("Leave profile setup?", "Your entered profile information has not been saved.", [
      { text: "Continue setup", style: "cancel" },
      { text: "Leave", style: "destructive", onPress: leave },
    ]);
  }
  useEffect(() => {
    if (phase !== "verification_required" && phase !== "profile_setup_required" && !(phase === "unauthenticated" && isRegistering)) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (phase === "verification_required") void leaveVerification();
      else if (phase === "profile_setup_required") requestLeaveFirstProfileSetup();
      else if (!operationBusy) { setIsRegistering(false); setMessage(null); setPassword(""); setConfirmPassword(""); }
      return true;
    });
    return () => subscription.remove();
  }, [dateOfBirth, isRegistering, name, nickname, operation, phase, relationship]);

  if (phase === "configuration_required") return <Gate><Text style={styles.title}>Firebase setup is needed</Text><Text style={styles.body}>This development build needs the Firebase Android configuration before sign-in can be used. Follow FIREBASE_SETUP.md, then rebuild the Android development app.</Text></Gate>;
  if (phase === "verification_required") return <Gate><AppBackHeader title="Verify your email" onBack={() => void leaveVerification()} disabled={operationBusy} /><Text style={styles.body}>We sent a verification link to {user?.email ?? "your email"}. Open the link, then return here.</Text>{message ? <Message text={message} /> : null}{notice ? <Text style={styles.notice}>{notice}</Text> : null}<Action label="I've verified my email" loadingLabel="Checking..." active={isAuthOperationActive(operation, "verify-email-refresh")} disabled={operationBusy} onPress={() => void run("verify-email-refresh", async () => { const verified = await refreshVerification(); if (!verified) setMessage("Your email is not verified yet. Open the verification link, then try again."); })} /><Action secondary label={resendCooldownLabel(resendSeconds)} loadingLabel="Sending..." active={isAuthOperationActive(operation, "resend-email")} disabled={operationBusy || resendSeconds > 0} onPress={() => void run("resend-email", async () => { await resendVerificationEmail(); setResendSeconds(RESEND_COOLDOWN_SECONDS); setNotice("Verification email sent."); })} /><Pressable accessibilityRole="button" accessibilityLabel="Use a different email" accessibilityState={{ disabled: operationBusy }} disabled={operationBusy} onPress={() => void leaveVerification()} style={styles.switch}><Text style={styles.switchText}>Use a different email</Text></Pressable></Gate>;
  if (phase === "profile_setup_required") return <Gate><AppBackHeader title="Set up your first profile" onBack={requestLeaveFirstProfileSetup} disabled={operationBusy} /><Text style={styles.body}>Your medication information stays separated by profile on this device.</Text><Field label="Full name" value={name} onChangeText={setName} placeholder="For example, Asha Sharma" autoCapitalize="words" /><Field label="Nickname (optional)" value={nickname} onChangeText={setNickname} placeholder="For example, Asha" autoCapitalize="words" /><Field label="Date of birth" value={dateOfBirth} onChangeText={setDateOfBirth} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" /><Text style={styles.label}>Relationship</Text><View style={styles.chips}>{relationships.map((item) => <ThemedChip key={item} label={item} selected={relationship === item} disabled={operationBusy} onPress={() => setRelationship(item)} accessibilityLabel={`${item} relationship${relationship === item ? ", selected" : ""}`} />)}</View>{message ? <Message text={message} /> : null}<Action label="Create profile" loadingLabel="Creating profile..." active={isAuthOperationActive(operation, "profile-create")} disabled={operationBusy} onPress={() => void run("profile-create", async () => { await createProfile({ fullName: name, nickname, dateOfBirth, relationship }); })} /><Pressable accessibilityRole="button" accessibilityLabel="Back to sign in" accessibilityState={{ disabled: operationBusy }} disabled={operationBusy} onPress={requestLeaveFirstProfileSetup} style={styles.switch}><Text style={styles.switchText}>Back to sign in</Text></Pressable></Gate>;
  if (googleLinkEmail) return <Gate><AppBackHeader title="Link your Google sign-in" onBack={() => { if (!operationBusy) { clearPendingGoogleCredential(); setGoogleLinkEmail(null); setPassword(""); } }} disabled={operationBusy} /><Text style={styles.body}>This Google email already belongs to an email-and-password account. Confirm its password to add Google sign-in to the same account.</Text><Field label="Email" value={googleLinkEmail} editable={false} selectTextOnFocus={false} /><Field label="Password" value={password} onChangeText={setPassword} placeholder="Your existing account password" secureTextEntry />{message ? <Message text={message} /> : null}<Action label="Continue with password" loadingLabel="Linking..." active={isAuthOperationActive(operation, "google-link")} disabled={operationBusy} onPress={() => void run("google-link", () => linkPendingGoogleCredentialWithPassword(googleLinkEmail, password))} /><Pressable accessibilityRole="button" accessibilityLabel="Cancel Google account linking" accessibilityState={{ disabled: operationBusy }} disabled={operationBusy} onPress={() => { clearPendingGoogleCredential(); setGoogleLinkEmail(null); setPassword(""); setMessage(null); }} style={styles.switch}><Text style={styles.switchText}>Cancel</Text></Pressable></Gate>;
  return <Gate>{isRegistering ? <AppBackHeader title="Create account" onBack={() => { if (!operationBusy) { setIsRegistering(false); setMessage(null); setPassword(""); setConfirmPassword(""); } }} disabled={operationBusy} /> : <><Text style={styles.brand}>Mr. Pill Pal</Text><Text style={styles.title}>Welcome back</Text></>}<Text style={styles.body}>A private medication routine, stored locally and ready for your account setup.</Text><Field label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" /><Field label="Password" value={password} onChangeText={setPassword} placeholder="At least 8 characters" secureTextEntry />{isRegistering ? <Field label="Confirm password" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Repeat password" secureTextEntry /> : null}{message ? <Message text={message} /> : null}<Action label={isRegistering ? "Create account" : "Sign in"} loadingLabel={isRegistering ? "Creating account..." : "Signing in..."} active={isRegistering ? isAuthOperationActive(operation, "email-signup") : isAuthOperationActive(operation, "email-login")} disabled={operationBusy} onPress={() => void run(isRegistering ? "email-signup" : "email-login", () => isRegistering ? signUpWithEmail(email, password, confirmPassword) : signInWithEmail(email, password))} /><Action secondary label="Continue with Google" loadingLabel="Connecting..." active={isAuthOperationActive(operation, "google")} disabled={operationBusy} onPress={() => void run("google", async () => { await signInWithGoogle(); })} /><Pressable accessibilityRole="button" accessibilityState={{ disabled: operationBusy }} disabled={operationBusy} onPress={() => { setIsRegistering(!isRegistering); setMessage(null); }} style={styles.switch}><Text style={styles.switchText}>{isRegistering ? "Already have an account? Sign in" : "New here? Create an account"}</Text></Pressable></Gate>;
}

function Gate({ children }: { children: React.ReactNode }) { const { colors } = useAppTheme(); const styles = createStyles(colors); return <SafeAreaView edges={["top", "bottom"]} style={styles.page}><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.page}><ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled"><View style={styles.card}>{children}</View></ScrollView></KeyboardAvoidingView></SafeAreaView>; }
function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) { const { colors } = useAppTheme(); const styles = createStyles(colors); return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} style={styles.input} placeholderTextColor={colors.muted} autoCapitalize="none" {...props} /></View>; }
function Message({ text }: { text: string }) { const { colors } = useAppTheme(); return <Text accessibilityRole="alert" style={createStyles(colors).error}>{text}</Text>; }
function Action({ label, loadingLabel, active, disabled, secondary, onPress }: { label: string; loadingLabel: string; active: boolean; disabled: boolean; secondary?: boolean; onPress: () => void }) { const { colors } = useAppTheme(); const styles = createStyles(colors); return <Pressable accessibilityRole="button" accessibilityState={{ busy: active, disabled }} disabled={disabled} onPress={onPress} style={[styles.action, secondary && styles.secondary, disabled && !active && styles.disabled]}>{active ? <><ActivityIndicator color={secondary ? colors.outlineForeground : colors.primaryForeground} /><Text style={secondary ? styles.secondaryText : styles.actionText}>{loadingLabel}</Text></> : <Text style={secondary ? styles.secondaryText : styles.actionText}>{label}</Text>}</Pressable>; }
const createStyles = (colors: AppColorTokens) => StyleSheet.create({ page:{flex:1,backgroundColor:colors.background},scrollContent:{flexGrow:1,justifyContent:"center",padding:ui.spacing.screen},card:{width:"100%",maxWidth:480,alignSelf:"center",padding:ui.spacing.card,borderRadius:ui.radius.card,backgroundColor:colors.cardBackground,borderWidth:1,borderColor:colors.border,borderTopColor:colors.borderStrong},brand:{fontSize:19,fontWeight:"800",color:colors.primary},title:{marginTop:8,fontSize:27,fontWeight:"800",color:colors.cardForeground,flexShrink:1},body:{marginTop:8,fontSize:16,lineHeight:23,color:colors.textSecondary},field:{marginTop:16},label:{fontSize:15,fontWeight:"700",color:colors.textPrimary},input:{minHeight:48,marginTop:6,paddingHorizontal:13,borderRadius:ui.radius.button,borderWidth:1,borderColor:colors.outlineBorder,fontSize:16,color:colors.inputForeground,backgroundColor:colors.inputBackground},action:{minHeight:48,flexDirection:"row",gap:9,justifyContent:"center",alignItems:"center",marginTop:16,paddingHorizontal:16,borderRadius:ui.radius.button,backgroundColor:colors.primaryBackground},actionText:{fontSize:16,fontWeight:"800",color:colors.primaryForeground},secondary:{backgroundColor:colors.inputBackground,borderWidth:1,borderColor:colors.outlineBorder},secondaryText:{fontSize:16,fontWeight:"800",color:colors.outlineForeground},disabled:{opacity:.55},switch:{minHeight:44,justifyContent:"center",alignItems:"center",marginTop:12},switchText:{fontSize:15,fontWeight:"700",color:colors.outlineForeground},error:{marginTop:14,padding:12,borderRadius:ui.radius.button,backgroundColor:colors.dangerBackground,color:colors.dangerForeground,fontSize:15,lineHeight:21},notice:{marginTop:14,padding:12,borderRadius:ui.radius.button,backgroundColor:colors.badgeTakenBackground,color:colors.badgeTakenForeground,fontSize:15,fontWeight:"700"},chips:{flexDirection:"row",flexWrap:"wrap",gap:8,marginTop:8} });
