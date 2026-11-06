import type { CaptionConfig } from "./types";
import { authHeaders } from "./clientAuth";

export interface TranslateResult {
  text: string;
  /** Every engine failed, `text` is the untranslated source */
  failed: boolean;
  /** The chosen engine failed and the free Google fallback answered */
  fallback: boolean;
  engine?: string;
  /** Operator-facing explanation when failed or fallback */
  message?: string;
  latencyMs?: number;
}

interface TranslateOptions {
  glossary?: CaptionConfig["customGlossary"];
  context?: string[];
  engineOverride?: CaptionConfig["translationEngine"];
}

/** Single place that calls /api/caption/translate for the console, the speech engine and the API test. */
export async function requestTranslation(
  config: Partial<CaptionConfig>,
  text: string,
  sourceLang: string,
  opts: TranslateOptions = {}
): Promise<TranslateResult> {
  try {
    const res = await fetch("/api/caption/translate", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        text,
        sourceLang,
        targetLang: "vi",
        glossary: opts.glossary ?? config.customGlossary ?? [],
        context: opts.context ?? [],
        engine: opts.engineOverride || config.translationEngine || "auto",
        openrouterApiKey: config.openrouterApiKey,
        openrouterTranslateModel: config.openrouterTranslateModel,
        openaiApiKey: config.openaiApiKey,
        openaiModel: config.openaiModel,
        deeplApiKey: config.deeplApiKey,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.failed || !data.translatedText) {
      return {
        text,
        failed: true,
        fallback: false,
        engine: data.engine,
        message: data.error || `Translation request failed (${res.status})`,
      };
    }
    return {
      text: data.translatedText,
      failed: false,
      fallback: !!data.fallback,
      engine: data.engine,
      message: data.warning,
      latencyMs: data.latencyMs,
    };
  } catch (err) {
    return {
      text,
      failed: true,
      fallback: false,
      message: `Cannot reach the LiveCap server: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
