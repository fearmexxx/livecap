"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  CaptionConfig,
  CaptionItem,
  ConnectedDevice,
  DEFAULT_CAPTION_CONFIG,
  DEFAULT_SPEAKERS,
  SessionInfo,
  SourceLanguage,
  SpeakerProfile,
} from "@/lib/caption/types";
import { getCaptionSync } from "@/lib/caption/sync";
import { LiveSpeechEngine } from "@/lib/caption/speechEngine";
import { requestTranslation } from "@/lib/caption/translateClient";
import {
  formatTranscriptJson,
  formatTranscriptSrt,
  formatTranscriptTxt,
  formatTranscriptVtt,
} from "@/lib/caption/transcriptUtils";
import CaptionDisplayView from "@/components/caption/CaptionDisplayView";
import ConsoleSettings from "@/components/caption/ConsoleSettings";
import { CONFIG_STORAGE_KEY } from "@/lib/caption/useCaptionReceiver";
import {
  Mic,
  MicOff,
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
  ChevronDown,
  Download,
  Plus,
  FileText,
  Minimize2,
  Maximize2,
  Users,
  Wifi,
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

const PRESET_SESSIONS = [
  { id: "default", name: "🏛️ Default (Main Hall)", desc: "Phòng hội nghị trung tâm" },
  { id: "hall-a", name: "🎙️ Hall A (Main Stage)", desc: "Sân khấu lớn / Diễn giả chính" },
  { id: "hall-b", name: "🏢 Hall B (Breakout Room)", desc: "Phòng hội thảo chuyên đề" },
  { id: "track-1", name: "🇰🇷 Track 1 (Korean Keynote)", desc: "Luồng diễn giả tiếng Hàn" },
  { id: "track-2", name: "🇺🇸 Track 2 (English Tech Talk)", desc: "Luồng diễn giả tiếng Anh" },
];

const SPEAKER_COLORS = ["#F59E0B", "#10B981", "#38BDF8", "#A855F7", "#F43F5E", "#EC4899"];

export default function CaptionConsolePage() {
  const [config, setConfig] = useState<CaptionConfig>(DEFAULT_CAPTION_CONFIG);
  const [isListening, setIsListening] = useState(false);
  const [engineStatus, setEngineStatus] = useState<"idle" | "listening" | "reconnecting" | "paused">("idle");
  const [audioLevel, setAudioLevel] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Multi-session / Multi-room State
  const [sessionId, setSessionId] = useState<string>("default");
  const [sessionName, setSessionName] = useState<string>("🏛️ Default (Main Hall)");
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [showSpeakerModal, setShowSpeakerModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [customSessionId, setCustomSessionId] = useState("");
  const [customSessionName, setCustomSessionName] = useState("");
  const [activeRoomsList, setActiveRoomsList] = useState<SessionInfo[]>([]);
  const [connectedDevices, setConnectedDevices] = useState<ConnectedDevice[]>([]);
  const sessionIdRef = useRef("default");

  // New Speaker Form State
  const [newSpkName, setNewSpkName] = useState("");
  const [newSpkRole, setNewSpkRole] = useState("");
  const [newSpkLang, setNewSpkLang] = useState<SourceLanguage>("ko-KR");
  const [newSpkColor, setNewSpkColor] = useState("#F59E0B");
  const [newSpkMicId, setNewSpkMicId] = useState("default");

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  const [currentCaption, setCurrentCaption] = useState<CaptionItem | null>(null);
  const [history, setHistory] = useState<CaptionItem[]>([]);
  const [pinnedAnnouncement, setPinnedAnnouncement] = useState<string | null>(null);
  const [announcementInput, setAnnouncementInput] = useState("");

  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState("default");

  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [previewAspect, setPreviewAspect] = useState<"16:9" | "lower-third" | "led-banner">("lower-third");
  const [isPreviewCollapsed, setIsPreviewCollapsed] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

  const speechEngineRef = useRef<LiveSpeechEngine | null>(null);
  const transcriptBottomRef = useRef<HTMLDivElement | null>(null);

  const speakers: SpeakerProfile[] = config.speakers?.length ? config.speakers : DEFAULT_SPEAKERS;
  const activeSpeaker =
    speakers.find((s) => s.id === config.activeSpeakerId) || speakers[0] || DEFAULT_SPEAKERS[0];

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

  // Resolve session from URL on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const qSession = urlParams.get("session")?.trim();
        if (qSession) {
          setSessionId(qSession);
          sessionIdRef.current = qSession;
          const match = PRESET_SESSIONS.find((s) => s.id === qSession);
          setSessionName(match ? match.name : `📍 ${qSession}`);
        }
      } catch {}
    }
  }, []);

  // Subscribe to multi-device sync for the current room (so captions from other mic devices appear!)
  useEffect(() => {
    const sync = getCaptionSync(sessionId);
    sync.setDeviceMeta({
      role: "operator",
      deviceName: `Console (${sync.getDeviceId().slice(-4)})`,
      speakerName: activeSpeaker?.name,
    });

    const unsubPayload = sync.subscribe((payload) => {
      if (payload.type === "CAPTION_UPDATE") {
        setCurrentCaption(payload.caption);
        if (payload.caption.isFinal) {
          setHistory((prev) =>
            prev.some((h) => h.id === payload.caption.id)
              ? prev
              : [...prev.slice(-99), payload.caption]
          );
        }
      } else if (payload.type === "CLEAR_SCREEN") {
        setCurrentCaption(null);
        setPinnedAnnouncement(null);
      } else if (payload.type === "PIN_ANNOUNCEMENT") {
        setPinnedAnnouncement(payload.text);
      }
    });

    const unsubRoom = sync.subscribeRoomState(({ devices, history: serverHistory }) => {
      setConnectedDevices(devices);
      if (serverHistory && serverHistory.length > 0) {
        setHistory((prev) => (serverHistory.length > prev.length ? serverHistory : prev));
      }
    });

    const unsubSyncErrors = sync.subscribeSyncErrors(setSyncError);

    sync.startRemotePolling(600);
    return () => {
      unsubPayload();
      unsubRoom();
      unsubSyncErrors();
      sync.stopRemotePolling();
    };
  }, [sessionId, activeSpeaker?.name]);

  // Fetch all active rooms when Session Modal is opened
  useEffect(() => {
    if (!showSessionModal) return;
    fetch("/api/caption/sync?action=list-sessions")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.sessions)) {
          setActiveRoomsList(data.sessions);
        }
      })
      .catch(() => {});
  }, [showSessionModal]);

  // Load config on mount & start audio monitoring for selected mic
  useEffect(() => {
    try {
      const sessionConfigKey = `${CONFIG_STORAGE_KEY}_${sessionId}`;
      const saved = localStorage.getItem(sessionConfigKey) || localStorage.getItem(CONFIG_STORAGE_KEY);
      if (saved) {
        setConfig((prev) => ({ ...prev, ...JSON.parse(saved) }));
      }
    } catch {}

    refreshAudioDevices().then(() => {
      if (!speechEngineRef.current) {
        const engine = new LiveSpeechEngine({
          onInterimCaption: (item) => {
            setCurrentCaption(item);
            getCaptionSync(sessionIdRef.current).broadcast({
              type: "CAPTION_UPDATE",
              caption: item,
              session: sessionIdRef.current,
            });
          },
          onFinalCaption: (item) => {
            setCurrentCaption(item);
            setHistory((prev) =>
              prev.some((h) => h.id === item.id) ? prev : [...prev.slice(-99), item]
            );
            getCaptionSync(sessionIdRef.current).broadcast({
              type: "CAPTION_UPDATE",
              caption: item,
              session: sessionIdRef.current,
            });
          },
          onAudioLevel: (lvl) => setAudioLevel(lvl),
          onError: (err) => setErrorMessage(err),
          onWarning: (msg) => setWarningMessage(msg),
          onStatusChange: (st) => setEngineStatus(st),
        });
        speechEngineRef.current = engine;
      }
      speechEngineRef.current.setConfig(config);
      speechEngineRef.current.startAudioAnalysis(selectedDevice);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDevice, sessionId]);

  // Sync engine settings
  useEffect(() => {
    if (speechEngineRef.current) {
      speechEngineRef.current.setConfig(config);
    }
  }, [config]);

  // Keyboard hotkeys Alt+1 .. Alt+9 to switch speakers quickly
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key >= "1" && e.key <= "9") {
        const idx = parseInt(e.key, 10) - 1;
        if (speakers[idx]) {
          e.preventDefault();
          handleSelectSpeaker(speakers[idx]);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speakers, config]);

  // Broadcast configuration updates
  const handleConfigChange = (patch: Partial<CaptionConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      try {
        const sessionConfigKey = `${CONFIG_STORAGE_KEY}_${sessionId}`;
        localStorage.setItem(sessionConfigKey, JSON.stringify(next));
        if (sessionId === "default") {
          localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(next));
        }
      } catch {}
      getCaptionSync(sessionId).broadcast({
        type: "CONFIG_UPDATE",
        config: next,
        session: sessionId,
        sessionName,
      });
      return next;
    });

    if (patch.sourceLanguage && speechEngineRef.current) {
      speechEngineRef.current.setLanguage(patch.sourceLanguage);
    }
    if (patch.audioGain && speechEngineRef.current) {
      speechEngineRef.current.setAudioGain(patch.audioGain);
    }
  };

  // Switch active speaker profile
  const handleSelectSpeaker = (spk: SpeakerProfile) => {
    const patch: Partial<CaptionConfig> = {
      activeSpeakerId: spk.id,
      speakerLabel: spk.name,
    };
    if (spk.defaultLang) {
      patch.sourceLanguage = spk.defaultLang;
    }
    handleConfigChange(patch);

    if (spk.micDeviceId && spk.micDeviceId !== selectedDevice) {
      setSelectedDevice(spk.micDeviceId);
    }
  };

  // Add a new speaker profile to the room
  const handleAddSpeaker = () => {
    if (!newSpkName.trim()) return;
    const created: SpeakerProfile = {
      id: "spk_" + Date.now().toString(36),
      name: newSpkName.trim(),
      role: newSpkRole.trim() || undefined,
      color: newSpkColor,
      defaultLang: newSpkLang,
      micDeviceId: newSpkMicId !== "default" ? newSpkMicId : undefined,
    };
    const nextList = [...speakers, created];
    handleConfigChange({
      speakers: nextList,
      activeSpeakerId: created.id,
      speakerLabel: created.name,
      sourceLanguage: created.defaultLang || config.sourceLanguage,
    });
    setNewSpkName("");
    setNewSpkRole("");
  };

  const handleDeleteSpeaker = (id: string) => {
    if (speakers.length <= 1) return;
    const nextList = speakers.filter((s) => s.id !== id);
    const nextActive =
      config.activeSpeakerId === id ? nextList[0] : activeSpeaker;
    handleConfigChange({
      speakers: nextList,
      activeSpeakerId: nextActive.id,
      speakerLabel: nextActive.name,
    });
  };

  // Switch session handler
  const switchSession = (newId: string, newName?: string) => {
    const cleanId = newId.trim() || "default";
    const name = newName || PRESET_SESSIONS.find((s) => s.id === cleanId)?.name || `📍 ${cleanId}`;

    if (isListening) {
      speechEngineRef.current?.stop();
      setIsListening(false);
      setEngineStatus("idle");
      setAudioLevel(0);
    }

    setSessionId(cleanId);
    sessionIdRef.current = cleanId;
    setSessionName(name);
    setShowSessionModal(false);

    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (cleanId === "default") {
        url.searchParams.delete("session");
      } else {
        url.searchParams.set("session", cleanId);
      }
      window.history.pushState({}, "", url.toString());

      try {
        const sessionConfigKey = `${CONFIG_STORAGE_KEY}_${cleanId}`;
        const saved = localStorage.getItem(sessionConfigKey) || localStorage.getItem(CONFIG_STORAGE_KEY);
        if (saved) {
          setConfig({ ...DEFAULT_CAPTION_CONFIG, ...JSON.parse(saved) });
        }
      } catch {}
    }

    // Reset current captions for clean session transition
    setCurrentCaption(null);
    setHistory([]);
    setPinnedAnnouncement(null);
  };

  // Export Transcript to TXT, SRT, VTT, or JSON format
  const exportTranscript = (format: "txt" | "srt" | "vtt" | "json") => {
    if (history.length === 0) {
      alert("Chưa có lịch sử câu phụ đề nào trong phiên này để xuất.");
      return;
    }
    const cleanSessionName = sessionName.replace(/[^\w\s-]/gi, "").trim();
    let content = "";
    let mime = "text/plain;charset=utf-8";

    if (format === "txt") {
      content = formatTranscriptTxt(history, sessionName, sessionId);
    } else if (format === "srt") {
      content = formatTranscriptSrt(history);
      mime = "application/x-subrip;charset=utf-8";
    } else if (format === "vtt") {
      content = formatTranscriptVtt(history);
      mime = "text/vtt;charset=utf-8";
    } else if (format === "json") {
      content = formatTranscriptJson(history, sessionName, sessionId);
      mime = "application/json;charset=utf-8";
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `LiveCap_${cleanSessionName || sessionId}_${new Date().toISOString().slice(0, 10)}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportModal(false);
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
      setWarningMessage(null);
      await refreshAudioDevices();

      // Release the standby engine's mic stream before opening a new one
      speechEngineRef.current?.stopAll();

      const engine = new LiveSpeechEngine({
        onInterimCaption: (item) => {
          setCurrentCaption(item);
          getCaptionSync(sessionIdRef.current).broadcast({
            type: "CAPTION_UPDATE",
            caption: item,
            session: sessionIdRef.current,
          });
        },
        onFinalCaption: (item) => {
          setCurrentCaption(item);
          setHistory((prev) =>
            prev.some((h) => h.id === item.id) ? prev : [...prev.slice(-99), item]
          );
          getCaptionSync(sessionIdRef.current).broadcast({
            type: "CAPTION_UPDATE",
            caption: item,
            session: sessionIdRef.current,
          });
        },
        onAudioLevel: (lvl) => setAudioLevel(lvl),
        onError: (err) => {
          setErrorMessage(err);
          setIsListening(false);
          setEngineStatus("idle");
        },
        onWarning: (msg) => setWarningMessage(msg),
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
    getCaptionSync(sessionId).broadcast({ type: "CLEAR_SCREEN", session: sessionId });
  };

  // Pin Announcement
  const handlePinAnnouncement = () => {
    if (!announcementInput.trim()) return;
    const text = announcementInput.trim();
    setPinnedAnnouncement(text);
    getCaptionSync(sessionId).broadcast({ type: "PIN_ANNOUNCEMENT", text, session: sessionId });
  };

  const handleUnpinAnnouncement = () => {
    setPinnedAnnouncement(null);
    setAnnouncementInput("");
    getCaptionSync(sessionId).broadcast({ type: "PIN_ANNOUNCEMENT", text: null, session: sessionId });
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
    const url = sessionId === "default" ? "/caption/window" : `/caption/window?session=${sessionId}`;
    window.open(
      url,
      `VBE_Caption_Window_${sessionId}`,
      `width=${w},height=${h},top=${top},left=${left},resizable=yes,status=no,toolbar=no,menubar=no,location=no`
    );
  };

  // Open LED Stage Output
  const openLedOutput = () => {
    const url = sessionId === "default" ? "/caption/led" : `/caption/led?session=${sessionId}`;
    window.open(url, `VBE_LED_Output_${sessionId}`, "width=1920,height=1080");
  };

  // Run a demo sentence
  const handlePlayDemo = async (demo: (typeof DEMO_SENTENCES)[0]) => {
    if (demo.lang !== config.sourceLanguage) {
      handleConfigChange({ sourceLanguage: demo.lang });
    }

    try {
      const result = await requestTranslation(config, demo.text, demo.lang.startsWith("ko") ? "ko" : "en");
      setWarningMessage(
        result.failed
          ? `Translation failed, the screen is showing the original language. ${result.message || ""}`.trim()
          : result.fallback
          ? result.message || "Main translation engine failed; using free Google fallback."
          : null
      );
      const finalItem: CaptionItem = {
        id: "demo_" + Date.now(),
        timestamp: Date.now(),
        sourceLang: demo.lang.startsWith("ko") ? "ko" : "en",
        sourceText: demo.text,
        translatedText: result.text,
        isFinal: true,
        speakerId: activeSpeaker.id,
        speakerName: activeSpeaker.name,
        speakerRole: activeSpeaker.role,
        speakerColor: activeSpeaker.color,
      };

      setCurrentCaption(finalItem);
      setHistory((prev) => [...prev.slice(-99), finalItem]);
      getCaptionSync(sessionId).broadcast({
        type: "CAPTION_UPDATE",
        caption: finalItem,
        session: sessionId,
      });
    } catch (e) {
      console.error("Demo translation error:", e);
    }
  };

  return (
    <div className="min-h-screen xl:h-screen xl:max-h-screen w-full bg-[#070709] text-zinc-100 font-display flex flex-col select-none overflow-y-auto xl:overflow-hidden">
      {/* 1. COMPACT TOP HEADER BAR (~44px) */}
      <header className="h-11 border-b border-white/10 bg-zinc-950 px-3.5 flex items-center justify-between gap-3 shrink-0 z-40">
        {/* Left: Branding, Room Switcher & Device Presence */}
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-7 h-7 rounded-lg bg-brand-gold/15 border border-brand-gold/40 flex items-center justify-center font-bold text-brand-gold text-xs group-hover:bg-brand-gold/25 transition-colors">
              VBE
            </div>
            <div className="flex items-center gap-1.5 hidden md:flex">
              <span className="text-xs font-bold tracking-tight text-white">
                LIVE CAPTION
              </span>
            </div>
          </Link>

          {/* Session / Room Switcher Pill */}
          <button
            onClick={() => setShowSessionModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-brand-gold/40 text-xs text-brand-gold transition-all shadow-sm group"
            title="Nhấp để chuyển đổi hoặc tạo Phòng / Phiên Live Session mới"
          >
            <Layers size={13} className="text-brand-gold group-hover:scale-110 transition-transform shrink-0" />
            <span className="font-semibold max-w-[130px] sm:max-w-[165px] truncate">{sessionName}</span>
            <ChevronDown size={12} className="opacity-70 shrink-0" />
          </button>

          {/* Connected Devices Badge */}
          <button
            onClick={() => setShowSessionModal(true)}
            className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg bg-zinc-900/90 border border-white/10 text-[11px] text-zinc-300 hover:text-white"
            title="Số thiết bị (Console, LED Wall, vMix, Remote Mic) đang kết nối trong phòng này"
          >
            <Wifi size={12} className="text-emerald-400" />
            <span className="font-mono font-bold text-emerald-400">
              {Math.max(1, connectedDevices.length)}
            </span>
            <span className="text-zinc-500 hidden lg:inline">devices</span>
          </button>
        </div>

        {/* Center: Language & Audio VU Meter */}
        <div className="flex items-center gap-3">
          {/* Audio VU Meter */}
          <div
            className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-zinc-900 border border-white/5 cursor-pointer"
            title={`Audio Input Level (${engineStatus})`}
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
            <span className="text-[10px] font-mono tabular-nums text-zinc-400 w-8 shrink-0 text-right">
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

          {/* Active STT Engine Pill */}
          <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 border border-white/5 text-[11px] font-mono">
            <span className="text-zinc-500">STT:</span>
            <span className="font-semibold text-brand-gold">
              {config.sttEngine === "openrouter"
                ? "OpenRouter (gpt-transcribe)"
                : config.sttEngine === "local-gpu"
                ? "Local GPU (Intel Arc/NVIDIA)"
                : "Web Speech API"}
            </span>
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
      {(warningMessage || syncError) && (
        <div className="bg-amber-950/90 border-b border-amber-700/50 px-4 py-1.5 flex items-center justify-between text-xs text-amber-200 shrink-0">
          <div className="flex items-center gap-2">
            <AlertCircle size={14} className="text-amber-400" />
            <span>{syncError || warningMessage}</span>
          </div>
          <button
            onClick={() => {
              setWarningMessage(null);
              setSyncError(null);
            }}
            className="text-amber-400 hover:text-white"
          >
            <X size={13} />
          </button>
        </div>
      )}

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

      {/* 2. MAIN 2-COLUMN BROADCAST WORKSPACE */}
      <div className="flex-1 min-h-0 grid grid-cols-12 gap-2.5 p-2.5 overflow-y-auto xl:overflow-hidden">
        {/* LEFT COLUMN: LIVE BROADCAST STAGE & TRANSCRIPT (7 cols) */}
        <div className="col-span-12 lg:col-span-7 flex flex-col gap-2 min-h-0 h-full overflow-y-auto pr-1">
          {/* Row A: Output Feed Launcher Bar */}
          <div className="rounded-xl bg-zinc-950/80 border border-white/10 px-2.5 py-1 flex items-center justify-between gap-2 shrink-0">
            <span className="text-[11px] uppercase font-bold tracking-wider text-zinc-400">
              OUTPUTS:
            </span>

            <div className="flex items-center gap-1.5 flex-wrap">
              {/* vMix Browser Overlay URL */}
              <button
                onClick={() =>
                  copyToClipboard(
                    `${window.location.origin}/caption/overlay${sessionId === "default" ? "" : `?session=${sessionId}`}`,
                    "vmix"
                  )
                }
                className="px-2 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-brand-gold font-medium border border-brand-gold/30 text-xs flex items-center gap-1.5 transition-colors"
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
                className="px-2 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-white/10 text-xs flex items-center gap-1.5 transition-colors"
                title="Mở cửa sổ thay đổi kích thước cho phiên này"
              >
                <Monitor size={13} className="text-blue-400" />
                Resizable Window
                <ExternalLink size={11} className="text-zinc-500" />
              </button>

              {/* LED Stage Wall */}
              <button
                onClick={openLedOutput}
                className="px-2 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-white/10 text-xs flex items-center gap-1.5 transition-colors"
                title="Mở cửa sổ màn hình LED hội trường cho phiên này"
              >
                <Layers size={13} className="text-emerald-400" />
                LED Stage
                <ExternalLink size={11} className="text-zinc-500" />
              </button>

              {/* Export Transcript */}
              <button
                onClick={() => setShowExportModal(true)}
                className="px-2 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-white/10 text-xs flex items-center gap-1.5 transition-colors"
                title="Xuất phụ đề phiên này ra tệp .TXT, .SRT, .VTT, .JSON"
              >
                <Download size={13} className="text-amber-400" />
                <span className="hidden sm:inline">Export</span>
              </button>
            </div>
          </div>

          {/* Row A2: MULTI-SPEAKER SWITCHER BAR (1-Click Speaker & Panelist Attribution) */}
          <div className="rounded-xl bg-zinc-950/80 border border-white/10 px-2.5 py-1.5 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
              <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 flex items-center gap-1 shrink-0 mr-1">
                <Users size={12} className="text-brand-gold" /> Speakers:
              </span>
              {speakers.map((spk, idx) => {
                const isSelected = activeSpeaker.id === spk.id;
                return (
                  <button
                    key={spk.id}
                    onClick={() => handleSelectSpeaker(spk)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-all border ${
                      isSelected
                        ? "text-white shadow-sm"
                        : "bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border-white/5"
                    }`}
                    style={
                      isSelected
                        ? {
                            backgroundColor: `${spk.color}28`,
                            borderColor: spk.color,
                            color: "#ffffff",
                          }
                        : undefined
                    }
                    title={`Bấm hoặc nhấn Alt+${idx + 1} để chọn diễn giả ${spk.name}`}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: spk.color }}
                    />
                    <span>{spk.name}</span>
                    {spk.role && (
                      <span className="text-[10px] opacity-70 font-normal">({spk.role})</span>
                    )}
                    <span className="text-[9px] font-mono opacity-60">
                      {spk.defaultLang === "ko-KR" ? "🇰🇷" : "🇺🇸"}
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setShowSpeakerModal(true)}
              className="px-2 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-[11px] font-semibold text-brand-gold flex items-center gap-1 shrink-0"
              title="Quản lý danh sách diễn giả & gán micro riêng cho từng người"
            >
              <Plus size={12} /> Quản lý
            </button>
          </div>

          {/* Row B: Broadcast Live Preview Box */}
          <div className="rounded-xl bg-zinc-950/80 border border-white/10 overflow-hidden flex flex-col shrink-0 shadow-lg">
            <div className="px-2.5 py-1 bg-zinc-900/60 border-b border-white/5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setIsPreviewCollapsed(!isPreviewCollapsed)}
                  className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-brand-gold transition-colors"
                  title={isPreviewCollapsed ? "Mở rộng Live Preview" : "Thu gọn Live Preview"}
                >
                  {isPreviewCollapsed ? <Maximize2 size={13} /> : <Minimize2 size={13} />}
                </button>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-300">
                  LIVE BROADCAST PREVIEW
                </span>
                <span className="text-[10px] font-mono text-zinc-500 hidden sm:inline">
                  [{config.displayMode} • {activeSpeaker.name}]
                </span>
              </div>

              {/* Aspect Ratio Toggle */}
              <div className="flex items-center gap-1 bg-zinc-950 p-0.5 rounded border border-white/5 text-[10px]">
                <button
                  onClick={() => {
                    setIsPreviewCollapsed(false);
                    setPreviewAspect("lower-third");
                  }}
                  className={`px-1.5 py-0.5 rounded font-mono ${
                    previewAspect === "lower-third" && !isPreviewCollapsed
                      ? "bg-brand-gold text-black font-bold"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Lower-Third (300px)
                </button>
                <button
                  onClick={() => {
                    setIsPreviewCollapsed(false);
                    setPreviewAspect("16:9");
                  }}
                  className={`px-1.5 py-0.5 rounded font-mono ${
                    previewAspect === "16:9" && !isPreviewCollapsed
                      ? "bg-brand-gold text-black font-bold"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Full 16:9
                </button>
                <button
                  onClick={() => {
                    setIsPreviewCollapsed(false);
                    setPreviewAspect("led-banner");
                  }}
                  className={`px-1.5 py-0.5 rounded font-mono ${
                    previewAspect === "led-banner" && !isPreviewCollapsed
                      ? "bg-brand-gold text-black font-bold"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  LED Banner
                </button>
              </div>
            </div>

            {!isPreviewCollapsed && (
              <div
                className={`relative w-full overflow-hidden transition-all duration-200 flex items-center justify-center ${
                  previewAspect === "16:9"
                    ? "h-36"
                    : previewAspect === "lower-third"
                    ? "h-28"
                    : "h-24"
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
            )}
          </div>

          {/* Row C: Pinned Stage Notification Bar */}
          <div className="rounded-xl bg-zinc-950/70 border border-white/10 px-2.5 py-1 flex items-center gap-2 shrink-0">
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
              className="px-2.5 py-1 rounded-lg bg-brand-gold hover:bg-brand-gold/90 text-black font-bold text-xs flex items-center gap-1 shrink-0 transition-colors"
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
          <div className="rounded-xl bg-zinc-950/70 border border-white/10 px-2.5 py-1 flex items-center gap-2 shrink-0 overflow-x-auto scrollbar-thin">
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

          {/* Row E: Transcript Log */}
          <div className="flex-1 min-h-[140px] rounded-xl bg-zinc-950/80 border border-white/10 flex flex-col overflow-hidden shadow-lg">
            <div className="px-3 py-1 bg-zinc-900/60 border-b border-white/5 flex items-center justify-between text-xs shrink-0">
              <span className="text-[11px] uppercase font-bold tracking-wider text-zinc-400">
                Live Transcript Feed ({history.length} lines)
              </span>
              <button
                onClick={() => {
                  setHistory([]);
                  fetch("/api/caption/sync", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ type: "CLEAR_HISTORY", session: sessionId }),
                  }).catch(() => {});
                }}
                className="text-[11px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1 transition-colors"
              >
                <Trash2 size={11} /> Clear Log
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5 scrollbar-thin">
              {history.length === 0 ? (
                <div className="h-full flex items-center justify-center text-zinc-600 text-xs italic">
                  Chưa có phụ đề. Bấm &quot;START CAPTION&quot; hoặc chọn câu Test mẫu ở trên.
                </div>
              ) : (
                history.map((item) => (
                  <div
                    key={item.id}
                    className="p-2 rounded-lg bg-zinc-900/60 border border-white/5 flex flex-col gap-0.5 text-xs"
                    style={{
                      borderLeftWidth: item.speakerColor ? "3px" : undefined,
                      borderLeftColor: item.speakerColor || undefined,
                    }}
                  >
                    <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                      <div className="flex items-center gap-2">
                        {item.speakerName && (
                          <span
                            className="font-bold px-1.5 py-0.2 rounded"
                            style={{
                              color: item.speakerColor || "#F59E0B",
                              backgroundColor: `${item.speakerColor || "#F59E0B"}1A`,
                            }}
                          >
                            🎙️ {item.speakerName}
                            {item.speakerRole ? ` (${item.speakerRole})` : ""}
                          </span>
                        )}
                        <span>{item.sourceLang.toUpperCase()} → VI</span>
                      </div>
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

        {/* RIGHT COLUMN: HIGH-DENSITY SETTINGS TABS (5 cols) */}
        <div className="col-span-12 lg:col-span-5 h-[580px] lg:h-full min-h-0 rounded-xl bg-zinc-950/90 border border-white/10 flex flex-col overflow-hidden shadow-2xl">
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

      {/* MULTI-SPEAKER MANAGEMENT MODAL */}
      {showSpeakerModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-white/15 rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <h2 className="text-sm font-bold text-brand-gold flex items-center gap-2">
                <Users size={16} /> Quản Lý Đa Diễn Giả & Gán Micro (Multi-Speaker Roster)
              </h2>
              <button
                onClick={() => setShowSpeakerModal(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-zinc-400">
              Thiết lập danh sách diễn giả cho phòng họp này. Mẹo: Dùng phím tắt{" "}
              <code className="text-brand-gold">Alt + 1..9</code> để chuyển nhanh người đang phát biểu trên sân khấu.
            </p>

            {/* Current Speakers List */}
            <div className="space-y-1.5">
              {speakers.map((spk, idx) => {
                const isSelected = activeSpeaker.id === spk.id;
                return (
                  <div
                    key={spk.id}
                    className={`p-2.5 rounded-xl border flex items-center justify-between ${
                      isSelected
                        ? "bg-zinc-800/90 border-brand-gold/50"
                        : "bg-zinc-950/60 border-white/5"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className="w-3.5 h-3.5 rounded-full shrink-0"
                        style={{ backgroundColor: spk.color }}
                      />
                      <div>
                        <div className="text-xs font-bold text-white flex items-center gap-2">
                          <span>{spk.name}</span>
                          {spk.role && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/10 text-zinc-300 font-normal">
                              {spk.role}
                            </span>
                          )}
                          <span className="text-[10px] font-mono text-zinc-400">
                            [Alt+{idx + 1}]
                          </span>
                        </div>
                        <div className="text-[10px] text-zinc-500">
                          Ngôn ngữ: {spk.defaultLang === "ko-KR" ? "🇰🇷 Tiếng Hàn" : "🇺🇸 Tiếng Anh"}
                          {spk.micDeviceId && spk.micDeviceId !== "default"
                            ? ` • Mic riêng đã gán`
                            : ""}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleSelectSpeaker(spk)}
                        className={`px-2.5 py-1 rounded text-xs font-semibold ${
                          isSelected
                            ? "bg-brand-gold text-black font-bold"
                            : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
                        }`}
                      >
                        {isSelected ? "Đang nói" : "Chọn"}
                      </button>
                      {speakers.length > 1 && (
                        <button
                          onClick={() => handleDeleteSpeaker(spk.id)}
                          className="p-1.5 rounded bg-zinc-800 hover:bg-red-900/60 text-zinc-400 hover:text-red-300"
                          title="Xóa diễn giả"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add New Speaker Form */}
            <div className="p-3 rounded-xl bg-zinc-950 border border-white/5 space-y-2.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-brand-gold flex items-center gap-1.5">
                <Plus size={13} /> Thêm Diễn Giả / Khách Mời Mới
              </span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-zinc-400 mb-0.5">Tên diễn giả</label>
                  <input
                    type="text"
                    value={newSpkName}
                    onChange={(e) => setNewSpkName(e.target.value)}
                    placeholder="e.g. Mr. Park Jin-ho"
                    className="w-full bg-zinc-900 border border-white/10 rounded px-2 py-1.5 text-xs text-zinc-200"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-400 mb-0.5">Chức danh / Vai trò</label>
                  <input
                    type="text"
                    value={newSpkRole}
                    onChange={(e) => setNewSpkRole(e.target.value)}
                    placeholder="e.g. CEO Samsung VN"
                    className="w-full bg-zinc-900 border border-white/10 rounded px-2 py-1.5 text-xs text-zinc-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] text-zinc-400 mb-0.5">Ngôn ngữ mặc định</label>
                  <select
                    value={newSpkLang}
                    onChange={(e) => setNewSpkLang(e.target.value as SourceLanguage)}
                    className="w-full bg-zinc-900 border border-white/10 rounded px-2 py-1.5 text-xs text-zinc-200"
                  >
                    <option value="ko-KR">🇰🇷 Tiếng Hàn</option>
                    <option value="en-US">🇺🇸 Tiếng Anh</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-400 mb-0.5">Màu thẻ tên LED</label>
                  <div className="flex items-center gap-1.5 pt-1">
                    {SPEAKER_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewSpkColor(c)}
                        className={`w-5 h-5 rounded-full border ${
                          newSpkColor === c ? "border-white scale-110" : "border-transparent opacity-70"
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-400 mb-0.5">Gán Micro (Tùy chọn)</label>
                  <select
                    value={newSpkMicId}
                    onChange={(e) => setNewSpkMicId(e.target.value)}
                    className="w-full bg-zinc-900 border border-white/10 rounded px-2 py-1.5 text-xs text-zinc-200"
                  >
                    <option value="default">Mặc định</option>
                    {audioDevices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || d.deviceId.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="button"
                disabled={!newSpkName.trim()}
                onClick={handleAddSpeaker}
                className="w-full py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-xs transition-colors"
              >
                + Thêm Vào Danh Sách Diễn Giả
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Setup Guide Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-white/15 rounded-2xl max-w-xl w-full p-5 shadow-2xl space-y-3 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <h2 className="text-sm font-bold text-brand-gold flex items-center gap-2">
                <Tv size={16} /> Hướng dẫn kết nối vMix, Đa Phòng & Màn hình LED Sân khấu
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
                <h4 className="font-bold text-xs text-brand-gold">
                  1. Tích hợp vào vMix (Nền trong suốt Alpha Channel)
                </h4>
                <ol className="list-decimal list-inside space-y-0.5 text-zinc-400 text-[11px]">
                  <li>Bấm nút <strong>&quot;Copy vMix URL&quot;</strong> ở thanh trên.</li>
                  <li>Trong vMix, bấm <strong>Add Input</strong> → chọn <strong>Web Browser</strong>.</li>
                  <li>Dán URL (<code>http://localhost:3000/caption/overlay?session=...</code>).</li>
                  <li>Đặt kích thước: <strong>1920×1080</strong> (hoặc 1920×300).</li>
                  <li>Gán vào <strong>Overlay 1 / 2</strong>. Phụ đề nổi trong suốt trên video.</li>
                </ol>
              </div>

              <div className="p-3 rounded-xl bg-zinc-950 border border-white/5 space-y-1">
                <h4 className="font-bold text-xs text-brand-gold">
                  2. Xuất ra Màn hình LED / Máy chiếu Sân khấu
                </h4>
                <ol className="list-decimal list-inside space-y-0.5 text-zinc-400 text-[11px]">
                  <li>Bấm <strong>&quot;LED Stage&quot;</strong> để mở cửa sổ nền đen tương phản cao.</li>
                  <li>Kéo cửa sổ sang màn hình LED thứ 2 (Extend Display) hoặc mở URL trên máy tính điều khiển LED trong cùng mạng LAN.</li>
                  <li>Di chuột lên góc phải màn LED để chỉnh nhanh cỡ chữ (+/-) hoặc chế độ hiển thị, nhấn <strong>F11</strong> hoặc nhấp đúp để toàn màn hình.</li>
                </ol>
              </div>

              <div className="p-3 rounded-xl bg-zinc-950 border border-white/5 space-y-1">
                <h4 className="font-bold text-xs text-brand-gold">
                  3. Đa Phòng (Multi-Room) & Đa Diễn Giả (Multi-Speaker)
                </h4>
                <p className="text-zinc-400 text-[11px]">
                  Mỗi phòng (<code>?session=hall-a</code>, <code>?session=hall-b</code>) hoạt động độc lập. Nhiều máy tính thu âm (Remote Mic Nodes) có thể cùng vào chung 1 phòng để đẩy phụ đề của từng diễn giả lên cùng một màn hình LED.
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

      {/* MULTI-SESSION / MULTI-ROOM MANAGEMENT MODAL */}
      {showSessionModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-white/15 rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <h2 className="text-sm font-bold text-brand-gold flex items-center gap-2">
                <Layers size={16} /> Quản Lý Đa Phòng & Thiết Bị Kết Nối (Multi-Room Hub)
              </h2>
              <button
                onClick={() => setShowSessionModal(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            {/* Active Connected Devices in Current Room */}
            <div className="p-3 rounded-xl bg-zinc-950 border border-white/5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <Wifi size={12} /> Thiết bị đang kết nối trong phòng ({Math.max(1, connectedDevices.length)})
                </span>
                <span className="text-[10px] font-mono text-zinc-500">ID: {sessionId}</span>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {connectedDevices.length === 0 ? (
                  <span className="text-[11px] text-zinc-400">Console hiện tại (Local)</span>
                ) : (
                  connectedDevices.map((d) => (
                    <span
                      key={d.deviceId}
                      className="px-2 py-0.5 rounded-md bg-zinc-900 border border-white/10 text-[10px] font-mono text-zinc-300 flex items-center gap-1"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      {d.deviceName}
                      {d.speakerName ? ` • ${d.speakerName}` : ""}
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* Presets List */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                Danh sách Phòng / Sân khấu:
              </span>
              <div className="space-y-1.5">
                {PRESET_SESSIONS.map((sess) => {
                  const isActive = sessionId === sess.id;
                  const liveMeta = activeRoomsList.find((r) => r.id === sess.id);
                  return (
                    <div
                      key={sess.id}
                      onClick={() => switchSession(sess.id, sess.name)}
                      className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                        isActive
                          ? "bg-brand-gold/15 border-brand-gold/50 text-white"
                          : "bg-zinc-950/60 border-white/5 text-zinc-300 hover:bg-zinc-800/60"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isActive ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"
                          }`}
                        />
                        <div>
                          <div className="font-bold text-xs flex items-center gap-2">
                            <span>{sess.name}</span>
                            {isActive && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-brand-gold/30 text-brand-gold font-mono uppercase">
                                Đang chọn
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-zinc-500 font-mono">
                            ID: ?session={sess.id} • {sess.desc}
                            {liveMeta
                              ? ` • ${liveMeta.captionCount || 0} câu • ${liveMeta.deviceCount || 0} thiết bị`
                              : ""}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          switchSession(sess.id, sess.name);
                        }}
                        className={`px-2.5 py-1 rounded text-xs font-semibold ${
                          isActive
                            ? "bg-brand-gold text-black font-bold"
                            : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
                        }`}
                      >
                        {isActive ? "Đang chạy" : "Chuyển tới"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Create Custom Session */}
            <div className="p-3 rounded-xl bg-zinc-950 border border-white/5 space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-brand-gold flex items-center gap-1.5">
                <Plus size={13} /> Tạo Phòng / Sân Khấu Mới
              </span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-zinc-400 mb-0.5">Mã Phòng (Session Slug)</label>
                  <input
                    type="text"
                    value={customSessionId}
                    onChange={(e) => setCustomSessionId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                    placeholder="e.g. stage-2, hall-c, room-101"
                    className="w-full bg-zinc-900 border border-white/10 rounded px-2 py-1.5 text-xs text-zinc-200"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-400 mb-0.5">Tên Hiển Thị (Display Name)</label>
                  <input
                    type="text"
                    value={customSessionName}
                    onChange={(e) => setCustomSessionName(e.target.value)}
                    placeholder="e.g. 🏢 Hall C (VIP Stage)"
                    className="w-full bg-zinc-900 border border-white/10 rounded px-2 py-1.5 text-xs text-zinc-200"
                  />
                </div>
              </div>
              <button
                type="button"
                disabled={!customSessionId.trim()}
                onClick={() => {
                  if (customSessionId.trim()) {
                    switchSession(customSessionId.trim(), customSessionName.trim() || customSessionId.trim());
                    setCustomSessionId("");
                    setCustomSessionName("");
                  }
                }}
                className="w-full py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-xs transition-colors"
              >
                + Khởi Tạo & Chuyển Tới Phòng Này
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EXPORT TRANSCRIPT MODAL (.TXT, .SRT, .VTT, .JSON) */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-white/15 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <h2 className="text-sm font-bold text-brand-gold flex items-center gap-2">
                <Download size={16} /> Xuất Dữ Liệu Phụ Đề Phiên Họp
              </h2>
              <button
                onClick={() => setShowExportModal(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-2.5 rounded-xl bg-zinc-950 border border-white/5 text-xs text-zinc-300 space-y-1">
              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                <span>Phòng / Phiên hiện tại:</span>
                <span className="font-bold text-brand-gold">{sessionName}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                <span>Tổng số câu thoại:</span>
                <span className="font-mono font-bold text-emerald-400">{history.length} câu</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => exportTranscript("txt")}
                className="p-3 rounded-xl bg-zinc-950 hover:bg-zinc-800 border border-white/10 flex flex-col items-center justify-center gap-1 transition-colors group cursor-pointer"
              >
                <FileText size={18} className="text-brand-gold group-hover:scale-110 transition-transform" />
                <span className="font-bold text-xs text-white">Văn Bản (.TXT)</span>
                <span className="text-[10px] text-zinc-500 text-center">Biên bản họp có tên diễn giả</span>
              </button>

              <button
                type="button"
                onClick={() => exportTranscript("srt")}
                className="p-3 rounded-xl bg-zinc-950 hover:bg-zinc-800 border border-white/10 flex flex-col items-center justify-center gap-1 transition-colors group cursor-pointer"
              >
                <Download size={18} className="text-emerald-400 group-hover:scale-110 transition-transform" />
                <span className="font-bold text-xs text-white">Phụ Đề (.SRT)</span>
                <span className="text-[10px] text-zinc-500 text-center">Premiere / DaVinci / CapCut</span>
              </button>

              <button
                type="button"
                onClick={() => exportTranscript("vtt")}
                className="p-3 rounded-xl bg-zinc-950 hover:bg-zinc-800 border border-white/10 flex flex-col items-center justify-center gap-1 transition-colors group cursor-pointer"
              >
                <Tv size={18} className="text-sky-400 group-hover:scale-110 transition-transform" />
                <span className="font-bold text-xs text-white">WebVTT (.VTT)</span>
                <span className="text-[10px] text-zinc-500 text-center">Chuẩn HTML5 & Voice Tag</span>
              </button>

              <button
                type="button"
                onClick={() => exportTranscript("json")}
                className="p-3 rounded-xl bg-zinc-950 hover:bg-zinc-800 border border-white/10 flex flex-col items-center justify-center gap-1 transition-colors group cursor-pointer"
              >
                <Layers size={18} className="text-purple-400 group-hover:scale-110 transition-transform" />
                <span className="font-bold text-xs text-white">Dữ Liệu (.JSON)</span>
                <span className="text-[10px] text-zinc-500 text-center">Lưu trữ & hậu kỳ AI</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
