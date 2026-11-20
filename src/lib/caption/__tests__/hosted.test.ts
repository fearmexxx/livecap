import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_HALL,
  canUseHall,
  checkPassword,
  getAuthSecret,
  isAuthEnabled,
  isHostedWithoutLogins,
  isValidViewKey,
  listHalls,
  parseHallPasswords,
  readCookie,
  signSession,
  verifySession,
  viewKeyFor,
  viewerSafeConfig,
} from "../hostedAuth.ts";
import { createRedisBackend } from "../roomBackend.ts";
import { startFakeUpstash } from "./fakeUpstash.ts";
import { hallState, minuteOfDay, readApiUsage, safeHallId, summarizeUsage, usageChanges, usageDay } from "../usage.ts";

const env = {
  LIVECAP_HALL_PASSWORDS: "hall-1:alpha1, hall-2:bravo2,hall-10:tenten",
  LIVECAP_ADMIN_PASSWORD: "boss-password",
};

describe("Hall logins", () => {
  test("parses hall passwords and lists halls in natural order", () => {
    assert.deepEqual(parseHallPasswords(env.LIVECAP_HALL_PASSWORDS), { "hall-1": "alpha1", "hall-2": "bravo2", "hall-10": "tenten" });
    assert.deepEqual(listHalls(env), ["hall-1", "hall-2", "hall-10"]);
    assert.equal(isAuthEnabled({}), false);
    assert.equal(isAuthEnabled(env), true);
  });

  test("checks passwords per hall; admin opens everything", () => {
    assert.equal(checkPassword("hall-1", "alpha1", env), "hall-1");
    assert.equal(checkPassword("hall-1", "bravo2", env), null);
    assert.equal(checkPassword("hall-2", "", env), null);
    assert.equal(checkPassword(ADMIN_HALL, "boss-password", env), ADMIN_HALL);
    assert.equal(checkPassword(ADMIN_HALL, "alpha1", env), null);
    assert.equal(checkPassword("hall-2", "boss-password", env), "hall-2");
  });

  test("signed session cookie round-trips and rejects tampering or expiry", async () => {
    const secret = await getAuthSecret(env);
    const token = await signSession({ hall: "hall-2", exp: Date.now() + 60_000 }, secret);
    assert.equal((await verifySession(token, secret))?.hall, "hall-2");
    const [body, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ hall: ADMIN_HALL, exp: Date.now() + 60_000 })).toString("base64url");
    assert.equal(await verifySession(`${forged}.${sig}`, secret), null);
    // Change the first signature character (always to a different one)
    const tampered = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
    assert.equal(await verifySession(`${body}.${tampered}`, secret), null);
    const old = await signSession({ hall: "hall-2", exp: Date.now() - 1 }, secret);
    assert.equal(await verifySession(old, secret), null);
    assert.equal(await verifySession(token, await getAuthSecret({ ...env, LIVECAP_ADMIN_PASSWORD: "new-password" })), null);
  });

  test("view keys are per hall", async () => {
    const secret = await getAuthSecret(env);
    const k1 = await viewKeyFor("hall-1", secret);
    assert.equal(await isValidViewKey("hall-1", k1, secret), true);
    assert.equal(await isValidViewKey("hall-2", k1, secret), false);
    assert.equal(await isValidViewKey("hall-1", null, secret), false);
  });

  test("hall access and cookie parsing", () => {
    assert.equal(canUseHall({ hall: "hall-1", exp: 0 }, "hall-1"), true);
    assert.equal(canUseHall({ hall: "hall-1", exp: 0 }, "hall-2"), false);
    assert.equal(canUseHall({ hall: ADMIN_HALL, exp: 0 }, "hall-2"), true);
    assert.equal(canUseHall(null, "hall-1"), false);
    assert.equal(readCookie("a=1; livecap_auth=abc.def; b=2", "livecap_auth"), "abc.def");
  });
});

describe("Redis room store", () => {
  test("captions, config and devices survive across store instances (like Vercel copies)", async () => {
    const fake = await startFakeUpstash();
    try {
      const writer = createRedisBackend(fake.url, "test-token");
      const reader = createRedisBackend(fake.url, "test-token");
      const caption = { id: "c1", originalText: "안녕하세요", translatedText: "Xin chào", isFinal: true, timestamp: 1 } as never;
      await writer.applyEvent({ type: "CAPTION_UPDATE", caption, session: "hall-3" });
      const room = await reader.getRoom("hall-3");
      assert.equal(room.currentCaption?.translatedText, "Xin chào");
      assert.equal(room.history.length, 1);
      const updated = await reader.getLastUpdated("hall-3");
      assert.equal(updated, room.lastUpdated);

      await reader.registerDevice("hall-3", { deviceId: "vmix", deviceName: "vMix", role: "viewer", lastSeen: 0 });
      assert.deepEqual((await writer.getDevices("hall-3")).map((d) => d.deviceId), ["vmix"]);

      const sessions = await reader.listSessions();
      assert.deepEqual(sessions.map((s) => s.id), ["hall-3"]);

      await writer.clearRoomHistory("hall-3");
      assert.equal((await reader.getRoom("hall-3")).history.length, 0);
      assert.equal((await reader.getRoom("hall-9")).history.length, 0);
    } finally {
      fake.server.close();
    }
  });

  test("keeps every final sentence when captions land together", async () => {
    const fake = await startFakeUpstash();
    try {
      const a = createRedisBackend(fake.url, "test-token");
      const b = createRedisBackend(fake.url, "test-token");
      const line = (n: number) => ({ id: `c${n}`, originalText: "x", translatedText: `vi ${n}`, isFinal: true, timestamp: n }) as never;
      await Promise.all(
        [1, 2, 3, 4, 5, 6].map((n) =>
          (n % 2 ? a : b).applyEvent({ type: "CAPTION_UPDATE", caption: line(n), session: "hall-1" })
        )
      );
      const room = await a.getRoom("hall-1");
      assert.deepEqual(room.history.map((c) => c.id), ["c1", "c2", "c3", "c4", "c5", "c6"]);
    } finally {
      fake.server.close();
    }
  });

  test("shows a re-sent final once, with its latest text", async () => {
    const fake = await startFakeUpstash();
    try {
      const repo = createRedisBackend(fake.url, "test-token");
      const base = { id: "c1", originalText: "x", isFinal: true, timestamp: 1 };
      await repo.applyEvent({ type: "CAPTION_UPDATE", caption: { ...base, translatedText: "old" } as never, session: "h" });
      await repo.applyEvent({ type: "CAPTION_UPDATE", caption: { ...base, translatedText: "new" } as never, session: "h" });
      const { history } = await repo.getRoom("h");
      assert.equal(history.length, 1);
      assert.equal(history[0].translatedText, "new");
    } finally {
      fake.server.close();
    }
  });

  test("counts failed logins across server copies", async () => {
    const fake = await startFakeUpstash();
    try {
      const a = createRedisBackend(fake.url, "test-token");
      const b = createRedisBackend(fake.url, "test-token");
      await a.recordLoginFailure("1.2.3.4");
      await b.recordLoginFailure("1.2.3.4");
      assert.equal(await a.loginFailures("1.2.3.4"), 2);
      assert.equal(await a.loginFailures("5.6.7.8"), 0);
      await b.clearLoginFailures("1.2.3.4");
      assert.equal(await a.loginFailures("1.2.3.4"), 0);
    } finally {
      fake.server.close();
    }
  });
});

describe("Hosted safety", () => {
  test("refuses to run open on Vercel, and ignores short passwords", () => {
    assert.equal(isHostedWithoutLogins({ VERCEL: "1" } as never), true);
    assert.equal(isHostedWithoutLogins({ VERCEL: "1", ...env } as never), false);
    assert.equal(isHostedWithoutLogins({}), false);
    const weak = { LIVECAP_HALL_PASSWORDS: "hall-1:1234", LIVECAP_ADMIN_PASSWORD: "boss" };
    assert.equal(isAuthEnabled(weak), false);
    assert.equal(checkPassword("hall-1", "1234", weak), null);
    assert.equal(checkPassword(ADMIN_HALL, "boss", weak), null);
  });

  test("view keys do not receive the glossary or event briefing", () => {
    const safe = viewerSafeConfig({ fontSize: 40, eventContext: "secret", customGlossary: [{ from: "a", to: "b" }] });
    assert.equal(safe?.eventContext, "");
    assert.deepEqual(safe?.customGlossary, []);
    assert.equal(safe?.fontSize, 40);
    assert.equal(viewerSafeConfig(null), null);
  });
});

describe("Usage counters for the monitoring page", () => {
  test("uses Vietnam days and minutes", () => {
    const t = Date.UTC(2026, 10, 15, 17, 30); // 00:30 on the 16th in Vietnam
    assert.equal(usageDay(t), "2026-11-16");
    assert.equal(minuteOfDay(t), 30);
  });

  test("counts a Gemini translation with its tokens and cost", () => {
    const now = Date.UTC(2026, 10, 15, 3, 0);
    const { incr, latest } = usageChanges({ kind: "translate", ok: true, ms: 900, tokensIn: 400, tokensOut: 30, cost: 0.0002, engine: "openrouter", model: "google/gemini-2.5-flash" }, now);
    assert.equal(incr.tr_req, 1);
    assert.equal(incr.tok_in, 400);
    assert.equal(incr.cost, 0.0002);
    assert.equal(incr[`t:${minuteOfDay(now)}`], 430);
    assert.equal(latest.model, "google/gemini-2.5-flash");
    assert.equal(latest.last_error, undefined);
  });

  test("records a fallback as a problem with its message", () => {
    const { incr, latest } = usageChanges({ kind: "translate", ok: true, fallback: true, error: "openrouter failed (402)" });
    assert.equal(incr.tr_fallback, 1);
    assert.match(latest.last_error, /402/);
  });

  test("keeps free previews apart from paid requests", () => {
    const { incr } = usageChanges({ kind: "translate", ok: true, free: true, engine: "google-free" });
    assert.equal(incr.tr_free, 1);
    assert.equal(incr.tr_req, undefined);
  });

  test("adds up counters in Redis and summarizes them", async () => {
    const fake = await startFakeUpstash();
    try {
      const backend = createRedisBackend(fake.url, "test-token");
      const now = Date.UTC(2026, 10, 15, 3, 0);
      const day = usageDay(now);
      for (const ms of [800, 1200]) {
        const { incr, latest } = usageChanges({ kind: "translate", ok: true, ms, tokensIn: 100, tokensOut: 20, cost: 0.0001 }, now);
        await backend.recordUsage("hall-2", day, incr, latest);
      }
      const stt = usageChanges({ kind: "stt", ok: false, error: "OpenRouter 500" }, now);
      await backend.recordUsage("hall-2", day, stt.incr, stt.latest);
      assert.deepEqual(await backend.usageHalls(day), ["hall-2"]);
      const u = summarizeUsage(await backend.getUsage("hall-2", day), now);
      assert.equal(u.translate.requests, 2);
      assert.equal(u.translate.avgMs, 1000);
      assert.equal(u.tokens, 240);
      assert.ok(Math.abs(u.cost - 0.0002) < 1e-9);
      assert.equal(u.stt.failed, 1);
      assert.equal(u.series.requests.at(-1), 3);
      assert.equal(u.series.requests.length, 60);
      await backend.ping();
    } finally {
      fake.server.close();
    }
  });

  test("works out each hall's state", () => {
    const now = 10_000_000;
    assert.equal(hallState({ consoles: 0, lastTranslateAt: now, lastSttAt: 0, lastErrorAt: 0 }, now), "offline");
    assert.equal(hallState({ consoles: 1, lastTranslateAt: now - 30_000, lastSttAt: 0, lastErrorAt: 0 }, now), "live");
    assert.equal(hallState({ consoles: 1, lastTranslateAt: now - 600_000, lastSttAt: 0, lastErrorAt: 0 }, now), "ready");
    assert.equal(hallState({ consoles: 1, lastTranslateAt: now, lastSttAt: 0, lastErrorAt: now - 60_000 }, now), "warning");
  });

  test("only accepts plain hall ids and reads API usage", () => {
    assert.equal(safeHallId("Hall-3"), "hall-3");
    assert.equal(safeHallId("../x"), null);
    assert.deepEqual(readApiUsage({ prompt_tokens: 5, completion_tokens: 2, cost: 0.1 }), { tokensIn: 5, tokensOut: 2, cost: 0.1 });
    assert.deepEqual(readApiUsage(undefined), { tokensIn: 0, tokensOut: 0, cost: 0 });
  });
});
