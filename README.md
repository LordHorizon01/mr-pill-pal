# Welcome to your Expo app 👋

## Android APK testing builds

The Android APK workflow builds a standalone release variant: Expo embeds the production JavaScript bundle and assets in the APK, so the installed app does not need Metro, Expo Go, or a computer.

The workflow runs on pushes to `main` and `kshitij-month3`. Main publishes the stable channel at the [`latest-apk` release](https://github.com/LordHorizon01/mr-pill-pal/releases/tag/latest-apk); Month 3 publishes separately at the [`latest-month3` release](https://github.com/LordHorizon01/mr-pill-pal/releases/tag/latest-month3). Each release has a fixed-name latest APK and a build-specific APK whose filename includes the source commit. The [Android APK workflow](https://github.com/LordHorizon01/mr-pill-pal/actions/workflows/android-apk.yml) retains each run's artifact for 90 days.

Direct APK links, available after the first successful publish:

- Stable: [mr-pill-pal-stable-latest.apk](https://github.com/LordHorizon01/mr-pill-pal/releases/download/latest-apk/mr-pill-pal-stable-latest.apk)
- Month 3: [mr-pill-pal-month3-latest.apk](https://github.com/LordHorizon01/mr-pill-pal/releases/download/latest-month3/mr-pill-pal-month3-latest.apk)

Both channels use the same Android package, `com.anonymous.mrpillpal`, and the same persistent signing certificate. They cannot be installed side by side; installing either channel updates the same app. The workflow uses its increasing GitHub Actions run number as `versionCode`, so a later build can be installed over an earlier compatible build.

### One-time GitHub secrets

Before the first build, add these repository secrets in **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
| --- | --- |
| `GOOGLE_SERVICES_JSON` | Full Firebase Android `google-services.json` contents |
| `ANDROID_KEYSTORE_BASE64` | Base64 text for the persistent Android signing keystore |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Alias used when creating the key |
| `ANDROID_KEY_PASSWORD` | Password for that key |

Create a dedicated test signing key once and keep a protected backup outside Git. In PowerShell, first move to a safe folder outside the repository, such as `$env:TEMP`, then run `keytool -genkeypair -v -keystore mr-pill-pal-release.jks -alias mr-pill-pal -keyalg RSA -keysize 2048 -validity 10000` and `keytool -list -v -keystore mr-pill-pal-release.jks -alias mr-pill-pal` to view its SHA-1 and SHA-256 fingerprints. Encode the file for the Actions secret with `[Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $env:TEMP 'mr-pill-pal-release.jks')))`. Enter the resulting base64 and passwords directly in GitHub Secrets; don't paste them into chat or commit them.

In Firebase Console → Project settings → Your apps → Android app `com.anonymous.mrpillpal`, add both signing fingerprints. Confirm Google sign-in's Android OAuth client uses the same package and SHA-1. Download the refreshed `google-services.json` after updating Firebase, then paste its contents into the GitHub secret. The JSON is client configuration, not a Firebase Admin service-account key.

Use the same keystore and passwords for every release. Do not commit or share the keystore/passwords. Losing this key prevents Android from accepting future APKs as updates; Android may require uninstalling the existing app, which deletes its local SQLite data. Keep a secure backup before installing the first release build.

### Build and install on a physical phone

1. Push a manually tested commit to `main` for stable or `kshitij-month3` for development. GitHub publishes only after the release APK passes package, version, bundle, and signature checks.
2. Open the corresponding release page above on the Android phone and download its `*-latest.apk` file.
3. Open the downloaded file. If Android asks, allow **Install unknown apps** for that browser or file manager only, then return to the installer. Keep Play Protect and other device security protections enabled.
4. Launch Mr. Pill Pal and sign in with a test account. Avoid real health information in testing.
5. Grant notification permission when prompted. In Reminders & notifications, review privacy settings and use the app's test-notification control.

A push does not update an already installed standalone APK. To receive a new build, make and locally test your code changes, then run `git add <changed-files>`, `git commit -m "Describe the change"`, and `git push origin kshitij-month3` for development or `git push origin main` for stable. In GitHub, open **Actions → Android APK**, wait for the run to turn green, then download the APK from the run's Artifacts or from that channel's latest release. Install the APK over the existing app to test the new version. The workflow assigns a higher Android version code; the package ID and signing key must also match for an in-place update that preserves SQLite data. Uninstalling/reinstalling or installing an APK with a different signature can erase local medication, schedule, dose, inventory, refill, and profile data.

### Real-device reminder checklist

- Create a one-time reminder and a recurring reminder; confirm each appears at the scheduled time.
- Use the in-app short-delay test reminder, then test a real reminder with the screen locked.
- Confirm notification privacy settings hide medication details when enabled.
- Open the app and record doses as Taken and Skipped; verify history and stock behavior. Notifications currently do not provide Taken/Skipped action buttons.
- Reboot the phone and confirm a future reminder is restored.
- On Android 13+, allow notifications when prompted. If reminders are late or absent, check the app's notification channel, Do Not Disturb, battery/background restrictions, and exact-alarm access under Android Settings → Apps → Mr. Pill Pal → Alarms & reminders (wording varies by Android version/device).

Android and device vendors can delay background alarms under battery saving. This checklist is for manual testing; no physical-device reminder test is claimed by the build workflow.

### Troubleshooting installation and sign-in

- **App not installed / signature mismatch:** check that the previous app and APK use the same release keystore. Do not uninstall an installation containing important test data unless it has been backed up.
- **Package mismatch:** use an APK built from this repository; it must declare `com.anonymous.mrpillpal`.
- **Android version unsupported:** check the phone's Android version; Expo SDK 57 supports Android 7 and newer.
- **Firebase or Google sign-in fails:** confirm `google-services.json` belongs to this Firebase project/package, add the release certificate SHA-1/SHA-256 in Firebase, verify Google sign-in is enabled, and refresh the `GOOGLE_SERVICES_JSON` secret with the updated file.
- **Notifications absent:** enable app notifications and its reminder channel, allow exact alarms if Android exposes that setting, and review battery restrictions. Do not disable system security protections.

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
