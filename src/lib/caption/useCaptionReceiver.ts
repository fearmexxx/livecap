"use client";

import { useEffect, useState } from "react";
import { CaptionConfig, CaptionItem, DEFAULT_CAPTION_CONFIG } from "./types";
import { getCaptionSync } from "./sync";

export const CONFIG_STORAGE_KEY = "vbe_caption_config";

/**
 * Shared receiver used by every output window (vMix overlay, resizable window, LED stage).
 * Supports multi-session isolation:
 * - Reads `?session=hall-a` from URL query parameter.
 * - Listens only to that session via BroadcastChannel and server sync on LAN.
 */
export function useCaptionReceiver(
  transformConfig: (c: CaptionConfig) => CaptionConfig = (c) => c,
  explicitSessionId?: string
) {
  const [config, setConfig] = useState<CaptionConfig>(() => transformConfig(DEFAULT_CAPTION_CONFIG));
  const [currentCaption, setCurrentCaption] = useState<CaptionItem | null>(null);
  const [history, setHistory] = useState<CaptionItem[]>([]);
  const [pinnedAnnouncement, setPinnedAnnouncement] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string>(explicitSessionId || "default");

  useEffect(() => {
    // Resolve sessionId from URL query if not explicitly passed
    let activeSession = explicitSessionId || "default";
    if (!explicitSessionId && typeof window !== "undefined") {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const qSession = urlParams.get("session")?.trim();
        if (qSession) {
          activeSession = qSession;
        }
      } catch {}
    }
    setSessionId(activeSession);

    // Load saved configuration for this session (or fallback to default)
    try {
      const sessionConfigKey = `${CONFIG_STORAGE_KEY}_${activeSession}`;
      const saved = localStorage.getItem(sessionConfigKey) || localStorage.getItem(CONFIG_STORAGE_KEY);
      if (saved) {
        setConfig(transformConfig({ ...DEFAULT_CAPTION_CONFIG, ...JSON.parse(saved) }));
      }
    } catch {
      // ignore
    }

    const syncService = getCaptionSync(activeSession);

    const unsubscribe = syncService.subscribe((payload) => {
      switch (payload.type) {
        case "CAPTION_UPDATE":
          setCurrentCaption(payload.caption);
          if (payload.caption.isFinal) {
            setHistory((prev) =>
              prev.some((h) => h.id === payload.caption.id) ? prev : [...prev.slice(-29), payload.caption]
            );
          }
          break;
        case "CONFIG_UPDATE":
          setConfig(transformConfig({ ...DEFAULT_CAPTION_CONFIG, ...payload.config }));
          break;
        case "CLEAR_SCREEN":
          setCurrentCaption(null);
          setPinnedAnnouncement(null);
          setHistory([]);
          break;
        case "PIN_ANNOUNCEMENT":
          setPinnedAnnouncement(payload.text);
          break;
      }
    });

    syncService.startRemotePolling(300);
    return () => {
      unsubscribe();
      syncService.stopRemotePolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [explicitSessionId]);

  return { config, currentCaption, history, pinnedAnnouncement, sessionId };
}
