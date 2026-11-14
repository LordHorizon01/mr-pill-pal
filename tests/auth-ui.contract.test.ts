import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getAuthFormLayout } from "../src/features/auth/auth-form-layout.domain";

const authGate = readFileSync("src/components/auth-gate.tsx", "utf8");
const setupWizard = readFileSync("src/components/profile-setup-wizard.tsx", "utf8");
const authFormLayout = readFileSync("src/features/auth/auth-form-layout.domain.ts", "utf8");
const passwordFieldStart = authGate.indexOf("function PasswordField(");
const passwordFieldEnd = authGate.indexOf("\nfunction Message(", passwordFieldStart);
const passwordField = authGate.slice(passwordFieldStart, passwordFieldEnd);

test("password fields start hidden and keep their controlled value while visibility toggles", () => {
  assert.match(passwordField, /const \[visible, setVisible\] = useState\(false\)/);
  assert.match(passwordField, /secureTextEntry=\{!visible\}/);
  assert.match(passwordField, /value=\{value\}/);
  assert.match(passwordField, /onChangeText=\{onChangeText\}/);
  const toggle = passwordField.match(/function toggleVisibility\(\) \{([\s\S]*?)\n  \}/)?.[1];
  assert.ok(toggle, "visibility toggle handler exists");
  assert.match(toggle, /setVisible\(\(current\) => !current\)/);
  assert.doesNotMatch(toggle, /onChangeText|setPassword|setConfirmPassword/);
});

test("visibility buttons expose show/hide labels, native symbols, and a 48dp target", () => {
  assert.match(passwordField, /accessibilityRole="button"/);
  assert.match(passwordField, /accessibilityLabel=\{visible \? "Hide password" : "Show password"\}/);
  assert.match(passwordField, /ios: visible \? "eye\.slash" : "eye"/);
  assert.match(passwordField, /android: visible \? "visibility_off" : "visibility"/);
  assert.match(authGate, /passwordVisibilityButton: \{ width: 48, height: 48/);
});

test("sign-in, sign-up, confirmation, and Google-link fields use isolated password controls", () => {
  assert.equal((authGate.match(/<PasswordField\b/g) ?? []).length, 3);
  assert.match(authGate, /key=\{`email-password-\$\{isRegistering \? "signup" : "signin"\}`\}/);
  assert.match(authGate, /key="signup-confirm-password" label="Confirm password"/);
  assert.match(authGate, /key=\{`google-link-password-\$\{googleLinkEmail\}`\} label="Password"/);
  assert.match(authGate, /onPress=\{\(\) => \{ setIsRegistering\(!isRegistering\); setMessage\(null\); \}\}/);
});

test("toggling while typing restores focus and the last cursor selection without logging values", () => {
  assert.match(passwordField, /onPressIn=\{\(\) => \{ shouldRestoreFocus\.current = hasFocus\.current; \}\}/);
  assert.match(passwordField, /inputRef\.current\?\.focus\(\)/);
  assert.match(passwordField, /inputRef\.current\?\.setNativeProps\(\{ selection: selection\.current \}\)/);
  assert.match(passwordField, /selection\.current = event\.nativeEvent\.selection/);
  assert.doesNotMatch(passwordField, /console\.(?:log|debug|info)\s*\(/);
});

test("profile restoration loader is one safe-area-centered group with centered copy", () => {
  assert.match(setupWizard, /<SafeAreaView edges=\{\["top", "bottom"\]\}/);
  assert.match(setupWizard, /waitingGroup:\{flex:1,width:"100%",maxWidth:480,alignSelf:"center",alignItems:"center",justifyContent:"center",gap:8/);
  assert.match(setupWizard, /waitingText:\{flexShrink:1,textAlign:"center"/);
  assert.match(setupWizard, /<ActivityIndicator size="large"[\s\S]*?<Text style=\{\[s\.waitingText/);
});

test("authentication landing copy is clean and Email is capitalized without changing routes", () => {
  assert.doesNotMatch(authGate, /Private by design\s*[•·]\s*Core features work offline/);
  assert.match(authGate, /label="Continue with Email"/);
  assert.doesNotMatch(authGate, /label="Continue with email"/);
  assert.match(authGate, /onEmail=\{\(\) => \{ setIsRegistering\(true\); setAuthFormOpen\(true\); setMessage\(null\); \}\}/);
});

test("email Back is an outlined accessible secondary control and clears form-only state", () => {
  assert.match(authGate, /accessibilityLabel="Back to authentication choices"/);
  assert.match(authGate, /hitSlop=\{8\} onPress=\{onBack\} style=\{\[authStyles\.back/);
  assert.match(authGate, /height:layout\.backHeight,minHeight:layout\.backHeight,paddingHorizontal:13,borderColor:c\.border,backgroundColor:c\.surface/);
  assert.match(authGate, /back:\{minWidth:48,justifyContent:"center",alignItems:"center",alignSelf:"flex-start",paddingHorizontal:12,borderWidth:1,borderRadius:9\}/);
  assert.doesNotMatch(authGate, /back:\{[^}]*minHeight:48/);
  assert.match(authFormLayout, /backHeight:\s*32/);
  assert.match(authGate, /setAuthFormOpen\(false\); setMessage\(null\); setPassword\(""\); setConfirmPassword\(""\)/);
});

test("authentication layout compacts for a standard phone and preserves larger-font scrolling", () => {
  const phone = getAuthFormLayout(824, false, 1);
  assert.equal(phone.compact, true);
  assert.equal(phone.backHeight, 32);
  assert.equal(phone.illustrationWidth, 172);
  assert.equal(phone.illustrationHeight, 118);
  assert.equal(phone.cardPadding, 14);

  const largeScreen = getAuthFormLayout(900, false, 1);
  assert.equal(largeScreen.compact, false);
  assert.equal(largeScreen.backHeight, 32);

  const keyboard = getAuthFormLayout(420, true, 1);
  assert.equal(keyboard.compact, true);
  assert.ok(keyboard.illustrationHeight <= 94);
  assert.equal(keyboard.verticalPadding, 4);

  const largeText = getAuthFormLayout(900, false, 1.4);
  assert.equal(largeText.compact, true);
  assert.match(authGate, /<ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle=\{\[authStyles\.formScroll/);
  assert.match(authGate, /Keyboard\.addListener\(Platform\.OS==="ios"\?"keyboardWillShow":"keyboardDidShow"/);
  assert.match(authGate, /keyboardDidHide/);
});
