# Build Reference

## Commands

```bash
npm install
npm run prebuild:android
npm run typecheck
cd android
./gradlew assembleDebug
./gradlew assembleRelease
```

## Artifacts

```text
android/app/build/outputs/apk/debug/app-debug.apk
android/app/build/outputs/apk/release/app-release.apk
```

## Android Identity

```text
applicationId: com.qvac.fieldmeridian
label: FieldMeridian
scheme: fieldmeridian
```

## Local Toolchain

- Android SDK path: `android/local.properties`
- JDK: pinned to OpenJDK 21 in `android/gradle.properties`
- Android ABI: `arm64-v8a`
- Minimum Android SDK: 29

The release build currently uses the generated debug signing config. That is acceptable for local demo testing, not for Play Store distribution.
