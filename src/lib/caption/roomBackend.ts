import { type MultiRoomHub, multiRoomHub, type RoomSyncState } from "./roomStore.ts";
import type { BroadcastPayload, CaptionConfig, CaptionItem, ConnectedDevice, SessionInfo } from "./types.ts";

/**
 * Where room state (current caption, history, config, devices) lives.
 *
 * - Laptop / localhost: in this server's memory (MultiRoomHub).
 * - Hosted on Vercel: several server copies run at once, so state goes to Upstash Redis (REST API,
 *   no extra package). Set KV_REST_API_URL + KV_REST_API_TOKEN (what Vercel's Upstash integration
 *   adds) or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.
 */
export interface RoomBackend {
  readonly kind: "memory" | "redis";
  getRoom(sessionId: string): Promise<RoomSyncState>;
  /** Room's lastUpdated only (cheap check for pollers) */
  getLastUpdated(sessionId: string): Promise<number>;
  registerDevice(sessionId: string, device: ConnectedDevice): Promise<void>;
  getDevices(sessionId: string): Promise<ConnectedDevice[]>;
  applyEvent(payload: BroadcastPayload & { sessionName?: string }): Promise<RoomSyncState>;
  clearRoomHistory(sessionId: string): Promise<RoomSyncState>;
  listSessions(): Promise<SessionInfo[]>;
  /** Failed logins for this address within the window */
  loginFailures(address: string): Promise<number>;
  recordLoginFailure(address: string): Promise<void>;
  clearLoginFailures(address: string): Promise<void>;
}

const DEVICE_TTL_MS = 60_000;
const ROOM_TTL_SECONDS = 60 * 60 * 24 * 7; // rooms expire a week after their last update
const MAX_ROOM_HISTORY = 100;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const REDIS_TIMEOUT_MS = 3000;

export function normalizeSessionId(sessionId: string | null | undefined): string {
  return (sessionId || "default").trim() || "default";
}

class MemoryBackend implements RoomBackend {
  readonly kind = "memory" as const;
  private hub: MultiRoomHub;
  private failures = new Map<string, { count: number; resetAt: number }>();
  constructor(hub: MultiRoomHub) {
    this.hub = hub;
  }

  async getRoom(sessionId: string) {
    const room = this.hub.getRoom(sessionId);
    this.hub.pruneStaleDevices(room);
    return room;
  }
  async getLastUpdated(sessionId: string) {
    return this.hub.getRoom(sessionId).lastUpdated;
  }
  async registerDevice(sessionId: string, device: ConnectedDevice) {
    this.hub.registerDevice(sessionId, device);
  }
  async getDevices(sessionId: string) {
    const room = this.hub.getRoom(sessionId);
    this.hub.pruneStaleDevices(room);
    return Object.values(room.devices);
  }
  async applyEvent(payload: BroadcastPayload & { sessionName?: string }) {
    return this.hub.applyEvent(payload);
  }
  async clearRoomHistory(sessionId: string) {
    return this.hub.clearRoomHistory(sessionId);
  }
  async listSessions() {
    return this.hub.listSessions();
  }
  async loginFailures(address: string) {
    const entry = this.failures.get(address);
    return entry && entry.resetAt > Date.now() ? entry.count : 0;
  }
  async recordLoginFailure(address: string) {
    const count = (await this.loginFailures(address)) + 1;
    const resetAt = count === 1 ? Date.now() + LOGIN_WINDOW_MS : this.failures.get(address)!.resetAt;
    this.failures.set(address, { count, resetAt });
  }
  async clearLoginFailures(address: string) {
    this.failures.delete(address);
  }
}

type RedisCommand = (string | number)[];

function flatToObject(flat: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (Array.isArray(flat)) {
    for (let i = 0; i + 1 < flat.length; i += 2) out[String(flat[i])] = String(flat[i + 1]);
  }
  return out;
}

function parseField<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// A final can be re-sent with the same id: the latest copy wins, oldest line first
function mergeHistory(raw: unknown): CaptionItem[] {
  const byId = new Map<string, CaptionItem>();
  for (const line of Array.isArray(raw) ? raw : []) {
    const item = parseField<CaptionItem | null>(line, null);
    if (item) byId.set(item.id, item);
  }
  return [...byId.values()].sort((a, b) => a.timestamp - b.timestamp);
}

class RedisBackend implements RoomBackend {
  readonly kind = "redis" as const;
  private url: string;
  private token: string;
  private prefix: string;
  constructor(url: string, token: string, prefix = "livecap") {
    this.url = url;
    this.token = token;
    this.prefix = prefix;
  }

  private async pipeline(commands: RedisCommand[]): Promise<unknown[]> {
    const res = await fetch(`${this.url.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands),
      cache: "no-store",
      signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Redis ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { result?: unknown; error?: string }[];
    return data.map((d) => {
      if (d.error) throw new Error(`Redis: ${d.error}`);
      return d.result;
    });
  }

  private roomKey(id: string) {
    return `${this.prefix}:room:${id}`;
  }
  private historyKey(id: string) {
    return `${this.prefix}:history:${id}`;
  }
  private loginKey(address: string) {
    return `${this.prefix}:login:${address}`;
  }
  private devicesKey(id: string) {
    return `${this.prefix}:devices:${id}`;
  }
  private updatedKey(id: string) {
    return `${this.prefix}:updated:${id}`;
  }
  private roomsKey() {
    return `${this.prefix}:rooms`;
  }

  async getRoom(sessionId: string): Promise<RoomSyncState> {
    const id = normalizeSessionId(sessionId);
    const [flat, rawHistory, updated] = await this.pipeline([
      ["HGETALL", this.roomKey(id)],
      ["LRANGE", this.historyKey(id), -MAX_ROOM_HISTORY, -1],
      ["GET", this.updatedKey(id)],
    ]);
    const fields = flatToObject(flat);
    return {
      id,
      sessionName: fields.sessionName || (id === "default" ? "🏛️ Default (Main Hall)" : id),
      currentCaption: parseField<CaptionItem | null>(fields.currentCaption, null),
      history: mergeHistory(rawHistory),
      config: parseField<CaptionConfig | null>(fields.config, null),
      pinnedAnnouncement: parseField<string | null>(fields.pinnedAnnouncement, null),
      devices: {},
      lastUpdated: Number(updated) || 0,
      createdAt: Number(fields.createdAt) || 0,
    };
  }

  async getLastUpdated(sessionId: string): Promise<number> {
    const [raw] = await this.pipeline([["GET", this.updatedKey(normalizeSessionId(sessionId))]]);
    return Number(raw) || 0;
  }

  async registerDevice(sessionId: string, device: ConnectedDevice) {
    if (!device?.deviceId) return;
    const id = normalizeSessionId(sessionId);
    await this.pipeline([
      ["HSET", this.devicesKey(id), device.deviceId, JSON.stringify({ ...device, lastSeen: Date.now() })],
      ["EXPIRE", this.devicesKey(id), ROOM_TTL_SECONDS],
    ]);
  }

  async getDevices(sessionId: string): Promise<ConnectedDevice[]> {
    const id = normalizeSessionId(sessionId);
    const [flat] = await this.pipeline([["HGETALL", this.devicesKey(id)]]);
    const now = Date.now();
    const live: ConnectedDevice[] = [];
    const stale: string[] = [];
    const arr = Array.isArray(flat) ? (flat as string[]) : [];
    for (let i = 0; i + 1 < arr.length; i += 2) {
      try {
        const dev = JSON.parse(arr[i + 1]) as ConnectedDevice;
        if (now - dev.lastSeen > DEVICE_TTL_MS) stale.push(arr[i]);
        else live.push(dev);
      } catch {
        stale.push(arr[i]);
      }
    }
    if (stale.length) await this.pipeline([["HDEL", this.devicesKey(id), ...stale]]).catch(() => {});
    return live;
  }

  // Each field is written on its own: two captions landing together must not overwrite each other,
  // which reading, changing and saving the whole room would allow
  async applyEvent(payload: BroadcastPayload & { sessionName?: string }): Promise<RoomSyncState> {
    const id = normalizeSessionId(payload.session);
    const key = this.roomKey(id);
    const now = Date.now();
    const commands: RedisCommand[] = [["HSETNX", key, "createdAt", now]];
    if (payload.sessionName) commands.push(["HSET", key, "sessionName", payload.sessionName]);

    switch (payload.type) {
      case "CAPTION_UPDATE":
        commands.push(["HSET", key, "currentCaption", JSON.stringify(payload.caption)]);
        if (payload.caption.isFinal) {
          commands.push(
            ["RPUSH", this.historyKey(id), JSON.stringify(payload.caption)],
            ["LTRIM", this.historyKey(id), -MAX_ROOM_HISTORY, -1]
          );
        }
        break;
      case "CONFIG_UPDATE":
        commands.push(["HSET", key, "config", JSON.stringify(payload.config)]);
        break;
      case "CLEAR_SCREEN":
        commands.push(["HSET", key, "currentCaption", "null", "pinnedAnnouncement", "null"]);
        break;
      case "PIN_ANNOUNCEMENT":
        commands.push(["HSET", key, "pinnedAnnouncement", JSON.stringify(payload.text)]);
        break;
    }
    if (payload.type !== "HEARTBEAT") commands.push(...this.touch(id, now));

    await this.pipeline(commands);
    if (payload.device) await this.registerDevice(id, payload.device);
    return this.getRoom(id);
  }

  async clearRoomHistory(sessionId: string): Promise<RoomSyncState> {
    const id = normalizeSessionId(sessionId);
    await this.pipeline([
      ["DEL", this.historyKey(id)],
      ["HSET", this.roomKey(id), "currentCaption", "null"],
      ...this.touch(id, Date.now()),
    ]);
    return this.getRoom(id);
  }

  private touch(id: string, now: number): RedisCommand[] {
    return [
      ["SET", this.updatedKey(id), now, "EX", ROOM_TTL_SECONDS],
      ["EXPIRE", this.roomKey(id), ROOM_TTL_SECONDS],
      ["EXPIRE", this.historyKey(id), ROOM_TTL_SECONDS],
      ["SADD", this.roomsKey(), id],
    ];
  }

  async listSessions(): Promise<SessionInfo[]> {
    const [ids] = await this.pipeline([["SMEMBERS", this.roomsKey()]]);
    const list: SessionInfo[] = [];
    for (const id of Array.isArray(ids) ? (ids as string[]) : []) {
      const [room, devices] = await Promise.all([this.getRoom(id), this.getDevices(id)]);
      list.push({
        id,
        name: room.sessionName || id,
        createdAt: room.createdAt,
        lastUpdated: room.lastUpdated,
        hasCaption: !!room.currentCaption,
        captionCount: room.history.length,
        deviceCount: devices.length,
        activeSpeaker: room.currentCaption?.speakerName || room.config?.speakerLabel,
        latestCaptionText:
          room.currentCaption?.translatedText || room.history[room.history.length - 1]?.translatedText || "",
      });
    }
    return list;
  }

  async loginFailures(address: string) {
    const [count] = await this.pipeline([["GET", this.loginKey(address)]]);
    return Number(count) || 0;
  }

  async recordLoginFailure(address: string) {
    const key = this.loginKey(address);
    await this.pipeline([
      ["INCR", key],
      ["EXPIRE", key, LOGIN_WINDOW_MS / 1000, "NX"],
    ]);
  }

  async clearLoginFailures(address: string) {
    await this.pipeline([["DEL", this.loginKey(address)]]);
  }
}

export function redisConfigFromEnv(env: Record<string, string | undefined> = process.env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

let backend: RoomBackend | null = null;

export function getRoomBackend(): RoomBackend {
  if (backend) return backend;
  const redis = redisConfigFromEnv();
  backend = redis ? new RedisBackend(redis.url, redis.token) : new MemoryBackend(multiRoomHub);
  return backend;
}

/** For tests */
export function createRedisBackend(url: string, token: string, prefix?: string): RoomBackend {
  return new RedisBackend(url, token, prefix);
}
