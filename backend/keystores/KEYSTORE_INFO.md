# Android Release Keystores

These files are the signing keys for the Plato Android APKs.
**Never commit the .jks files to git** (they are in .gitignore).
Back them up in a secure location (password manager, encrypted drive).

---

## dinex-captain.jks — Plato Captain App

| Field        | Value                            |
|--------------|----------------------------------|
| App ID       | in.dinexpos.captain              |
| App Name     | Plato Captain                    |
| Key Alias    | dinex                            |
| Store Pass   | Dinex@123                        |
| Key Pass     | Dinex@123                        |
| Algorithm    | RSA 2048-bit, SHA384withRSA      |
| Valid Until  | ~10,000 days from 2026-05-10     |
| Generated    | 2026-05-10 (build machine Mac)   |
| Used in      | android/app/build.gradle         |
| Path on disk | ~/Desktop/APKS/dinex-captain.jks |

---

## dinex-kds.jks — Plato KDS App

| Field        | Value                           |
|--------------|---------------------------------|
| App ID       | in.dinexpos.kds                 |
| App Name     | Plato KDS                       |
| Key Alias    | dinex                           |
| Store Pass   | Dinex@123                       |
| Key Pass     | Dinex@123                       |
| Algorithm    | RSA 2048-bit, SHA384withRSA     |
| Valid Until  | ~10,000 days from 2026-05-10    |
| Generated    | 2026-05-10 (build machine Mac)  |
| Used in      | android/app/build.gradle        |
| Path on disk | ~/Desktop/APKS/dinex-kds.jks    |

---

## How to build APKs

```bash
# 1. Build web assets
cd apps/waiter-mobile && npm run build
cd apps/kitchen-display && npm run build

# 2. Sync to Android
npx cap sync android   # (run inside each app folder)

# 3. Build signed APK (Java 21 required — set in android/gradle.properties)
cd android && ./gradlew assembleRelease

# Output: android/app/build/outputs/apk/release/app-release.apk
```

> **Java note:** Android builds require Java 21.
> `org.gradle.java.home` is set in `android/gradle.properties` to `~/java21/Contents/Home`.
> If building on a new machine, download Temurin 21 and update that path.

---

## Version history

| App     | Version | Code | Built      | Notes                              |
|---------|---------|------|------------|------------------------------------|
| Captain | 1.5     | 6    | 2026-05-10 | Bill print cashierName, socket fix |
| Captain | 1.4     | 5    | 2026-04-30 | Previous release                   |
| KDS     | 1.4     | 5    | 2026-05-10 | Auto-bump fix, 1-col layout fix    |
| KDS     | 1.3     | 4    | 2026-04-30 | Previous release                   |

---

## POS Windows (.exe) Signing

The POS `.exe` is **not code-signed** (no Windows certificate).
Windows Defender may show a SmartScreen warning on first run — click "More info → Run anyway".
To add code signing: obtain an EV certificate and set `CSC_LINK` / `CSC_KEY_PASSWORD` env vars before running `electron-builder`.
