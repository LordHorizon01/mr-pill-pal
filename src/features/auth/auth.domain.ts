export type AuthScreenError = { code?: string; message?: string } | Error | unknown;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateEmailPassword(email: string, password: string, confirmPassword?: string): void {
  if (!/^\S+@\S+\.\S+$/.test(normalizeEmail(email))) throw new Error("Enter a valid email address.");
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");
  if (confirmPassword !== undefined && password !== confirmPassword) throw new Error("Passwords do not match.");
}

export function toAuthMessage(error: AuthScreenError, fallback = "We could not complete that request. Please try again."): string {
  const code = typeof error === "object" && error ? String((error as { code?: string }).code ?? "") : "";
  const messages: Record<string, string> = {
    "auth/invalid-email": "Enter a valid email address.",
    "auth/invalid-credential": "The email or password is incorrect.",
    "auth/wrong-password": "The email or password is incorrect.",
    "auth/user-not-found": "The email or password is incorrect.",
    "auth/email-already-in-use": "An account already uses this email. Try logging in instead.",
    "auth/weak-password": "Choose a stronger password with at least 6 characters.",
    "auth/too-many-requests": "Too many attempts were made. Please wait and try again.",
    "auth/network-request-failed": "You appear to be offline. Check your connection and try again.",
    "auth/invalid-verification-code": "That code is incorrect. Check it and try again.",
    "auth/session-expired": "This verification code expired. Request a new one.",
    "auth/credential-already-in-use": "This sign-in method belongs to another account.",
    "auth/account-exists-with-different-credential": "This email already uses another sign-in method. Log in with that method first.",
    "auth/requires-recent-login": "For your security, log in again before making this change.",
    "DEVELOPER_ERROR": "Google sign-in needs app configuration. Please try again after the development build is updated.",
    "SIGN_IN_CANCELLED": "",
    "SIGN_IN_REQUIRED": "Google sign-in needs your permission. Please try again.",
  };
  return messages[code] ?? fallback;
}

export function normalizePhoneNumber(countryCode: string, phoneNumber: string): string {
  const code = countryCode.trim().replace(/\s/g, "");
  const number = phoneNumber.trim().replace(/[\s()-]/g, "");
  if (!/^\+\d{1,4}$/.test(code) || !/^\d{6,15}$/.test(number)) throw new Error("Enter a valid country code and phone number.");
  return `${code}${number}`;
}
