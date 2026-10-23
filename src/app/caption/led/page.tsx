"use client";

import React, { useEffect, useState } from "react";
import CaptionDisplayView from "@/components/caption/CaptionDisplayView";
import { useCaptionReceiver } from "@/lib/caption/useCaptionReceiver";
import { CaptionConfig } from "@/lib/caption/types";
import { Maximize2, Minimize2 } from "lucide-react";

// LED walls / projectors can't show transparency – force a solid backdrop.
const ledTransform = (c: CaptionConfig): CaptionConfig => ({
  ...c,
  bgStyle: c.bgStyle === "transparent" || c.bgStyle === "frosted-glass" ? "black-box" : c.bgStyle,
  bgOpacity: 100,
});

export default function StageLedPage() {
  const { config, currentCaption, history, pinnedAnnouncement } = useCaptionReceiver(ledTransform);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
  };

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden select-none" onDoubleClick={toggleFullscreen}>
      <div className="absolute top-4 right-4 z-50 opacity-10 hover:opacity-100 transition-opacity">
        <button
          onClick={toggleFullscreen}
          className="p-2 rounded-lg bg-zinc-900/80 text-zinc-300 hover:text-white border border-white/10"
          title="Toggle fullscreen (or double-click anywhere)"
        >
          {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
      </div>

      <CaptionDisplayView
        config={config}
        currentCaption={currentCaption}
        history={history}
        pinnedAnnouncement={pinnedAnnouncement}
      />
    </div>
  );
}
