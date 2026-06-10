# Model Reference

## Active QVAC Model

```text
QWEN3_600M_INST_Q4
```

This is the QVAC SDK registry asset used by the app:

```text
registry://hf/unsloth/Qwen3-0.6B-GGUF/blob/50968a4468ef4233ed78cd7c3de230dd1d61a56b/Qwen3-0.6B-Q4_0.gguf
```

## Size

- Registry size: `382156480` bytes
- Decimal size: about `382 MB`
- Binary size: about `364 MiB`

The model is downloaded by QVAC at runtime. It is not embedded inside the APK.

## Runtime

- Model type: `llm`
- Context size: `2048`
- Device: `cpu`
- Tool calling: disabled

CPU inference was chosen to keep the Android package smaller and avoid shipping Vulkan/OpenCL GPU libraries for the current on-device sorting layer.
