"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  CaptionConfig,
  CaptionItem,
  DEFAULT_CAPTION_CONFIG,
  SourceLanguage,
} from "@/lib/caption/types";
import { captionSync } from "@/lib/caption/sync";
import { LiveSpeechEngine } from "@/lib/caption/speechEngine";
import CaptionDisplayView from "@/components/caption/CaptionDisplayView";
import ConsoleSettings from "@/components/caption/ConsoleSettings";
import { CONFIG_STORAGE_KEY } from "@/lib/caption/useCaptionReceiver";
import {
  Mic,
  MicOff,
  Copy,
  ExternalLink,
  Trash2,
  Volume2,
  Radio,
  Sliders,
  Send,
  Sparkles,
  Layers,
  Monitor,
  Tv,
  Check,
  AlertCircle,
  HelpCircle,
  X,
} from "lucide-react";

const DEMO_SENTENCES = [
  {
    lang: "ko-KR" as SourceLanguage,
    text: "오늘 글로벌 컨퍼런스에 참석해 주신 모든 귀빈 여러분을 진심으로 환영합니다.",
    label: "🇰🇷 [KR] Chào mừng hội nghị",
  },
  {
    lang: "ko-KR" as SourceLanguage,
    text: "다음으로 2026년 인공지능 기술의 미래와 산업 혁신에 대한 발표가 있겠습니다.",
    label: "🇰🇷 [KR] Kế hoạch AI & đổi mới",
  },
  {
    lang: "ko-KR" as SourceLanguage,
    text: "질의응답 시간은 발표가 끝난 직후 진행될 예정이오니 참고 부탁드립니다.",
    label: "🇰🇷 [KR] Phiên hỏi đáp Q&A",
  },
  {
    lang: "en-US" as SourceLanguage,
    text: "Good morning distinguished guests, welcome to the Vietnam Global Business Summit 2026.",
    label: "🇺🇸 [EN] Welcome speech",
  },
  {
    lang: "en-US" as SourceLanguage,
    text: "We are entering a transformative era where AI and human creativity join together.",
    label: "🇺🇸 [EN] Kỷ nguyên AI & sáng tạo",
  },
  {
    lang: "en-US" as SourceLanguage,
    text: "Thank you all for your attention. We will now take questions from the floor.",
    label: "🇺🇸 [EN] Cảm ơn & mở Q&A",
  },
];

export default function CaptionConsolePage() {
  const [config, setConfig] = useState<CaptionConfig>(DEFAULT_CAPTION_CONFIG);
  const [isListening, setIsListening] = useState(false);
  const [engineStatus, setEngineStatus] = useState<"idle" | "listening" | "reconnecting" | "paused">("idle");
  const [audioLevel, setAudioLevel] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [currentCaption, setCurrentCaption] = useState<CaptionItem | null>(null);
  const [history, setHistory] = useState<CaptionItem[]>([]);
  const [pinnedAnnouncement, setPinnedAnnouncement] = useState<string | null>(null);
  const [announcementInput, setAnnouncementInput] = useState("");

  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState("default");

  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [previewAspect, setPreviewAspect] = useState<"16:9" | "lower-third" | "led-banner">("lower-third");
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

  const speechEngineRef = useRef<LiveSpeechEngine | null>(null);
  const overlayUrlRef = useRef("");

  // Load config from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CONFIG_STORAGE_KEY);
      if (saved) {
        setConfig((prev) => ({ ...prev, ...JSON.parse(saved) }));
      }
    } catch {
      // ignore
    }

    if (typeof window !== "undefined") {
      overlayUrlRef.current = `${window.location.origin}/caption/overlay`;
    }

    // List available microphones
    if (navigator?.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices
        .enumerateDevices()
        .then((devices) => {
          const audioInputs = devices.filter((d) => d.kind === "audioinput");
          setAudioDevices(audioInputs);
        })
        .catch(() => {});
    }
  }, []);

  // Update speech engine glossary when config changes
  useEffect(() => {
    if (speechEngineRef.current) {
      speechEngineRef.current.setGlossary(config.customGlossary);
    }
  }, [config.customGlossary]);

  // Broadcast configuration updates whenever config changes
  const handleConfigChange = (patch: Partial<CaptionConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      captionSync.broadcast({ type: "CONFIG_UPDATE", config: next });
      return next;
    });

    if (patch.sourceLanguage && speechEngineRef.current) {
      speechEngineRef.current.setLanguage(patch.sourceLanguage);
    }
  };

  // Start / Stop speech recognition
  const toggleListening = () => {
    if (isListening) {
      speechEngineRef.current?.stop();
      setIsListening(false);
      setEngineStatus("idle");
      setAudioLevel(0);
    } else {
      setErrorMessage(null);
      const engine = new LiveSpeechEngine({
        onInterimCaption: (item) => {
          setCurrentCaption(item);
          captionSync.broadcast({ type: "CAPTION_UPDATE", caption: item });
        },
        onFinalCaption: (item) => {
          setCurrentCaption(item);
          setHistory((prev) => [...prev.slice(-29), item]);
          captionSync.broadcast({ type: "CAPTION_UPDATE", caption: item });
        },
        onAudioLevel: (lvl) => setAudioLevel(lvl),
        onError: (err) => {
          setErrorMessage(err);
          setIsListening(false);
          setEngineStatus("idle");
        },
        onStatusChange: (st) => setEngineStatus(st),
      });

      engine.setGlossary(config.customGlossary);
      engine.start(config.sourceLanguage, selectedDevice);
      speechEngineRef.current = engine;
      setIsListening(true);
    }
  };

  // Switch language instantly
  const setLanguage = (lang: SourceLanguage) => {
    handleConfigChange({ sourceLanguage: lang });
    if (speechEngineRef.current && isListening) {
      speechEngineRef.current.setLanguage(lang);
    }
  };

  // Clear / Panic button
  const handleClearScreen = () => {
    setCurrentCaption(null);
    setPinnedAnnouncement(null);
    setAnnouncementInput("");
    captionSync.broadcast({ type: "CLEAR_SCREEN" });
  };

  // Pin Announcement
  const handlePinAnnouncement = () => {
    if (!announcementInput.trim()) return;
    const text = announcementInput.trim();
    setPinnedAnnouncement(text);
    captionSync.broadcast({ type: "PIN_ANNOUNCEMENT", text });
  };

  const handleUnpinAnnouncement = () => {
    setPinnedAnnouncement(null);
    setAnnouncementInput("");
    captionSync.broadcast({ type: "PIN_ANNOUNCEMENT", text: null });
  };

  // Copy URL to clipboard
  const copyToClipboard = (url: string, label: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedUrl(label);
      setTimeout(() => setCopiedUrl(null), 2500);
    });
  };

  // Open Pop-out Window
  const openResizableWindow = () => {
    const url = `/caption/window`;
    const w = 1280;
    const h = 320;
    const left = (window.screen.width - w) / 2;
    const top = (window.screen.height - h) / 2;
    window.open(
      url,
      "VBE_Caption_Window",
      `width=${w},height=${h},top=${top},left=${left},resizable=yes,status=no,toolbar=no,menubar=no,location=no`
    );
  };

  // Open LED Stage Output
  const openLedOutput = () => {
    window.open(`/caption/led`, "VBE_LED_Output", "width=1920,height=1080");
  };

  // Run a demo sentence
  const handlePlayDemo = async (demo: (typeof DEMO_SENTENCES)[0]) => {
    if (demo.lang !== config.sourceLanguage) {
      handleConfigChange({ sourceLanguage: demo.lang });
    }

    try {
      const res = await fetch("/api/caption/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: demo.text,
          sourceLang: demo.lang.startsWith("ko") ? "ko" : "en",
          targetLang: "vi",
          glossary: config.customGlossary,
        }),
      });

      const data = await res.json();
      const finalItem: CaptionItem = {
        id: "demo_" + Date.now(),
        timestamp: Date.now(),
        sourceLang: demo.lang.startsWith("ko") ? "ko" : "en",
        sourceText: demo.text,
        translatedText: data.translatedText || demo.text,
        isFinal: true,
      };

      setCurrentCaption(finalItem);
      setHistory((prev) => [...prev.slice(-29), finalItem]);
      captionSync.broadcast({ type: "CAPTION_UPDATE", caption: finalItem });
    } catch (e) {
      console.error("Demo translation error:", e);
    }
  };

  return (
    <div className="min-h-screen bg-[#070709] text-zinc-100 font-display flex flex-col">
      {/* Top Navigation & Status Bar */}
      <header className="border-b border-white/10 bg-zinc-950/80 backdrop-blur-md px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-40">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-brand-gold/15 border border-brand-gold/40 flex items-center justify-center font-bold text-brand-gold text-sm group-hover:bg-brand-gold/25 transition-colors">
              VBE
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
                LIVE CAPTION STUDIO
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-brand-gold/20 text-brand-gold border border-brand-gold/30">
                  vMix & LED
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Korean & English to Vietnamese Live Subtitling
              </p>
            </div>
          </Link>
        </div>

        {/* Live Audio & Engine Controls */}
        <div className="flex items-center gap-3">
          {/* Active Audio VU Meter */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900/80 border border-white/5">
            <Volume2
              size={15}
              className={audioLevel > 5 ? "text-emerald-400" : "text-zinc-500"}
            />
            <div className="w-24 h-2 bg-zinc-800 rounded-full overflow-hidden flex items-center p-0.5">
              <div
                className={`h-full rounded-full transition-all duration-75 ${
                  audioLevel > 70
                    ? "bg-red-500"
                    : audioLevel > 40
                    ? "bg-amber-400"
                    : "bg-emerald-500"
                }`}
                style={{ width: `${Math.min(100, audioLevel)}%` }}
              />
            </div>
            <span className="text-[10px] font-mono text-zinc-400 w-7">
              {audioLevel}%
            </span>
          </div>

          {/* Source Language Switcher */}
          <div className="flex rounded-lg overflow-hidden border border-white/10 bg-zinc-900 p-0.5">
            <button
              onClick={() => setLanguage("ko-KR")}
              className={`px-3 py-1.5 text-xs font-semibold rounded transition-all flex items-center gap-1.5 ${
                config.sourceLanguage === "ko-KR"
                  ? "bg-brand-gold text-black shadow-md"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <span>🇰🇷</span> 한국어
            </button>
            <button
              onClick={() => setLanguage("en-US")}
              className={`px-3 py-1.5 text-xs font-semibold rounded transition-all flex items-center gap-1.5 ${
                config.sourceLanguage === "en-US"
                  ? "bg-brand-gold text-black shadow-md"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <span>🇺🇸</span> English
            </button>
          </div>

          {/* Master Mic On/Off */}
          <button
            onClick={toggleListening}
            className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 transition-all shadow-lg ${
              isListening
                ? "bg-red-600 hover:bg-red-700 text-white animate-pulse"
                : "bg-emerald-600 hover:bg-emerald-500 text-white"
            }`}
          >
            {isListening ? (
              <>
                <MicOff size={16} /> STOP MIC
              </>
            ) : (
              <>
                <Mic size={16} /> START CAPTIONING
              </>
            )}
          </button>

          {/* Panic Clear Screen */}
          <button
            onClick={handleClearScreen}
            className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-white/10 text-xs font-medium flex items-center gap-1.5 transition-colors"
            title="Instantly clear subtitles from vMix and LED outputs"
          >
            <Trash2 size={14} className="text-amber-400" />
            <span className="hidden sm:inline">Clear Screen</span>
          </button>

          {/* Help Modal Button */}
          <button
            onClick={() => setShowHelpModal(true)}
            className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-white/10"
            title="Setup Guide for vMix & LED"
          >
            <HelpCircle size={16} />
          </button>
        </div>
      </header>

      {/* Error alert if mic was blocked */}
      {errorMessage && (
        <div className="bg-red-950/80 border-b border-red-800/50 px-6 py-2.5 flex items-center justify-between text-xs text-red-200">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-red-400" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-red-400 hover:text-white">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Main Workspace Layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 overflow-hidden">
        {/* Left Column: Live Control & Previews (8 cols) */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          {/* Quick Output Launcher Bar */}
          <div className="rounded-2xl bg-zinc-950/60 border border-white/10 p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase font-bold tracking-wider text-zinc-400">
                OUTPUT FEEDS:
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* vMix Browser Overlay URL */}
              <div className="flex items-center rounded-lg bg-zinc-900 border border-white/10 overflow-hidden text-xs">
                <span className="px-2.5 py-1.5 text-zinc-400 font-mono text-[11px] bg-zinc-950/50 flex items-center gap-1.5">
                  <Tv size={13} className="text-brand-gold" /> vMix Browser URL
                </span>
                <button
                  onClick={() =>
                    copyToClipboard(
                      `${window.location.origin}/caption/overlay`,
                      "vmix"
                    )
                  }
                  className="px-3 py-1.5 bg-brand-gold/15 hover:bg-brand-gold/25 text-brand-gold font-medium border-l border-white/10 flex items-center gap-1 transition-colors"
                  title="Copy direct vMix Web Browser Input URL (transparent alpha)"
                >
                  {copiedUrl === "vmix" ? (
                    <>
                      <Check size={13} /> Copied!
                    </>
                  ) : (
                    <>
                      <Copy size={13} /> Copy URL
                    </>
                  )}
                </button>
              </div>

              {/* Resizable Pop-out Window */}
              <button
                onClick={openResizableWindow}
                className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-850 text-zinc-200 border border-white/10 text-xs font-medium flex items-center gap-1.5 transition-colors"
                title="Launch standalone floating resizable window for Window Capture or Stage drag"
              >
                <Monitor size={14} className="text-blue-400" />
                Resizable Window
                <ExternalLink size={12} className="text-zinc-500" />
              </button>

              {/* LED Stage Wall */}
              <button
                onClick={openLedOutput}
                className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-850 text-zinc-200 border border-white/10 text-xs font-medium flex items-center gap-1.5 transition-colors"
                title="Open fullscreen high-contrast output for Stage LED screen or Projector"
              >
                <Layers size={14} className="text-emerald-400" />
                LED Stage View
                <ExternalLink size={12} className="text-zinc-500" />
              </button>
            </div>
          </div>

          {/* Interactive Live Output Preview */}
          <div className="rounded-2xl bg-zinc-950/80 border border-white/10 overflow-hidden flex flex-col shadow-2xl">
            <div className="px-4 py-3 bg-zinc-900/60 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                  LIVE BROADCAST PREVIEW (vMix & LED)
                </span>
                <span className="text-[11px] font-mono text-zinc-500 hidden sm:inline">
                  [{config.displayMode} • {config.bgStyle}]
                </span>
              </div>

              {/* Aspect Ratio Preview Toggles */}
              <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-white/5">
                <button
                  onClick={() => setPreviewAspect("lower-third")}
                  className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                    previewAspect === "lower-third"
                      ? "bg-brand-gold text-black font-semibold"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Lower-Third (1920×300)
                </button>
                <button
                  onClick={() => setPreviewAspect("16:9")}
                  className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                    previewAspect === "16:9"
                      ? "bg-brand-gold text-black font-semibold"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Full 16:9 (1080p)
                </button>
                <button
                  onClick={() => setPreviewAspect("led-banner")}
                  className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                    previewAspect === "led-banner"
                      ? "bg-brand-gold text-black font-semibold"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  LED Banner (3:1)
                </button>
              </div>
            </div>

            {/* Simulated Broadcast Stage Screen */}
            <div
              className={`relative w-full overflow-hidden transition-all duration-300 flex items-center justify-center ${
                previewAspect === "16:9"
                  ? "aspect-video"
                  : previewAspect === "lower-third"
                  ? "h-64"
                  : "h-44"
              }`}
              style={{
                backgroundImage:
                  config.bgStyle === "transparent"
                    ? "radial-gradient(#1f2937 1px, transparent 1px), radial-gradient(#1f2937 1px, #0a0a0f 1px)"
                    : undefined,
                backgroundSize: "20px 20px",
                backgroundColor: config.bgStyle === "transparent" ? "#07070b" : undefined,
              }}
            >
              {/* Simulated Camera Feed Overlay Helper */}
              {config.bgStyle === "transparent" && (
                <div className="absolute top-3 left-4 text-[10px] uppercase font-mono tracking-wider text-zinc-600 pointer-events-none select-none">
                  Simulated Alpha Video Feed (vMix Transparent Layer)
                </div>
              )}

              <CaptionDisplayView
                config={config}
                currentCaption={currentCaption}
                history={history}
                pinnedAnnouncement={pinnedAnnouncement}
                previewMode={!isListening && !currentCaption}
              />
            </div>
          </div>

          {/* Quick Pinned Announcement & Panic Push */}
          <div className="rounded-2xl bg-zinc-950/60 border border-white/10 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase font-bold tracking-wider text-brand-gold flex items-center gap-1.5">
                <Radio size={14} /> Pinned Stage Announcement / VIP Notification
              </span>
              {pinnedAnnouncement && (
                <button
                  onClick={handleUnpinAnnouncement}
                  className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                >
                  <X size={13} /> Remove Announcement
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={announcementInput}
                onChange={(e) => setAnnouncementInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handlePinAnnouncement()}
                placeholder="Type urgent announcement (e.g. Phiên thảo luận Q&A sắp bắt đầu...)"
                className="flex-1 bg-zinc-900 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-brand-gold/60"
              />
              <button
                onClick={handlePinAnnouncement}
                className="px-4 py-2 rounded-xl bg-brand-gold hover:bg-brand-gold/90 text-black font-bold text-xs flex items-center gap-1.5 transition-colors"
              >
                <Send size={13} /> Push to LED / vMix
              </button>
            </div>
          </div>

          {/* Test Speech Simulator (Conference Keynote Presets) */}
          <div className="rounded-2xl bg-zinc-950/60 border border-white/10 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase font-bold tracking-wider text-zinc-400 flex items-center gap-1.5">
                <Sparkles size={14} className="text-brand-gold" /> Test Speech Simulator (Zero-Mic Calibration)
              </span>
              <span className="text-[11px] text-zinc-500">
                Click any line to simulate speaker audio & translation
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {DEMO_SENTENCES.map((demo, idx) => (
                <button
                  key={idx}
                  onClick={() => handlePlayDemo(demo)}
                  className="p-2.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-white/5 text-left transition-all hover:border-brand-gold/30 group"
                >
                  <div className="text-xs font-semibold text-zinc-300 group-hover:text-brand-gold transition-colors">
                    {demo.label}
                  </div>
                  <div className="text-[11px] text-zinc-500 truncate mt-0.5">
                    {demo.text}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Real-time Rolling Transcript Log */}
          <div className="rounded-2xl bg-zinc-950/60 border border-white/10 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <span className="text-xs uppercase font-bold tracking-wider text-zinc-400">
                Session Transcript Log ({history.length} lines)
              </span>
              <button
                onClick={() => setHistory([])}
                className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1"
              >
                <Trash2 size={12} /> Clear Log
              </button>
            </div>

            <div className="max-h-56 overflow-y-auto space-y-2.5 pr-2">
              {history.length === 0 ? (
                <div className="text-center py-6 text-zinc-600 text-xs italic">
                  No speech recorded yet. Start microphone or click a test phrase above.
                </div>
              ) : (
                history.map((item) => (
                  <div
                    key={item.id}
                    className="p-2.5 rounded-xl bg-zinc-900/50 border border-white/5 flex flex-col gap-1 text-xs"
                  >
                    <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                      <span>{item.sourceLang.toUpperCase()} → VI</span>
                      <span>{new Date(item.timestamp).toLocaleTimeString()}</span>
                    </div>
                    {item.sourceText && (
                      <div className="text-zinc-400 italic font-light">{item.sourceText}</div>
                    )}
                    <div className="text-zinc-100 font-semibold">{item.translatedText}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Live Styling & Conference Setup (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          {/* Audio Input Device Selector */}
          <div className="rounded-2xl bg-zinc-950/80 border border-white/10 p-4 flex flex-col gap-3 shadow-xl">
            <h3 className="text-xs font-bold uppercase tracking-wider text-brand-gold flex items-center gap-1.5">
              <Sliders size={14} /> Audio Input Hardware
            </h3>

            <div>
              <label className="block text-[11px] uppercase tracking-wider text-zinc-500 mb-1">
                Audio Source (Soundboard / USB Mic)
              </label>
              <select
                value={selectedDevice}
                onChange={(e) => {
                  setSelectedDevice(e.target.value);
                  if (isListening) {
                    toggleListening();
                    setTimeout(toggleListening, 300);
                  }
                }}
                className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-brand-gold/60"
              >
                <option value="default">Default System Audio / Virtual Cable</option>
                {audioDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Microphone ${d.deviceId.slice(0, 5)}...`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Live Display & Typography Settings Card */}
          <div className="rounded-2xl bg-zinc-950/80 border border-white/10 p-4 flex flex-col gap-4 shadow-xl flex-1">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-brand-gold">
                Live Display Customizer
              </h3>
              <span className="text-[10px] text-zinc-500 font-mono">Real-time Sync</span>
            </div>

            <ConsoleSettings config={config} onChange={handleConfigChange} />
          </div>
        </div>
      </div>

      {/* Setup Guide Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-white/15 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h2 className="text-base font-bold text-brand-gold flex items-center gap-2">
                <Tv size={18} /> How to Connect to vMix & Stage LED Screen
              </h2>
              <button
                onClick={() => setShowHelpModal(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 text-xs text-zinc-300 leading-relaxed">
              <div className="p-3 rounded-xl bg-zinc-950 border border-white/5 space-y-1.5">
                <h4 className="font-bold text-white text-sm">
                  1. Adding to vMix (Transparent Alpha Overlay)
                </h4>
                <ol className="list-decimal list-inside space-y-1 text-zinc-400">
                  <li>Click <strong>&quot;Copy URL&quot;</strong> on the console (e.g. <code>http://localhost:3000/caption/overlay</code>).</li>
                  <li>In vMix, click <strong>Add Input → Web Browser</strong>.</li>
                  <li>Paste the URL and set resolution to <strong>1920×1080</strong> (or 1920×300 for a lower-third crop).</li>
                  <li>Check <strong>&quot;Transparent&quot;</strong> in vMix browser properties if needed.</li>
                  <li>Assign this input to <strong>Overlay 1</strong> or <strong>Overlay 2</strong>. Done! Subtitles overlay cleanly on camera with 0 background.</li>
                </ol>
              </div>

              <div className="p-3 rounded-xl bg-zinc-950 border border-white/5 space-y-1.5">
                <h4 className="font-bold text-white text-sm">
                  2. Projecting to Stage LED Screen
                </h4>
                <ol className="list-decimal list-inside space-y-1 text-zinc-400">
                  <li>Connect your HDMI / DisplayPort cable from the PC to the LED Video Processor (Novastar / Colorlight).</li>
                  <li>Click <strong>&quot;LED Stage View&quot;</strong> or <strong>&quot;Resizable Window&quot;</strong>.</li>
                  <li>Drag the window onto the LED display monitor.</li>
                  <li>Press <strong>F11</strong> or double-click to enter Fullscreen mode.</li>
                </ol>
              </div>

              <div className="p-3 rounded-xl bg-zinc-950 border border-white/5 space-y-1.5">
                <h4 className="font-bold text-white text-sm">
                  3. Multi-PC LAN Setup (Operator Laptop + vMix PC)
                </h4>
                <p className="text-zinc-400">
                  If the sound operator is on a laptop and vMix is on another desktop PC on the same Wi-Fi/LAN, simply replace <code>localhost</code> with the host PC&apos;s IP (e.g. <code>http://192.168.1.50:3000/caption/overlay</code>). Captions synchronize automatically across the local network!
                </p>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowHelpModal(false)}
                className="px-4 py-2 rounded-xl bg-brand-gold text-black font-bold text-xs"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
