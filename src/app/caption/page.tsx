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
  const [showHelpModal, setShowHelpModal] = useState(false);

  const speechEngineRef = useRef<LiveSpeechEngine | null>(null);
  const transcriptBottomRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, currentCaption]);

  // Request Mic Permission & Enumerate Devices
  const refreshAudioDevices = async () => {
    try {
      if (navigator?.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
      }
      if (navigator?.mediaDevices?.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const inputs = devices.filter((d) => d.kind === "audioinput");
        setAudioDevices(inputs);
      }
    } catch (err: any) {
      console.warn("Mic permission check notice:", err.message);
    }
  };

  // Load config on mount & start audio monitoring for selected mic
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CONFIG_STORAGE_KEY);
      if (saved) {
        setConfig((prev) => ({ ...prev, ...JSON.parse(saved) }));
      }
    } catch {}

    refreshAudioDevices().then(() => {
      if (!speechEngineRef.current) {
        const engine = new LiveSpeechEngine({
          onInterimCaption: (item) => {
            setCurrentCaption(item);
            captionSync.broadcast({ type: "CAPTION_UPDATE", caption: item });
          },
          onFinalCaption: (item) => {
            setCurrentCaption(item);
            setHistory((prev) => [...prev.slice(-35), item]);
            captionSync.broadcast({ type: "CAPTION_UPDATE", caption: item });
          },
          onAudioLevel: (lvl) => setAudioLevel(lvl),
          onError: (err) => setErrorMessage(err),
          onStatusChange: (st) => setEngineStatus(st),
        });
        speechEngineRef.current = engine;
      }
      speechEngineRef.current.setConfig(config);
      speechEngineRef.current.startAudioAnalysis(selectedDevice);
    });
  }, [selectedDevice]);

  // Sync engine settings
  useEffect(() => {
    if (speechEngineRef.current) {
      speechEngineRef.current.setConfig(config);
    }
  }, [config]);

  // Broadcast configuration updates
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
    if (patch.audioGain && speechEngineRef.current) {
      speechEngineRef.current.setAudioGain(patch.audioGain);
    }
  };

  // Start / Stop speech recognition
  const toggleListening = async () => {
    if (isListening) {
      speechEngineRef.current?.stop();
      setIsListening(false);
      setEngineStatus("idle");
      setAudioLevel(0);
    } else {
      setErrorMessage(null);
      // Ensure microphone permission is requested
      await refreshAudioDevices();

      const engine = new LiveSpeechEngine({
        onInterimCaption: (item) => {
          setCurrentCaption(item);
          captionSync.broadcast({ type: "CAPTION_UPDATE", caption: item });
        },
        onFinalCaption: (item) => {
          setCurrentCaption(item);
          setHistory((prev) => [...prev.slice(-35), item]);
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

      engine.setConfig(config);
      engine.start(config.sourceLanguage, selectedDevice);
      speechEngineRef.current = engine;
      setIsListening(true);
    }
  };

  // Switch language instantly
  const setLanguage = (lang: SourceLanguage) => {
    handleConfigChange({ sourceLanguage: lang });
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
    const w = 1280;
    const h = 320;
    const left = (window.screen.width - w) / 2;
    const top = (window.screen.height - h) / 2;
    window.open(
      "/caption/window",
      "VBE_Caption_Window",
      `width=${w},height=${h},top=${top},left=${left},resizable=yes,status=no,toolbar=no,menubar=no,location=no`
    );
  };

  // Open LED Stage Output
  const openLedOutput = () => {
    window.open("/caption/led", "VBE_LED_Output", "width=1920,height=1080");
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
          engine: config.translationEngine || "google-free",
          openaiApiKey: config.openaiApiKey,
          openaiModel: config.openaiModel,
          deeplApiKey: config.deeplApiKey,
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
      setHistory((prev) => [...prev.slice(-35), finalItem]);
      captionSync.broadcast({ type: "CAPTION_UPDATE", caption: finalItem });
    } catch (e) {
      console.error("Demo translation error:", e);
    }
  };

  return (
    <div className="h-screen max-h-screen w-screen overflow-hidden bg-[#070709] text-zinc-100 font-display flex flex-col select-none">
      {/* 1. COMPACT TOP HEADER BAR (~50px) */}
      <header className="h-12 border-b border-white/10 bg-zinc-950 px-4 flex items-center justify-between gap-3 shrink-0 z-40">
        {/* Left: Branding & Tag */}
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-7 h-7 rounded-lg bg-brand-gold/15 border border-brand-gold/40 flex items-center justify-center font-bold text-brand-gold text-xs group-hover:bg-brand-gold/25 transition-colors">
              VBE
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold tracking-tight text-white">
                LIVE CAPTION STUDIO
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-brand-gold/20 text-brand-gold border border-brand-gold/30 hidden sm:inline">
                vMix & LED 1080p
              </span>
            </div>
          </Link>
        </div>

        {/* Center: Language & Audio VU Meter */}
        <div className="flex items-center gap-3">
          {/* Audio VU Meter */}
          <div
            className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-zinc-900 border border-white/5 cursor-pointer"
            title="Audio Input Level (VU Meter)"
          >
            <Volume2
              size={14}
              className={audioLevel > 5 ? "text-emerald-400" : "text-zinc-500"}
            />
            <div className="w-20 h-2 bg-zinc-800 rounded-full overflow-hidden flex items-center p-0.5">
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
            <span className="text-[10px] font-mono text-zinc-400 w-6 text-right">
              {audioLevel}%
            </span>
          </div>

          {/* Source Language Switcher */}
          <div className="flex rounded-lg overflow-hidden border border-white/10 bg-zinc-900 p-0.5">
            <button
              onClick={() => setLanguage("ko-KR")}
              className={`px-2.5 py-1 text-xs font-semibold rounded transition-all flex items-center gap-1 ${
                config.sourceLanguage === "ko-KR"
                  ? "bg-brand-gold text-black shadow"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <span>🇰🇷</span> 한국어
            </button>
            <button
              onClick={() => setLanguage("en-US")}
              className={`px-2.5 py-1 text-xs font-semibold rounded transition-all flex items-center gap-1 ${
                config.sourceLanguage === "en-US"
                  ? "bg-brand-gold text-black shadow"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <span>🇺🇸</span> English
            </button>
          </div>
        </div>

        {/* Right: Master Controls */}
        <div className="flex items-center gap-2">
          {/* Master Mic Button */}
          <button
            onClick={toggleListening}
            className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all shadow-md ${
              isListening
                ? "bg-red-600 hover:bg-red-700 text-white animate-pulse"
                : "bg-emerald-600 hover:bg-emerald-500 text-white"
            }`}
          >
            {isListening ? (
              <>
                <MicOff size={14} /> STOP MIC
              </>
            ) : (
              <>
                <Mic size={14} /> START CAPTION
              </>
            )}
          </button>

          {/* Panic Clear Screen */}
          <button
            onClick={handleClearScreen}
            className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-white/10 text-xs font-medium flex items-center gap-1 transition-colors"
            title="Instantly clear subtitles from vMix & LED output"
          >
            <Trash2 size={13} className="text-amber-400" />
            <span className="hidden sm:inline">Clear</span>
          </button>

          {/* Help Modal Toggle */}
          <button
            onClick={() => setShowHelpModal(true)}
            className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-white/10"
            title="Setup Guide"
          >
            <HelpCircle size={15} />
          </button>
        </div>
      </header>

      {/* Mic error banner if any */}
      {errorMessage && (
        <div className="bg-red-950/90 border-b border-red-800/50 px-4 py-1.5 flex items-center justify-between text-xs text-red-200 shrink-0">
          <div className="flex items-center gap-2">
            <AlertCircle size={14} className="text-red-400" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-red-400 hover:text-white">
            <X size={13} />
          </button>
        </div>
      )}

      {/* 2. MAIN 2-COLUMN BROADCAST WORKSPACE (Fits 1920x1080 without full-page scroll) */}
      <div className="flex-1 min-h-0 grid grid-cols-12 gap-3 p-3 overflow-hidden">
        {/* LEFT COLUMN: LIVE BROADCAST STAGE & TRANSCRIPT (7 cols) */}
        <div className="col-span-12 lg:col-span-7 flex flex-col gap-2.5 min-h-0 overflow-hidden">
          {/* Row A: Output Feed Launcher Bar */}
          <div className="rounded-xl bg-zinc-950/80 border border-white/10 px-3 py-1.5 flex items-center justify-between gap-2 shrink-0">
            <span className="text-[11px] uppercase font-bold tracking-wider text-zinc-400">
              OUTPUTS:
            </span>

            <div className="flex items-center gap-2">
              {/* vMix Browser Overlay URL */}
              <button
                onClick={() =>
                  copyToClipboard(
                    `${window.location.origin}/caption/overlay`,
                    "vmix"
                  )
                }
                className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-brand-gold font-medium border border-brand-gold/30 text-xs flex items-center gap-1.5 transition-colors"
                title="Copy vMix Web Browser Input URL (Transparent Alpha Channel)"
              >
                <Tv size={13} />
                {copiedUrl === "vmix" ? (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <Check size={12} /> Copied!
                  </span>
                ) : (
                  <span>Copy vMix URL</span>
                )}
              </button>

              {/* Resizable Pop-out Window */}
              <button
                onClick={openResizableWindow}
                className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-white/10 text-xs flex items-center gap-1.5 transition-colors"
                title="Open floating resizable window for vMix Window Capture"
              >
                <Monitor size={13} className="text-blue-400" />
                Resizable Window
                <ExternalLink size={11} className="text-zinc-500" />
              </button>

              {/* LED Stage Wall */}
              <button
                onClick={openLedOutput}
                className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-white/10 text-xs flex items-center gap-1.5 transition-colors"
                title="Open fullscreen output for Stage LED screen"
              >
                <Layers size={13} className="text-emerald-400" />
                LED Stage
                <ExternalLink size={11} className="text-zinc-500" />
              </button>
            </div>
          </div>

          {/* Row B: Broadcast Live Preview Box */}
          <div className="rounded-xl bg-zinc-950/80 border border-white/10 overflow-hidden flex flex-col shrink-0 shadow-lg">
            <div className="px-3 py-1.5 bg-zinc-900/60 border-b border-white/5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-300">
                  LIVE BROADCAST PREVIEW
                </span>
                <span className="text-[10px] font-mono text-zinc-500">
                  [{config.displayMode} • {config.bgStyle}]
                </span>
              </div>

              {/* Aspect Ratio Toggle */}
              <div className="flex items-center gap-1 bg-zinc-950 p-0.5 rounded border border-white/5 text-[10px]">
                <button
                  onClick={() => setPreviewAspect("lower-third")}
                  className={`px-2 py-0.5 rounded font-mono ${
                    previewAspect === "lower-third"
                      ? "bg-brand-gold text-black font-bold"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Lower-Third (1920×300)
                </button>
                <button
                  onClick={() => setPreviewAspect("16:9")}
                  className={`px-2 py-0.5 rounded font-mono ${
                    previewAspect === "16:9"
                      ? "bg-brand-gold text-black font-bold"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Full 16:9
                </button>
                <button
                  onClick={() => setPreviewAspect("led-banner")}
                  className={`px-2 py-0.5 rounded font-mono ${
                    previewAspect === "led-banner"
                      ? "bg-brand-gold text-black font-bold"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  LED Banner
                </button>
              </div>
            </div>

            <div
              className={`relative w-full overflow-hidden transition-all duration-200 flex items-center justify-center ${
                previewAspect === "16:9"
                  ? "h-44"
                  : previewAspect === "lower-third"
                  ? "h-36"
                  : "h-28"
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
              <CaptionDisplayView
                config={config}
                currentCaption={currentCaption}
                history={history}
                pinnedAnnouncement={pinnedAnnouncement}
                previewMode={!isListening && !currentCaption}
              />
            </div>
          </div>

          {/* Row C: Pinned Stage Notification Bar */}
          <div className="rounded-xl bg-zinc-950/70 border border-white/10 px-3 py-1.5 flex items-center gap-2 shrink-0">
            <Radio size={13} className="text-brand-gold shrink-0" />
            <input
              type="text"
              value={announcementInput}
              onChange={(e) => setAnnouncementInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handlePinAnnouncement()}
              placeholder="Ghim thông báo khẩn (e.g. Phiên thảo luận Q&A sắp bắt đầu...)"
              className="flex-1 bg-zinc-900 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-brand-gold/60"
            />
            <button
              onClick={handlePinAnnouncement}
              className="px-3 py-1 rounded-lg bg-brand-gold hover:bg-brand-gold/90 text-black font-bold text-xs flex items-center gap-1 shrink-0 transition-colors"
            >
              <Send size={11} /> Push
            </button>
            {pinnedAnnouncement && (
              <button
                onClick={handleUnpinAnnouncement}
                className="p-1 rounded-lg bg-red-950/80 hover:bg-red-900 text-red-300 text-xs shrink-0"
                title="Remove Pinned Announcement"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Row D: Compact Test Phrases Carousel / Pills */}
          <div className="rounded-xl bg-zinc-950/70 border border-white/10 px-3 py-1.5 flex items-center gap-2 shrink-0 overflow-x-auto scrollbar-none">
            <span className="text-[10px] uppercase font-bold text-zinc-400 flex items-center gap-1 shrink-0">
              <Sparkles size={12} className="text-brand-gold" /> Test:
            </span>
            <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
              {DEMO_SENTENCES.map((demo, idx) => (
                <button
                  key={idx}
                  onClick={() => handlePlayDemo(demo)}
                  className="px-2 py-0.5 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-white/5 text-[11px] text-zinc-300 hover:text-brand-gold whitespace-nowrap transition-colors"
                >
                  {demo.label}
                </button>
              ))}
            </div>
          </div>

          {/* Row E: Transcript Log (Fills all remaining vertical space!) */}
          <div className="flex-1 min-h-0 rounded-xl bg-zinc-950/80 border border-white/10 flex flex-col overflow-hidden shadow-lg">
            <div className="px-3 py-1.5 bg-zinc-900/60 border-b border-white/5 flex items-center justify-between text-xs shrink-0">
              <span className="text-[11px] uppercase font-bold tracking-wider text-zinc-400">
                Live Transcript Feed ({history.length} lines)
              </span>
              <button
                onClick={() => setHistory([])}
                className="text-[11px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1 transition-colors"
              >
                <Trash2 size={11} /> Clear Log
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5 scrollbar-thin scrollbar-thumb-zinc-700">
              {history.length === 0 ? (
                <div className="h-full flex items-center justify-center text-zinc-600 text-xs italic">
                  Chưa có phụ đề. Bấm &quot;START CAPTION&quot; hoặc chọn câu Test mẫu ở trên.
                </div>
              ) : (
                history.map((item) => (
                  <div
                    key={item.id}
                    className="p-2 rounded-lg bg-zinc-900/60 border border-white/5 flex flex-col gap-0.5 text-xs"
                  >
                    <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                      <span>{item.sourceLang.toUpperCase()} → VI</span>
                      <span>{new Date(item.timestamp).toLocaleTimeString()}</span>
                    </div>
                    {item.sourceText && (
                      <div className="text-zinc-400 italic text-[11px] font-light">
                        {item.sourceText}
                      </div>
                    )}
                    <div className="text-zinc-100 font-semibold text-xs">
                      {item.translatedText}
                    </div>
                  </div>
                ))
              )}
              <div ref={transcriptBottomRef} />
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: HIGH-DENSITY SETTINGS TABS (5 cols, Fits 100% height) */}
        <div className="col-span-12 lg:col-span-5 h-full min-h-0 rounded-xl bg-zinc-950/90 border border-white/10 flex flex-col overflow-hidden shadow-2xl">
          <ConsoleSettings
            config={config}
            onChange={handleConfigChange}
            audioDevices={audioDevices}
            selectedDevice={selectedDevice}
            onSelectDevice={(devId) => {
              setSelectedDevice(devId);
              if (speechEngineRef.current) {
                speechEngineRef.current.startAudioAnalysis(devId);
              }
              if (isListening) {
                toggleListening();
                setTimeout(toggleListening, 300);
              }
            }}
            audioLevel={audioLevel}
            onRequestMicPermission={refreshAudioDevices}
          />
        </div>
      </div>

      {/* Setup Guide Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-white/15 rounded-2xl max-w-xl w-full p-5 shadow-2xl space-y-3 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <h2 className="text-sm font-bold text-brand-gold flex items-center gap-2">
                <Tv size={16} /> Hướng dẫn kết nối vMix & Màn hình LED Sân khấu
              </h2>
              <button
                onClick={() => setShowHelpModal(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-xs text-zinc-300 leading-relaxed">
              <div className="p-3 rounded-xl bg-zinc-950 border border-white/5 space-y-1">
                <h4 className="font-bold text-white text-xs text-brand-gold">
                  1. Tích hợp vào vMix (Nền trong suốt Alpha Channel)
                </h4>
                <ol className="list-decimal list-inside space-y-0.5 text-zinc-400 text-[11px]">
                  <li>Bấm nút <strong>&quot;Copy vMix URL&quot;</strong> ở thanh trên.</li>
                  <li>Trong vMix, bấm <strong>Add Input</strong> $\rightarrow$ chọn <strong>Web Browser</strong>.</li>
                  <li>Dán URL (<code>http://localhost:3000/caption/overlay</code>).</li>
                  <li>Đặt kích thước: <strong>1920×1080</strong> (hoặc 1920×300).</li>
                  <li>Gán vào <strong>Overlay 1 / 2</strong>. Phụ đề nổi trong suốt trên video.</li>
                </ol>
              </div>

              <div className="p-3 rounded-xl bg-zinc-950 border border-white/5 space-y-1">
                <h4 className="font-bold text-white text-xs text-brand-gold">
                  2. Xuất ra Màn hình LED / Máy chiếu Sân khấu
                </h4>
                <ol className="list-decimal list-inside space-y-0.5 text-zinc-400 text-[11px]">
                  <li>Bấm <strong>&quot;LED Stage&quot;</strong> để mở cửa sổ nền đen tương phản cao.</li>
                  <li>Kéo cửa sổ sang màn hình LED thứ 2 (Extend Display).</li>
                  <li>Nhấn <strong>F11</strong> hoặc nhấp đúp chuột để full màn hình.</li>
                </ol>
              </div>

              <div className="p-3 rounded-xl bg-zinc-950 border border-white/5 space-y-1">
                <h4 className="font-bold text-white text-xs text-brand-gold">
                  3. Thu âm Micro PC hoặc Bàn Mixer
                </h4>
                <p className="text-zinc-400 text-[11px]">
                  Vào Tab <strong>&quot;Audio&quot;</strong> ở cột bên phải $\rightarrow$ Chọn thiết bị micro tương ứng. Nếu giọng nói nhỏ, kéo thanh <strong>Gain Booster</strong> lên 2x - 3x.
                </p>
              </div>
            </div>

            <div className="pt-1 flex justify-end">
              <button
                onClick={() => setShowHelpModal(false)}
                className="px-4 py-1.5 rounded-lg bg-brand-gold text-black font-bold text-xs"
              >
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
