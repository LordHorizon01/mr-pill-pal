# Firebase setup for Mr. Pill Pal

This project has the application code for Firebase Authentication and profile metadata, but it does not include a Firebase project, credentials, or a `google-services.json` file. Complete these steps before testing sign-in on Android.

1. Create or select a Firebase project in the Firebase Console. Do not use a personal production project for a college demo unless your team agrees on ownership.
2. Add an Android app with this exact package name: `com.anonymous.mrpillpal`.
3. Download the generated `google-services.json` and place it at the project root as `google-services.json`. It is ignored by Git and must not be shared in reports or commits.
4. In **Authentication → Sign-in method**, enable Email/Password. Enable Google only after setting its OAuth consent screen and SHA fingerprints. Enable Phone only after completing Firebase's Android phone-auth configuration and testing policy requirements.
5. For Google sign-in, create/get the Firebase **Web client ID** and place it in a local environment file as `EXPO_PUBLIC_FIREBASE_GOOGLE_WEB_CLIENT_ID=...`. Do not store it in source code. The value is used only by the Google sign-in client configuration.
6. Add the SHA-1 and SHA-256 fingerprints of the Android debug/development signing key in Firebase Project Settings. Release signing fingerprints must be added separately before a release build.
7. Create a Firestore database in the Firebase Console. The chosen edition, location, and retention policy must be recorded by the project owner before production use.
8. Review `firestore.rules`, then deploy it from an authenticated Firebase CLI session with `npx firebase-tools@latest deploy --only firestore:rules --project YOUR_PROJECT_ID`.
9. Confirm in the Firebase Rules Playground that account A cannot read or change account B's `accounts` or `profiles` documents.
10. Build a native Android development app. React Native Firebase does not run in Expo Go. After the configuration file is in place, use the Expo SDK 57 workflow: `npx expo prebuild --clean` when native configuration must be regenerated, then `npx expo run:android`.
11. Test email verification, Google sign-in, and phone OTP separately. Phone authentication requires real device/Android configuration and should not be claimed as tested until it is actually tested.
12. Do not put medication records, dose history, passwords, OTP codes, dates of birth, or medical notes into Firebase Analytics, Crashlytics breadcrumbs, or ordinary console logs.

## Current cloud scope

Firebase stores only account and profile metadata in this cycle. Medications, schedules, doses, and intake history remain local SQLite data and are scoped by the selected local profile. Cloud synchronization of medication records is intentionally not enabled yet.

## Caregiver and sharing boundary

The profile type includes future caregiver-oriented roles, but invitation, access-grant, and revocation flows are not implemented. The deployed rules above are deliberately owner-only. Do not relax them until a reviewed membership model and tests exist.
