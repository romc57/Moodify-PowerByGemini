# Building a standalone Android APK

The app can be built as an APK that runs **independently** (no Expo Go required).

## Option 1: EAS Build (recommended, no Android SDK needed)

1. **Log in to Expo** (one-time):
   ```bash
   npx eas-cli login
   ```

2. **Build the APK**:
   ```bash
   npm run build:apk
   ```
   Or: `npx eas build --platform android --profile preview`

3. When the build finishes, EAS will give you a **download link** for the APK. Install it on your device or share the link.

The `preview` profile in [eas.json](eas.json) is set to produce an **APK** (not an AAB), so you get a single file you can install directly.

---

## Option 2: Local build (requires Android SDK)

If you have the Android SDK installed and `ANDROID_HOME` set:

1. **Set SDK location** (if not already set):
   ```bash
   export ANDROID_HOME=/path/to/Android/Sdk
   ```
   Or create `android/local.properties` with:
   ```properties
   sdk.dir=/path/to/Android/Sdk
   ```

2. **Build the release APK**:
   ```bash
   npm run build:apk:local
   ```

3. The APK will be at:
   ```
   android/app/build/outputs/apk/release/app-release.apk
   ```

Install with: `adb install android/app/build/outputs/apk/release/app-release.apk` or copy the file to your device and open it.
