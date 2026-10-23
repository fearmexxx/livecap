import { BroadcastPayload, CaptionConfig, CaptionItem } from "./types";

const CHANNEL_NAME = "vbe_live_caption_bus";
const STORAGE_KEY = "vbe_caption_last_event";

class CaptionSyncService {
  private channel: BroadcastChannel | null = null;
  private listeners: Set<(payload: BroadcastPayload) => void> = new Set();
  private isServerSyncEnabled: boolean = true;
  private pollIntervalId: any = null;
  private lastPollTimestamp: number = 0;

  constructor() {
    if (typeof window !== "undefined") {
      try {
        if ("BroadcastChannel" in window) {
          this.channel = new BroadcastChannel(CHANNEL_NAME);
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
        if (event.key === STORAGE_KEY && event.newValue) {
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

  // Subscribe to incoming updates (used by Overlay & LED displays)
  public subscribe(callback: (payload: BroadcastPayload) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notify(payload: BroadcastPayload) {
    // Strip transport metadata. Handlers are idempotent (history de-dupes by caption id),
    // so receiving the same event via BroadcastChannel + server polling is harmless.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _t, ...clean } = payload as BroadcastPayload & { _t?: number };
    this.listeners.forEach((cb) => cb(clean as BroadcastPayload));
  }

  // Broadcast an update (used by the Operator Console)
  public broadcast(payload: BroadcastPayload) {
    // 1. BroadcastChannel (instant zero-latency IPC on same machine)
    if (this.channel) {
      try {
        this.channel.postMessage(payload);
      } catch (err) {
        console.error("BroadcastChannel postMessage error:", err);
      }
    }

    // 2. localStorage event
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ ...payload, _t: Date.now() })
        );
      } catch (err) {
        // quota or privacy mode
      }
    }

    // 3. Optional Server Sync for multi-computer setups (vMix PC + Operator Laptop)
    if (this.isServerSyncEnabled && typeof window !== "undefined") {
      fetch("/api/caption/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
        const res = await fetch("/api/caption/sync");
        if (!res.ok) return;
        const data = await res.json();
        if (data.lastUpdated && data.lastUpdated > this.lastPollTimestamp) {
          this.lastPollTimestamp = data.lastUpdated;
          if (data.currentCaption) {
            this.notify({ type: "CAPTION_UPDATE", caption: data.currentCaption });
          } else {
            this.notify({ type: "CLEAR_SCREEN" });
          }
          if (data.config) {
            this.notify({ type: "CONFIG_UPDATE", config: data.config });
          }
          if (data.pinnedAnnouncement !== undefined) {
            this.notify({ type: "PIN_ANNOUNCEMENT", text: data.pinnedAnnouncement });
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

// Singleton instance
export const captionSync = new CaptionSyncService();
