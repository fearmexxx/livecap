import { NextRequest, NextResponse } from "next/server";

// In-memory LRU-like cache for instant translation of repetitive phrases
const translationCache = new Map<string, string>();
const MAX_CACHE_SIZE = 1000;

function applyGlossary(text: string, glossary: Array<{ from: string; to: string }>): string {
  if (!glossary || glossary.length === 0) return text;
  let result = text;
  for (const entry of glossary) {
    if (!entry.from || !entry.to) continue;
    // Unicode-aware word boundary replace (case-insensitive) – works for Vietnamese diacritics
    const escaped = entry.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "giu");
    result = result.replace(regex, entry.to);
  }
  return result;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, sourceLang = "auto", targetLang = "vi", glossary = [] } = body;

    if (!text || typeof text !== "string" || text.trim() === "") {
      return NextResponse.json({ translatedText: "", sourceLang });
    }

    const cleanText = text.trim();
    const cacheKey = `${sourceLang}_${targetLang}_${cleanText.toLowerCase()}`;

    // Check fast cache
    if (translationCache.has(cacheKey)) {
      let cached = translationCache.get(cacheKey)!;
      cached = applyGlossary(cached, glossary);
      return NextResponse.json({
        translatedText: cached,
        sourceLang,
        cached: true,
      });
    }

    // Determine source language code for Google Translate
    // 'ko-KR' -> 'ko', 'en-US' -> 'en', 'auto' -> 'auto'
    let sl = "auto";
    if (sourceLang.startsWith("ko")) sl = "ko";
    else if (sourceLang.startsWith("en")) sl = "en";

    // Call fast Google Translate endpoint
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${targetLang}&dt=t&q=${encodeURIComponent(
      cleanText
    )}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000); // 4s timeout

    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`Google Translate responded with status: ${res.status}`);
    }

    const data = await res.json();
    // Google GTX format: [[["translated text", "original text", null, null, 1], ...], null, "detected_lang"]
    let translated = "";
    if (Array.isArray(data) && Array.isArray(data[0])) {
      translated = data[0].map((item: any) => item[0]).filter(Boolean).join("");
    } else {
      translated = cleanText;
    }

    // Detected source language
    const detectedLang = data?.[2] || sl;

    // Apply custom event glossary
    const finalTranslation = applyGlossary(translated, glossary);

    // Save to cache
    if (translationCache.size > MAX_CACHE_SIZE) {
      const firstKey = translationCache.keys().next().value;
      if (firstKey) translationCache.delete(firstKey);
    }
    translationCache.set(cacheKey, translated);

    return NextResponse.json({
      translatedText: finalTranslation,
      sourceLang: detectedLang,
      cached: false,
    });
  } catch (error: any) {
    console.error("Translation API Error:", error?.message || error);
    // Return original text gracefully if translation fails
    return NextResponse.json(
      {
        translatedText: "",
        error: error?.message || "Translation failed",
      },
      { status: 200 }
    );
  }
}
