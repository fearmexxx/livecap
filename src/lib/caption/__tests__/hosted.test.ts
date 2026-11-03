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
    assert.equal(await verifySession(`${body}.x${sig.slice(1)}`, secret), null);
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
