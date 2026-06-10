import type { LinkMetadata } from "../../domain/stash";

const URL_PATTERN = /https?:\/\/[^\s<>"']+|www\.[^\s<>"']+/i;
const TRAILING_PUNCTUATION = /[),.;!?]+$/;
const SAFE_PROTOCOLS = new Set(["http:", "https:"]);

export function extractPrimaryUrl(input: string) {
  const match = input.match(URL_PATTERN);
  if (!match) return null;

  return normalizeUrl(match[0].replace(TRAILING_PUNCTUATION, ""));
}

export function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

export function domainFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

export function isSafeRemoteUrl(value: string | undefined) {
  if (!value) return false;

  try {
    const parsed = new URL(value);
    return SAFE_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

export async function fetchLinkMetadata(url: string): Promise<LinkMetadata> {
  if (!isSafeRemoteUrl(url)) {
    return {
      error: "Unsupported link",
      fetchedAt: new Date().toISOString(),
      status: "failed",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Stash/1.0",
      },
      signal: controller.signal,
    });

    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    if (!contentType.toLowerCase().includes("html")) {
      throw new Error("Not an HTML page");
    }

    const html = (await response.text()).slice(0, 240_000);
    return {
      canonicalUrl: absoluteUrl(readLinkHref(html, "canonical"), url),
      description: firstText(
        readMeta(html, "property", "og:description"),
        readMeta(html, "name", "twitter:description"),
        readMeta(html, "name", "description"),
      ),
      faviconUrl: absoluteUrl(firstText(readLinkHref(html, "icon"), readLinkHref(html, "shortcut icon")), url),
      fetchedAt: new Date().toISOString(),
      imageUrl: absoluteUrl(
        firstText(
          readMeta(html, "property", "og:image"),
          readMeta(html, "property", "og:image:url"),
          readMeta(html, "property", "og:image:secure_url"),
          readMeta(html, "name", "twitter:image"),
          readMeta(html, "itemprop", "image"),
          readLinkHref(html, "image_src"),
          readJsonLdImage(html),
          readFirstContentImage(html),
        ),
        url,
      ),
      siteName: readMeta(html, "property", "og:site_name"),
      status: "fetched",
      title: firstText(
        readMeta(html, "property", "og:title"),
        readMeta(html, "name", "twitter:title"),
        readTitle(html),
      ),
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      fetchedAt: new Date().toISOString(),
      status: "failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function firstText(...values: Array<string | undefined>) {
  return values.find((value) => value && value.trim().length > 0)?.trim();
}

function readTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeHtml(stripTags(match[1])).trim() : undefined;
}

function readMeta(html: string, attr: "itemprop" | "name" | "property", key: string) {
  const tag = findTag(html, "meta", attr, key);
  if (!tag) return undefined;

  const content = readAttribute(tag, "content");
  return content ? decodeHtml(content).trim() : undefined;
}

function readLinkHref(html: string, rel: string) {
  const tag = findTag(html, "link", "rel", rel);
  if (!tag) return undefined;

  const href = readAttribute(tag, "href");
  return href ? decodeHtml(href).trim() : undefined;
}

function readJsonLdImage(html: string) {
  const scripts = html.match(/<script\b[^>]*type\s*=\s*(['"])application\/ld\+json\1[^>]*>[\s\S]*?<\/script>/gi) ?? [];

  for (const script of scripts) {
    const body = script.replace(/^<script\b[^>]*>/i, "").replace(/<\/script>$/i, "");
    try {
      const parsed = JSON.parse(decodeHtml(body.trim()));
      const image = findImageInJsonLd(parsed);
      if (image) return image;
    } catch {
      const match = body.match(/"image"\s*:\s*"([^"]+)"/i);
      if (match?.[1]) return decodeHtml(match[1]);
    }
  }

  return undefined;
}

function findImageInJsonLd(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findImageInJsonLd(item);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof value !== "object") return undefined;

  const record = value as Record<string, unknown>;
  const image = record.image;
  if (typeof image === "string") return image;
  if (Array.isArray(image) || (image && typeof image === "object")) {
    const nested = findImageInJsonLd(image);
    if (nested) return nested;
  }
  if (typeof record.url === "string" && /image/i.test(String(record["@type"] ?? ""))) return record.url;
  return undefined;
}

function readFirstContentImage(html: string) {
  const images = html.match(/<img\b[^>]*>/gi) ?? [];
  for (const tag of images) {
    const srcset = readAttribute(tag, "srcset");
    const src = readAttribute(tag, "src") ?? srcset?.split(",")[0]?.trim().split(/\s+/)[0];
    if (!src) continue;
    if (/base64|data:|svg|sprite|logo|icon|avatar|tracking|pixel/i.test(src)) continue;
    return decodeHtml(src);
  }
  return undefined;
}

function findTag(html: string, tagName: "link" | "meta", attr: string, value: string) {
  const tags = html.match(new RegExp(`<${tagName}\\b[^>]*>`, "gi")) ?? [];
  const target = value.toLowerCase();

  return tags.find((tag) => {
    const attrValue = readAttribute(tag, attr)?.toLowerCase();
    if (!attrValue) return false;
    if (attr === "rel") return attrValue.split(/\s+/).includes(target);
    return attrValue === target;
  });
}

function readAttribute(tag: string, attr: string) {
  const pattern = new RegExp(`${attr}\\s*=\\s*(['"])(.*?)\\1`, "i");
  const quoted = tag.match(pattern);
  if (quoted) return quoted[2];

  const bare = tag.match(new RegExp(`${attr}\\s*=\\s*([^\\s>]+)`, "i"));
  return bare?.[1];
}

function absoluteUrl(value: string | undefined, baseUrl: string) {
  if (!value) return undefined;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

function stripTags(value: string) {
  return value.replace(/<[^>]+>/g, " ");
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}
