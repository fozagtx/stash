# APK Optimization Reference

## Current APKs

```text
android/app/build/outputs/apk/debug/app-debug.apk
159435016 bytes
152 MB shown by ls -lh

android/app/build/outputs/apk/release/app-release.apk
141854789 bytes
135 MB shown by ls -lh
```

## Removed Or Avoided

- Removed direct `expo-device` dependency from the app package.
- Removed `lucide-react-native` and replaced seven icons with a tiny local SVG icon component.
- Disabled GIF image support with `expo.gif.enabled=false`.
- Kept animated WebP disabled with `expo.webp.animated=false`.
- Forced QVAC model loading to CPU mode.
- Excluded unused QVAC GPU libraries from Android packaging:
  - `libqvac-ggml-vulkan.so`
  - `libqvac-ggml-opencl.so`
  - `libOpenCL.so`
- Removed the OpenCL native-library declaration from the Android manifest.

The APK audit confirmed those GPU libraries are not present in the debug APK.

## Remaining Large Native Pieces

These remain because they are tied to React Native, QVAC, Bare runtime, or the app bundle:

```text
63164720 lib/arm64-v8a/libbare-kit.so
21637448 assets/index.android.bundle
8887128  lib/arm64-v8a/librocksdb-native.3.15.2.so
8297384  lib/arm64-v8a/libqvac__llm-llamacpp.0.22.1.so
7018128  classes.dex
6763936  lib/arm64-v8a/libreactnative.so
2460728  lib/arm64-v8a/libhermesvm.so
```

Do not strip `react-native-bare-kit`, `bare-rpc`, `expo-file-system`, or the QVAC Llama plugin without a device runtime test. They are part of the QVAC load and inference path.
