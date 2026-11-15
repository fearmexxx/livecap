/**
 * Per-hall usage counters for the monitoring page (/admin): requests, tokens, cost, speed and errors
 * for translation and speech-to-text, kept per day (Vietnam time) and per minute for the charts.
 *
 * Stored as one flat hash per hall per day (Redis HINCRBY / HINCRBYFLOAT, or memory on a laptop):
 *   counters   tr_req, tr_fail, tr_fallback, tr_cached, tr_free, tr_ms, tok_in, tok_out, cost,
 *              stt_req, stt_fail, stt_ms, stt_cost, stt_tok
 *   per minute r:<minute of day> (requests), t:<minute of day> (tokens), c:<minute of day> (cost)
 *   latest     last_tr, last_stt, last_error, last_error_at, engine, model
 * No imports, so it runs in route handlers, the browser and node tests alike.
 */

export const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;
export const USAGE_TTL_SECONDS = 60 * 60 * 24 * 35;

export type UsageIncrements = Record<string, number>;
export type UsageLatest = Record<string, string>;

export interface UsageEvent {
  kind: "translate" | "stt";
  ok: boolean;
  ms?: number;
  tokensIn?: number;
  tokensOut?: number;
  cost?: number;
  engine?: string;
  model?: string;
  fallback?: boolean;
  cached?: boolean;
  /** Free Google translation (interim previews, or no key): counted apart, it costs nothing */
  free?: boolean;
  error?: string;
}

/** "2026-11-15" in Vietnam time. */
export function usageDay(now = Date.now()): string {
  return new Date(now + VIETNAM_OFFSET_MS).toISOString().slice(0, 10);
}

/** Minute of the Vietnam day, 0..1439. */
export function minuteOfDay(now = Date.now()): number {
  const d = new Date(now + VIETNAM_OFFSET_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** Only plain hall ids are counted, so a forged header cannot fill storage with junk keys. */
export function safeHallId(raw: string | null | undefined): string | null {
  const id = (raw || "").trim().toLowerCase();
  return /^[a-z0-9_-]{1,40}$/.test(id) ? id : null;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

/** What one request adds to the hall's counters. */
export function usageChanges(event: UsageEvent, now = Date.now()): { incr: UsageIncrements; latest: UsageLatest } {
  const incr: UsageIncrements = {};
  const latest: UsageLatest = {};
  const add = (k: string, v: number) => {
    if (v) incr[k] = (incr[k] || 0) + v;
  };
  const minute = minuteOfDay(now);
  const tokens = Math.round(num(event.tokensIn) + num(event.tokensOut));
  const cost = num(event.cost);

  if (event.kind === "translate") {
    if (event.free && event.ok && !event.fallback) {
      add("tr_free", 1);
      add(`r:${minute}`, 1);
    } else {
      add("tr_req", 1);
      if (!event.ok) add("tr_fail", 1);
      if (event.fallback) add("tr_fallback", 1);
      if (event.cached) add("tr_cached", 1);
      add("tr_ms", Math.round(num(event.ms)));
      add("tok_in", Math.round(num(event.tokensIn)));
      add("tok_out", Math.round(num(event.tokensOut)));
      add("cost", cost);
      add(`r:${minute}`, 1);
    }
    latest.last_tr = String(now);
  } else {
    add("stt_req", 1);
    if (!event.ok) add("stt_fail", 1);
    add("stt_ms", Math.round(num(event.ms)));
    add("stt_tok", tokens);
    add("stt_cost", cost);
    add(`r:${minute}`, 1);
    latest.last_stt = String(now);
  }
  add(`t:${minute}`, tokens);
  add(`c:${minute}`, cost);
  if (event.engine) latest[event.kind === "stt" ? "stt_engine" : "engine"] = event.engine.slice(0, 40);
  if (event.model) latest[event.kind === "stt" ? "stt_model" : "model"] = event.model.slice(0, 80);
  if (!event.ok || event.fallback) {
    latest.last_error = `${event.kind === "stt" ? "Speech-to-text" : "Translation"}: ${(event.error || "failed").slice(0, 200)}`;
    latest.last_error_at = String(now);
  }
  return { incr, latest };
}

export interface HallUsage {
  translate: { requests: number; failed: number; fallback: number; cached: number; free: number; avgMs: number };
  stt: { requests: number; failed: number; avgMs: number; tokens: number; cost: number };
  tokensIn: number;
  tokensOut: number;
  tokens: number;
  cost: number;
  lastTranslateAt: number;
  lastSttAt: number;
  lastError: string;
  lastErrorAt: number;
  engine: string;
  model: string;
  sttEngine: string;
  sttModel: string;
  /** Last `minutes` minutes, oldest first */
  series: { requests: number[]; tokens: number[]; cost: number[] };
}

/** Turns the stored hash into totals plus per-minute series ending at `now`. */
export function summarizeUsage(raw: Record<string, string>, now = Date.now(), minutes = 60): HallUsage {
  const n = (k: string) => Number(raw[k]) || 0;
  const end = minuteOfDay(now);
  const series = { requests: [] as number[], tokens: [] as number[], cost: [] as number[] };
  for (let i = minutes - 1; i >= 0; i--) {
    const m = end - i;
    // Minutes before midnight belong to yesterday's hash, which is not loaded: show them as 0
    series.requests.push(m >= 0 ? n(`r:${m}`) : 0);
    series.tokens.push(m >= 0 ? n(`t:${m}`) : 0);
    series.cost.push(m >= 0 ? n(`c:${m}`) : 0);
  }
  const trReq = n("tr_req");
  const sttReq = n("stt_req");
  const tokensIn = n("tok_in");
  const tokensOut = n("tok_out");
  return {
    translate: {
      requests: trReq,
      failed: n("tr_fail"),
      fallback: n("tr_fallback"),
      cached: n("tr_cached"),
      free: n("tr_free"),
      avgMs: trReq - n("tr_cached") > 0 ? Math.round(n("tr_ms") / (trReq - n("tr_cached"))) : 0,
    },
    stt: {
      requests: sttReq,
      failed: n("stt_fail"),
      avgMs: sttReq ? Math.round(n("stt_ms") / sttReq) : 0,
      tokens: n("stt_tok"),
      cost: n("stt_cost"),
    },
    tokensIn,
    tokensOut,
    tokens: tokensIn + tokensOut + n("stt_tok"),
    cost: n("cost") + n("stt_cost"),
    lastTranslateAt: n("last_tr"),
    lastSttAt: n("last_stt"),
    lastError: raw.last_error || "",
    lastErrorAt: n("last_error_at"),
    engine: raw.engine || "",
    model: raw.model || "",
    sttEngine: raw.stt_engine || "",
    sttModel: raw.stt_model || "",
    series,
  };
}

export type HallState = "live" | "ready" | "warning" | "offline";

/**
 * - live: a console is connected and translated in the last 2 minutes
 * - ready: a console is connected but quiet
 * - warning: a failure or fallback in the last 5 minutes
 * - offline: no console connected
 */
export function hallState(
  input: { consoles: number; lastTranslateAt: number; lastSttAt: number; lastErrorAt: number },
  now = Date.now()
): HallState {
  if (input.consoles === 0) return "offline";
  if (input.lastErrorAt && now - input.lastErrorAt < 5 * 60_000) return "warning";
  const lastWork = Math.max(input.lastTranslateAt, input.lastSttAt);
  return lastWork && now - lastWork < 2 * 60_000 ? "live" : "ready";
}

/** Reads token counts and cost from an OpenAI-style `usage` object (OpenRouter adds `cost`). */
export function readApiUsage(usage: unknown): { tokensIn: number; tokensOut: number; cost: number } {
  const u = (usage && typeof usage === "object" ? usage : {}) as Record<string, unknown>;
  return {
    tokensIn: num(u.prompt_tokens ?? u.input_tokens),
    tokensOut: num(u.completion_tokens ?? u.output_tokens),
    cost: num(u.cost),
  };
}
