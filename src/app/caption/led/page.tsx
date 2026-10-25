"use client";

import React, { useEffect, useState } from "react";
import CaptionDisplayView from "@/components/caption/CaptionDisplayView";
import { useCaptionReceiver } from "@/lib/caption/useCaptionReceiver";
import { CaptionConfig, DisplayMode } from "@/lib/caption/types";
import { Maximize2, Minimize2, ZoomIn, ZoomOut, Layers, Radio } from "lucide-react";

// LED walls / projectors can't show transparency – force a solid backdrop.
const ledTransform = (c: CaptionConfig): CaptionConfig => ({
  ...c,
  bgStyle: c.bgStyle === "transparent" || c.bgStyle === "frosted-glass" ? "black-box" : c.bgStyle,
  bgOpacity: 100,
});

export default function StageLedPage() {
  const { config, currentCaption, history, pinnedAnnouncement, sessionId, devices } =
    useCaptionReceiver(ledTransform, undefined, "led");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [localFontDelta, setLocalFontDelta] = useState(0);
  const [localModeOverride, setLocalModeOverride] = useState<DisplayMode | null>(null);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
  };

  const effectiveConfig: CaptionConfig = {
    ...config,
    fontSize: Math.max(20, Math.min(140, (config.fontSize || 42) + localFontDelta)),
    displayMode: localModeOverride || config.displayMode,
  };

  return (
    <div
      className="relative w-screen h-screen bg-black overflow-hidden select-none group"
      onDoubleClick={toggleFullscreen}
    >
      {/* Auto-hiding LED Stage Calibration HUD (Invisible unless hovered) */}
      <div className="absolute top-4 right-4 z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center gap-2 bg-zinc-950/90 border border-white/15 px-3 py-1.5 rounded-xl shadow-2xl">
        <div className="flex items-center gap-1.5 pr-2 border-r border-white/10 text-xs text-zinc-300 font-mono">
          <Radio size={13} className="text-emerald-400 animate-pulse" />
          <span className="font-bold text-brand-gold uppercase">{sessionId}</span>
          <span className="text-[10px] text-zinc-500">({devices.length || 1} dev)</span>
        </div>

        <button
          onClick={() =>
            setLocalModeOverride((prev) => {
              const cur = prev || config.displayMode;
              if (cur === "bilingual") return "rolling-ledger";
              if (cur === "rolling-ledger") return "vietnamese-only";
              return "bilingual";
            })
          }
          className="px-2 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-xs text-zinc-200 border border-white/10 flex items-center gap-1"
          title="Chuyển chế độ hiển thị LED (Song ngữ / Cuộn nhiều dòng / Chỉ Tiếng Việt)"
        >
          <Layers size={13} className="text-brand-gold" />
          <span>{effectiveConfig.displayMode}</span>
        </button>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setLocalFontDelta((d) => d - 4)}
            className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-white/10"
            title="Giảm cỡ chữ trên màn LED"
          >
            <ZoomOut size={15} />
          </button>
          <span className="text-[11px] font-mono text-zinc-400 px-1">
            {effectiveConfig.fontSize}px
          </span>
          <button
            onClick={() => setLocalFontDelta((d) => d + 4)}
            className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-white/10"
            title="Tăng cỡ chữ trên màn LED"
          >
            <ZoomIn size={15} />
          </button>
        </div>

        <button
          onClick={toggleFullscreen}
          className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-white/10"
          title="Toàn màn hình LED (F11 hoặc nhấp đúp chuột)"
        >
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>

      <CaptionDisplayView
        config={effectiveConfig}
        currentCaption={currentCaption}
        history={history}
        pinnedAnnouncement={pinnedAnnouncement}
      />
    </div>
  );
}
