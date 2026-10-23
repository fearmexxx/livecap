"use client";

import React, { useEffect, useState } from "react";
import CaptionDisplayView from "@/components/caption/CaptionDisplayView";
import { useCaptionReceiver } from "@/lib/caption/useCaptionReceiver";
import { Maximize2, Minimize2, EyeOff } from "lucide-react";

const PRESETS = [
  { label: "1920×280 Lower-third", w: 1920, h: 280 },
  { label: "1280×200 Lower-third", w: 1280, h: 200 },
  { label: "1920×1080 FHD", w: 1920, h: 1080 },
  { label: "2560×600 LED banner", w: 2560, h: 600 },
];

/**
 * Free-floating, resizable caption window.
 * Open from the console (popup) -> drag edges to any size -> capture in vMix via "Desktop Capture / Window"
 * or drag it onto the projector/LED display and go fullscreen.
 */
export default function ResizableWindowPage() {
  const { config, currentCaption, history, pinnedAnnouncement } = useCaptionReceiver();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [cleanMode, setCleanMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const update = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCleanMode(false);
      if (e.key.toLowerCase() === "h") setCleanMode((v) => !v);
      if (e.key.toLowerCase() === "f") toggleFullscreen();
    };
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    update();
    window.addEventListener("resize", update);
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, []);

  function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    else document.exitFullscreen();
  }

  const resizeTo = (w: number, h: number) => {
    // Works when the window was opened as a popup from the console.
    const chromeW = window.outerWidth - window.innerWidth;
    const chromeH = window.outerHeight - window.innerHeight;
    window.resizeTo(w + chromeW, h + chromeH);
  };

  return (
    <div
      className="relative w-screen h-screen overflow-hidden select-none"
      style={{ background: config.bgStyle === "transparent" ? "#000" : undefined }}
    >
      {!cleanMode && (
        <div className="absolute top-2 left-2 right-2 z-50 flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-zinc-950/85 backdrop-blur-md border border-white/10 text-xs text-zinc-300 shadow-2xl">
          <div className="flex items-center gap-3">
            <span className="font-bold text-brand-gold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              VBE CAPTION OUTPUT
            </span>
            <span className="px-2 py-0.5 rounded bg-zinc-800 font-mono text-[11px]">
              {size.width} × {size.height}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => resizeTo(p.w, p.h)}
                className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 font-mono text-[11px]"
              >
                {p.label}
              </button>
            ))}
            <button onClick={toggleFullscreen} className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700" title="Fullscreen (F)">
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <button
              onClick={() => setCleanMode(true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-brand-gold/20 hover:bg-brand-gold/30 text-brand-gold border border-brand-gold/40"
              title="Hide toolbar (H). Press ESC to show again."
            >
              <EyeOff size={13} /> Hide toolbar
            </button>
          </div>
        </div>
      )}

      <CaptionDisplayView
        config={config}
        currentCaption={currentCaption}
        history={history}
        pinnedAnnouncement={pinnedAnnouncement}
      />
    </div>
  );
}
