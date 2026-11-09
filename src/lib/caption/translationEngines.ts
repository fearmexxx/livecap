/** Picks the translation engine and API keys for a request. Server-only (reads env). */
export type ResolvedEngine = "openrouter" | "openai" | "deepl" | "google-free";

// Request keys (typed in the console) win; server env keys mean keys never leave the PC at all
export function resolveKeys(body: Record<string, unknown>, env: Record<string, string | undefined> = process.env) {
  const pick = (v: unknown, fallback?: string) =>
    typeof v === "string" && v.trim() ? v.trim() : fallback?.trim() || "";
  return {
    openrouter: pick(body.openrouterApiKey, env.OPENROUTER_API_KEY),
    openai: pick(body.openaiApiKey, env.OPENAI_API_KEY),
    deepl: pick(body.deeplApiKey, env.DEEPL_API_KEY),
  };
}

// "auto" prefers an LLM interpreter when any key exists, and the free Google mirrors otherwise
export function resolveEngine(
  requested: string,
  keys: { openrouter: string; openai: string; deepl: string }
): ResolvedEngine {
  if (requested === "openrouter" && keys.openrouter) return "openrouter";
  if (requested === "openai" && keys.openai) return "openai";
  if (requested === "deepl" && keys.deepl) return "deepl";
  if (requested === "auto") {
    if (keys.openrouter) return "openrouter";
    if (keys.deepl) return "deepl";
    if (keys.openai) return "openai";
  }
  return "google-free";
}
