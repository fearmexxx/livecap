import { NextRequest, NextResponse } from "next/server";
import {
  buildInterpreterMessages,
  cleanLlmOutput,
  hashString,
  postApplyGlossary,
  preApplyGlossary,
} from "@/lib/caption/textProcessing";
import type { GlossaryEntry } from "@/lib/caption/types";

// In-memory LRU cache for repeated phrases (keyed by engine + glossary + text)
const translationCache = new Map<string, string>();
const MAX_CACHE_SIZE = 2000;
const UPSTREAM_TIMEOUT_MS = 6000;

function cacheGet(key: string): string | undefined {
  const v = translationCache.get(key);
  if (v !== undefined) {
    // refresh LRU position
    translationCache.delete(key);
    translationCache.set(key, v);
  }
  return v;
}

function cacheSet(key: string, value: string) {
  if (translationCache.size >= MAX_CACHE_SIZE) {
    const firstKey = translationCache.keys().next().value;
    if (firstKey) translationCache.delete(firstKey);
  }
  translationCache.set(key, value);
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = UPSTREAM_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function sl(sourceLang: string): string {
  if (sourceLang.startsWith("ko")) return "ko";
  if (sourceLang.startsWith("en")) return "en";
  return "auto";
}

/* ---------------- Free Google (multi-mirror) ---------------- */
async function translateWithMultiFree(text: string, sourceLang: string, targetLang = "vi"): Promise<string> {
  const s = sl(sourceLang);
  const ua =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

  // Tier 1: GTX endpoint (returns full sentence segmentation)
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${s}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetchWithTimeout(url, { headers: { "User-Agent": ua } }, 3000);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && Array.isArray(data[0])) {
        const out = data[0].map((item: any) => item?.[0]).filter(Boolean).join("");
        if (out) return out;
      }
    }
  } catch {}

  // Tier 2: Chrome dict client
  try {
    const url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${s}&tl=${targetLang}&q=${encodeURIComponent(text)}`;
    const res = await fetchWithTimeout(url, { headers: { "User-Agent": ua } }, 3000);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && typeof data[0] === "string") return data[0];
      if (Array.isArray(data) && Array.isArray(data[0])) {
        const out = data[0].map((item: any) => (Array.isArray(item) ? item[0] : item)).filter(Boolean).join("");
        if (out) return out;
      }
    }
  } catch {}

  // Tier 3: MyMemory
  try {
    const pair = `${s === "auto" ? "ko" : s}|${targetLang}`;
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${pair}`;
    const res = await fetchWithTimeout(url, {}, 3000);
    if (res.ok) {
      const data = await res.json();
      if (data?.responseData?.translatedText) return data.responseData.translatedText;
    }
  } catch {}

  throw new Error("All free translation mirrors failed");
}

/* ---------------- LLM engines (OpenRouter / OpenAI) ---------------- */
interface LlmArgs {
  text: string;
  sourceLang: string;
  glossary: GlossaryEntry[];
  context: string[];
  eventContext?: string;
  speakerName?: string;
}

async function translateWithChatApi(
  endpoint: string,
  apiKey: string,
  model: string,
  args: LlmArgs,
  extraHeaders: Record<string, string> = {}
): Promise<string> {
  const messages = buildInterpreterMessages(args);
  const res = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.1,
      max_tokens: 400,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LLM ${res.status}: ${err.slice(0, 300)}`);
  }
  const data = await res.json();
  const out = cleanLlmOutput(data.choices?.[0]?.message?.content || "");
  if (!out) throw new Error("LLM returned empty translation");
  return out;
}

/* ---------------- DeepL ---------------- */
async function translateWithDeepL(text: string, sourceLang: string, apiKey: string, context: string[]): Promise<string> {
  const host = apiKey.endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com";
  const s = sl(sourceLang);
  const body: Record<string, unknown> = { text: [text], target_lang: "VI" };
  if (s !== "auto") body.source_lang = s.toUpperCase();
  if (context.length) body.context = context.slice(-3).join(" ");
  const res = await fetchWithTimeout(`${host}/v2/translate`, {
    method: "POST",
    headers: { Authorization: `DeepL-Auth-Key ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`DeepL ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.translations?.[0]?.text || text;
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  try {
    const body = await req.json();
    const {
      text,
      sourceLang = "auto",
      targetLang = "vi",
      glossary = [] as GlossaryEntry[],
      context = [] as string[],
      eventContext = "",
      speakerName = "",
      engine = "google-free",
      openrouterApiKey,
      openrouterTranslateModel = "google/gemini-2.5-flash",
      openaiApiKey,
      openaiModel = "gpt-4o-mini",
      deeplApiKey,
    } = body;

    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ translatedText: "", sourceLang });
    }

    const cleanText = text.trim();
    const safeGlossary: GlossaryEntry[] = Array.isArray(glossary) ? glossary : [];
    const safeContext: string[] = Array.isArray(context) ? context.filter((c) => typeof c === "string") : [];

    // Server-side env keys allow keeping secrets off operator laptops' localStorage
    const orKey = (openrouterApiKey || process.env.OPENROUTER_API_KEY || "").trim();
    const oaKey = (openaiApiKey || process.env.OPENAI_API_KEY || "").trim();
    const dlKey = (deeplApiKey || process.env.DEEPL_API_KEY || "").trim();

    const glossaryHash = hashString(JSON.stringify(safeGlossary));
    const cacheKey = `${engine}|${sourceLang}|${targetLang}|${glossaryHash}|${eventContext}|${cleanText.toLowerCase()}`;
    const cached = cacheGet(cacheKey);
    if (cached !== undefined) {
      return NextResponse.json({ translatedText: cached, sourceLang, cached: true, engine, latencyMs: 0 });
    }

    let translated = "";
    let usedEngine = engine;
    const llmArgs: LlmArgs = {
      text: cleanText,
      sourceLang,
      glossary: safeGlossary,
      context: safeContext,
      eventContext,
      speakerName,
    };

    try {
      if (engine === "openrouter" && orKey) {
        translated = await translateWithChatApi(
          "https://openrouter.ai/api/v1/chat/completions",
          orKey,
          openrouterTranslateModel || "google/gemini-2.5-flash",
          llmArgs,
          { "HTTP-Referer": "https://livecap.vbe.vn", "X-Title": "VBE LiveCap Studio" }
        );
      } else if (engine === "openai" && oaKey) {
        translated = await translateWithChatApi(
          "https://api.openai.com/v1/chat/completions",
          oaKey,
          openaiModel || "gpt-4o-mini",
          llmArgs
        );
      } else if (engine === "deepl" && dlKey) {
        translated = postApplyGlossary(
          await translateWithDeepL(preApplyGlossary(cleanText, safeGlossary), sourceLang, dlKey, safeContext),
          safeGlossary
        );
      } else {
        usedEngine = "google-free";
        translated = await translateWithMultiFree(preApplyGlossary(cleanText, safeGlossary), sourceLang, targetLang);
      }
    } catch (err: any) {
      console.warn(`[translate] ${engine} failed → falling back to google-free:`, err?.message);
      usedEngine = "google-free (fallback)";
      translated = await translateWithMultiFree(preApplyGlossary(cleanText, safeGlossary), sourceLang, targetLang);
    }

    const finalTranslation = postApplyGlossary(translated, safeGlossary);
    cacheSet(cacheKey, finalTranslation);

    return NextResponse.json({
      translatedText: finalTranslation,
      sourceLang,
      cached: false,
      engine: usedEngine,
      latencyMs: Date.now() - startTime,
    });
  } catch (error: any) {
    console.error("Translation API Error:", error?.message || error);
    // Never return 5xx for a live show: client keeps the source text
    return NextResponse.json(
      { translatedText: "", error: error?.message || "Translation failed", latencyMs: Date.now() - startTime },
      { status: 200 }
    );
  }
}
