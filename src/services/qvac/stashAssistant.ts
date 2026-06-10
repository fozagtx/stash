import type { Basket, StashItem } from "../../domain/stash";
import { cleanModelLine, stripModelThinking } from "./modelText";
import { runQvacPrompt } from "./qvacRuntime";

export type StashSuggestion = {
  aiTags: string[];
  basketId?: string;
  summary?: string;
  title?: string;
};

export async function suggestForItem(modelId: string | null, item: StashItem, baskets: Basket[]): Promise<StashSuggestion> {
  const basketList = baskets
    .filter((basket) => !basket.archived)
    .map((basket) => `${basket.id}: ${basket.name}`)
    .join("\n");

  const prompt = [
    "/no_think",
    "Analyze this saved item. Return only JSON with keys title, summary, tags, basketId.",
    "Never include reasoning, hidden thinking, markdown, or <think> text.",
    "Rules: title <= 7 words, summary <= 22 words, tags <= 5 lowercase words.",
    "Use a basketId from the basket list only when it clearly fits.",
    "",
    `Baskets:\n${basketList}`,
    "",
    `Current title: ${item.title}`,
    `URL: ${item.url ?? ""}`,
    `Text:\n${item.body.slice(0, 2400)}`,
  ].join("\n");

  const result = await runQvacPrompt(modelId, prompt);
  return parseSuggestion(result.text, baskets);
}

function parseSuggestion(raw: string, baskets: Basket[]): StashSuggestion {
  const json = extractJson(raw);
  const basketIds = new Set(baskets.map((basket) => basket.id));

  try {
    const parsed = JSON.parse(json) as {
      basketId?: string;
      summary?: string;
      tags?: string[];
      title?: string;
    };

    return {
      aiTags: cleanTags(parsed.tags ?? []),
      basketId: parsed.basketId && basketIds.has(parsed.basketId) ? parsed.basketId : undefined,
      summary: cleanModelLine(parsed.summary, 180),
      title: cleanModelLine(parsed.title, 80),
    };
  } catch {
    return {
      aiTags: [],
      summary: cleanModelLine(raw, 180),
    };
  }
}

function extractJson(raw: string) {
  const closedThinkingRemoved = raw.replace(/<think>[\s\S]*?<\/think>/gi, " ");
  return closedThinkingRemoved.match(/\{[\s\S]*\}/)?.[0] ?? raw.match(/\{[\s\S]*\}/)?.[0] ?? stripModelThinking(raw);
}

function cleanTags(tags: string[]) {
  return tags
    .map((tag) => stripModelThinking(tag).trim().replace(/^#/, "").toLowerCase())
    .filter(Boolean)
    .slice(0, 5);
}
