export function stripModelThinking(value: unknown) {
  if (typeof value !== "string") return "";

  let clean = value.replace(/<think>[\s\S]*?<\/think>/gi, " ");
  const openTag = clean.toLowerCase().indexOf("<think>");
  if (openTag >= 0) {
    clean = clean.slice(0, openTag);
  }

  return clean.replace(/<\/?think>/gi, " ").replace(/\s+/g, " ").trim();
}

export function cleanModelLine(value: unknown, maxLength: number) {
  const clean = stripModelThinking(value);
  if (!clean) return undefined;
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 3)}...` : clean;
}
