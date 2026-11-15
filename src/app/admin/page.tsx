"use client";

import { useCallback, useEffect, useState } from "react";

/* Shapes returned by /api/admin/status */
interface Usage {
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
  series: { requests: number[]; tokens: number[]; cost: number[] };
}
interface Hall {
  id: string;
  name: string;
  configured: boolean;
  state?: "live" | "ready" | "warning" | "offline";
  consoles?: number;
  devices?: { name: string; role: string; lastSeen: number; speaker: string }[];
  lastUpdated?: number;
  lines?: number;
  lastLine?: { vi: string; src: string; at: number; speaker: string } | null;
  usage?: Usage;
  error?: string;
}
interface OpenRouterInfo {
  configured: boolean;
  ok?: boolean;
  latencyMs?: number;
  error?: string;
  label?: string;
  usage?: number | null;
  usageDaily?: number | null;
  usageMonthly?: number | null;
  limit?: number | null;
  limitRemaining?: number | null;
}
interface Status {
  generatedAt: number;
  day: string;
  storage: { kind: string; ok: boolean; latencyMs?: number; error?: string };
  services: { openrouter: OpenRouterInfo; openai: { configured: boolean }; deepl: { configured: boolean }; logins: { enabled: boolean; halls: number } };
  halls: Hall[];
}

const REFRESH_MS = 5000;

const STATE_STYLE: Record<string, { label: string; dot: string; pill: string }> = {
  live: { label: "Live", dot: "bg-emerald-400", pill: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  ready: { label: "Ready", dot: "bg-sky-400", pill: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  warning: { label: "Warning", dot: "bg-amber-400", pill: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  offline: { label: "Offline", dot: "bg-zinc-500", pill: "bg-zinc-700/40 text-zinc-400 border-zinc-600" },
};

const fmtInt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(Math.round(n)));
const fmtUsd = (n: number | null | undefined) =>
  n === null || n === undefined ? "–" : n === 0 ? "$0.00" : n < 1 ? `$${n.toFixed(n < 0.01 ? 4 : 3)}` : `$${n.toFixed(2)}`;
function ago(ts: number | undefined, now: number) {
  if (!ts) return "never";
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function Sparkline({ values, color = "#34d399", height = 36 }: { values: number[]; color?: string; height?: number }) {
  const w = 240;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(height - 2 - (v / max) * (height - 4)).toFixed(1)}`);
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} aria-hidden>
      <polygon points={`0,${height} ${pts.join(" ")} ${w},${height}`} fill={color} opacity={0.12} />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Kpi({ label, value, sub, series, color }: { label: string; value: string; sub?: string; series?: number[]; color?: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 min-w-0">
      <div className="text-xs text-zinc-400">{label}</div>
      <div className="text-2xl font-semibold mt-1 tabular-nums">{value}</div>
      {sub && <div className="text-xs text-zinc-500 mt-0.5 truncate">{sub}</div>}
      {series && (
        <div className="mt-2">
          <Sparkline values={series} color={color} height={28} />
        </div>
      )}
    </div>
  );
}

function ServiceChip({ name, ok, detail }: { name: string; ok: boolean | null; detail: string }) {
  const dot = ok === null ? "bg-zinc-500" : ok ? "bg-emerald-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 min-w-0">
      <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
      <span className="text-sm font-medium">{name}</span>
      <span className="text-xs text-zinc-500 truncate">{detail}</span>
    </div>
  );
}

function sumSeries(halls: Hall[], key: "requests" | "tokens" | "cost") {
  const out = new Array(60).fill(0);
  for (const h of halls) h.usage?.series[key].forEach((v, i) => (out[i] += v));
  return out;
}

export default function AdminPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/status", { cache: "no-store" });
      if (res.status === 401 || res.status === 403) {
        setForbidden(true);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot reach LiveCap");
    }
  }, []);

  useEffect(() => {
    load();
    const poll = setInterval(load, REFRESH_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [load]);

  if (forbidden) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center px-4">
        <div className="max-w-sm text-center space-y-3">
          <p>This page needs the admin login.</p>
          <a href="/login?next=/admin" className="inline-block rounded-lg bg-brand-gold text-zinc-950 font-semibold px-4 py-2">
            Log in as admin
          </a>
        </div>
      </main>
    );
  }

  const halls = (status?.halls || []).filter((h) => h.configured || (h.usage && (h.usage.translate.requests || h.usage.stt.requests)));
  const totals = halls.reduce(
    (t, h) => {
      const u = h.usage;
      if (!u) return t;
      t.cost += u.cost;
      t.tokens += u.tokens;
      t.requests += u.translate.requests + u.translate.free + u.stt.requests;
      t.errors += u.translate.failed + u.translate.fallback + u.stt.failed;
      t.msSum += u.translate.avgMs * Math.max(0, u.translate.requests - u.translate.cached);
      t.msCount += Math.max(0, u.translate.requests - u.translate.cached);
      return t;
    },
    { cost: 0, tokens: 0, requests: 0, errors: 0, msSum: 0, msCount: 0 }
  );
  const counts = { live: 0, ready: 0, warning: 0, offline: 0 } as Record<string, number>;
  halls.forEach((h) => h.state && counts[h.state]++);
  const or = status?.services.openrouter;
  const stale = status && now - status.generatedAt > REFRESH_MS * 3;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 px-4 py-5 sm:px-6">
      <div className="max-w-7xl mx-auto space-y-5">
        <header className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded border border-brand-gold text-brand-gold text-xs font-bold">VBE</span>
            <h1 className="text-lg font-semibold">LiveCap monitor</h1>
            {status && <span className="text-sm text-zinc-500">{status.day} (Vietnam time)</span>}
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className={`flex items-center gap-1.5 ${error || stale ? "text-red-400" : "text-zinc-400"}`}>
              <span className={`w-2 h-2 rounded-full ${error || stale ? "bg-red-400" : "bg-emerald-400 animate-pulse"}`} />
              {error ? `Update failed: ${error}` : status ? `Updated ${ago(status.generatedAt, now)}` : "Loading…"}
            </span>
            <a href="/caption?session=hall-1" className="text-zinc-400 hover:text-zinc-100 underline underline-offset-4">
              Console
            </a>
          </div>
        </header>

        {status && (
          <>
            <section className="flex flex-wrap gap-2 text-sm">
              {(["live", "ready", "warning", "offline"] as const).map((s) => (
                <span key={s} className={`px-2.5 py-1 rounded-full border ${STATE_STYLE[s].pill}`}>
                  {counts[s]} {STATE_STYLE[s].label.toLowerCase()}
                </span>
              ))}
            </section>

            <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              <Kpi label="Spend today" value={fmtUsd(totals.cost)} sub="all halls, from OpenRouter" series={sumSeries(halls, "cost")} color="#f6c445" />
              <Kpi label="Requests today" value={fmtInt(totals.requests)} sub="translation + speech-to-text" series={sumSeries(halls, "requests")} color="#60a5fa" />
              <Kpi label="Tokens today" value={fmtInt(totals.tokens)} sub="last 60 min below" series={sumSeries(halls, "tokens")} color="#34d399" />
              <Kpi label="Avg translation" value={totals.msCount ? `${(totals.msSum / totals.msCount / 1000).toFixed(2)} s` : "–"} sub="server time per sentence" />
              <Kpi label="Problems today" value={String(totals.errors)} sub="failures + fallbacks" />
              <Kpi
                label="OpenRouter credit"
                value={or?.limitRemaining !== undefined && or?.limitRemaining !== null ? fmtUsd(or.limitRemaining) : fmtUsd(or?.usage ?? null)}
                sub={
                  or?.limitRemaining !== undefined && or?.limitRemaining !== null
                    ? `left of ${fmtUsd(or.limit)} key limit`
                    : or?.ok
                      ? `used on this key${or.usageDaily !== null && or.usageDaily !== undefined ? `, ${fmtUsd(or.usageDaily)} today` : ""}`
                      : "not available"
                }
              />
            </section>

            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              <ServiceChip
                name="OpenRouter"
                ok={or?.configured ? !!or.ok : null}
                detail={!or?.configured ? "no server key" : or.ok ? `reachable, ${or.latencyMs} ms` : or.error || "error"}
              />
              <ServiceChip
                name="Storage"
                ok={status.storage.ok}
                detail={`${status.storage.kind === "redis" ? "Upstash Redis" : "this server's memory"}${status.storage.ok ? `, ${status.storage.latencyMs} ms` : `: ${status.storage.error}`}`}
              />
              <ServiceChip name="Hall logins" ok={status.services.logins.enabled} detail={status.services.logins.enabled ? `${status.services.logins.halls} halls` : "off"} />
              <ServiceChip
                name="Backup engines"
                ok={status.services.deepl.configured || status.services.openai.configured ? true : null}
                detail={[status.services.deepl.configured && "DeepL", status.services.openai.configured && "OpenAI", "free Google"].filter(Boolean).join(", ")}
              />
            </section>

            <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {halls.map((h) => (
                <HallCard key={h.id} hall={h} now={now} />
              ))}
              {halls.length === 0 && <p className="text-zinc-500 text-sm">No halls yet.</p>}
            </section>

            <UsageTable halls={halls} />
          </>
        )}
      </div>
    </main>
  );
}

function HallCard({ hall, now }: { hall: Hall; now: number }) {
  if (hall.error || !hall.usage) {
    return (
      <div className="bg-zinc-900 border border-red-500/40 rounded-xl p-4">
        <div className="font-semibold">{hall.name}</div>
        <p className="text-sm text-red-400 mt-1">Could not load: {hall.error}</p>
      </div>
    );
  }
  const u = hall.usage;
  const st = STATE_STYLE[hall.state || "offline"];
  const recentError = !!u.lastErrorAt && now - u.lastErrorAt < 30 * 60_000;
  const problems = u.translate.failed + u.translate.fallback + u.stt.failed;
  return (
    <div className={`bg-zinc-900 border rounded-xl p-4 space-y-3 min-w-0 ${hall.state === "warning" ? "border-amber-500/50" : "border-zinc-800"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${st.dot} ${hall.state === "live" ? "animate-pulse" : ""}`} />
          <span className="font-semibold truncate">{hall.name}</span>
          <span className="text-xs text-zinc-500">{hall.id}</span>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full border ${st.pill}`}>{st.label}</span>
      </div>

      <div className="text-sm min-h-[2.5rem]">
        {hall.lastLine ? (
          <>
            <p className="line-clamp-2 text-zinc-100">{hall.lastLine.vi || hall.lastLine.src}</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              {hall.lastLine.speaker ? `${hall.lastLine.speaker} · ` : ""}
              {ago(hall.lastLine.at, now)} · {hall.lines} lines on screen
            </p>
          </>
        ) : (
          <p className="text-zinc-500">Nothing on screen yet</p>
        )}
      </div>

      <div>
        <div className="flex justify-between text-xs text-zinc-500">
          <span>Requests, last 60 min</span>
          <span>now</span>
        </div>
        <Sparkline values={u.series.requests} color={hall.state === "warning" ? "#fbbf24" : "#34d399"} />
      </div>

      <dl className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Requests" value={fmtInt(u.translate.requests + u.translate.free + u.stt.requests)} />
        <Stat label="Tokens" value={fmtInt(u.tokens)} />
        <Stat label="Spend" value={fmtUsd(u.cost)} />
        <Stat label="Avg time" value={u.translate.avgMs ? `${(u.translate.avgMs / 1000).toFixed(2)} s` : "–"} />
        <Stat label="Problems" value={String(problems)} warn={problems > 0} />
        <Stat label="Last work" value={ago(Math.max(u.lastTranslateAt, u.lastSttAt), now)} />
      </dl>

      <div className="text-xs text-zinc-400 space-y-1">
        <div className="truncate">
          Translation: <span className="text-zinc-200">{u.model || u.engine || "–"}</span>
          {u.sttEngine && (
            <>
              {" · "}Speech: <span className="text-zinc-200">{u.sttModel || u.sttEngine}</span>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {(hall.devices || []).length === 0 && <span className="text-zinc-500">No device connected</span>}
          {(hall.devices || []).map((d, i) => (
            <span key={i} className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300" title={`seen ${ago(d.lastSeen, now)}`}>
              {d.role === "operator" ? "Console" : d.role.toUpperCase()} · {d.name}
            </span>
          ))}
        </div>
        {recentError && (
          <p className="text-amber-300 break-words">
            {ago(u.lastErrorAt, now)}: {u.lastError}
          </p>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="bg-zinc-950/60 rounded-lg py-1.5">
      <dt className="text-[11px] text-zinc-500">{label}</dt>
      <dd className={`text-sm font-semibold tabular-nums ${warn ? "text-amber-300" : ""}`}>{value}</dd>
    </div>
  );
}

function UsageTable({ halls }: { halls: Hall[] }) {
  const maxTokens = Math.max(1, ...halls.map((h) => h.usage?.tokens || 0));
  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 overflow-x-auto">
      <h2 className="font-semibold mb-3">Today by hall</h2>
      <table className="w-full text-sm min-w-[640px]">
        <thead className="text-xs text-zinc-500 text-left">
          <tr>
            <th className="font-normal pb-2">Hall</th>
            <th className="font-normal pb-2 w-1/3">Tokens</th>
            <th className="font-normal pb-2 text-right">Translations</th>
            <th className="font-normal pb-2 text-right">Speech clips</th>
            <th className="font-normal pb-2 text-right">Free previews</th>
            <th className="font-normal pb-2 text-right">Problems</th>
            <th className="font-normal pb-2 text-right">Spend</th>
          </tr>
        </thead>
        <tbody>
          {halls.map((h) => {
            const u = h.usage;
            if (!u) return null;
            return (
              <tr key={h.id} className="border-t border-zinc-800">
                <td className="py-2">{h.name}</td>
                <td className="py-2 pr-4">
                  <div className="flex items-center gap-2">
                    <div className="h-2 rounded bg-emerald-400/70" style={{ width: `${(u.tokens / maxTokens) * 100}%`, minWidth: u.tokens ? 4 : 0 }} />
                    <span className="tabular-nums text-zinc-300">{fmtInt(u.tokens)}</span>
                  </div>
                </td>
                <td className="py-2 text-right tabular-nums">{u.translate.requests}</td>
                <td className="py-2 text-right tabular-nums">{u.stt.requests}</td>
                <td className="py-2 text-right tabular-nums text-zinc-400">{u.translate.free}</td>
                <td className="py-2 text-right tabular-nums">{u.translate.failed + u.translate.fallback + u.stt.failed}</td>
                <td className="py-2 text-right tabular-nums">{fmtUsd(u.cost)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
