#!/usr/bin/env node
/**
 * Load and bandwidth benchmark for LiveCap's caption sync.
 *
 * Simulates, for every hall at once (from a hall mid-event: a full history and an event settings file):
 *   - one console: talking at a normal pace. Previews of the line go out every ~0.5 s while
 *     someone speaks, then a final line every ~6 s. The console also polls like a screen.
 *   - N screens (LED, vMix, window): polling the hall's feed exactly like src/lib/caption/sync.ts.
 * and measures requests, bytes each way (raw and gzip), poll latency, and how long a final line
 * takes to reach the screens.
 *
 * Settings (environment):
 *   LIVECAP_URL            default http://localhost:3000
 *   BENCH_HALLS            halls at once (default 5)
 *   BENCH_SCREENS          screens per hall (default 3)
 *   BENCH_SECONDS          how long (default 60)
 *   BENCH_POLL_MS          screen poll interval (default 800, as hosted)
 *   LIVECAP_ADMIN_PASSWORD on a site with logins: consoles log in with it, screens use view keys
 *   BENCH_HALL_PREFIX      hall ids (default "bench-"); never use real hall names during an event
 *   BENCH_PREFILL          finished lines already in each hall's history at the start (default 100,
 *                          the most a hall keeps: a hall mid-event)
 *   BENCH_REDIS_STATS      local runs only: a counting Redis proxy's /stats URL, to report Redis calls
 *   LIVECAP_REPORT         also write the Markdown report to this file
 *
 * Run:  LIVECAP_URL=http://localhost:3311 node scripts/bench-sync.mjs
 * Speech recognition and translation requests are counted but not sent (they go to Google /
 * OpenRouter, not to LiveCap's sync).
 */

import { gzipSync } from "node:zlib";
import { writeFileSync, appendFileSync } from "node:fs";

const BASE = (process.env.LIVECAP_URL || "http://localhost:3000").replace(/\/+$/, "");
const HALLS = Number(process.env.BENCH_HALLS || 5);
const SCREENS = Number(process.env.BENCH_SCREENS || 3);
const SECONDS = Number(process.env.BENCH_SECONDS || 60);
const POLL_MS = Number(process.env.BENCH_POLL_MS || 800);
const PREFIX = process.env.BENCH_HALL_PREFIX || "bench-";
const ADMIN = process.env.LIVECAP_ADMIN_PASSWORD || "";
const PREFILL = Number(process.env.BENCH_PREFILL ?? 100);
const REDIS_STATS = process.env.BENCH_REDIS_STATS || "";

const PREVIEW_MS = 500; // one preview line about every half second while speaking
const FINAL_EVERY_MS = 6000; // one finished sentence about every 6 seconds

/* ---------------- Counters ---------------- */
const stats = {}; // key -> { requests, upBytes, downBytes, downGzip, ms: [] }
function count(key, upBytes, downBytes, downGzip, ms) {
  const s = (stats[key] ||= { requests: 0, upBytes: 0, downBytes: 0, downGzip: 0, ms: [] });
  s.requests++;
  s.upBytes += upBytes;
  s.downBytes += downBytes;
  s.downGzip += downGzip;
  s.ms.push(ms);
}
const lags = []; // ms from a final being sent to a screen showing it
const pct = (arr, p) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

async function http(key, path, { method = "GET", body, cookie } = {}) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  // Request line + typical headers (cookie, user agent ...) approximated as 400 bytes
  const upBytes = 400 + path.length + (payload ? Buffer.byteLength(payload) : 0) + (cookie ? cookie.length : 0);
  const started = performance.now();
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(payload ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
    body: payload,
    redirect: "manual",
  });
  const text = await res.text();
  const ms = performance.now() - started;
  // Response headers are roughly 350 bytes on Vercel
  const raw = Buffer.byteLength(text);
  count(key, upBytes, raw + 350, gzipSync(text).length + 350, ms);
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {}
  return { res, data };
}

/* ---------------- Hall roles ---------------- */
async function loginCookie(hall) {
  if (!ADMIN) return { cookie: "", viewKey: "" };
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hall, password: ADMIN }),
  });
  const cookie = /livecap_auth=[^;]+/.exec(res.headers.get("set-cookie") || "")?.[0] || "";
  const me = await (await fetch(`${BASE}/api/auth/me?session=${hall}`, { headers: { cookie } })).json();
  return { cookie, viewKey: me.viewKey || "" };
}

// Mirrors startRemotePolling() in src/lib/caption/sync.ts
function startPoller(key, hall, { cookie, viewKey, role }, onCaption, stopAt) {
  const deviceId = `bench_${role}_${Math.random().toString(36).slice(2, 8)}`;
  let since = 0;
  let history = [];
  let historyTag = "";
  let configVersion = "";
  let lastDevicePing = 0;
  return (async () => {
    while (Date.now() < stopAt) {
      const tickStart = Date.now();
      // h/cv: what this screen has (current servers); historyCount: what older servers read
      const qs = new URLSearchParams({ session: hall, h: historyTag, historyCount: String(history.length) });
      if (configVersion) qs.set("cv", configVersion);
      if (viewKey && role !== "operator") qs.set("k", viewKey);
      if (since) qs.set("since", String(since));
      if (tickStart - lastDevicePing > 10_000) {
        lastDevicePing = tickStart;
        qs.set("deviceId", deviceId);
        qs.set("role", role);
        qs.set("deviceName", `${role} bench`);
      }
      try {
        const { res, data } = await http(key, `/api/caption/sync?${qs}`, { cookie: role === "operator" ? cookie : "" });
        if (!res.ok) count(`${key} (refused ${res.status})`, 0, 0, 0, 0);
        if (data && !data.unchanged) {
          if (Array.isArray(data.history)) history = data.history;
          else if (Array.isArray(data.historyAdd)) {
            const byId = new Map(history.map((l) => [l.id, l]));
            for (const l of data.historyAdd) byId.set(l.id, l);
            history = [...byId.values()].sort((a, b) => a.timestamp - b.timestamp).slice(-100);
          }
          if (typeof data.historyTag === "string") historyTag = data.historyTag;
          if (typeof data.configVersion === "string") configVersion = data.configVersion;
          if (data.lastUpdated > since) {
            since = data.lastUpdated;
            // A finished line reaches a screen as the current caption or in the history
            if (data.currentCaption) onCaption(data.currentCaption);
            history.slice(-3).forEach(onCaption);
          }
        }
      } catch {
        count(`${key} (errors)`, 0, 0, 0, 0);
      }
      const wait = POLL_MS - (Date.now() - tickStart);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
  })();
}

async function runHall(index, startedPromise, onReady) {
  const hall = `${PREFIX}${index + 1}`;
  const auth = await loginCookie(hall);
  const sentFinals = new Map(); // caption id -> sent time
  const device = { deviceId: `console_${hall}`, deviceName: "Console", role: "operator", lastSeen: Date.now() };

  // Start from a hall mid-event: event settings with a glossary, and a full history
  await http("setup", "/api/caption/sync", { method: "POST", cookie: auth.cookie, body: { type: "CLEAR_HISTORY", session: hall } });
  await http("setup", "/api/caption/sync", {
    method: "POST",
    cookie: auth.cookie,
    body: { type: "CONFIG_UPDATE", session: hall, config: benchConfig(), device },
  });
  for (let i = 0; i < PREFILL; i++) {
    await http("setup", "/api/caption/sync", {
      method: "POST",
      cookie: auth.cookie,
      body: { type: "CAPTION_UPDATE", session: hall, caption: finalCaption(`old_${hall}_${i}`, i), device },
    });
  }

  onReady();
  const stopAt = await startedPromise;
  if (index === 0 && REDIS_STATS) await fetch(REDIS_STATS.replace(/\/stats$/, "/reset"));
  for (const k of Object.keys(stats)) if (k === "setup") delete stats[k];

  // Screens
  const screens = [];
  for (let s = 0; s < SCREENS; s++) {
    const seen = new Set();
    screens.push(
      startPoller("screen poll", hall, { ...auth, role: s === 0 ? "led" : "vmix" }, (caption) => {
        if (caption.isFinal && sentFinals.has(caption.id) && !seen.has(caption.id)) {
          seen.add(caption.id);
          lags.push(Date.now() - sentFinals.get(caption.id));
        }
      }, stopAt)
    );
  }
  // The console polls too (it shows other devices' captions)
  const consolePoll = startPoller("console poll", hall, { ...auth, role: "operator" }, () => {}, stopAt);

  // The console talking
  const talk = (async () => {
    let n = 0;
    let lastSentAt = 0;
    const stamp = () => (lastSentAt = Math.max(Date.now(), lastSentAt + 1));
    while (Date.now() < stopAt) {
      n++;
      const words = SENTENCE(n).split(" ");
      const sentenceStart = Date.now();
      // Previews: the line grows word by word
      for (let w = 3; Date.now() - sentenceStart < FINAL_EVERY_MS - PREVIEW_MS && Date.now() < stopAt; w += 2) {
        const text = words.slice(0, Math.min(words.length, w)).join(" ");
        counters.translatePreview++;
        await http("console preview", "/api/caption/sync", {
          method: "POST",
          cookie: auth.cookie,
          body: {
            type: "CAPTION_UPDATE",
            session: hall,
            caption: { id: "interim_live", timestamp: Date.now(), sourceLang: "ko", sourceText: "한국어 원문 ".repeat(Math.ceil(w / 2)), translatedText: text, isFinal: false, speakerName: "Diễn giả 1", speakerRole: "Keynote", speakerColor: "#F6C445", sentAt: stamp() },
            device,
          },
        });
        await new Promise((r) => setTimeout(r, PREVIEW_MS));
      }
      if (Date.now() >= stopAt) break;
      const id = `final_${hall}_${n}`;
      counters.translateFinal++;
      sentFinals.set(id, Date.now());
      await http("console final", "/api/caption/sync", {
        method: "POST",
        cookie: auth.cookie,
        body: {
          type: "CAPTION_UPDATE",
          session: hall,
          caption: { ...finalCaption(id, n), sentAt: stamp() },
          device,
        },
      });
      // A short breath before the next sentence's first preview
      await new Promise((r) => setTimeout(r, PREVIEW_MS));
    }
  })();

  await Promise.all([...screens, consolePoll, talk]);
  // Leave the bench halls empty
  await http("cleanup", "/api/caption/sync", { method: "POST", cookie: auth.cookie, body: { type: "CLEAR_HISTORY", session: hall } }).catch(() => {});
}

const counters = { translatePreview: 0, translateFinal: 0 };

const SENTENCE = (n) => `Câu số ${n} của diễn giả, nói về đầu tư và công nghệ tại Việt Nam trong năm tới`;
function finalCaption(id, n) {
  return { id, timestamp: Date.now(), sourceLang: "ko", sourceText: "한국어 원문 문장입니다 ".repeat(4), translatedText: SENTENCE(n), isFinal: true, speakerName: "Diễn giả 1", speakerRole: "Keynote", speakerColor: "#F6C445", sentAt: Date.now() };
}
// About what a real event settings file holds: display settings, 5 speakers, a 60-term glossary and a
// briefing. Screens on a view key get it without the glossary and briefing.
function benchConfig() {
  return {
    fontSize: 56, fontFamily: "Be Vietnam Pro", textColor: "#FFFFFF", backgroundColor: "#000000", backgroundOpacity: 0.6,
    boxPaddingX: 32, boxPaddingY: 16, borderRadius: 16, maxWidthPercent: 92, displayMode: "bilingual", position: "bottom",
    alignment: "center", maxLines: 3, autoClearSec: 7, showSpeakerBadge: true, speakerLabel: "Diễn giả 1", activeSpeakerId: "spk-1",
    speakers: Array.from({ length: 5 }, (_, i) => ({ id: `spk-${i + 1}`, name: `Diễn giả ${i + 1}`, role: "Keynote", color: "#F6C445" })),
    ledSafeMarginPx: 24, sourceLanguage: "ko-KR", sttEngine: "webspeech", openrouterTranslateModel: "google/gemini-2.5-flash",
    interimTranslation: true, translationEngine: "auto",
    customGlossary: Array.from({ length: 60 }, (_, i) => ({ from: `용어 ${i} 반도체 투자`, to: `thuật ngữ ${i} đầu tư bán dẫn` })),
    eventContext: "Hội nghị đầu tư Hàn Quốc - Việt Nam 2026. ".repeat(20),
  };
}

let redis = null;
function report() {
  const perHallMin = (n) => (n / HALLS / (SECONDS / 60));
  const kb = (b) => (b / 1024).toFixed(1);
  const lines = [];
  lines.push(`# LiveCap sync benchmark`);
  lines.push("");
  lines.push(`${BASE}: ${HALLS} halls, 1 console + ${SCREENS} screens each, ${SECONDS} s, screens poll every ${POLL_MS} ms.`);
  lines.push("");
  lines.push(`| Traffic | Requests | Per hall per min | Up KB/hall/min | Down KB/hall/min (raw) | Down KB/hall/min (gzip) | Avg down bytes | p50 ms | p95 ms |`);
  lines.push(`|---|---|---|---|---|---|---|---|---|`);
  let tot = { requests: 0, up: 0, down: 0, gz: 0 };
  for (const [key, s] of Object.entries(stats).sort()) {
    if (key === "cleanup") continue;
    tot.requests += s.requests;
    tot.up += s.upBytes;
    tot.down += s.downBytes;
    tot.gz += s.downGzip;
    lines.push(`| ${key} | ${s.requests} | ${perHallMin(s.requests).toFixed(0)} | ${kb(perHallMin(s.upBytes))} | ${kb(perHallMin(s.downBytes))} | ${kb(perHallMin(s.downGzip))} | ${Math.round(s.downBytes / Math.max(1, s.requests))} | ${pct(s.ms, 50).toFixed(0)} | ${pct(s.ms, 95).toFixed(0)} |`);
  }
  lines.push(`| **All sync** | ${tot.requests} | ${perHallMin(tot.requests).toFixed(0)} | ${kb(perHallMin(tot.up))} | ${kb(perHallMin(tot.down))} | ${kb(perHallMin(tot.gz))} | | | |`);
  lines.push("");
  const expected = counters.translateFinal * SCREENS;
  lines.push(`Finished lines that reached the screens: ${lags.length} of ${expected} (${expected ? Math.round((100 * lags.length) / expected) : 0}%), in a median ${pct(lags, 50)} ms, 95th percentile ${pct(lags, 95)} ms.`);
  lines.push("");
  lines.push(`Not sent but counted (they also run on the server): ${counters.translatePreview} preview translations and ${counters.translateFinal} final translations, about ${perHallMin(counters.translatePreview + counters.translateFinal).toFixed(0)} per hall per minute while someone speaks.`);
  if (redis) {
    lines.push("");
    lines.push(`Redis (counted at a local proxy): ${redis.calls} calls with ${redis.commands} commands, ${kb(redis.downBytes)} KB read and ${kb(redis.upBytes)} KB written; per hall per minute ${perHallMin(redis.commands).toFixed(0)} commands and ${kb(perHallMin(redis.downBytes))} KB read.`);
    lines.push("");
    lines.push(`Commands: ${Object.entries(redis.ops).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ")}.`);
  }
  const md = lines.join("\n") + "\n";
  console.log(md);
  if (process.env.LIVECAP_REPORT) writeFileSync(process.env.LIVECAP_REPORT, md);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
}

console.log(`Benchmark: ${HALLS} halls × (1 console + ${SCREENS} screens) for ${SECONDS}s against ${BASE}`);
// Halls are set up first, then measured together
let startGate;
const started = new Promise((r) => (startGate = r));
let ready = 0;
const runs = Array.from({ length: HALLS }, (_, i) => runHall(i, started, () => ++ready === HALLS && startGate(Date.now() + SECONDS * 1000)));
const stopAt = await started;
await Promise.all(runs);
if (REDIS_STATS) redis = await (await fetch(REDIS_STATS)).json();
report();
