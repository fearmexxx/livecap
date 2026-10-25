import type { BroadcastPayload, CaptionConfig, CaptionItem, ConnectedDevice, SessionInfo } from "./types";

export interface RoomSyncState {
  id: string;
  sessionName: string;
  currentCaption: CaptionItem | null;
  history: CaptionItem[];
  config: CaptionConfig | null;
  pinnedAnnouncement: string | null;
  devices: Record<string, ConnectedDevice>;
  lastUpdated: number;
  createdAt: number;
}

const MAX_ROOM_HISTORY = 100;
const DEVICE_TTL_MS = 60_000; // 60 seconds device presence TTL

export class MultiRoomHub {
  private rooms = new Map<string, RoomSyncState>();

  public getRoom(sessionId: string): RoomSyncState {
    const id = (sessionId || "default").trim() || "default";
    if (!this.rooms.has(id)) {
      const now = Date.now();
      this.rooms.set(id, {
        id,
        sessionName: id === "default" ? "🏛️ Default (Main Hall)" : id,
        currentCaption: null,
        history: [],
        config: null,
        pinnedAnnouncement: null,
        devices: {},
        lastUpdated: now,
        createdAt: now,
      });
    }
    return this.rooms.get(id)!;
  }

  public pruneStaleDevices(room: RoomSyncState, now = Date.now()) {
    for (const [devId, dev] of Object.entries(room.devices)) {
      if (now - dev.lastSeen > DEVICE_TTL_MS) {
        delete room.devices[devId];
      }
    }
  }

  public registerDevice(sessionId: string, device?: ConnectedDevice) {
    if (!device || !device.deviceId) return;
    const room = this.getRoom(sessionId);
    const now = Date.now();
    room.devices[device.deviceId] = {
      ...device,
      lastSeen: now,
    };
    this.pruneStaleDevices(room, now);
  }

  public applyEvent(
    payload: BroadcastPayload & { sessionName?: string }
  ): RoomSyncState {
    const sessionId = (payload.session || "default").trim() || "default";
    const room = this.getRoom(sessionId);
    const now = Date.now();

    if (payload.sessionName) {
      room.sessionName = payload.sessionName;
    }

    if (payload.device) {
      this.registerDevice(sessionId, payload.device);
    }

    switch (payload.type) {
      case "CAPTION_UPDATE": {
        room.currentCaption = payload.caption;
        if (payload.caption.isFinal) {
          const existingIdx = room.history.findIndex((h) => h.id === payload.caption.id);
          if (existingIdx >= 0) {
            room.history[existingIdx] = payload.caption;
          } else {
            room.history.push(payload.caption);
            // Keep chronological order across multi-device submissions
            room.history.sort((a, b) => a.timestamp - b.timestamp);
            if (room.history.length > MAX_ROOM_HISTORY) {
              room.history = room.history.slice(-MAX_ROOM_HISTORY);
            }
          }
        }
        room.lastUpdated = now;
        break;
      }
      case "CONFIG_UPDATE": {
        room.config = payload.config;
        room.lastUpdated = now;
        break;
      }
      case "CLEAR_SCREEN": {
        room.currentCaption = null;
        room.pinnedAnnouncement = null;
        room.lastUpdated = now;
        break;
      }
      case "PIN_ANNOUNCEMENT": {
        room.pinnedAnnouncement = payload.text;
        room.lastUpdated = now;
        break;
      }
      case "HEARTBEAT": {
        // Heartbeat updates device presence without mutating caption lastUpdated unless needed
        break;
      }
    }

    this.pruneStaleDevices(room, now);
    return room;
  }

  public clearRoomHistory(sessionId: string): RoomSyncState {
    const room = this.getRoom(sessionId);
    room.history = [];
    room.currentCaption = null;
    room.lastUpdated = Date.now();
    return room;
  }

  public listSessions(): SessionInfo[] {
    this.getRoom("default");
    const now = Date.now();
    const list: SessionInfo[] = [];

    for (const [id, room] of this.rooms.entries()) {
      this.pruneStaleDevices(room, now);
      const activeDevices = Object.values(room.devices);
      const latestSpeaker =
        room.currentCaption?.speakerName ||
        room.config?.speakerLabel ||
        activeDevices.find((d) => d.speakerName)?.speakerName;

      list.push({
        id,
        name: room.sessionName || id,
        createdAt: room.createdAt,
        lastUpdated: room.lastUpdated,
        hasCaption: !!room.currentCaption,
        captionCount: room.history.length,
        deviceCount: activeDevices.length,
        activeSpeaker: latestSpeaker,
        latestCaptionText:
          room.currentCaption?.translatedText ||
          room.history[room.history.length - 1]?.translatedText ||
          "",
      });
    }

    return list;
  }

  public resetAll() {
    this.rooms.clear();
  }
}

// Global singleton hub across Next.js route invocations
const globalForHub = globalThis as unknown as { __liveCapMultiRoomHub?: MultiRoomHub };
export const multiRoomHub =
  globalForHub.__liveCapMultiRoomHub || (globalForHub.__liveCapMultiRoomHub = new MultiRoomHub());
