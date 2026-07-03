export function safeJsonParse(jsonString: string | null | undefined, fallback: any = {}) {
  if (!jsonString) return fallback;
  try {
    return JSON.parse(jsonString);
  } catch {
    return fallback;
  }
}
