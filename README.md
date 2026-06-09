# FieldMeridian

Offline spatial queries for field teams, built as an Expo Android dev-client app with `@qvac/sdk`.

## What ships

- Expo SDK 56 Android app
- QVAC native plugin with `minSdkVersion` 29
- Tree-shaken QVAC worker bundle using `@qvac/sdk/llamacpp-completion/plugin`
- Local San Juan demo bundle with places, POIs, map markers, and route estimates
- QVAC tool-calling path with deterministic local fallback
- CPU inference path to avoid shipping unused Vulkan/OpenCL GPU libraries
- Local SVG icons with no broad icon-pack dependency
- Evidence panel showing tool, mode, bundle, latency, backend, and decode speed
- Common project references in [`references/`](./references/README.md)

## Run

```bash
npm install
npm run prebuild:android
npm run typecheck
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
