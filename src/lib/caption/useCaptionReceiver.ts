"use client";

import { useEffect, useState } from "react";
import { CaptionConfig, CaptionItem, DEFAULT_CAPTION_CONFIG } from "./types";
import { captionSync } from "./sync";

export const CONFIG_STORAGE_KEY = "vbe_caption_config";

/**
 * Shared receiver used by every output window (vMix overlay, resizable window, LED stage).
 * Listens to the operator console via BroadcastChannel (same PC) and server polling (other PCs on LAN).
 */
export function useCaptionReceiver(
  transformConfig: (c: CaptionConfig) => CaptionConfig = (c) => c
) {
  const [config, setConfig] = useState<CaptionConfig>(() => transformConfig(DEFAULT_CAPTION_CONFIG));
  const [currentCaption, setCurrentCaption] = useState<CaptionItem | null>(null);
  const [history, setHistory] = useState<CaptionItem[]>([]);
  const [pinnedAnnouncement, setPinnedAnnouncement] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CONFIG_STORAGE_KEY);
      if (saved) setConfig(transformConfig({ ...DEFAULT_CAPTION_CONFIG, ...JSON.parse(saved) }));
    } catch {
      // ignore
    }

    const unsubscribe = captionSync.subscribe((payload) => {
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

    captionSync.startRemotePolling(300);
    return () => {
      unsubscribe();
      captionSync.stopRemotePolling();
    };
    // transformConfig is expected to be a stable/pure function
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { config, currentCaption, history, pinnedAnnouncement };
}
