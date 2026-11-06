import type { GlossaryEntry } from "./types";

/* ------------------------------------------------------------------ */
/* 1. Sentence assembler                                               */
/*    Chrome Web Speech emits short "final" fragments split on pauses. */
/*    Translating fragments in isolation produces broken Vietnamese.   */
/*    We buffer fragments into complete sentences before translating.  */
/* ------------------------------------------------------------------ */

const PUNCT_END_RE = /[.!?。！？…]["')\]]*\s*$/;

/**
 * Korean puts the verb at the end, and Chrome's Korean recognition rarely adds punctuation, so a
 * sentence is "complete" when it ends in a final verb ending (합니다, 했어요, 할까요, 합시다 ...).
 */
const KOREAN_FINAL_RE =
  /(?:습니다|습니까|ㅂ니다|니다|니까|세요|에요|예요|어요|아요|여요|해요|지요|죠|네요|군요|래요|대요|나요|가요|까요|십시오|시죠|합시다|읍시다|ㅂ시다|겠다|었다|았다|였다|했다|이다|한다|된다|있다|없다|란다|는다|다)[.!?]?\s*$/;

/**
 * Endings that mean the speaker is mid-sentence: clause connectives (-고, -는데, -서, -면, -지만)
 * and particles (-은/는, -이/가, -을/를, -에서). A pause after these is a breath, not a full stop.
 */
const KOREAN_CONTINUES_RE =
  /(?:고|는데|은데|인데|ㄴ데|지만|면서|으면서|어서|아서|해서|여서|니까|으니까|며|으며|으면|면|거나|든지|도록|려고|으려고|다가|는|은|이|가|을|를|의|에|에서|에게|께서|와|과|랑|하고|도|만|로|으로|부터|까지|보다|처럼|및|또는|그리고|그래서|그런데|하지만)[,]?\s*$/;

const ENGLISH_CONTINUES_RE =
  /\b(?:and|but|or|so|because|that|which|who|the|a|an|of|to|in|on|for|with|from|our|we|is|are|will|very)[,]?\s*$/i;

function isMostlyHangul(text: string): boolean {
  const hangul = (text.match(/[\uAC00-\uD7A3]/g) || []).length;
  return hangul > 0 && hangul >= (text.replace(/\s/g, "").length || 1) * 0.4;
}

export interface AssemblerOptions {
  /** Flush when buffer reaches this many characters even without punctuation */
  maxChars: number;
  /** Same limit for Korean text (Hangul packs more meaning per character) */
  maxCharsKorean: number;
  /** Flush after this much silence (ms) since the last fragment */
  pauseFlushMs: number;
  /** Silence to wait when the speaker stopped mid-sentence (connective, particle, "and") */
  midSentencePauseMs: number;
  /** Do not flush sentences shorter than this unless forced (avoids "네." spam) */
  minChars: number;
}

export const DEFAULT_ASSEMBLER_OPTIONS: AssemblerOptions = {
  maxChars: 160,
  maxCharsKorean: 100,
  pauseFlushMs: 1200,
  midSentencePauseMs: 2600,
  minChars: 2,
};

export function isSentenceComplete(text: string): boolean {
  const t = text.trim();
  if (PUNCT_END_RE.test(t)) return true;
  return isMostlyHangul(t) && KOREAN_FINAL_RE.test(t) && !KOREAN_CONTINUES_RE.test(t);
}

/** True when the text visibly stops mid-sentence, so a short pause should not cut it. */
export function looksUnfinished(text: string): boolean {
  const t = text.trim();
  if (!t || PUNCT_END_RE.test(t)) return false;
  return isMostlyHangul(t) ? KOREAN_CONTINUES_RE.test(t) : ENGLISH_CONTINUES_RE.test(t);
}

// Natural clause boundaries to cut an over-long sentence at, instead of mid-phrase
const CLAUSE_BOUNDARY_RE =
  /(?:고|는데|은데|인데|지만|면서|어서|아서|해서|니까|으며|며|으면|면)[,]?\s|,\s|;\s|\s(?=(?:and|but|so|because|which)\s)/g;

/** Splits an over-long buffer at the last clause boundary: [ready, remainder]. */
export function splitAtClause(text: string, maxChars: number): [string, string] {
  let cut = -1;
  CLAUSE_BOUNDARY_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CLAUSE_BOUNDARY_RE.exec(text)) !== null) {
    const end = m.index + m[0].length;
    if (end >= maxChars * 0.4 && end <= maxChars) cut = end;
  }
  if (cut < 0) return [text.trim(), ""];
  return [text.slice(0, cut).trim(), text.slice(cut).trim()];
}

/**
 * Pure state machine: feed fragments, get back complete sentences.
 * Timers are owned by the caller (speech engine) so this stays testable.
 */
export class SentenceAssembler {
  private buffer = "";
  private opts: AssemblerOptions;

  constructor(opts: Partial<AssemblerOptions> = {}) {
    this.opts = { ...DEFAULT_ASSEMBLER_OPTIONS, ...opts };
  }

  get pending(): string {
    return this.buffer;
  }

  get pauseFlushMs(): number {
    return this.opts.pauseFlushMs;
  }

  /** Add a final fragment. Returns sentences ready to translate (0..n). */
  push(fragment: string): string[] {
    const clean = normalizeWhitespace(fragment);
    if (!clean) return [];
    this.buffer = this.buffer ? `${this.buffer} ${clean}` : clean;

    const ready: string[] = [];
    // Split on sentence boundaries inside the buffer (Whisper often returns 2 sentences at once)
    const parts = splitSentences(this.buffer);
    // All parts except the last are definitely complete
    for (let i = 0; i < parts.length - 1; i++) {
      if (parts[i].length >= this.opts.minChars) ready.push(parts[i]);
    }
    const last = parts[parts.length - 1] || "";
    const limit = isMostlyHangul(last) ? this.opts.maxCharsKorean : this.opts.maxChars;
    if (isSentenceComplete(last)) {
      if (last.length >= this.opts.minChars) ready.push(last);
      this.buffer = "";
    } else if (last.length >= limit) {
      // Too long for one screen: cut at the last clause boundary and keep the rest
      const [head, rest] = splitAtClause(last, limit);
      if (head.length >= this.opts.minChars) ready.push(head);
      this.buffer = rest;
    } else {
      this.buffer = last;
    }
    return ready;
  }

  /** How long to wait in silence before flushing what is buffered. */
  flushDelayMs(): number {
    return looksUnfinished(this.buffer) ? this.opts.midSentencePauseMs : this.opts.pauseFlushMs;
  }

  /** Force-flush whatever is buffered (pause timeout or stop). */
  flush(): string | null {
    const out = this.buffer.trim();
    this.buffer = "";
    return out || null;
  }

  reset() {
    this.buffer = "";
  }
}

export function normalizeWhitespace(text: string): string {
  return (text || "").replace(/\s+/g, " ").trim();
}

/** Split text into sentences, keeping terminal punctuation. */
export function splitSentences(text: string): string[] {
  const t = normalizeWhitespace(text);
  if (!t) return [];
  const out: string[] = [];
  const re = /[^.!?。！？…]+[.!?。！？…]+["')\]]*\s*/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    // Ignore decimal numbers like "3.5" and abbreviations like "Mr."
    const seg = m[0];
    out.push(seg.trim());
    lastIndex = re.lastIndex;
  }
  const rest = t.slice(lastIndex).trim();
  if (rest) out.push(rest);
  return mergeFalseSplits(out);
}

const ABBREVIATIONS = /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|Inc|Ltd|Co|No|U\.S|e\.g|i\.e)\.$/i;

function mergeFalseSplits(parts: string[]): string[] {
  const merged: string[] = [];
  for (const p of parts) {
    const prev = merged[merged.length - 1];
    if (prev && (ABBREVIATIONS.test(prev) || /\d\.$/.test(prev) && /^\d/.test(p))) {
      merged[merged.length - 1] = `${prev} ${p}`.replace(/\.\s+(\d)/, ".$1");
    } else {
      merged.push(p);
    }
  }
  return merged;
}

/* ------------------------------------------------------------------ */
/* 2. Whisper hallucination filter                                     */
/*    Whisper invents YouTube-style phrases on silence / noise.        */
/* ------------------------------------------------------------------ */

const HALLUCINATION_PATTERNS: RegExp[] = [
  /^(thank you|thanks)( so much)?( for watching| for listening)?[.!]*$/i,
  /please (like and )?subscribe/i,
  /^(you|bye|okay|so)[.!]*$/i,
  /subtitles? (by|created by)/i,
  /amara\.org/i,
  /시청해\s*주셔서\s*감사합니다/,
  /구독과\s*좋아요/,
  /구독\s*(부탁|해\s*주세요)/,
  /^(MBC|KBS|SBS|YTN)\s*뉴스/,
  /자막\s*(제공|by)/,
  /^감사합니다[.!]*$/,
  /^[\s.,!?…\-–—]*$/,
];

export function isLikelyHallucination(text: string, previous?: string): boolean {
  const t = normalizeWhitespace(text);
  if (!t) return true;
  if (HALLUCINATION_PATTERNS.some((re) => re.test(t))) return true;
  // Repetition loops: same token repeated many times ("네 네 네 네 네", "the the the")
  const tokens = t.split(/\s+/);
  if (tokens.length >= 4) {
    const unique = new Set(tokens.map((x) => x.toLowerCase()));
    if (unique.size / tokens.length < 0.3) return true;
  }
  // Single character repeated ("ㅋㅋㅋㅋㅋㅋ", "......")
  if (/^(.)\1{5,}$/.test(t.replace(/\s/g, ""))) return true;
  // Exact duplicate of the previous segment (chunk overlap / echo)
  if (previous && normalizeWhitespace(previous).toLowerCase() === t.toLowerCase() && t.length > 8) {
    return true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* 3. Glossary helpers                                                 */
/* ------------------------------------------------------------------ */

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function termRegex(term: string): RegExp {
  // Hangul has no word boundary semantics → match as substring.
  if (/[\u3131-\uD79D]/.test(term)) return new RegExp(escapeRegex(term), "g");
  // Latin/ASCII terms may be attached directly to Korean particles (e.g., "VBE의", "AI가"),
  // so block only adjacent Latin letters/digits rather than Hangul characters.
  return new RegExp(
    `(?<![\\p{Script=Latin}\\p{N}])${escapeRegex(term)}(?![\\p{Script=Latin}\\p{N}])`,
    "giu"
  );
}

/** Glossary entries whose source term appears in the text (longest first). */
export function relevantGlossary(text: string, glossary: GlossaryEntry[]): GlossaryEntry[] {
  if (!text || !glossary?.length) return [];
  return glossary
    .filter((g) => g.from && g.to && termRegex(g.from).test(text))
    .sort((a, b) => b.from.length - a.from.length);
}

/**
 * Protect glossary terms before sending to a non-LLM engine (Google/DeepL).
 * Terms are replaced by their Vietnamese target directly in the source; Google keeps
 * foreign-script spans untranslated, so the correct term survives into the output.
 */
export function preApplyGlossary(text: string, glossary: GlossaryEntry[]): string {
  let out = text;
  for (const g of relevantGlossary(text, glossary)) {
    out = out.replace(termRegex(g.from), g.to);
  }
  return out;
}

/** Final safety pass on the Vietnamese output (for terms the engine left untranslated). */
export function postApplyGlossary(text: string, glossary: GlossaryEntry[]): string {
  if (!text || !glossary?.length) return text;
  let out = text;
  for (const g of [...glossary].sort((a, b) => b.from.length - a.from.length)) {
    if (!g.from || !g.to || g.from === g.to) continue;
    // Skip if the target already appears (avoid "VBE Event Group Event Group")
    if (out.includes(g.to)) continue;
    out = out.replace(termRegex(g.from), g.to);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 4. LLM interpreter prompt                                           */
/* ------------------------------------------------------------------ */

export interface PromptInput {
  text: string;
  sourceLang: string; // "ko" | "en" | "auto"
  glossary?: GlossaryEntry[];
  context?: string[]; // previous source sentences (oldest → newest)
  previousTranslations?: string[]; // Vietnamese already shown for those sentences
  eventContext?: string; // e.g. "Korea–Vietnam semiconductor investment forum"
  speakerName?: string;
}

export function languageName(code: string): string {
  if (code.startsWith("ko")) return "Korean";
  if (code.startsWith("en")) return "English";
  return "the source language (auto-detect Korean or English)";
}

export function buildInterpreterMessages(input: PromptInput): { role: "system" | "user"; content: string }[] {
  const from = languageName(input.sourceLang);
  const terms = relevantGlossary(input.text, input.glossary || []);
  const lines: string[] = [
    `You are a professional simultaneous conference interpreter translating live ${from} speech into Vietnamese for audience subtitles on an LED screen.`,
    "Rules:",
    "- Output ONLY the Vietnamese translation of the CURRENT segment. No quotes, notes, romanization, or explanations.",
    "- The input comes from automatic speech recognition and may contain misheard words, missing punctuation, or fillers. Infer the intended meaning from context; drop fillers (음, 어, uh, um, you know).",
    "- Use natural, concise, formal Vietnamese suitable for a business/conference audience (use 'quý vị' for audience address).",
    "- Keep person names, company names, product names, and numbers accurate. Keep English acronyms (AI, CEO, ESG) as-is unless a glossary entry says otherwise.",
    "- If the segment is an incomplete fragment, translate it as a natural fragment; do not invent content.",
  ];
  if (input.sourceLang.startsWith("ko") || input.sourceLang === "auto") {
    lines.push(
      "Korean specifics:",
      "- Number units: 만 = 10,000; 억 = 100,000,000; 조 = 1,000,000,000,000. Convert exactly into Vietnamese units: 3억 5천만 원 → 350 triệu won; 1조 2천억 → 1,2 nghìn tỷ; 5만 명 → 50.000 người. Never confuse 억 with tỷ.",
      "- Korean often omits the subject. Infer it from the previous segments (a company presenter usually means 'chúng tôi'); do not invent a subject that is not implied.",
      "- Titles: 회장님 → Chủ tịch, 대표님/사장님 → Tổng Giám đốc, 부사장 → Phó Tổng Giám đốc, 교수님 → Giáo sư, 장관님 → Bộ trưởng, 대사님 → Đại sứ. Keep Korean names in Korean order and romanized (김민수 → Kim Min-su).",
      "- 여러분 / 신사 숙녀 여러분 → 'quý vị'. 감사합니다 → 'Xin cảm ơn'.",
      "- Speech recognition cuts Korean sentences at pauses. If the segment ends with a connective (-고, -는데, -서, -면, -지만) or a particle, translate it as an unfinished clause without a final full stop; the next segment continues it."
    );
  }
  if (input.eventContext?.trim()) {
    lines.push(`Event context: ${input.eventContext.trim()}`);
  }
  if (input.speakerName?.trim()) {
    lines.push(`Current speaker: ${input.speakerName.trim()}`);
  }
  if (terms.length) {
    lines.push("Mandatory terminology (always use these exact Vietnamese renderings):");
    for (const t of terms) lines.push(`- "${t.from}" → "${t.to}"`);
  }

  const ctx = (input.context || []).filter(Boolean).slice(-3);
  const shown = (input.previousTranslations || []).filter(Boolean).slice(-3);
  const blocks: string[] = [];
  if (ctx.length) {
    blocks.push(`Previous segments (for context only, do NOT translate):\n${ctx.map((c) => `> ${c}`).join("\n")}`);
  }
  if (shown.length) {
    blocks.push(
      `Vietnamese already shown on screen (keep names and terms consistent with it, do NOT repeat it):\n${shown.map((c) => `> ${c}`).join("\n")}`
    );
  }
  const user = blocks.length ? `${blocks.join("\n\n")}\n\nCURRENT segment to translate:\n${input.text}` : input.text;

  return [
    { role: "system", content: lines.join("\n") },
    { role: "user", content: user },
  ];
}

/** Strip wrapper artefacts LLMs sometimes add despite instructions. */
export function cleanLlmOutput(raw: string): string {
  let t = (raw || "").trim();
  t = t.replace(/^```[a-z]*\s*|\s*```$/gi, "");
  t = t.replace(/^(vietnamese|tiếng việt|bản dịch|translation)\s*[:：]\s*/i, "");
  if (/^["“'].*["”']$/s.test(t)) t = t.slice(1, -1);
  return t.trim();
}

/** Stable short hash for cache keys. */
export function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
