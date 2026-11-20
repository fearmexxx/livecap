import { BroadcastPayload, CaptionItem, ConnectedDevice } from "./types";
import { stripSecrets } from "./security";
import { authHeaders } from "./clientAuth";
import { applyHistoryUpdate } from "./feed";

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
  private stopPolling: (() => void) | null = null;
  /** Send time of the caption on this screen; older ones arriving late are ignored */
  private shownSentAt = 0;
  private lastSentAt = 0;
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
    // A caption that was sent before the one on screen (a slow network copy) must not replace it
    const sentAt =
      payload.type === "CAPTION_UPDATE" ? payload.caption?.sentAt : payload.type === "CLEAR_SCREEN" ? payload.sentAt : undefined;
    if (sentAt) {
      if (sentAt < this.shownSentAt) return;
      this.shownSentAt = sentAt;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _t, ...clean } = payload as BroadcastPayload & { _t?: number };
    this.listeners.forEach((cb) => cb(clean as BroadcastPayload));
  }

  // Broadcast an update (used by the Operator Console or Remote Mic Device)
  public broadcast(payload: BroadcastPayload & { sessionName?: string }) {
    this.clientDevice.lastSeen = Date.now();
    // API keys stay on the operator machine: never put them on any channel
    // Stamp captions with a send time that only goes up, so every screen and the server keep the latest
    const sentAt = (this.lastSentAt = Math.max(Date.now(), this.lastSentAt + 1));
    const safePayload =
      payload.type === "CONFIG_UPDATE"
        ? { ...payload, config: stripSecrets(payload.config) }
        : payload.type === "CAPTION_UPDATE"
          ? { ...payload, caption: { ...payload.caption, sentAt } }
          : payload.type === "CLEAR_SCREEN"
            ? { ...payload, sentAt }
            : payload;
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
    if (this.stopPolling) return;
    // Hosted (Vercel): every poll is a billed function call and a Redis read, so poll a little slower
    if (process.env.NEXT_PUBLIC_LIVECAP_HOSTED === "1") intervalMs = Math.max(intervalMs, 800);

    // Output pages opened from a hall's private link carry its read-only view key (&k=)
    const viewKey =
      typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("k") : null;
    let lastDevicePing = 0;
    let lastDevices: ConnectedDevice[] = [];
    let lastHistory: CaptionItem[] = [];
    // What this screen already has, so the server only sends what changed (see feed.ts)
    let historyTag = "";
    let configVersion = "";
    let inFlight = false;

    const pollOnce = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const qs = new URLSearchParams({ session: this.sessionId, h: historyTag });
        if (configVersion) qs.set("cv", configVersion);
        if (viewKey) qs.set("k", viewKey);
        if (this.lastPollTimestamp > 0) qs.set("since", String(this.lastPollTimestamp));
        // Report this device (and get the device list) every 10 s rather than on every poll
        const now = Date.now();
        if (now - lastDevicePing > 10_000) {
          lastDevicePing = now;
          qs.set("deviceId", this.clientDevice.deviceId);
          qs.set("role", this.clientDevice.role);
          qs.set("deviceName", this.clientDevice.deviceName);
          if (this.clientDevice.speakerName) qs.set("speakerName", this.clientDevice.speakerName);
        }

        const res = await fetch(`/api/caption/sync?${qs.toString()}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();

        if (Array.isArray(data.devices)) lastDevices = data.devices;
        const historyChanged = Array.isArray(data.history) || Array.isArray(data.historyAdd);
        if (historyChanged) lastHistory = applyHistoryUpdate(lastHistory, data);
        if (typeof data.historyTag === "string") historyTag = data.historyTag;
        if (typeof data.configVersion === "string") configVersion = data.configVersion;
        if (Array.isArray(data.devices) || historyChanged) {
          this.stateListeners.forEach((cb) =>
            cb({
              devices: lastDevices,
              history: lastHistory,
            })
          );
        }
        if (data.unchanged) return;

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
      } finally {
        inFlight = false;
      }
    };

    const stopTicker = startBackgroundTicker(intervalMs, pollOnce);
    const releaseKeepAlive = keepPageAwake(`livecap-output-${this.sessionId}-${this.clientDevice.deviceId}`);
    // Catch up at once when the window is shown, focused, unfrozen or back online
    const catchUp = () => {
      if (typeof document === "undefined" || document.visibilityState === "visible") void pollOnce();
    };
    const events: [EventTarget, string][] =
      typeof window === "undefined"
        ? []
        : [
            [document, "visibilitychange"],
            [document, "resume"],
            [window, "focus"],
            [window, "pageshow"],
            [window, "online"],
          ];
    events.forEach(([target, name]) => target.addEventListener(name, catchUp));
    void pollOnce();

    this.stopPolling = () => {
      stopTicker();
      releaseKeepAlive();
      events.forEach(([target, name]) => target.removeEventListener(name, catchUp));
    };
  }

  public stopRemotePolling() {
    if (this.stopPolling) {
      this.stopPolling();
      this.stopPolling = null;
    }
  }
}

/**
 * Calls `tick` every `intervalMs`, also while the window is in the background.
 *
 * Chrome slows timers in windows that are hidden or covered (down to once a minute after 5
 * minutes, more with Energy Saver), which froze LED and vMix windows that were not in front.
 * Timers inside a Web Worker are not slowed that way, so the worker keeps time and the page only
 * reacts to its messages. Falls back to a normal interval where workers are not available.
 */
export function startBackgroundTicker(intervalMs: number, tick: () => void): () => void {
  if (typeof window !== "undefined" && typeof Worker !== "undefined" && typeof Blob !== "undefined") {
    try {
      const source = "let t=null;onmessage=function(e){if(t)clearInterval(t);t=e.data>0?setInterval(function(){postMessage(0)},e.data):null};";
      const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
      const worker = new Worker(url);
      worker.onmessage = () => tick();
      worker.postMessage(intervalMs);
      return () => {
        worker.postMessage(0);
        worker.terminate();
        URL.revokeObjectURL(url);
      };
    } catch {
      // fall through to a plain interval
    }
  }
  const id = setInterval(tick, intervalMs);
  return () => clearInterval(id);
}

/**
 * Asks Chrome not to freeze this page while it is in the background. Chrome does not freeze
 * pages that hold a Web Lock, and frozen output windows were what stopped showing captions.
 */
export function keepPageAwake(lockName: string): () => void {
  let release: (() => void) | null = null;
  try {
    const locks = typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
    if (locks) {
      void locks
        .request(lockName, () => new Promise<void>((resolve) => (release = resolve)))
        .catch(() => {});
    }
  } catch {
    // not supported: polling still works, only slower when hidden
  }
  return () => release?.();
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
