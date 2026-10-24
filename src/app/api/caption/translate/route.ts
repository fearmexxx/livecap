import { NextRequest, NextResponse } from "next/server";

// In-memory LRU-like cache for instant translation of repetitive phrases
const translationCache = new Map<string, string>();
const MAX_CACHE_SIZE = 1000;

function applyGlossary(text: string, glossary: Array<{ from: string; to: string }>): string {
  if (!glossary || glossary.length === 0) return text;
  let result = text;
  for (const entry of glossary) {
    if (!entry.from || !entry.to) continue;
    // Unicode-aware word boundary replace (case-insensitive)
    const escaped = entry.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "giu");
    result = result.replace(regex, entry.to);
  }
  return result;
}

// Multi-mirror Google & MyMemory free translation engine (Handles 429 auto-failover!)
async function translateWithMultiFree(text: string, sourceLang: string, targetLang = "vi"): Promise<string> {
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

  return text;
}

// OpenAI GPT-4o-mini translation (if user configures OpenAI API Key)
async function translateWithOpenAI(
  text: string,
  sourceLang: string,
  apiKey: string,
  model = "gpt-4o-mini"
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
          content: `You are a real-time conference interpreter. Translate the following ${fromName} live speech transcript into natural, fluent Vietnamese. Return ONLY the translated Vietnamese text, with no quotes, explanations, or notes.`,
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
  return data.choices?.[0]?.message?.content?.trim() || text;
}

// OpenRouter LLM translation (GPT-4o-mini, Gemini 2.5 Flash, DeepSeek)
async function translateWithOpenRouter(
  text: string,
  sourceLang: string,
  apiKey: string,
  model = "google/gemini-2.5-flash"
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
          content: `You are an expert conference interpreter. Translate the following ${fromName} live speech into natural, fluent Vietnamese for live audience screens. Return ONLY the translated Vietnamese text, with no markdown, quotes or explanations.`,
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
  return data.choices?.[0]?.message?.content?.trim() || text;
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
  return data.translations?.[0]?.text || text;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      text,
      sourceLang = "auto",
      targetLang = "vi",
      glossary = [],
      engine = "google-free",
      openrouterApiKey,
      openrouterTranslateModel = "google/gemini-2.5-flash",
      openaiApiKey,
      openaiModel = "gpt-4o-mini",
      deeplApiKey,
    } = body;

    if (!text || typeof text !== "string" || text.trim() === "") {
      return NextResponse.json({ translatedText: "", sourceLang });
    }

    const cleanText = text.trim();
    const cacheKey = `${engine}_${sourceLang}_${targetLang}_${cleanText.toLowerCase()}`;

    // Check memory cache
    if (translationCache.has(cacheKey)) {
      let cached = translationCache.get(cacheKey)!;
      cached = applyGlossary(cached, glossary);
      return NextResponse.json({
        translatedText: cached,
        sourceLang,
        cached: true,
        engine,
      });
    }

    let translated = "";
    const startTime = Date.now();

    // Select translation engine
    if (engine === "openrouter" && openrouterApiKey?.trim()) {
      try {
        translated = await translateWithOpenRouter(cleanText, sourceLang, openrouterApiKey.trim(), openrouterTranslateModel);
      } catch (err: any) {
        console.warn("OpenRouter fallback to MultiFree:", err.message);
        translated = await translateWithMultiFree(cleanText, sourceLang, targetLang);
      }
    } else if (engine === "openai" && openaiApiKey?.trim()) {
      try {
        translated = await translateWithOpenAI(cleanText, sourceLang, openaiApiKey.trim(), openaiModel);
      } catch (err: any) {
        console.warn("OpenAI fallback to MultiFree:", err.message);
        translated = await translateWithMultiFree(cleanText, sourceLang, targetLang);
      }
    } else if (engine === "deepl" && deeplApiKey?.trim()) {
      try {
        translated = await translateWithDeepL(cleanText, sourceLang, deeplApiKey.trim());
      } catch (err: any) {
        console.warn("DeepL fallback to MultiFree:", err.message);
        translated = await translateWithMultiFree(cleanText, sourceLang, targetLang);
      }
    } else {
      // Default: Multi-mirror free engine
      translated = await translateWithMultiFree(cleanText, sourceLang, targetLang);
    }

    // Apply custom event glossary
    const finalTranslation = applyGlossary(translated, glossary);
    const latencyMs = Date.now() - startTime;

    // Save to cache
    if (translationCache.size > MAX_CACHE_SIZE) {
      const firstKey = translationCache.keys().next().value;
      if (firstKey) translationCache.delete(firstKey);
    }
    translationCache.set(cacheKey, translated);

    return NextResponse.json({
      translatedText: finalTranslation,
      sourceLang,
      cached: false,
      engine,
      latencyMs,
    });
  } catch (error: any) {
    console.error("Translation API Error:", error?.message || error);
    return NextResponse.json(
      {
        translatedText: "",
        error: error?.message || "Translation failed",
      },
      { status: 200 }
    );
  }
}
