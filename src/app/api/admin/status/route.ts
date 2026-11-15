import { NextRequest, NextResponse } from "next/server";
import { getRoomBackend } from "@/lib/caption/roomBackend";
import { ADMIN_HALL, isAuthEnabled, listHalls, sessionFromHeaders } from "@/lib/caption/hostedAuth";
import { hallState, summarizeUsage, usageDay } from "@/lib/caption/usage";
import { resolveKeys } from "@/lib/caption/translationEngines";
import { roomDisplayName } from "@/lib/caption/roomSettings";

/**
 * Everything the monitoring page (/admin) shows, in one call: each hall's state, devices, latest
 * line and today's usage, plus the OpenRouter key's credit and whether storage answers.
 * Admin login only (on a laptop without logins, open like the rest of the app).
 */

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const KEY_CACHE_MS = 30_000;
let keyCache: { at: number; value: unknown } | null = null;

async function openRouterKeyInfo(apiKey: string) {
  if (!apiKey) return { configured: false };
  if (keyCache && Date.now() - keyCache.at < KEY_CACHE_MS) return keyCache.value;
  const started = Date.now();
  let value: Record<string, unknown>;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/key", {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    const body = await res.json().catch(() => ({}));
    const d = (body?.data || {}) as Record<string, unknown>;
    value = res.ok
      ? {
          configured: true,
          ok: true,
          latencyMs: Date.now() - started,
          label: typeof d.label === "string" ? d.label.replace(/sk-or-[\w-]+/g, "sk-or-…") : "",
          usage: d.usage ?? null,
          usageDaily: d.usage_daily ?? null,
          usageWeekly: d.usage_weekly ?? null,
          usageMonthly: d.usage_monthly ?? null,
          limit: d.limit ?? null,
          limitRemaining: d.limit_remaining ?? null,
          isFreeTier: !!d.is_free_tier,
        }
      : { configured: true, ok: false, latencyMs: Date.now() - started, error: `OpenRouter ${res.status}` };
  } catch (err) {
    value = { configured: true, ok: false, error: err instanceof Error ? err.message : "unreachable" };
  }
  keyCache = { at: Date.now(), value };
  return value;
}

export async function GET(req: NextRequest) {
  if (isAuthEnabled()) {
    const auth = await sessionFromHeaders(req.headers);
    if (!auth || auth.hall !== ADMIN_HALL) {
      return NextResponse.json({ error: "Log in with the admin password to see every hall." }, { status: 403 });
    }
  }

  const now = Date.now();
  const day = usageDay(now);
  const backend = getRoomBackend();

  const storageStarted = Date.now();
  let storage: Record<string, unknown>;
  try {
    await backend.ping();
    storage = { kind: backend.kind, ok: true, latencyMs: Date.now() - storageStarted };
  } catch (err) {
    storage = { kind: backend.kind, ok: false, error: err instanceof Error ? err.message : "unreachable" };
  }

  const keys = resolveKeys({});
  const [openrouter, usageHalls] = await Promise.all([
    openRouterKeyInfo(keys.openrouter),
    backend.usageHalls(day).catch(() => [] as string[]),
  ]);

  const configured = listHalls();
  const ids = [...new Set([...configured, ...usageHalls])].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const halls = await Promise.all(
    ids.map(async (id) => {
      try {
        const [devices, room, raw] = await Promise.all([backend.getDevices(id), backend.getRoom(id), backend.getUsage(id, day)]);
        const usage = summarizeUsage(raw, now);
        const consoles = devices.filter((d) => d.role === "operator" || d.role === "mic-node").length;
        const last = room.currentCaption || room.history[room.history.length - 1] || null;
        return {
          id,
          name: roomDisplayName(id),
          configured: configured.includes(id),
          state: hallState({ consoles, ...usage }, now),
          consoles,
          devices: devices.map((d) => ({ name: d.deviceName, role: d.role, lastSeen: d.lastSeen, speaker: d.speakerName || "" })),
          lastUpdated: room.lastUpdated,
          lines: room.history.length,
          lastLine: last ? { vi: last.translatedText, src: last.sourceText, at: last.timestamp, speaker: last.speakerName || "" } : null,
          usage,
        };
      } catch (err) {
        return { id, name: roomDisplayName(id), configured: configured.includes(id), error: err instanceof Error ? err.message : "failed" };
      }
    })
  );

  return NextResponse.json(
    {
      generatedAt: now,
      day,
      storage,
      services: {
        openrouter,
        openai: { configured: !!keys.openai },
        deepl: { configured: !!keys.deepl },
        logins: { enabled: isAuthEnabled(), halls: configured.length },
      },
      halls,
    },
    { headers: NO_STORE }
  );
}
