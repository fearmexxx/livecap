import { NextRequest, NextResponse } from "next/server";
import { applyGlossary } from "@/lib/caption/transcriptUtils";
import { resolveEngine, resolveKeys, type ResolvedEngine } from "@/lib/caption/translationEngines";
import { getConfiguredPin, hasWriteAccess, PIN_REQUIRED_MESSAGE } from "@/lib/caption/security";

// In-memory LRU-like cache for instant translation of repetitive phrases
const translationCache = new Map<string, string>();
const MAX_CACHE_SIZE = 1000;

// Multi-mirror Google & MyMemory free translation engine (Handles 429 auto-failover!)
async function translateWithMultiFree(text: string, sourceLang: string, targetLang = "vi"): Promise<string | null> {
  let sl = "auto";
  if (sourceLang.startsWith("ko")) sl = "ko";
  else if (sourceLang.startsWith("en")) sl = "en";

  // Tier 1: Google Chrome dict client endpoint (high rate limit, fast ~120ms)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const url1 = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${sl}&tl=${targetLang}&q=${encodeURIComponent(
      text
    )}`;
    const res1 = await fetch(url1, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      },
    });
    clearTimeout(timeout);
    if (res1.ok) {
      const data = await res1.json();
      if (Array.isArray(data) && typeof data[0] === "string") {
        return data[0];
      }
      if (Array.isArray(data) && Array.isArray(data[0])) {
        return data[0].map((item: any) => (Array.isArray(item) ? item[0] : item)).filter(Boolean).join("");
      }
    }
  } catch (e) {
    // try tier 2
  }

  // Tier 2: Google GTX single endpoint
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const url2 = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${targetLang}&dt=t&q=${encodeURIComponent(
      text
    )}`;
    const res2 = await fetch(url2, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    clearTimeout(timeout);
    if (res2.ok) {
      const data = await res2.json();
      if (Array.isArray(data) && Array.isArray(data[0])) {
        return data[0].map((item: any) => item[0]).filter(Boolean).join("");
      }
    }
  } catch (e) {
    // try tier 3
  }

  // Tier 3: MyMemory Translation API fallback
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const url3 = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sl}|${targetLang}`;
    const res3 = await fetch(url3, { signal: controller.signal });
    clearTimeout(timeout);
    if (res3.ok) {
      const data = await res3.json();
      if (data?.responseData?.translatedText) {
        return data.responseData.translatedText;
      }
    }
  } catch (e) {
    // fallback
  }

  return null;
}

// Prior sentences help the LLM keep pronouns, names and topic consistent across short live fragments
function buildInterpreterPrompt(fromName: string, context: string[]): string {
  let prompt = `You are an expert conference interpreter. Translate the following ${fromName} live speech into natural, fluent Vietnamese for live audience screens. Return ONLY the translated Vietnamese text, with no markdown, quotes or explanations.`;
  if (context.length > 0) {
    prompt += `\n\nFor context only (already translated, do NOT translate or repeat), the speaker just said:\n${context
      .map((c) => `- ${c}`)
      .join("\n")}`;
  }
  return prompt;
}

// OpenAI GPT-4o-mini translation (if user configures OpenAI API Key)
async function translateWithOpenAI(
  text: string,
  sourceLang: string,
  apiKey: string,
  model = "gpt-4o-mini",
  context: string[] = []
): Promise<string> {
  const fromName = sourceLang.startsWith("ko") ? "Korean" : "English";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: buildInterpreterPrompt(fromName, context),
        },
        { role: "user", content: text },
      ],
      temperature: 0.2,
      max_tokens: 250,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI error: ${err}`);
  }

  const data = await res.json();
  const out = data.choices?.[0]?.message?.content?.trim();
  if (!out) throw new Error("empty translation");
  return out;
}

// OpenRouter LLM translation (GPT-4o-mini, Gemini 2.5 Flash, DeepSeek)
async function translateWithOpenRouter(
  text: string,
  sourceLang: string,
  apiKey: string,
  model = "google/gemini-2.5-flash",
  context: string[] = []
): Promise<string> {
  const fromName = sourceLang.startsWith("ko") ? "Korean" : "English";
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "LiveCap Live Captioning",
    },
    body: JSON.stringify({
      model: model || "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: buildInterpreterPrompt(fromName, context),
        },
        { role: "user", content: text },
      ],
      temperature: 0.2,
      max_tokens: 300,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter translate error: ${err}`);
  }

  const data = await res.json();
  const out = data.choices?.[0]?.message?.content?.trim();
  if (!out) throw new Error("empty translation");
  return out;
}

// DeepL translation (if user configures DeepL Auth Key)
async function translateWithDeepL(text: string, sourceLang: string, apiKey: string): Promise<string> {
  const isFree = apiKey.endsWith(":fx");
  const host = isFree ? "https://api-free.deepl.com" : "https://api.deepl.com";
  const sourceCode = sourceLang.startsWith("ko") ? "KO" : "EN";

  const res = await fetch(`${host}/v2/translate`, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: [text],
      source_lang: sourceCode,
      target_lang: "VI",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DeepL error: ${err}`);
  }

  const data = await res.json();
  const out = data.translations?.[0]?.text;
  if (!out) throw new Error("empty translation");
  return out;
}

// Lets the console show which server-side keys exist and whether a room PIN is enforced
export async function GET() {
  const keys = resolveKeys({});
  return NextResponse.json(
    {
      serverKeys: {
        openrouter: !!keys.openrouter,
        openai: !!keys.openai,
        deepl: !!keys.deepl,
      },
      pinRequired: !!getConfiguredPin(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: NextRequest) {
  if (!hasWriteAccess(req.headers)) {
    return NextResponse.json(
      { translatedText: "", error: PIN_REQUIRED_MESSAGE, pinRequired: true, failed: true },
      { status: 401 }
    );
  }
  try {
    const body = await req.json();
    const {
      text,
      sourceLang = "auto",
      targetLang = "vi",
      glossary = [],
      engine: requestedEngine = "auto",
      openrouterTranslateModel = "google/gemini-2.5-flash",
      openaiModel = "gpt-4o-mini",
    } = body;
    const context: string[] = Array.isArray(body.context)
      ? body.context.filter((c: unknown): c is string => typeof c === "string" && c.trim() !== "").slice(-3)
      : [];

    if (!text || typeof text !== "string" || text.trim() === "") {
      return NextResponse.json({ translatedText: "", sourceLang });
    }

    const cleanText = text.trim();
    const keys = resolveKeys(body);
    const engine = resolveEngine(requestedEngine, keys);
    const cacheKey = `${engine}_${sourceLang}_${targetLang}_${cleanText.toLowerCase()}`;

    // Check memory cache
    if (translationCache.has(cacheKey)) {
      const cached = applyGlossary(translationCache.get(cacheKey)!, glossary);
      return NextResponse.json({
        translatedText: cached,
        sourceLang,
        cached: true,
        engine,
      });
    }

    let translated: string | null = null;
    let usedEngine: ResolvedEngine = engine;
    let warning: string | undefined;
    const startTime = Date.now();

    if (engine !== "google-free") {
      try {
        if (engine === "openrouter") {
          translated = await translateWithOpenRouter(cleanText, sourceLang, keys.openrouter, openrouterTranslateModel, context);
        } else if (engine === "openai") {
          translated = await translateWithOpenAI(cleanText, sourceLang, keys.openai, openaiModel, context);
        } else {
          translated = await translateWithDeepL(cleanText, sourceLang, keys.deepl);
        }
      } catch (err: any) {
        console.warn(`${engine} failed, falling back to free Google:`, err.message);
        warning = `${engine} translation failed (${String(err.message).slice(0, 120)}); using free Google fallback.`;
      }
    }

    if (translated === null) {
      usedEngine = "google-free";
      translated = await translateWithMultiFree(cleanText, sourceLang, targetLang);
    }

    if (translated === null) {
      // Every tier failed: tell the console loudly instead of silently showing the source language
      return NextResponse.json({
        translatedText: cleanText,
        sourceLang,
        engine: usedEngine,
        failed: true,
        error: "All translation engines failed. Check the internet connection or API key.",
        latencyMs: Date.now() - startTime,
      });
    }

    const finalTranslation = applyGlossary(translated, glossary);
    const latencyMs = Date.now() - startTime;

    // Only cache real translations from the engine that was asked for
    if (usedEngine === engine) {
      if (translationCache.size > MAX_CACHE_SIZE) {
        const firstKey = translationCache.keys().next().value;
        if (firstKey) translationCache.delete(firstKey);
      }
      translationCache.set(cacheKey, translated);
    }

    return NextResponse.json({
      translatedText: finalTranslation,
      sourceLang,
      cached: false,
      engine: usedEngine,
      fallback: usedEngine !== engine,
      warning,
      latencyMs,
    });
  } catch (error: any) {
    console.error("Translation API Error:", error?.message || error);
    return NextResponse.json(
      {
        translatedText: "",
        failed: true,
        error: error?.message || "Translation failed",
      },
      { status: 200 }
    );
  }
}
