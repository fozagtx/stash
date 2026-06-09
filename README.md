# FieldMeridian

FieldMeridian is an offline field assistant for people working on-site with poor or no internet.

Its aim is simple: help field teams think, write, and organize work when the cloud is not available. A user can type rough notes, incident details, inspection questions, or operational tasks, and the app helps turn them into clear checklists, reports, decisions, and messages directly on the phone.

## Product Aim

- Turn messy field notes into clean reports.
- Create practical inspection and incident checklists.
- Help choose next actions during field work.
- Draft short team messages from rough instructions.
- Keep the experience local-first and usable without relying on live cloud services.

## Good Questions To Ask

- `Make a field checklist for inspecting flood damage on a road. Include safety risks, tools needed, and a short report template.`
- `Turn these rough notes into a clean field report: [paste notes]`
- `What are the first 5 actions after arriving at a damaged site?`
- `Draft a short message to my team saying the meeting point changed to the north gate.`
- `Make a supply checklist for a 6-hour site visit with no signal.`
- `Extract tasks, risks, people, and times from this note: [paste note]`
- `Write a simple incident report for a blocked road and one injured worker.`

## Boundaries

FieldMeridian is not a live GPS, map, weather, or emergency-services lookup tool. Do not treat it as a source of current location, nearest hospital, live routing, or real-time conditions unless those data sources are added later.

## What Ships

- Android app built with Expo SDK 56 and React Native.
- QVAC SDK integration using `LLAMA_3_2_1B_INST_Q4_0`.
- Explicit Start flow so the user controls when the on-phone assistant opens.
- Glass-style mobile UI with the generated app logo in the header.
- A single visible app name: `FieldMeridian`.
- Setup card hidden after the assistant opens.
- No visible model/runtime/debug jargon in the app interface.
- CPU inference path with unused Vulkan/OpenCL native libraries excluded from the release APK.
- Common project references in [`references/`](./references/README.md).

## Android Package

- App name: `FieldMeridian`
- Package ID: `com.qvac.fieldmeridian`
- Release APK output: `android/app/build/outputs/apk/release/app-release.apk`
- Local desktop copy after build: `~/Desktop/FieldMeridian-release.apk`

## Build

```bash
npm install
npm run typecheck
cd android
./gradlew assembleRelease
```

Install on a connected Android device:

```bash
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

## Development

```bash
npm run prebuild:android
npm run android
```

For Metro only:

```bash
npm run start
```

## References

- [Build reference](./references/build.md)
- [Model reference](./references/model.md)
- [APK optimization reference](./references/apk-optimization.md)
