import { BroadcastPayload, CaptionItem, ConnectedDevice } from "./types";
import { stripSecrets } from "./security";
import { authHeaders } from "./clientAuth";

function getOrCreateClientDeviceId(): string {
  if (typeof window === "undefined") return "server_node";
  try {
    const existing = sessionStorage.getItem("vbe_livecap_device_id");
    if (existing) return existing;
    const created = "dev_" + Math.random().toString(36).substring(2, 8);
    sessionStorage.setItem("vbe_livecap_device_id", created);
    return created;
  } catch {
    return "dev_" + Math.random().toString(36).substring(2, 8);
  }
}

export class CaptionSyncService {
  private sessionId: string;
  private channel: BroadcastChannel | null = null;
  private listeners: Set<(payload: BroadcastPayload) => void> = new Set();
  private stateListeners: Set<(roomState: {
    devices: ConnectedDevice[];
    history: CaptionItem[];
  }) => void> = new Set();
  private isServerSyncEnabled: boolean = true;
  private pollIntervalId: any = null;
  private lastPollTimestamp: number = 0;
  private clientDevice: ConnectedDevice;
  private syncErrorListeners: Set<(message: string | null) => void> = new Set();

  constructor(sessionId: string = "default") {
    this.sessionId = sessionId || "default";
    const devId = getOrCreateClientDeviceId();
    this.clientDevice = {
      deviceId: devId,
      deviceName: `Node ${devId.slice(-4)}`,
      role: "viewer",
      lastSeen: Date.now(),
    };

    if (typeof window !== "undefined") {
      const channelName = `vbe_live_caption_bus_${this.sessionId}`;
      const storageKey = `vbe_caption_event_${this.sessionId}`;

      try {
        if ("BroadcastChannel" in window) {
          this.channel = new BroadcastChannel(channelName);
          this.channel.onmessage = (event) => {
            if (event.data) {
              this.notify(event.data);
            }
          };
        }
      } catch (err) {
        console.warn("BroadcastChannel not supported or restricted:", err);
      }

      // Storage event listener as fallback for separate tabs / windows
      window.addEventListener("storage", (event) => {
        if (
          (event.key === storageKey ||
            (this.sessionId === "default" && event.key === "vbe_caption_last_event")) &&
          event.newValue
        ) {
          try {
            const data = JSON.parse(event.newValue);
            this.notify(data);
          } catch {
            // ignore
          }
        }
      });
    }
  }

  public getSessionId(): string {
    return this.sessionId;
  }

  public setDeviceMeta(meta: Partial<Omit<ConnectedDevice, "deviceId" | "lastSeen">>) {
    this.clientDevice = {
      ...this.clientDevice,
      ...meta,
      lastSeen: Date.now(),
    };
  }

  public getDeviceId(): string {
    return this.clientDevice.deviceId;
  }

  // Subscribe to incoming updates (used by Overlay, LED displays, and multi-device consoles)
  public subscribe(callback: (payload: BroadcastPayload) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  // Subscribe to room-level device roster & full history updates
  public subscribeRoomState(
    callback: (state: { devices: ConnectedDevice[]; history: CaptionItem[] }) => void
  ): () => void {
    this.stateListeners.add(callback);
    return () => {
      this.stateListeners.delete(callback);
    };
  }

  // Subscribe to server sync failures (e.g. missing room PIN); null means sync recovered
  public subscribeSyncErrors(callback: (message: string | null) => void): () => void {
    this.syncErrorListeners.add(callback);
    return () => {
      this.syncErrorListeners.delete(callback);
    };
  }

  private notify(payload: BroadcastPayload) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _t, ...clean } = payload as BroadcastPayload & { _t?: number };
    this.listeners.forEach((cb) => cb(clean as BroadcastPayload));
  }

  // Broadcast an update (used by the Operator Console or Remote Mic Device)
  public broadcast(payload: BroadcastPayload & { sessionName?: string }) {
    this.clientDevice.lastSeen = Date.now();
    // API keys stay on the operator machine: never put them on any channel
    const safePayload =
      payload.type === "CONFIG_UPDATE" ? { ...payload, config: stripSecrets(payload.config) } : payload;
    const payloadWithSession = {
      ...safePayload,
      session: this.sessionId,
      device: payload.device || this.clientDevice,
    };

    // 1. BroadcastChannel (instant zero-latency IPC on same machine)
    if (this.channel) {
      try {
        this.channel.postMessage(payloadWithSession);
      } catch (err) {
        console.error("BroadcastChannel postMessage error:", err);
      }
    }

    // 2. localStorage event
    if (typeof window !== "undefined") {
      try {
        const storageKey = `vbe_caption_event_${this.sessionId}`;
        localStorage.setItem(
          storageKey,
          JSON.stringify({ ...payloadWithSession, _t: Date.now() })
        );
        if (this.sessionId === "default") {
          localStorage.setItem(
            "vbe_caption_last_event",
            JSON.stringify({ ...payloadWithSession, _t: Date.now() })
          );
        }
      } catch {
        // quota or privacy mode
      }
    }

    // 3. Server Sync for multi-computer / multi-device setups on LAN
    if (this.isServerSyncEnabled && typeof window !== "undefined") {
      fetch("/api/caption/sync", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payloadWithSession),
      })
        .then(async (res) => {
          if (res.ok) {
            this.syncErrorListeners.forEach((cb) => cb(null));
            return;
          }
          const data = await res.json().catch(() => ({}));
          const message = data?.error || `Sync failed (${res.status})`;
          this.syncErrorListeners.forEach((cb) => cb(message));
        })
        .catch(() => {
          // network sync silent failover
        });
    }
  }

  // Enable periodic network polling for LED Wall, vMix PC, or multi-device operator nodes
  public startRemotePolling(intervalMs = 400) {
    if (this.pollIntervalId) return;

    this.pollIntervalId = setInterval(async () => {
      try {
        const qs = new URLSearchParams({
          session: this.sessionId,
          deviceId: this.clientDevice.deviceId,
          role: this.clientDevice.role,
          deviceName: this.clientDevice.deviceName,
        });
        if (this.clientDevice.speakerName) {
          qs.set("speakerName", this.clientDevice.speakerName);
        }

        const res = await fetch(`/api/caption/sync?${qs.toString()}`);
        if (!res.ok) return;
        const data = await res.json();

        if (Array.isArray(data.devices) || Array.isArray(data.history)) {
          this.stateListeners.forEach((cb) =>
            cb({
              devices: data.devices || [],
              history: data.history || [],
            })
          );
        }

        if (data.lastUpdated && data.lastUpdated > this.lastPollTimestamp) {
          this.lastPollTimestamp = data.lastUpdated;
          if (data.currentCaption) {
            this.notify({
              type: "CAPTION_UPDATE",
              caption: data.currentCaption,
              session: this.sessionId,
            });
          } else {
            this.notify({ type: "CLEAR_SCREEN", session: this.sessionId });
          }
          if (data.config) {
            this.notify({
              type: "CONFIG_UPDATE",
              config: data.config,
              session: this.sessionId,
            });
          }
          if (data.pinnedAnnouncement !== undefined) {
            this.notify({
              type: "PIN_ANNOUNCEMENT",
              text: data.pinnedAnnouncement,
              session: this.sessionId,
            });
          }
        }
      } catch {
        // network glitch
      }
    }, intervalMs);
  }

  public stopRemotePolling() {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
  }
}

// Registry of sync service instances per session ID
const syncInstances = new Map<string, CaptionSyncService>();

export function getCaptionSync(sessionId: string = "default"): CaptionSyncService {
  const key = sessionId || "default";
  if (!syncInstances.has(key)) {
    syncInstances.set(key, new CaptionSyncService(key));
  }
  return syncInstances.get(key)!;
}

// Default singleton instance (for single-session / legacy compatibility)
export const captionSync = getCaptionSync("default");
