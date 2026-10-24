import { BroadcastPayload, CaptionConfig, CaptionItem } from "./types";

export class CaptionSyncService {
  private sessionId: string;
  private channel: BroadcastChannel | null = null;
  private listeners: Set<(payload: BroadcastPayload) => void> = new Set();
  private isServerSyncEnabled: boolean = true;
  private pollIntervalId: any = null;
  private lastPollTimestamp: number = 0;

  constructor(sessionId: string = "default") {
    this.sessionId = sessionId || "default";

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
          (event.key === storageKey || (this.sessionId === "default" && event.key === "vbe_caption_last_event")) &&
          event.newValue
        ) {
          try {
            const data = JSON.parse(event.newValue);
            this.notify(data);
          } catch (e) {
            // ignore
          }
        }
      });
    }
  }

  public getSessionId(): string {
    return this.sessionId;
  }

  // Subscribe to incoming updates (used by Overlay & LED displays)
  public subscribe(callback: (payload: BroadcastPayload) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notify(payload: BroadcastPayload) {
    // Strip transport metadata. Handlers are idempotent (history de-dupes by caption id)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _t, ...clean } = payload as BroadcastPayload & { _t?: number };
    this.listeners.forEach((cb) => cb(clean as BroadcastPayload));
  }

  // Broadcast an update (used by the Operator Console)
  public broadcast(payload: BroadcastPayload) {
    const payloadWithSession = { ...payload, session: this.sessionId };

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
      } catch (err) {
        // quota or privacy mode
      }
    }

    // 3. Optional Server Sync for multi-computer setups (vMix PC + Operator Laptop on LAN)
    if (this.isServerSyncEnabled && typeof window !== "undefined") {
      fetch("/api/caption/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadWithSession),
      }).catch(() => {
        // network sync silent failover
      });
    }
  }

  // Enable periodic network polling for remote vMix PC that isn't running on the same machine
  public startRemotePolling(intervalMs = 400) {
    if (this.pollIntervalId) return;

    this.pollIntervalId = setInterval(async () => {
      try {
        const res = await fetch(`/api/caption/sync?session=${encodeURIComponent(this.sessionId)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.lastUpdated && data.lastUpdated > this.lastPollTimestamp) {
          this.lastPollTimestamp = data.lastUpdated;
          if (data.currentCaption) {
            this.notify({ type: "CAPTION_UPDATE", caption: data.currentCaption, session: this.sessionId });
          } else {
            this.notify({ type: "CLEAR_SCREEN", session: this.sessionId });
          }
          if (data.config) {
            this.notify({ type: "CONFIG_UPDATE", config: data.config, session: this.sessionId });
          }
          if (data.pinnedAnnouncement !== undefined) {
            this.notify({ type: "PIN_ANNOUNCEMENT", text: data.pinnedAnnouncement, session: this.sessionId });
          }
        }
      } catch (err) {
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
