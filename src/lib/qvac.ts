import type { QvacRunResult, QvacState } from "../types";

type QvacModule = typeof import("@qvac/sdk");
type Progress = import("@qvac/sdk").ModelProgressUpdate;

let qvacModule: QvacModule | null = null;

async function getQvac() {
  qvacModule ??= await import("@qvac/sdk");
  return qvacModule;
}

function updateProgress(
  update: (state: QvacState) => void,
  status: QvacState["status"],
  message: string,
  progress: Progress,
) {
  update({
    modelId: null,
    status,
    message,
    progress: typeof progress.percentage === "number" ? Math.round(progress.percentage) : null,
  });
}

export async function initializeQvac(update: (state: QvacState) => void): Promise<string | null> {
  try {
    const qvac = await getQvac();

    update({
      modelId: null,
      status: "downloading",
      message: "Getting ready",
      progress: null,
    });

    await qvac.downloadAsset({
      assetSrc: qvac.LLAMA_3_2_1B_INST_Q4_0,
      onProgress: (progress: Progress) => {
        updateProgress(update, "downloading", "Getting ready", progress);
      },
    });

    update({
      modelId: null,
      status: "loading",
      message: "Opening",
      progress: null,
    });

    const modelId = await qvac.loadModel({
      modelSrc: qvac.LLAMA_3_2_1B_INST_Q4_0,
      modelType: "llm",
      modelConfig: {
        ctx_size: 2048,
        device: "cpu",
        tools: false,
        verbosity: qvac.VERBOSITY.ERROR,
      },
      onProgress: (progress: Progress) => {
        updateProgress(update, "loading", "Opening", progress);
      },
    });

    update({
      modelId,
      status: "ready",
      message: "On",
      progress: null,
    });

    return modelId;
  } catch (error) {
    update({
      modelId: null,
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      progress: null,
    });
    return null;
  }
}

export async function shutdownQvac(modelId: string | null) {
  if (!modelId) return;
  const qvac = await getQvac();
  await qvac.unloadModel({ modelId, clearStorage: false });
}

export async function runQvacPrompt(
  modelId: string | null,
  prompt: string,
  onText: (text: string) => void,
): Promise<QvacRunResult> {
  if (!modelId) {
    throw new Error("Start the assistant first.");
  }

  const qvac = await getQvac();
  let streamedText = "";

  const run = qvac.completion({
    modelId,
    stream: true,
    captureThinking: false,
    history: [
      {
        role: "system",
        content: "You are FieldMeridian. Give plain, practical answers. Keep replies short. Do not describe how the app works unless asked.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    generationParams: {
      temp: 0.2,
      top_p: 0.9,
      predict: 220,
    },
  });

  for await (const event of run.events) {
    if (event.type === "contentDelta") {
      streamedText += event.text;
      onText(streamedText);
    }
  }

  const final = await run.final;
  const text = final.contentText.trim() || streamedText.trim();

  return {
    text,
  };
}
