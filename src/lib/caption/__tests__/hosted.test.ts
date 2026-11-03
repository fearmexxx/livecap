import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_HALL,
  canUseHall,
  checkPassword,
  getAuthSecret,
  isAuthEnabled,
  isValidViewKey,
  listHalls,
  parseHallPasswords,
  readCookie,
  signSession,
  verifySession,
  viewKeyFor,
} from "../hostedAuth.ts";
import { createRedisBackend } from "../roomBackend.ts";
import { startFakeUpstash } from "./fakeUpstash.ts";

const env = {
  LIVECAP_HALL_PASSWORDS: "hall-1:alpha, hall-2:bravo,hall-10:ten",
  LIVECAP_ADMIN_PASSWORD: "boss",
};

describe("Hall logins", () => {
  test("parses hall passwords and lists halls in natural order", () => {
    assert.deepEqual(parseHallPasswords(env.LIVECAP_HALL_PASSWORDS), { "hall-1": "alpha", "hall-2": "bravo", "hall-10": "ten" });
    assert.deepEqual(listHalls(env), ["hall-1", "hall-2", "hall-10"]);
    assert.equal(isAuthEnabled({}), false);
    assert.equal(isAuthEnabled(env), true);
  });

  test("checks passwords per hall; admin opens everything", () => {
    assert.equal(checkPassword("hall-1", "alpha", env), "hall-1");
    assert.equal(checkPassword("hall-1", "bravo", env), null);
    assert.equal(checkPassword("hall-2", "", env), null);
    assert.equal(checkPassword(ADMIN_HALL, "boss", env), ADMIN_HALL);
    assert.equal(checkPassword(ADMIN_HALL, "alpha", env), null);
    assert.equal(checkPassword("hall-2", "boss", env), "hall-2");
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
    assert.equal(await verifySession(token, await getAuthSecret({ ...env, LIVECAP_ADMIN_PASSWORD: "new" })), null);
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
});
