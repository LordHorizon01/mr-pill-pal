import * as auth from "@react-native-firebase/auth";
import * as firestore from "@react-native-firebase/firestore";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import Constants from "expo-constants";
import { normalizeEmail, normalizePhoneNumber, toAuthMessage, validateEmailPassword } from "./auth.domain";
import { buildAccountSignOutPlan } from "./auth-session.domain";
import { buildAccountDocumentDraft } from "@/features/profiles/profile-setup.domain";

export type AuthUser = auth.User;
export type GoogleSignInResult = { cancelled: boolean };
type GoogleAuthStage = "configure" | "play-services" | "google-picker" | "missing-id-token" | "firebase-sign-in" | "password-link";

/**
 * The Google credential is deliberately memory-only. It is used solely to
 * finish an explicit password-confirmed link after Firebase reports that the
 * email already belongs to a password account.
 */
let pendingGoogleCredential: auth.AuthCredential | null = null;

export class GoogleLinkRequiredError extends Error {
  readonly code = "auth/account-exists-with-different-credential";
  constructor(readonly email: string) {
    super("Password confirmation is required before this Google sign-in can be linked.");
    this.name = "GoogleLinkRequiredError";
  }
}

function googleErrorCode(error: unknown): string {
  return typeof error === "object" && error ? String((error as { code?: string }).code ?? "unknown") : "unknown";
}

/** Logs only a stage/code in development; no tokens, passwords, or medication data. */
function logGoogleAuthFailure(stage: GoogleAuthStage, error: unknown): void {
  if (__DEV__) console.warn("[GoogleAuth]", { stage, code: googleErrorCode(error) });
}

function logAuthSignOut(stage: "google-signout" | "firebase-signout" | "transient-state-cleared", error?: unknown): void {
  if (!__DEV__) return;
  if (error) console.warn("[AuthSignOut]", { stage, code: googleErrorCode(error) });
  else console.log("[AuthSignOut]", { stage });
}
const firebaseAuth = () => auth.getAuth();
const firebaseStore = () => firestore.getFirestore();

function requireConfiguredFirebase(): void {
  try { firebaseAuth(); } catch { throw new Error("Firebase is not configured on this build yet. Complete FIREBASE_SETUP.md, then rebuild the Android development app."); }
}

function googleWebClientId(): string {
  const value = Constants.expoConfig?.extra?.firebaseGoogleWebClientId;
  if (typeof value !== "string" || !value.trim()) throw new Error("Google sign-in is not configured yet. Add the Firebase Web client ID as described in FIREBASE_SETUP.md.");
  return value;
}

function configureGoogleSignIn(): void {
  GoogleSignin.configure({ webClientId: googleWebClientId() });
}

export async function ensureAccountDocument(user: AuthUser): Promise<void> {
  requireConfiguredFirebase();
  const reference = firestore.doc(firebaseStore(), "accounts", user.uid);
  const snapshot = await firestore.getDoc(reference);

  if (!snapshot.exists()) {
    await firestore.setDoc(reference, {
      ...buildAccountDocumentDraft(user.uid, user.displayName),
      createdAt: firestore.serverTimestamp(),
      updatedAt: firestore.serverTimestamp(),
    });
    return;
  }

  await firestore.updateDoc(reference, {
    uid: user.uid,
    displayName: user.displayName?.trim() || null,
    updatedAt: firestore.serverTimestamp(),
  });
}

export function getCurrentAuthenticatedUser(expectedUid: string): AuthUser {
  requireConfiguredFirebase();
  const user = firebaseAuth().currentUser;
  if (!user) throw new Error("Your sign-in session ended. Please sign in again.");
  if (user.uid !== expectedUid) throw new Error("Your sign-in session changed. Please sign in again.");
  return user;
}

export async function markAccountProfileSetupComplete(accountUid: string): Promise<void> {
  const user = getCurrentAuthenticatedUser(accountUid);
  await firestore.updateDoc(firestore.doc(firebaseStore(), "accounts", user.uid), {
    profileSetupComplete: true,
    onboardingComplete: true,
    updatedAt: firestore.serverTimestamp(),
  });
}

export function requiresEmailVerification(user: AuthUser): boolean { return Boolean(user.email) && !user.emailVerified && user.providerData.some((provider: auth.UserInfo) => provider.providerId === "password"); }

export async function signUpWithEmail(email: string, password: string, confirmPassword: string): Promise<void> {
  requireConfiguredFirebase(); validateEmailPassword(email, password, confirmPassword);
  const credential = await auth.createUserWithEmailAndPassword(firebaseAuth(), normalizeEmail(email), password);
  await auth.sendEmailVerification(credential.user);
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  requireConfiguredFirebase(); validateEmailPassword(email, password);
  await auth.signInWithEmailAndPassword(firebaseAuth(), normalizeEmail(email), password);
}

export async function resendVerificationEmail(): Promise<void> {
  const user = firebaseAuth().currentUser; if (!user) throw new Error("Your sign-in session ended. Please log in again.");
  await auth.sendEmailVerification(user);
}

export async function reloadCurrentUser(): Promise<AuthUser | null> {
  const user = firebaseAuth().currentUser; if (!user) return null; await auth.reload(user); return firebaseAuth().currentUser;
}

export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  pendingGoogleCredential = null;
  try { requireConfiguredFirebase(); configureGoogleSignIn(); }
  catch (error) { logGoogleAuthFailure("configure", error); throw error; }

  try { await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true }); }
  catch (error) { logGoogleAuthFailure("play-services", error); throw error; }

  let response: Awaited<ReturnType<typeof GoogleSignin.signIn>>;
  try {
    // This is an explicit user action from the sign-in screen. A stale SDK
    // session must not make the previous account appear to be selected again.
    if (GoogleSignin.hasPreviousSignIn()) {
      try {
        await GoogleSignin.signOut();
      } catch (error) {
        // Continue to the explicit Google sign-in prompt. A local SDK cleanup
        // failure must not leave the user trapped on the sign-in screen.
        logAuthSignOut("google-signout", error);
      }
    }
    response = await GoogleSignin.signIn();
  }
  catch (error) { logGoogleAuthFailure("google-picker", error); throw error; }
  if (response.type === "cancelled") return { cancelled: true };

  const token = response.data.idToken;
  if (!token) {
    const error = new Error("Google did not return a sign-in token. Please try again.");
    logGoogleAuthFailure("missing-id-token", error);
    throw error;
  }

  const credential = auth.GoogleAuthProvider.credential(token);
  try {
    await auth.signInWithCredential(firebaseAuth(), credential);
    return { cancelled: false };
  } catch (error) {
    if (googleErrorCode(error) === "auth/account-exists-with-different-credential") {
      pendingGoogleCredential = credential;
      logGoogleAuthFailure("firebase-sign-in", error);
      throw new GoogleLinkRequiredError(normalizeEmail(response.data.user.email));
    }
    logGoogleAuthFailure("firebase-sign-in", error);
    throw error;
  }
}

/** Completes the only approved collision path: password sign-in, then provider link for that same UID. */
export async function linkPendingGoogleCredentialWithPassword(email: string, password: string): Promise<void> {
  if (!pendingGoogleCredential) throw new Error("Start Google sign-in again before linking your account.");
  validateEmailPassword(email, password);
  try {
    const result = await auth.signInWithEmailAndPassword(firebaseAuth(), normalizeEmail(email), password);
    await auth.linkWithCredential(result.user, pendingGoogleCredential);
    pendingGoogleCredential = null;
  } catch (error) {
    logGoogleAuthFailure("password-link", error);
    throw error;
  }
}

export function clearPendingGoogleCredential(): void {
  pendingGoogleCredential = null;
}

export async function sendPhoneOtp(countryCode: string, phoneNumber: string): Promise<auth.ConfirmationResult> {
  requireConfiguredFirebase(); return auth.signInWithPhoneNumber(firebaseAuth(), normalizePhoneNumber(countryCode, phoneNumber));
}

export async function verifyPhoneOtp(confirmation: auth.ConfirmationResult, code: string): Promise<void> {
  if (!/^\d{6}$/.test(code.trim())) throw new Error("Enter the 6-digit verification code.");
  await confirmation.confirm(code.trim());
}

/**
 * Clears the provider session when the authenticated Firebase account uses
 * Google, then clears Firebase. It deliberately does not revoke Google access.
 */
export async function signOutCurrentAccount(): Promise<void> {
  requireConfiguredFirebase();
  const user = firebaseAuth().currentUser;
  const plan = buildAccountSignOutPlan(user?.providerData);
  pendingGoogleCredential = null;

  if (plan.signOutGoogleSdk) {
    try {
      configureGoogleSignIn();
      await GoogleSignin.signOut();
      logAuthSignOut("google-signout");
    } catch (error) {
      // Firebase must still be cleared. The next explicit Google action will
      // make another interactive cleanup attempt before opening the picker.
      logAuthSignOut("google-signout", error);
    }
  }

  try {
    await auth.signOut(firebaseAuth());
    logAuthSignOut("firebase-signout");
  } catch (error) {
    logAuthSignOut("firebase-signout", error);
    throw error;
  }
}

/** Backward-compatible name for older callers; it now performs provider-aware logout. */
export async function logoutFromFirebase(): Promise<void> { await signOutCurrentAccount(); }

export function logTransientAccountStateCleared(): void { logAuthSignOut("transient-state-cleared"); }

/** Leaves an unverified sign-up safely without deleting the Firebase account. */
export async function signOutUnverifiedUser(): Promise<void> {
  requireConfiguredFirebase();
  const user = firebaseAuth().currentUser;
  if (!user) return;
  if (!requiresEmailVerification(user)) throw new Error("Only an unverified email sign-up can be left from this screen.");
  await auth.signOut(firebaseAuth());
}

export function observeAuthState(listener: (user: AuthUser | null) => void): () => void {
  requireConfiguredFirebase(); return auth.onAuthStateChanged(firebaseAuth(), listener);
}

export { toAuthMessage };
