import { MultiRoomHub, multiRoomHub, type RoomSyncState } from "./roomStore.ts";
import type { BroadcastPayload, ConnectedDevice, SessionInfo } from "./types.ts";

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
}

const DEVICE_TTL_MS = 60_000;
const ROOM_TTL_SECONDS = 60 * 60 * 24 * 7; // rooms expire a week after their last update

export function normalizeSessionId(sessionId: string | null | undefined): string {
  return (sessionId || "default").trim() || "default";
}

class MemoryBackend implements RoomBackend {
  readonly kind = "memory" as const;
  private hub: MultiRoomHub;
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
}

type RedisCommand = (string | number)[];

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
  private devicesKey(id: string) {
    return `${this.prefix}:devices:${id}`;
  }
  private updatedKey(id: string) {
    return `${this.prefix}:updated:${id}`;
  }
  private roomsKey() {
    return `${this.prefix}:rooms`;
  }

  /** Fresh room using the same defaults as the in-memory hub */
  private emptyRoom(id: string): RoomSyncState {
    const scratch = new MultiRoomHub();
    return scratch.getRoom(id);
  }

  async getRoom(sessionId: string): Promise<RoomSyncState> {
    const id = normalizeSessionId(sessionId);
    const [raw] = await this.pipeline([["GET", this.roomKey(id)]]);
    const room = typeof raw === "string" ? (JSON.parse(raw) as RoomSyncState) : this.emptyRoom(id);
    room.devices = {};
    return room;
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

  async applyEvent(payload: BroadcastPayload & { sessionName?: string }): Promise<RoomSyncState> {
    const id = normalizeSessionId(payload.session);
    // Reuse the in-memory reducer so both backends behave the same
    const hub = new MultiRoomHub();
    const current = await this.getRoom(id);
    Object.assign(hub.getRoom(id), current);
    const { device, ...rest } = payload;
    const room = hub.applyEvent(rest as BroadcastPayload & { sessionName?: string });
    await this.save(room);
    if (device) await this.registerDevice(id, device);
    return room;
  }

  async clearRoomHistory(sessionId: string): Promise<RoomSyncState> {
    const room = await this.getRoom(sessionId);
    room.history = [];
    room.currentCaption = null;
    room.lastUpdated = Date.now();
    await this.save(room);
    return room;
  }

  private async save(room: RoomSyncState) {
    const { devices: _devices, ...persisted } = room;
    void _devices;
    await this.pipeline([
      ["SET", this.roomKey(room.id), JSON.stringify(persisted), "EX", ROOM_TTL_SECONDS],
      ["SET", this.updatedKey(room.id), room.lastUpdated, "EX", ROOM_TTL_SECONDS],
      ["SADD", this.roomsKey(), room.id],
    ]);
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
