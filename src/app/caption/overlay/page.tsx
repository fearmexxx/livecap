"use client";

import React, { useEffect } from "react";
import CaptionDisplayView from "@/components/caption/CaptionDisplayView";
import { useCaptionReceiver } from "@/lib/caption/useCaptionReceiver";

/**
 * vMix "Web Browser" input source.
 * Transparent background (alpha channel) – add as Browser input in vMix and set its size, e.g. 1920x1080.
 */
export default function VMixOverlayPage() {
  const { config, currentCaption, history, pinnedAnnouncement } = useCaptionReceiver();

  useEffect(() => {
    document.documentElement.classList.add("vmix-transparent");
    document.body.classList.add("vmix-transparent");
    return () => {
      document.documentElement.classList.remove("vmix-transparent");
      document.body.classList.remove("vmix-transparent");
    };
  }, []);

  return (
    <main className="fixed inset-0 w-screen h-screen overflow-hidden pointer-events-none select-none bg-transparent">
      <CaptionDisplayView
        config={config}
        currentCaption={currentCaption}
        history={history}
        pinnedAnnouncement={pinnedAnnouncement}
      />
    </main>
  );
}
