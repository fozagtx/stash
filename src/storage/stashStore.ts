import * as FileSystem from "expo-file-system/legacy";

import type { Basket, IncomingShare, ItemDraft, StashData, StashItem, StashSettings } from "../domain/stash";
import { domainFromUrl, extractPrimaryUrl } from "../services/linkMetadata/linkMetadata";
import { cleanModelLine } from "../services/qvac/modelText";

const SCHEMA_VERSION = 2;
const STORE_DIR = `${FileSystem.documentDirectory ?? ""}stash/`;
const STORE_FILE = `${STORE_DIR}store.v1.json`;
const BACKUP_FILE = `${STORE_DIR}store.v1.bak.json`;
const EXPORT_FILE = `${STORE_DIR}stash-export.json`;
const MARKDOWN_EXPORT_FILE = `${STORE_DIR}stash-export.md`;

const DEFAULT_SETTINGS: StashSettings = {
  aiSuggestions: true,
  fetchLinkPreviews: true,
  onboardingComplete: false,
  privateItemsVisible: false,
};

const DEFAULT_BASKET_NAMES = ["Inbox", "Read Later", "Ideas", "Work", "Receipts"];

export async function loadStashData(): Promise<StashData> {
  await ensureStoreDirectory();

  const info = await FileSystem.getInfoAsync(STORE_FILE);
  if (!info.exists) {
    const seed = createSeedData();
    await persistStashData(seed);
    return seed;
  }

  try {
    const raw = await FileSystem.readAsStringAsync(STORE_FILE);
    return sanitizeData(JSON.parse(raw));
  } catch {
    const backup = await FileSystem.getInfoAsync(BACKUP_FILE);
    if (backup.exists) {
      const raw = await FileSystem.readAsStringAsync(BACKUP_FILE);
      return sanitizeData(JSON.parse(raw));
    }

    const seed = createSeedData();
    await persistStashData(seed);
    return seed;
  }
}

export async function persistStashData(data: StashData) {
  await ensureStoreDirectory();
  const info = await FileSystem.getInfoAsync(STORE_FILE);
  if (info.exists) {
    await FileSystem.copyAsync({ from: STORE_FILE, to: BACKUP_FILE });
  }

  await FileSystem.writeAsStringAsync(STORE_FILE, JSON.stringify(sanitizeData(data), null, 2));
}

export async function exportStashData(data: StashData) {
  await ensureStoreDirectory();
  await FileSystem.writeAsStringAsync(EXPORT_FILE, JSON.stringify(sanitizeData(data), null, 2));
  return EXPORT_FILE;
}

export async function exportStashMarkdown(data: StashData) {
  await ensureStoreDirectory();
  await FileSystem.writeAsStringAsync(MARKDOWN_EXPORT_FILE, buildMarkdownBackup(sanitizeData(data)));
  return MARKDOWN_EXPORT_FILE;
}

export async function exportStashBackup(data: StashData, format: "json" | "markdown") {
  const directoryUri = await requestBackupDirectory();
  if (!directoryUri) return null;

  const safeData = sanitizeData(data);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileBase = format === "json" ? `stash-backup-${stamp}` : `stash-notes-${stamp}`;
  const mimeType = format === "json" ? "application/json" : "text/markdown";
  const content = format === "json" ? JSON.stringify(safeData, null, 2) : buildMarkdownBackup(safeData);
  const uri = await FileSystem.StorageAccessFramework.createFileAsync(directoryUri, fileBase, mimeType);

  await FileSystem.StorageAccessFramework.writeAsStringAsync(uri, content);

  return {
    fileName: `${fileBase}${format === "json" ? ".json" : ".md"}`,
    uri,
  };
}

export async function importStashBackupFromDirectory() {
  const directoryUri = await requestBackupDirectory();
  if (!directoryUri) return null;

  const files = await FileSystem.StorageAccessFramework.readDirectoryAsync(directoryUri);
  const candidates = files
    .filter((uri) => {
      const name = readableBackupFileName(uri).toLowerCase();
      return name.includes("stash") && (name.includes("json") || name.includes("backup"));
    })
    .sort((left, right) => readableBackupFileName(right).localeCompare(readableBackupFileName(left)));

  if (!candidates.length) {
    throw new Error("No Stash JSON backup found in that folder.");
  }

  let lastError: unknown;
  for (const uri of candidates) {
    try {
      const raw = await FileSystem.StorageAccessFramework.readAsStringAsync(uri);
      const data = sanitizeData(JSON.parse(raw));
      return {
        data,
        fileName: readableBackupFileName(uri),
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Could not read the backup file.");
}

export function createSeedData(): StashData {
  const now = new Date().toISOString();

  return {
    baskets: DEFAULT_BASKET_NAMES.map((name, index) => createBasket(name, index, now)),
    items: [],
    schemaVersion: SCHEMA_VERSION,
    settings: DEFAULT_SETTINGS,
  };
}

export function createBasket(name: string, sortOrder: number, timestamp = new Date().toISOString()): Basket {
  return {
    archived: false,
    createdAt: timestamp,
    id: makeId("basket"),
    name: name.trim(),
    sortOrder,
    updatedAt: timestamp,
  };
}

export function createDraftFromInput(input: string, options: Partial<ItemDraft> = {}): ItemDraft {
  const url = extractPrimaryUrl(input);
  const body = input.trim();
  const title = options.title?.trim() || inferTitle(body, url);

  return {
    basketId: options.basketId ?? "inbox",
    body,
    captureMethod: options.captureMethod ?? "manual",
    isPrivate: options.isPrivate ?? false,
    sourceApp: options.sourceApp,
    title,
    type: options.type ?? (url ? "link" : "note"),
    url: options.url ?? url ?? undefined,
    userTags: options.userTags ?? [],
  };
}

export function createDraftFromShare(payload: IncomingShare, basketId: string): ItemDraft | null {
  const body = [payload.subject, payload.text].filter(Boolean).join("\n").trim();
  if (!body) return null;

  const url = extractPrimaryUrl(body);
  return createDraftFromInput(body, {
    basketId,
    captureMethod: "share",
    sourceApp: payload.source,
    title: payload.subject?.trim() || undefined,
    type: url ? "link" : "text",
    url: url ?? undefined,
  });
}

export function createItemFromDraft(draft: ItemDraft, timestamp = new Date().toISOString()): StashItem {
  const url = draft.url ?? extractPrimaryUrl(draft.body) ?? undefined;
  const domain = url ? domainFromUrl(url) : undefined;

  return {
    aiTags: [],
    archived: false,
    basketId: draft.basketId,
    body: draft.body.trim(),
    captureMethod: draft.captureMethod,
    createdAt: timestamp,
    deletedAt: null,
    domain,
    id: makeId("item"),
    isPrivate: draft.isPrivate,
    metadata: url
      ? {
          status: draft.isPrivate ? "disabled" : "idle",
        }
      : undefined,
    pinned: false,
    sourceApp: draft.sourceApp,
    title: draft.title.trim() || inferTitle(draft.body, url),
    type: draft.type,
    updatedAt: timestamp,
    url,
    userTags: cleanTags(draft.userTags),
  };
}

export function upsertItem(data: StashData, item: StashItem): StashData {
  const now = new Date().toISOString();
  const existing = data.items.findIndex((candidate) => candidate.id === item.id);
  const nextItem = { ...item, updatedAt: now };
  const items =
    existing >= 0
      ? data.items.map((candidate) => (candidate.id === item.id ? nextItem : candidate))
      : [nextItem, ...data.items];

  return {
    ...data,
    items,
  };
}

export function hideItem(data: StashData, itemId: string): StashData {
  const now = new Date().toISOString();
  return {
    ...data,
    items: data.items.map((item) => (item.id === itemId ? { ...item, deletedAt: now, updatedAt: now } : item)),
  };
}

export function updateSettings(data: StashData, settings: Partial<StashSettings>): StashData {
  return {
    ...data,
    settings: {
      ...data.settings,
      ...settings,
    },
  };
}

export function addBasket(data: StashData, name: string): StashData {
  const trimmed = name.trim();
  if (!trimmed) return data;

  const exists = data.baskets.some((basket) => basket.name.toLowerCase() === trimmed.toLowerCase() && !basket.archived);
  if (exists) return data;

  return {
    ...data,
    baskets: [...data.baskets, createBasket(trimmed, data.baskets.length)],
  };
}

export function searchItems(data: StashData, query: string, basketId?: string) {
  const needle = query.trim().toLowerCase();
  const activeBaskets = new Map(data.baskets.map((basket) => [basket.id, basket]));

  return data.items
    .filter((item) => !item.deletedAt && !item.archived)
    .filter((item) => data.settings.privateItemsVisible || !item.isPrivate)
    .filter((item) => !basketId || item.basketId === basketId)
    .filter((item) => {
      if (!needle) return true;
      const basket = activeBaskets.get(item.basketId);
      const haystack = [
        item.title,
        item.body,
        item.url,
        item.domain,
        item.metadata?.title,
        item.metadata?.description,
        item.metadata?.siteName,
        item.summary,
        basket?.name,
        ...item.userTags,
        ...item.aiTags,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    })
    .sort((left, right) => {
      if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
      return right.updatedAt.localeCompare(left.updatedAt);
    });
}

export function getInboxId(data: StashData) {
  return data.baskets.find((basket) => basket.name.toLowerCase() === "inbox" && !basket.archived)?.id ?? data.baskets[0]?.id;
}

export function formatItemForCopy(item: StashItem, basket?: Basket) {
  const summary = cleanModelLine(item.summary, 180);

  return [
    item.title,
    item.url,
    item.body,
    summary ? `Summary: ${summary}` : undefined,
    item.userTags.length || item.aiTags.length ? `Tags: ${[...item.userTags, ...item.aiTags].join(", ")}` : undefined,
    basket ? `Basket: ${basket.name}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildMarkdownBackup(data: StashData) {
  const baskets = [...data.baskets].sort((left, right) => left.sortOrder - right.sortOrder);
  const itemsByBasket = new Map(baskets.map((basket) => [basket.id, [] as StashItem[]]));

  data.items
    .filter((item) => !item.deletedAt && !item.archived)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .forEach((item) => {
      const bucket = itemsByBasket.get(item.basketId) ?? itemsByBasket.get(baskets[0]?.id ?? "");
      bucket?.push(item);
    });

  const lines = [
    "# Stash Backup",
    "",
    `Exported: ${new Date().toISOString()}`,
    `Baskets: ${baskets.length}`,
    `Items: ${data.items.filter((item) => !item.deletedAt && !item.archived).length}`,
    "",
  ];

  for (const basket of baskets) {
    if (basket.archived) continue;
    const items = itemsByBasket.get(basket.id) ?? [];
    lines.push(`## ${escapeMarkdown(basket.name)}`, "");

    if (!items.length) {
      lines.push("_No saved items._", "");
      continue;
    }

    for (const item of items) {
      const tags = [...item.userTags, ...item.aiTags].map((tag) => `#${tag}`).join(", ");
      lines.push(`### ${escapeMarkdown(item.title || "Untitled stash")}`);
      lines.push(`- Type: ${item.type}`);
      if (item.url) lines.push(`- Link: ${item.url}`);
      if (item.domain) lines.push(`- Domain: ${item.domain}`);
      if (tags) lines.push(`- Tags: ${tags}`);
      lines.push(`- Saved: ${item.createdAt}`);
      if (item.isPrivate) lines.push("- Marked private");
      lines.push("", item.body.trim() || "_No body text._", "");
      if (item.summary) lines.push(`Summary: ${cleanModelLine(item.summary, 260)}`, "");
    }
  }

  return `${lines.join("\n").trim()}\n`;
}

async function requestBackupDirectory() {
  const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  return permissions.granted ? permissions.directoryUri : null;
}

function readableBackupFileName(uri: string) {
  const decoded = safeDecode(uri);
  const fromDocument = decoded.split("/").pop() ?? decoded;
  return fromDocument.split(":").pop() ?? "stash-backup.json";
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function escapeMarkdown(value: string) {
  return value.replace(/([\\`*_{}[\]()#+\-.!>])/g, "\\$1");
}

function sanitizeData(value: Partial<StashData>): StashData {
  const baskets = Array.isArray(value.baskets) && value.baskets.length > 0 ? value.baskets : createDefaultBaskets();
  const basketIds = new Set(baskets.map((basket) => basket.id));
  const fallbackBasket = baskets[0]?.id ?? "inbox";
  const storedSettings: Partial<StashSettings> = value.settings ?? {};
  const fetchLinkPreviews =
    value.schemaVersion === 1 && storedSettings.fetchLinkPreviews === false ? true : (storedSettings.fetchLinkPreviews ?? DEFAULT_SETTINGS.fetchLinkPreviews);

  return {
    baskets: baskets.map((basket, index) => ({
      archived: Boolean(basket.archived),
      createdAt: basket.createdAt || new Date().toISOString(),
      id: basket.id || makeId("basket"),
      name: basket.name || "Inbox",
      sortOrder: typeof basket.sortOrder === "number" ? basket.sortOrder : index,
      updatedAt: basket.updatedAt || new Date().toISOString(),
    })),
    items: Array.isArray(value.items)
      ? value.items.map((item) => ({
          ...item,
          aiTags: Array.isArray(item.aiTags) ? item.aiTags : [],
          archived: Boolean(item.archived),
          basketId: basketIds.has(item.basketId) ? item.basketId : fallbackBasket,
          deletedAt: item.deletedAt ?? null,
          isPrivate: Boolean(item.isPrivate),
          pinned: Boolean(item.pinned),
          summary: cleanModelLine(item.summary, 180),
          title: cleanModelLine(item.title, 90) ?? "Untitled stash",
          userTags: Array.isArray(item.userTags) ? item.userTags : [],
        }))
      : [],
    schemaVersion: SCHEMA_VERSION,
    settings: {
      ...DEFAULT_SETTINGS,
      ...storedSettings,
      fetchLinkPreviews,
    },
  };
}

function createDefaultBaskets() {
  return DEFAULT_BASKET_NAMES.map((name, index) => createBasket(name, index));
}

async function ensureStoreDirectory() {
  const directory = await FileSystem.getInfoAsync(STORE_DIR);
  if (!directory.exists) {
    await FileSystem.makeDirectoryAsync(STORE_DIR, { intermediates: true });
  }
}

function inferTitle(body: string, url?: string | null) {
  if (url) return domainFromUrl(url) || "Saved link";
  const firstLine = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) return "Untitled stash";
  return firstLine.length > 64 ? `${firstLine.slice(0, 61)}...` : firstLine;
}

function cleanTags(tags: string[]) {
  return Array.from(
    new Set(
      tags
        .flatMap((tag) => tag.split(","))
        .map((tag) => tag.trim().replace(/^#/, "").toLowerCase())
        .filter(Boolean),
    ),
  ).slice(0, 12);
}

function makeId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}
