# Model Reference

## Active QVAC Model

```text
LLAMA_3_2_1B_INST_Q4_0
```

This is the QVAC SDK registry asset used by the app:

```text
registry://hf/unsloth/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_0.gguf
```

## Size

- Registry size: `773025824` bytes
- Decimal size: about `773 MB`
- Binary size: about `737 MiB`

The model is downloaded by QVAC at runtime. It is not embedded inside the APK.

## Runtime

- Model type: `llm`
- Context size: `2048`
- Device: `cpu`
- Tool calling: enabled

CPU inference was chosen because the app only needs local tool routing over a small offline spatial bundle. Shipping Vulkan/OpenCL GPU libraries made the APK much larger without being necessary for the demo path.
