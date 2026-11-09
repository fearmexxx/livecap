import { stripSecrets } from "./security.ts";
import type { CaptionConfig } from "./types";

/**
 * "Event settings" file: one JSON file holding every room's setup (speakers, glossary, event
 * context, display style). Prepare all halls on one laptop, save the file, then load the same
 * file on every room laptop. API keys and the laptop-specific microphone are never included.
 */
export const EVENT_FILE_KIND = "livecap-event-settings";

export interface EventSettingsFile {
  app: "livecap";
  kind: typeof EVENT_FILE_KIND;
  version: 1;
  savedAt: string;
  rooms: Record<string, Partial<CaptionConfig>>;
}

// Fields that belong to one physical laptop, not to the room
const DEVICE_SPECIFIC_KEYS = ["micDeviceId", "localGpuUrl"] as const;

export function sanitizeRoomConfig(config: Partial<CaptionConfig>): Partial<CaptionConfig> {
  const clean = stripSecrets({ ...config }) as Record<string, unknown>;
  for (const key of DEVICE_SPECIFIC_KEYS) delete clean[key];
  delete clean.pinnedAnnouncement;
  return clean as Partial<CaptionConfig>;
}

export function buildEventFile(rooms: Record<string, Partial<CaptionConfig>>, now = new Date()): EventSettingsFile {
  const clean: Record<string, Partial<CaptionConfig>> = {};
  for (const [id, config] of Object.entries(rooms)) {
    if (config && typeof config === "object") clean[id] = sanitizeRoomConfig(config);
  }
  return { app: "livecap", kind: EVENT_FILE_KIND, version: 1, savedAt: now.toISOString(), rooms: clean };
}

/** Parses a saved event file; throws an operator-readable error when it is not one. */
export function parseEventFile(text: string): Record<string, Partial<CaptionConfig>> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This file is not a LiveCap settings file (invalid JSON).");
  }
  const file = data as Partial<EventSettingsFile>;
  if (!file || file.kind !== EVENT_FILE_KIND || !file.rooms || typeof file.rooms !== "object") {
    throw new Error("This file is not a LiveCap event settings file.");
  }
  const rooms: Record<string, Partial<CaptionConfig>> = {};
  for (const [id, config] of Object.entries(file.rooms)) {
    const roomId = id.trim();
    if (roomId && config && typeof config === "object" && !Array.isArray(config)) {
      rooms[roomId] = sanitizeRoomConfig(config);
    }
  }
  if (Object.keys(rooms).length === 0) throw new Error("This settings file has no rooms in it.");
  return rooms;
}

/** "hall-3" → "Hall 3"; other room ids are shown as typed. */
export function roomDisplayName(id: string): string {
  const hall = /^hall-(\d+)$/i.exec(id.trim());
  return hall ? `Hall ${hall[1]}` : id;
}
