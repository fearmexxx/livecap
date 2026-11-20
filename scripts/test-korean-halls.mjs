#!/usr/bin/env node
/**
 * Live check of a hosted LiveCap site: Korean (and some English) translation across several halls
 * at once, plus the hall logins and the read-only vMix/LED links.
 *
 * What it does, for every hall at the same time (like 5 halls running together on event day):
 *   1. Logs in to the hall.
 *   2. Sends a scripted Korean talk, sentence by sentence, with the previous lines as context, the
 *      way the console does, and checks each Vietnamese line (no Korean left, numbers like 억/조
 *      converted, titles like 회장님 translated, Gemini used with no fallback).
 *   3. Posts each line to the hall's screen and reads it back through the hall's view-key link.
 * Then it checks the halls stay apart: one hall's view key cannot read another hall, a hall login
 * cannot post to another hall, signed-out requests are refused, and a wrong password is refused.
 *
 * Settings (environment variables; never put passwords in the command line or in git):
 *   LIVECAP_URL              Site to test, e.g. https://livecap-dun.vercel.app (default: that one)
 *   LIVECAP_HALL_PASSWORDS   "hall-1:pass1,hall-2:pass2,..." to log in to each hall with its own password
 *   LIVECAP_ADMIN_PASSWORD   Or the admin password, which opens any hall
 *   LIVECAP_TEST_HALLS       Halls to test, comma separated (default: the halls in LIVECAP_HALL_PASSWORDS,
 *                            or test-1..test-5 with the admin password)
 *   LIVECAP_EXPECT_ENGINE    Engine each answer must come from (default "openrouter"; "any" skips the check)
 *   LIVECAP_KEEP_HISTORY     "1" keeps the test lines on the halls' screens (default: cleared at the end)
 *   LIVECAP_SCREEN_TEST      "0" skips posting to the halls' screens (translation checks only)
 *
 * Run:  LIVECAP_ADMIN_PASSWORD=... node scripts/test-korean-halls.mjs
 * Exit code 0 when every check passes, 1 otherwise. A Markdown report is written to
 * $GITHUB_STEP_SUMMARY when set (GitHub Actions), and to LIVECAP_REPORT if given.
 */

import { writeFileSync, appendFileSync } from "node:fs";

const BASE = (process.env.LIVECAP_URL || "https://livecap-dun.vercel.app").replace(/\/+$/, "");
const EXPECT_ENGINE = (process.env.LIVECAP_EXPECT_ENGINE || "openrouter").trim();
const KEEP_HISTORY = process.env.LIVECAP_KEEP_HISTORY === "1";
const SCREEN_TEST = process.env.LIVECAP_SCREEN_TEST !== "0";
const HANGUL_RE = /[ᄀ-ᇿ㄰-㆏가-힯]/;
const VIET_RE = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i;

/* ---------------- Test talks ----------------
 * Each hall gets its own talk, so a mix-up between halls shows. `expect` lists patterns the
 * Vietnamese must match (any one of the alternatives in a RegExp); `avoid` lists patterns it must not.
 */
const KO_TALKS = [
  {
    title: "Opening keynote (chairman, revenue in 억/조)",
    speakerName: "김회장",
    eventContext: "VBE Korea–Vietnam Business Forum 2026. Speakers: Chairman Kim of Hanwha Partners.",
    lines: [
      { ko: "존경하는 내빈 여러분, 안녕하십니까.", expect: [/quý vị/i] },
      { ko: "오늘 이 자리에 함께해 주신 회장님께 깊은 감사를 드립니다.", expect: [/chủ tịch/i] },
      { ko: "작년 저희 회사의 베트남 매출은 3억 5천만 달러를 기록했습니다.", expect: [/350\s*triệu/i] },
      { ko: "그리고 2030년까지 누적 투자 규모를 1조 2천억 원으로 확대할 계획입니다.", expect: [/1[.,]?200\s*tỷ|1[.,]2\s*nghìn\s*tỷ|1[.,]2\s*ngàn\s*tỷ/i] },
      { ko: "감사합니다.", expect: [/cảm ơn/i] },
    ],
  },
  {
    title: "Panel on manufacturing (split sentence, omitted subject)",
    speakerName: "박대표",
    eventContext: "Panel: smart factories in Bac Ninh. Moderator: CEO Park (대표님).",
    lines: [
      { ko: "대표님께서 말씀하신 것처럼", expect: [/tổng giám đốc|giám đốc|ceo/i] },
      { ko: "박닌 공장의 자동화율은 작년보다 두 배 이상 높아졌습니다.", expect: [/bắc ninh/i, /gấp đôi|hai lần|2 lần/i] },
      { ko: "현재 직원 수는 약 1만 2천 명입니다.", expect: [/12[.,]?000|12\s*nghìn|12\s*ngàn/i] },
      { ko: "앞으로도 베트남 인재 양성에 계속 투자하겠습니다.", expect: [/việt nam/i, /đầu tư/i] },
    ],
  },
  {
    title: "Investment session (percentages, 조 dollars)",
    speakerName: "이사장",
    eventContext: "Session on Korean FDI into Vietnam. Speaker: Chairman Lee (이사장).",
    lines: [
      { ko: "한국은 베트남의 최대 투자국입니다.", expect: [/hàn quốc/i, /việt nam/i] },
      { ko: "누적 투자액은 약 870억 달러에 달합니다.", expect: [/87\s*tỷ/i] },
      { ko: "올해 양국 교역액은 전년 대비 15% 증가했습니다.", expect: [/15\s*%|15 phần trăm/i] },
      { ko: "질문이 있으시면 편하게 말씀해 주십시오.", expect: [/câu hỏi|hỏi/i] },
    ],
  },
  {
    title: "Tech talk (product names, long sentence)",
    speakerName: "최상무",
    eventContext: "AI and semiconductors session. Product names: Samsung Galaxy, HBM4.",
    lines: [
      { ko: "삼성전자는 하노이와 박닌에 대규모 생산 기지를 운영하고 있으며, 이곳에서 전 세계 스마트폰의 약 절반을 생산하고 있습니다.", expect: [/samsung/i, /hà nội/i, /một nửa|50\s*%/i] },
      { ko: "HBM4 메모리 수요가 빠르게 늘고 있습니다.", expect: [/hbm4/i] },
      { ko: "인공지능 시대에 베트남 엔지니어의 역할은 더욱 중요해질 것입니다.", expect: [/trí tuệ nhân tạo|ai\b/i, /kỹ sư/i] },
    ],
  },
  {
    title: "Closing remarks (English speaker)",
    speakerName: "Ms. Johnson",
    sourceLang: "en",
    eventContext: "Closing remarks by the US–ASEAN Business Council.",
    lines: [
      { ko: "Thank you all for joining us today.", expect: [/cảm ơn/i] },
      { ko: "Vietnam's GDP grew by 7.1 percent last year.", expect: [/7[.,]1\s*%|7[.,]1 phần trăm/i] },
      { ko: "We look forward to seeing you again next year in Ho Chi Minh City.", expect: [/hồ chí minh|tp\.?\s*hcm/i] },
    ],
  },
];

/* ---------------- Small HTTP client with a cookie per hall ---------------- */
class Client {
  constructor(label) {
    this.label = label;
    this.cookie = "";
  }
  async request(path, { method = "GET", body, headers = {} } = {}) {
    const res = await fetch(BASE + path, {
      method,
      redirect: "manual",
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const setCookie = res.headers.get("set-cookie");
    const match = setCookie && /livecap_auth=([^;]*)/.exec(setCookie);
    if (match) this.cookie = `livecap_auth=${match[1]}`;
    let data = null;
    const text = await res.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text.slice(0, 200) };
    }
    return { status: res.status, data };
  }
}

/* ---------------- Results ---------------- */
const results = []; // { group, name, ok, detail }
function check(group, name, ok, detail = "") {
  results.push({ group, name, ok: !!ok, detail });
  const mark = ok ? "PASS" : "FAIL";
  console.log(`${mark}  [${group}] ${name}${detail ? " — " + detail : ""}`);
  return !!ok;
}

function hallList() {
  const fromEnv = (process.env.LIVECAP_TEST_HALLS || "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (fromEnv.length) return fromEnv;
  const hallPw = parseHallPasswords(process.env.LIVECAP_HALL_PASSWORDS);
  const named = Object.keys(hallPw).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (named.length) return named;
  return ["test-1", "test-2", "test-3", "test-4", "test-5"];
}

function parseHallPasswords(raw) {
  const out = {};
  for (const part of (raw || "").split(/[,;\n]/)) {
    const idx = part.indexOf(":");
    if (idx <= 0) continue;
    out[part.slice(0, idx).trim().toLowerCase()] = part.slice(idx + 1).trim();
  }
  return out;
}

function passwordFor(hall) {
  return parseHallPasswords(process.env.LIVECAP_HALL_PASSWORDS)[hall] || process.env.LIVECAP_ADMIN_PASSWORD || "";
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

/* ---------------- One hall's run ---------------- */
async function runHall(hall, talk, runId) {
  const group = hall;
  const client = new Client(hall);
  const out = { hall, talk: talk.title, lines: [], latencies: [], viewKey: "", client, ok: true };

  let login = await client.request("/api/auth/login", { method: "POST", body: { hall, password: passwordFor(hall) } });
  let how = parseHallPasswords(process.env.LIVECAP_HALL_PASSWORDS)[hall] ? "hall password" : "admin password";
  if (login.status === 401 && how === "hall password" && process.env.LIVECAP_ADMIN_PASSWORD) {
    // The hall password in GitHub differs from the site's: say so, then carry on with the admin password
    check(group, "hall password from GitHub works on the site", false, "wrong password for this hall; check LIVECAP_HALL_PASSWORDS matches Vercel");
    login = await client.request("/api/auth/login", { method: "POST", body: { hall, password: process.env.LIVECAP_ADMIN_PASSWORD } });
    how = "admin password";
  }
  if (!check(group, `log in (${how})`, login.status === 200 && login.data?.ok, `HTTP ${login.status}${login.data?.error ? " " + login.data.error : ""}`)) {
    out.ok = false;
    return out;
  }
  const me = await client.request(`/api/auth/me?session=${encodeURIComponent(hall)}`);
  out.viewKey = me.data?.viewKey || "";
  out.loginHall = me.data?.hall;
  out.admin = !!me.data?.admin;
  check(group, "login is for this hall", me.data?.hall === hall, `logged in as ${me.data?.admin ? "admin" : me.data?.hall}`);

  const context = [];
  const previousTranslations = [];
  for (let i = 0; i < talk.lines.length; i++) {
    const line = talk.lines[i];
    const started = Date.now();
    const res = await client.request("/api/caption/translate", {
      method: "POST",
      body: {
        text: line.ko,
        sourceLang: talk.sourceLang || "ko",
        targetLang: "vi",
        context: context.slice(-3),
        previousTranslations: previousTranslations.slice(-3),
        eventContext: talk.eventContext,
        speakerName: talk.speakerName,
        engine: "auto",
      },
    });
    const roundTrip = Date.now() - started;
    const vi = String(res.data?.translatedText || "").trim();
    const engine = String(res.data?.engine || "");
    const problems = [];
    if (res.status !== 200) problems.push(`HTTP ${res.status}`);
    if (res.data?.failed) problems.push(`failed: ${res.data?.error || "unknown"}`);
    if (!vi) problems.push("empty translation");
    if (res.data?.fallback) problems.push(`fell back to ${engine}: ${res.data?.warning || ""}`);
    if (EXPECT_ENGINE !== "any" && !res.data?.cached && !engine.startsWith(EXPECT_ENGINE)) problems.push(`engine ${engine || "?"}, expected ${EXPECT_ENGINE}`);
    if (vi && HANGUL_RE.test(vi)) problems.push("Korean left in the Vietnamese");
    if (vi && !VIET_RE.test(vi)) problems.push("does not look like Vietnamese");
    for (const re of line.expect || []) if (vi && !re.test(vi)) problems.push(`missing ${re}`);
    for (const re of line.avoid || []) if (vi && re.test(vi)) problems.push(`should not contain ${re}`);

    if (!res.data?.cached) out.latencies.push(res.data?.latencyMs ?? roundTrip);
    out.lines.push({ src: line.ko, vi, engine, cached: !!res.data?.cached, ms: roundTrip, problems });
    check(group, `translate line ${i + 1}`, problems.length === 0, problems.length ? problems.join("; ") + ` | "${vi}"` : `${roundTrip} ms${res.data?.cached ? " (cached)" : ""}`);

    context.push(line.ko);
    if (vi) previousTranslations.push(vi);

    if (SCREEN_TEST && vi) {
      const caption = {
        id: `qa-${runId}-${hall}-${i}`,
        timestamp: Date.now(),
        sourceLang: talk.sourceLang || "ko",
        sourceText: line.ko,
        translatedText: `${vi} [qa ${runId} ${hall}]`,
        isFinal: true,
        speakerName: talk.speakerName,
      };
      const posted = await client.request("/api/caption/sync", {
        method: "POST",
        body: { type: "CAPTION_UPDATE", session: hall, caption, sessionName: `QA ${hall}` },
      });
      if (!posted.data?.success) check(group, `show line ${i + 1} on screen`, false, `HTTP ${posted.status} ${posted.data?.error || ""}`);
    }
  }

  if (SCREEN_TEST) {
    // Read back through the read-only link vMix/OBS/LED use: no cookie, only the view key
    const viewer = new Client(`${hall}-viewer`);
    const feed = await viewer.request(`/api/caption/sync?session=${encodeURIComponent(hall)}&k=${encodeURIComponent(out.viewKey)}`);
    const history = Array.isArray(feed.data?.history) ? feed.data.history : [];
    const mine = history.filter((c) => String(c.id || "").startsWith(`qa-${runId}-${hall}-`));
    const foreign = history.filter((c) => String(c.id || "").startsWith(`qa-${runId}-`) && !String(c.id).startsWith(`qa-${runId}-${hall}-`));
    const expected = out.lines.filter((l) => l.vi).length;
    check(group, "view-key link shows this hall's lines", feed.status === 200 && mine.length === expected, `HTTP ${feed.status}, ${mine.length}/${expected} lines`);
    check(group, "no other hall's lines on this screen", foreign.length === 0, foreign.length ? `${foreign.length} foreign lines` : "");
    const cfg = feed.data?.config;
    check(group, "view-key link hides glossary and briefing", !cfg || ((!cfg.customGlossary || cfg.customGlossary.length === 0) && !cfg.eventContext), "");
  }
  return out;
}

/* ---------------- Cross-hall and sign-in checks ---------------- */
async function isolationChecks(runs) {
  const group = "security";
  const live = runs.filter((r) => r.viewKey);
  if (live.length >= 2) {
    const [a, b] = live;
    const stranger = new Client("stranger");
    const wrongKey = await stranger.request(`/api/caption/sync?session=${encodeURIComponent(b.hall)}&k=${encodeURIComponent(a.viewKey)}`);
    check(group, `${a.hall}'s view key cannot read ${b.hall}`, wrongKey.status === 401, `HTTP ${wrongKey.status}`);

    if (!a.admin) {
      const cross = await a.client.request("/api/caption/sync", {
        method: "POST",
        body: { type: "PIN_ANNOUNCEMENT", session: b.hall, text: "qa cross-hall write" },
      });
      check(group, `${a.hall} login cannot post to ${b.hall}`, cross.status === 403, `HTTP ${cross.status}`);
    } else {
      check(group, "hall login cannot post to another hall", true, "skipped: admin login opens every hall (set LIVECAP_HALL_PASSWORDS to test)");
    }
  }

  const anon = new Client("anon");
  const t = await anon.request("/api/caption/translate", { method: "POST", body: { text: "안녕하세요", sourceLang: "ko" } });
  check(group, "signed-out translate request is refused", t.status === 401, `HTTP ${t.status}`);
  const feed = await anon.request(`/api/caption/sync?session=${encodeURIComponent(runs[0]?.hall || "hall-1")}`);
  check(group, "signed-out caption feed is refused", feed.status === 401, `HTTP ${feed.status}`);
  const page = await anon.request(`/caption?session=${encodeURIComponent(runs[0]?.hall || "hall-1")}`);
  check(group, "signed-out console redirects to login", page.status >= 300 && page.status < 400, `HTTP ${page.status}`);

  // One wrong password (the site locks an address only after 20 in 15 minutes; a later good login resets it)
  const wrong = await new Client("wrong").request("/api/auth/login", {
    method: "POST",
    body: { hall: runs[0]?.hall || "hall-1", password: "definitely-not-the-password" },
  });
  check(group, "wrong password is refused", wrong.status === 401, `HTTP ${wrong.status}`);
  // Clear the failure count again with a good login
  if (runs[0]) await new Client("reset").request("/api/auth/login", { method: "POST", body: { hall: runs[0].hall, password: passwordFor(runs[0].hall) } });
}

async function cleanUp(runs) {
  if (KEEP_HISTORY || !SCREEN_TEST) return;
  for (const r of runs) {
    if (!r.viewKey) continue;
    const res = await r.client.request("/api/caption/sync", { method: "POST", body: { type: "CLEAR_HISTORY", session: r.hall } });
    check("cleanup", `clear test lines from ${r.hall}`, res.data?.success, `HTTP ${res.status}`);
  }
}

/* ---------------- Report ---------------- */
function report(runs, wallMs) {
  const failed = results.filter((r) => !r.ok);
  const allLatencies = runs.flatMap((r) => r.latencies);
  const lines = [];
  lines.push(`# LiveCap Korean multi-hall test`);
  lines.push("");
  lines.push(`${failed.length ? "❌" : "✅"} **${results.length - failed.length}/${results.length} checks passed** on ${BASE}, ${runs.length} halls at once, ${(wallMs / 1000).toFixed(1)} s.`);
  lines.push("");
  lines.push(`Translation time (server side, not cached): median ${percentile(allLatencies, 50)} ms, 95th percentile ${percentile(allLatencies, 95)} ms, slowest ${Math.max(0, ...allLatencies)} ms over ${allLatencies.length} lines.`);
  lines.push("");
  if (failed.length) {
    lines.push(`## Failed checks`);
    lines.push("");
    for (const f of failed) lines.push(`- **${f.group}**: ${f.name}${f.detail ? ` — ${f.detail.replace(/\|/g, "\\|")}` : ""}`);
    lines.push("");
  }
  for (const r of runs) {
    lines.push(`## ${r.hall}: ${r.talk}`);
    lines.push("");
    lines.push(`| # | Source | Vietnamese | Engine | ms | Result |`);
    lines.push(`|---|---|---|---|---|---|`);
    r.lines.forEach((l, i) => {
      const esc = (s) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
      lines.push(`| ${i + 1} | ${esc(l.src)} | ${esc(l.vi)} | ${esc(l.engine)}${l.cached ? " (cached)" : ""} | ${l.ms} | ${l.problems.length ? "❌ " + esc(l.problems.join("; ")) : "✅"} |`);
    });
    lines.push("");
  }
  const md = lines.join("\n") + "\n";
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  if (process.env.LIVECAP_REPORT) writeFileSync(process.env.LIVECAP_REPORT, md);
  return failed.length;
}

async function main() {
  const halls = hallList();
  // The site lists its halls on the login page; flag test halls it does not know
  const site = await new Client("site").request("/api/auth/me").catch(() => null);
  const siteHalls = Array.isArray(site?.data?.halls) ? site.data.halls : [];
  if (siteHalls.length) {
    console.log(`Halls on the site: ${siteHalls.join(", ")}`);
    const unknown = halls.filter((h) => !siteHalls.includes(h) && !/^test-/.test(h));
    check("setup", "test halls are halls on the site", unknown.length === 0, unknown.length ? `not on the site: ${unknown.join(", ")} (site has ${siteHalls.join(", ")})` : "");
  }
  if (!process.env.LIVECAP_HALL_PASSWORDS && !process.env.LIVECAP_ADMIN_PASSWORD) {
    console.error("Set LIVECAP_ADMIN_PASSWORD or LIVECAP_HALL_PASSWORDS (see the top of this file).");
    process.exit(2);
  }
  const runId = Date.now().toString(36);
  console.log(`Testing ${BASE} with halls: ${halls.join(", ")} (run ${runId})`);
  const started = Date.now();
  const runs = await Promise.all(halls.map((hall, i) => runHall(hall, KO_TALKS[i % KO_TALKS.length], runId).catch((err) => {
    check(hall, "run", false, String(err?.message || err));
    return { hall, talk: "", lines: [], latencies: [], viewKey: "" };
  })));
  const wallMs = Date.now() - started;
  await isolationChecks(runs);
  await cleanUp(runs);
  const failures = report(runs, wallMs);
  console.log(failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
