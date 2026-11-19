# LUMI

LUMI is an offline-first Android journal and personal library built with Expo Router, React Native, TypeScript, and SQLite. The shipped offline build does not request Android network access; journal data stays in the app's local database and media directory unless the user explicitly exports a backup.

## Features

- Bookshelf of independent notebooks with selectable cover themes, notebook management, and a swipeable reader that remembers the last location.
- Daily journal with structured text blocks, mood, tags, images, and debounced autosave.
- Calendar, dated planner tasks, priorities, completion tracking, task carry-forward, and local reminder notifications.
- Vocabulary cards with examples, notes, favorites, language labels, import/export, and spaced review intervals of 1, 3, 7, 14, and 30 days.
- Search across entries, tasks, notebooks, and vocabulary; SQLite FTS5 is used when available, with a local SQL fallback.
- Writing streaks and usage statistics derived from local records.
- Optional PIN lock, biometric unlock, automatic relock, and screen-capture prevention while the PIN is configured.
- Portable `.lumibackup` archives containing the database tables and attached images, with checksums and guarded restore.

## Local data and privacy

Release and preview Android builds block `INTERNET`, `ACCESS_NETWORK_STATE`, `RECORD_AUDIO`, `CAMERA`, `SYSTEM_ALERT_WINDOW`, and Firebase Cloud Messaging receive permission. The app uses local reminders only and does not use a camera, microphone, or overlay. Android automatic app backup is disabled. The development build keeps permissions needed for Metro and development tooling.

The optional PIN is an app access gate stored through Android SecureStore. It does **not** encrypt the SQLite database or exported backup. Keep `.lumibackup` files somewhere private. Restoring one replaces the current LUMI database after confirmation.

## Requirements

- Node.js 22.13 or newer (Node 22 LTS recommended).
- For a local Android build: Android Studio with Android SDK/platform tools and JDK 17.
- For an EAS cloud build: an Expo account and the EAS CLI (`npx eas-cli`).

Expo SDK 58 targets React Native 0.88 and requires Node.js 22.13 or newer; see the [SDK 58 reference](https://docs.expo.dev/versions/v58.0.0/) and [Android build setup](https://docs.expo.dev/build/setup/).

## Install and run

```sh
npm install
npm start
```

For a local Android development build in PowerShell, enable the development variant before prebuild and run:

```powershell
$env:APP_VARIANT = 'development'
npx expo prebuild --platform android
npx expo run:android
```

Connect an Android device with USB debugging or start an Android emulator first. The development variant includes the network access Metro needs. Build the offline preview APK with EAS using the `preview` profile:

```sh
npx eas-cli login
npx eas-cli build --platform android --profile preview
```

The `preview` profile produces an internal APK and sets `APP_VARIANT=offline`, so its manifest excludes network permissions. The `production` EAS profile also defaults to the offline variant; use `preview` when you specifically need an installable APK.

## Build and install an offline APK

From PowerShell with Android SDK tools and JDK installed, build a local release APK and install it on a connected device or emulator:

```powershell
$env:APP_VARIANT = 'offline'
npx expo prebuild --platform android --no-install --no-clean
.\android\gradlew.bat -p android :app:assembleRelease
adb install -r .\android\app\build\outputs\apk\release\app-release.apk
```

The prebuilt `LUMI-offline.apk` in the project root can be installed with `adb install -r .\LUMI-offline.apk`. To manually check offline behavior, enable Airplane mode, open LUMI, create a notebook and entry, add a planner task and vocabulary card, close and reopen the app, then export and restore a `.lumibackup`.

The included APK uses the local debug signing key for sideloading. Configure your own release keystore before Play Store distribution.

## Checks

```sh
npm run lint
npm run typecheck
npm test
```

The tests cover date and streak helpers, spaced review scheduling, backup path validation, visual pagination, SQLite migrations and persistence, and serialized autosave.

## Project structure

- `app/` — Expo Router screens and navigation.
- `src/database/` — SQLite schema, settings, and repositories.
- `src/services/` — autosave, media, security, reminders, vocabulary transfer, and backup/restore.
- `src/themes/`, `src/localization/` — notebook themes and language strings.
- `tests/` — Node-based unit and database tests.

An installable universal APK is included at `LUMI-offline.apk`. It is signed with the local debug key for sideloading; create a separate production signing configuration before distributing through Google Play.
