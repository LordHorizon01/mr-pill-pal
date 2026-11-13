import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const authGate = readFileSync("src/components/auth-gate.tsx", "utf8");
const setupWizard = readFileSync("src/components/profile-setup-wizard.tsx", "utf8");
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
