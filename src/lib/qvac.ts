import { z } from "zod";

import { executeSpatialTool, inferToolFromQuery, runLocalQuery } from "./spatial";
import type { PoiType, QvacState, SpatialResult, SpatialToolArgs, SpatialToolName } from "../types";

type QvacModule = typeof import("@qvac/sdk");
type Progress = import("@qvac/sdk").ModelProgressUpdate;

const MODEL_NAME = "LLAMA_3_2_1B_INST_Q4_0";

const poiTypeSchema = z.enum([
  "clinic",
  "hospital",
  "pharmacy",
  "shelter",
  "school",
  "market",
  "fuel",
  "police",
]);

const toolArgsSchema = z.object({
  place: z.string().describe("Origin place, neighborhood, camp, or landmark in the San Juan bundle").optional(),
  poiType: poiTypeSchema.describe("Type of local point of interest").optional(),
  radiusKm: z.number().min(0.1).max(10).describe("Search radius in kilometers").optional(),
});

let qvacModule: QvacModule | null = null;

async function getQvac() {
  qvacModule ??= await import("@qvac/sdk");
  return qvacModule;
}

function cleanArgs(input: Record<string, unknown>): SpatialToolArgs {
  const parsed = toolArgsSchema.partial().safeParse(input);
  if (!parsed.success) return {};
  return {
    place: parsed.data.place,
    poiType: parsed.data.poiType as PoiType | undefined,
    radiusKm: parsed.data.radiusKm,
  };
}

function makeProgressMessage(progress: Progress) {
  if (typeof progress.percentage === "number") {
    return `${Math.round(progress.percentage)}%`;
  }
  return "working";
}

export async function initializeQvac(
  update: (state: QvacState) => void,
): Promise<string | null> {
  try {
    const qvac = await getQvac();

    update({
      modelId: null,
      status: "downloading",
      message: "Downloading local QVAC model",
      progress: null,
    });

    await qvac.downloadAsset({
      assetSrc: qvac.LLAMA_3_2_1B_INST_Q4_0,
      onProgress: (progress: Progress) => {
        update({
          modelId: null,
          status: "downloading",
          message: `Downloading local QVAC model: ${makeProgressMessage(progress)}`,
          progress: typeof progress.percentage === "number" ? Math.round(progress.percentage) : null,
        });
      },
    });

    update({
      modelId: null,
      status: "loading",
      message: "Loading QVAC model on device",
      progress: null,
    });

    const modelId = await qvac.loadModel({
      modelSrc: qvac.LLAMA_3_2_1B_INST_Q4_0,
      modelType: "llm",
      modelConfig: {
        ctx_size: 2048,
        device: "cpu",
        tools: true,
        verbosity: qvac.VERBOSITY.ERROR,
      },
      onProgress: (progress: Progress) => {
        update({
          modelId: null,
          status: "loading",
          message: `Loading QVAC model: ${makeProgressMessage(progress)}`,
          progress: typeof progress.percentage === "number" ? Math.round(progress.percentage) : null,
        });
      },
    });

    update({
      modelId,
      status: "ready",
      message: "QVAC local model ready",
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

export async function runQvacQuery(modelId: string | null, query: string): Promise<SpatialResult> {
  if (!modelId) return runLocalQuery(query);

  const qvac = await getQvac();
  const localPlan = inferToolFromQuery(query);
  const startedAt = Date.now();
  const tools = [
    {
      name: "geocode_place",
      description: "Resolve a local San Juan place name to offline coordinates.",
      parameters: z.object({
        place: z.string().describe("Place to geocode"),
      }),
      handler: async (args: Record<string, unknown>) =>
        executeSpatialTool("geocode_place", cleanArgs(args), query, "qvac", MODEL_NAME),
    },
    {
      name: "list_pois",
      description: "List local points of interest around an origin within a radius.",
      parameters: z.object({
        place: z.string().describe("Origin place").optional(),
        poiType: poiTypeSchema.describe("Point of interest type").optional(),
        radiusKm: z.number().min(0.1).max(10).describe("Radius in kilometers").optional(),
      }),
      handler: async (args: Record<string, unknown>) =>
        executeSpatialTool("list_pois", cleanArgs(args), query, "qvac", MODEL_NAME),
    },
    {
      name: "find_nearest_poi_with_route",
      description: "Find the nearest matching local POI and return a walking route.",
      parameters: z.object({
        place: z.string().describe("Origin place").optional(),
        poiType: poiTypeSchema.describe("Point of interest type").optional(),
      }),
      handler: async (args: Record<string, unknown>) =>
        executeSpatialTool("find_nearest_poi_with_route", cleanArgs(args), query, "qvac", MODEL_NAME),
    },
  ];

  try {
    const run = qvac.completion({
      modelId,
      stream: true,
      captureThinking: false,
      toolDialect: "json",
      tools,
      history: [
        {
          role: "system",
          content:
            "You route offline San Juan spatial questions to exactly one tool. Use tools only. Do not answer from memory. Prefer find_nearest_poi_with_route for nearest/closest/how do I walk queries, list_pois for list/within/nearby queries, and geocode_place for coordinate questions.",
        },
        {
          role: "user",
          content: query,
        },
      ],
      generationParams: {
        temp: 0.1,
        top_p: 0.8,
        predict: 180,
      },
    });

    const final = await run.final;
    const toolCall = final.toolCalls[0];
    const invoked = toolCall?.invoke ? await toolCall.invoke() : null;

    if (isSpatialResult(invoked)) {
      return {
        ...invoked,
        evidence: {
          ...invoked.evidence,
          latencyMs: Date.now() - startedAt,
          tokensPerSecond: final.stats?.tokensPerSecond,
          backendDevice: final.stats?.backendDevice,
        },
      };
    }
  } catch {
    return executeSpatialTool(localPlan.toolName, localPlan.args, query, "local", "QVAC fallback router");
  }

  return executeSpatialTool(
    localPlan.toolName as SpatialToolName,
    localPlan.args,
    query,
    "local",
    "QVAC no-tool fallback",
  );
}

function isSpatialResult(value: unknown): value is SpatialResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SpatialResult>;
  return typeof candidate.title === "string" && Array.isArray(candidate.markers);
}
