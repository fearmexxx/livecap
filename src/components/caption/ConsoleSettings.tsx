"use client";

import React, { useState, useEffect } from "react";
import { CaptionConfig, GlossaryEntry, TranslationEngine, STTEngine } from "@/lib/caption/types";
import { requestTranslation } from "@/lib/caption/translateClient";
import { getStoredPin, setStoredPin } from "@/lib/caption/clientAuth";
import {
  Plus,
  Trash2,
  CheckCircle2,
  Zap,
  Volume2,
  Key,
  BookOpen,
  LayoutTemplate,
  AlertTriangle,
  Play,
  Square,
  Mic,
  Cpu,
  Radio,
  RefreshCw,
  Server,
  Sparkles,
} from "lucide-react";

interface Props {
  config: CaptionConfig;
  onChange: (patch: Partial<CaptionConfig>) => void;
  audioDevices?: MediaDeviceInfo[];
  selectedDevice?: string;
  onSelectDevice?: (deviceId: string) => void;
  audioLevel?: number;
  onRequestMicPermission?: () => void;
}

const Label = ({ children }: { children: React.ReactNode }) => (
  <label className="block text-[11px] uppercase tracking-wider text-zinc-400 font-semibold mb-1">
    {children}
  </label>
);

const selectCls =
  "w-full bg-zinc-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-brand-gold/60";

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <Label>{label}</Label>
        <span className="text-[11px] font-mono text-brand-gold font-bold">
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#c6a35a] cursor-pointer"
      />
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-lg overflow-hidden border border-white/10 bg-zinc-900 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 py-1 text-xs rounded transition-all ${
            value === o.value
              ? "bg-brand-gold text-black font-bold shadow"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function ConsoleSettings({
  config,
  onChange,
  audioDevices = [],
  selectedDevice = "default",
  onSelectDevice,
  audioLevel = 0,
  onRequestMicPermission,
}: Props) {
  const [activeTab, setActiveTab] = useState<"display" | "audio" | "api" | "glossary">("audio");

  // API test state
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testLatency, setTestLatency] = useState<number | null>(null);
  const [testEngine, setTestEngine] = useState<string | null>(null);

  // Server status: which API keys live in .env.local, and whether a room PIN is enforced
  const [serverKeys, setServerKeys] = useState<{ openrouter: boolean; openai: boolean; deepl: boolean } | null>(null);
  const [pinRequired, setPinRequired] = useState(false);
  const [roomPin, setRoomPin] = useState("");

  useEffect(() => {
    setRoomPin(getStoredPin());
    fetch("/api/caption/translate")
      .then((r) => r.json())
      .then((data) => {
        setServerKeys(data.serverKeys || null);
        setPinRequired(!!data.pinRequired);
      })
      .catch(() => {});
  }, []);

  // Audio 3s loopback recorder test
  const [isRecordingSample, setIsRecordingSample] = useState(false);
  const [sampleAudioUrl, setSampleAudioUrl] = useState<string | null>(null);

  // Glossary new entry
  const [newFrom, setNewFrom] = useState("");
  const [newTo, setNewTo] = useState("");

  // Local GPU state
  const [localGpuStatus, setLocalGpuStatus] = useState<"checking" | "online" | "offline">("checking");
  const [localGpuDetails, setLocalGpuDetails] = useState<any>(null);

  const checkLocalGpuStatus = async () => {
    setLocalGpuStatus("checking");
    try {
      const url = (config.localGpuUrl || "http://127.0.0.1:8000").replace(/\/$/, "");
      const res = await fetch(`${url}/health`);
      if (res.ok) {
        const data = await res.json();
        setLocalGpuStatus("online");
        setLocalGpuDetails(data.hardware);
      } else {
        setLocalGpuStatus("offline");
      }
    } catch {
      setLocalGpuStatus("offline");
    }
  };

  useEffect(() => {
    checkLocalGpuStatus();
  }, [config.localGpuUrl]);
  const currentDeviceObj = audioDevices.find((d) => d.deviceId === selectedDevice);
  const selectedLabel = currentDeviceObj?.label || selectedDevice;
  const isBluetoothOrComm =
    selectedLabel.toLowerCase().includes("headset") ||
    selectedLabel.toLowerCase().includes("bluetooth") ||
    selectedLabel.toLowerCase().includes("robot") ||
    selectedLabel.toLowerCase().includes("communication");

  const addGlossary = () => {
    if (!newFrom.trim() || !newTo.trim()) return;
    const next: GlossaryEntry[] = [
      ...config.customGlossary,
      { from: newFrom.trim(), to: newTo.trim() },
    ];
    onChange({ customGlossary: next });
    setNewFrom("");
    setNewTo("");
  };

  const handleRecordSample = async () => {
    try {
      setIsRecordingSample(true);
      setSampleAudioUrl(null);
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: true,
      };
      if (selectedDevice && selectedDevice !== "default") {
        audioConstraints.deviceId = { ideal: selectedDevice };
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setSampleAudioUrl(url);
        setIsRecordingSample(false);

        // Auto play loopback
        const audio = new Audio(url);
        audio.play();
      };

      recorder.start();
      setTimeout(() => {
        if (recorder.state === "recording") {
          recorder.stop();
        }
        stream.getTracks().forEach((t) => t.stop());
      }, 3000);
    } catch (err: any) {
      alert("Microphone Error: " + err.message);
      setIsRecordingSample(false);
    }
  };

  const handleTestApi = async () => {
    setTestStatus("testing");
    setTestResult(null);
    const start = Date.now();
    const result = await requestTranslation(config, "안녕하세요, 실시간 번역 테스트입니다.", "ko", { glossary: [] });
    setTestLatency(Date.now() - start);
    setTestEngine(result.engine || null);
    if (result.failed) {
      setTestStatus("error");
      setTestResult(result.message || "Translation failed");
    } else {
      setTestStatus("success");
      setTestResult(result.fallback ? `${result.text}  (⚠ ${result.message})` : result.text);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden select-none">
      {/* Tab Navigation Header */}
      <div className="flex border-b border-white/10 bg-zinc-950/70 p-1 gap-1 shrink-0">
        <button
          onClick={() => setActiveTab("audio")}
          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            activeTab === "audio"
              ? "bg-brand-gold text-black shadow"
              : "text-zinc-400 hover:text-white hover:bg-zinc-900"
          }`}
        >
          <Volume2 size={13} /> Audio & Mic
        </button>
        <button
          onClick={() => setActiveTab("display")}
          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            activeTab === "display"
              ? "bg-brand-gold text-black shadow"
              : "text-zinc-400 hover:text-white hover:bg-zinc-900"
          }`}
        >
          <LayoutTemplate size={13} /> Display
        </button>
        <button
          onClick={() => setActiveTab("api")}
          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            activeTab === "api"
              ? "bg-brand-gold text-black shadow"
              : "text-zinc-400 hover:text-white hover:bg-zinc-900"
          }`}
        >
          <Key size={13} /> API & AI
        </button>
        <button
          onClick={() => setActiveTab("glossary")}
          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            activeTab === "glossary"
              ? "bg-brand-gold text-black shadow"
              : "text-zinc-400 hover:text-white hover:bg-zinc-900"
          }`}
        >
          <BookOpen size={13} /> Glossary
        </button>
      </div>

      {/* Tab Contents: Scrollable container */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3.5 pr-1.5 scrollbar-thin scrollbar-thumb-zinc-700">
        {/* TAB 1: AUDIO & HARDWARE CONFIG */}
        {activeTab === "audio" && (
          <div className="space-y-3.5">
            <div className="p-3 rounded-xl bg-zinc-900/60 border border-white/5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-brand-gold flex items-center gap-1">
                  <Volume2 size={13} /> Chọn Micro Thu Âm
                </span>
                <span
                  className={`text-[10px] font-mono tabular-nums w-24 shrink-0 text-center px-2 py-0.5 rounded-full font-bold border ${
                    audioLevel > 5
                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                      : "bg-zinc-800 text-zinc-500 border-transparent"
                  }`}
                >
                  {audioLevel > 5 ? `Signal: ${audioLevel}%` : "No Signal"}
                </span>
              </div>

              <div>
                <Label>Thiết bị đầu vào (Microphone / Sound Mixer)</Label>
                <select
                  value={selectedDevice}
                  onChange={(e) => onSelectDevice?.(e.target.value)}
                  className={selectCls}
                >
                  <option value="default">Default System Microphone / Sound Mixer</option>
                  {audioDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Audio Device (${d.deviceId.slice(0, 8)}...)`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label>Động Cơ Nhận Diện Giọng Nói (STT Engine)</Label>
                  {config.sttEngine === "local-gpu" && (
                    <span className="text-[10px] font-mono text-emerald-400 font-bold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      {localGpuStatus === "online" ? "GPU Active" : "GPU Offline"}
                    </span>
                  )}
                </div>
                <select
                  value={config.sttEngine || "webspeech"}
                  onChange={(e) => onChange({ sttEngine: e.target.value as STTEngine })}
                  className={selectCls}
                >
                  <option value="webspeech">🌐 Web Speech API (Chrome / Edge Built-in, Realtime, Miễn phí)</option>
                  <option value="openrouter">☁️ OpenRouter API (openai/gpt-transcribe Cloud AI)</option>
                  <option value="local-gpu">⚡ Local GPU Hardware (Intel Arc A750 / NVIDIA / CPU Offline)</option>
                </select>
              </div>

              {/* Live VU Meter */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <Label>Âm Lượng Thu Thực Tế (VU Meter)</Label>
                  <span className="text-[11px] font-mono tabular-nums text-zinc-200 font-bold w-10 text-right">
                    {audioLevel}%
                  </span>
                </div>
                <div className="w-full h-3.5 bg-zinc-950 rounded-full overflow-hidden border border-white/10 p-0.5">
                  <div
                    className={`h-full rounded-full transition-all duration-75 ${
                      audioLevel > 75
                        ? "bg-red-500"
                        : audioLevel > 45
                        ? "bg-amber-400"
                        : "bg-emerald-500"
                    }`}
                    style={{ width: `${Math.min(100, audioLevel)}%` }}
                  />
                </div>
              </div>

              {/* Software Gain Boost */}
              <Slider
                label="Khuếch Đại Âm Lượng (Gain Booster)"
                value={config.audioGain || 1.5}
                min={1}
                max={4}
                step={0.1}
                unit="x"
                onChange={(v) => onChange({ audioGain: v })}
              />

              {/* 3-Second Audio Test & Playback Loopback */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={handleRecordSample}
                  disabled={isRecordingSample}
                  className={`w-full py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-md ${
                    isRecordingSample
                      ? "bg-red-600 text-white animate-pulse"
                      : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/10"
                  }`}
                >
                  {isRecordingSample ? (
                    <>
                      <Square size={13} className="fill-white" /> Đang thu âm 3s... Hãy nói vào mic!
                    </>
                  ) : (
                    <>
                      <Mic size={13} className="text-brand-gold" /> 🎙️ Thu âm thử 3 giây & Tự phát lại
                    </>
                  )}
                </button>
                {sampleAudioUrl && !isRecordingSample && (
                  <p className="text-[10px] text-emerald-400 text-center mt-1 flex items-center justify-center gap-1">
                    <CheckCircle2 size={12} /> Đã phát lại giọng nói của bạn qua loa/tai nghe!
                  </p>
                )}
              </div>
            </div>

            {/* CRUCIAL WINDOWS BLUETOOTH / COMMUNICATIONS WARNING BANNER */}
            {isBluetoothOrComm && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2 text-xs">
                <div className="flex items-center gap-2 text-amber-400 font-bold">
                  <AlertTriangle size={15} className="shrink-0" />
                  <span>Cần chỉnh Windows Sound cho tai nghe ROBOT RB510</span>
                </div>
                <div className="text-zinc-300 text-[11px] leading-relaxed space-y-1.5">
                  <p>
                    Trong ảnh chụp Windows Settings của bạn, tai nghe <strong>ROBOT RB510</strong> đang được Windows gán là <em>&quot;Is default for communications&quot;</em>, trong khi trình duyệt Chrome và Web Speech API lại chỉ nghe từ thiết bị <strong>Default Sound Device</strong> (hiện đang là Steam Streaming Microphone).
                  </p>
                  <div className="p-2 rounded-lg bg-black/40 border border-white/5 space-y-1">
                    <p className="font-bold text-amber-300">👉 2 bước để thu âm nhận diện ngay lập tức:</p>
                    <p>
                      <strong>Cách 1 (Khuyên dùng trong Windows):</strong> Vào <strong>Windows Settings &gt; System &gt; Sound &gt; Properties (ROBOT RB510)</strong> $\rightarrow$ Ở mục <strong>&quot;Set as default sound device&quot;</strong>, bấm chọn <strong>&quot;Use as default for all audio&quot;</strong> (thay vì chỉ communications).
                    </p>
                    <p>
                      <strong>Cách 2 (Trong trình duyệt Chrome):</strong> Bấm vào biểu tượng <strong>Ổ khóa / Cài đặt</strong> ở đầu thanh địa chỉ <code>localhost:3000</code> $\rightarrow$ Chọn <strong>Microphone</strong> $\rightarrow$ Chọn đích danh <strong>Headset (ROBOT RB510)</strong>.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* General Microphone Permission Refresh */}
            {onRequestMicPermission && (
              <button
                type="button"
                onClick={onRequestMicPermission}
                className="w-full py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-[11px] font-semibold text-zinc-400 hover:text-white border border-white/5 flex items-center justify-center gap-1 transition-colors"
              >
                Làm mới danh sách Micro
              </button>
            )}
          </div>
        )}

        {/* TAB 2: DISPLAY & STYLING */}
        {activeTab === "display" && (
          <div className="space-y-4">
            <div>
              <Label>Display Mode</Label>
              <Segmented
                value={config.displayMode}
                onChange={(v) => onChange({ displayMode: v })}
                options={[
                  { value: "bilingual", label: "Song ngữ" },
                  { value: "vietnamese-only", label: "Tiếng Việt" },
                  { value: "rolling-ledger", label: "LED Wall" },
                ]}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Vertical</Label>
                <Segmented
                  value={config.position}
                  onChange={(v) => onChange({ position: v })}
                  options={[
                    { value: "top", label: "Top" },
                    { value: "center", label: "Center" },
                    { value: "bottom", label: "Bottom" },
                  ]}
                />
              </div>
              <div>
                <Label>Alignment</Label>
                <Segmented
                  value={config.alignment}
                  onChange={(v) => onChange({ alignment: v })}
                  options={[
                    { value: "left", label: "Left" },
                    { value: "center", label: "Center" },
                    { value: "right", label: "Right" },
                  ]}
                />
              </div>
            </div>

            <div className="p-3 rounded-xl bg-zinc-900/60 border border-white/5 space-y-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-brand-gold">
                Typography & Stroke
              </span>

              <Slider
                label="Vietnamese Font Size"
                value={config.fontSize}
                min={18}
                max={120}
                unit="px"
                onChange={(v) => onChange({ fontSize: v })}
              />

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Font Family</Label>
                  <select
                    className={selectCls}
                    value={config.fontFamily}
                    onChange={(e) => onChange({ fontFamily: e.target.value })}
                  >
                    <option value="'Roboto', sans-serif">Roboto (Khuyên dùng cho Tiếng Việt)</option>
                    <option value="Outfit, sans-serif">Outfit</option>
                    <option value="Arial, Helvetica, sans-serif">Arial</option>
                    <option value="'Segoe UI', Tahoma, sans-serif">Segoe UI</option>
                    <option value="'Times New Roman', serif">Serif</option>
                  </select>
                </div>
                <div>
                  <Label>Font Weight</Label>
                  <select
                    className={selectCls}
                    value={config.fontWeight}
                    onChange={(e) =>
                      onChange({ fontWeight: e.target.value as CaptionConfig["fontWeight"] })
                    }
                  >
                    <option value="400">Regular</option>
                    <option value="600">Semi-Bold</option>
                    <option value="700">Bold</option>
                    <option value="800">Extra-Bold</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Vietnamese Color</Label>
                  <div className="flex items-center gap-2 bg-zinc-900 border border-white/10 rounded-lg p-1.5">
                    <input
                      type="color"
                      value={config.vietnameseColor}
                      onChange={(e) => onChange({ vietnameseColor: e.target.value })}
                      className="w-7 h-6 rounded bg-transparent cursor-pointer"
                    />
                    <span className="text-[11px] font-mono text-zinc-300 uppercase">
                      {config.vietnameseColor}
                    </span>
                  </div>
                </div>
                <div>
                  <Label>Original Text Color</Label>
                  <div className="flex items-center gap-2 bg-zinc-900 border border-white/10 rounded-lg p-1.5">
                    <input
                      type="color"
                      value={config.originalColor}
                      onChange={(e) => onChange({ originalColor: e.target.value })}
                      className="w-7 h-6 rounded bg-transparent cursor-pointer"
                    />
                    <span className="text-[11px] font-mono text-zinc-300 uppercase">
                      {config.originalColor}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <Label>Black Stroke Outline (Legibility on Video)</Label>
                <Segmented
                  value={config.textStroke}
                  onChange={(v) => onChange({ textStroke: v })}
                  options={[
                    { value: "none", label: "None" },
                    { value: "sm", label: "1px" },
                    { value: "md", label: "2px" },
                    { value: "lg", label: "3px" },
                    { value: "xl", label: "4px" },
                  ]}
                />
              </div>
            </div>

            <div className="p-3 rounded-xl bg-zinc-900/60 border border-white/5 space-y-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-brand-gold">
                Background & Transparency
              </span>

              <div>
                <Label>Background Type</Label>
                <select
                  className={selectCls}
                  value={config.bgStyle}
                  onChange={(e) => onChange({ bgStyle: e.target.value as CaptionConfig["bgStyle"] })}
                >
                  <option value="transparent">Transparent (vMix Alpha Channel)</option>
                  <option value="black-box">Solid Black (Stage LED / Projector)</option>
                  <option value="frosted-glass">Frosted Glass Blur</option>
                  <option value="chroma-green">Chroma Key Green #00FF00</option>
                  <option value="chroma-blue">Chroma Key Blue #0000FF</option>
                  <option value="chroma-magenta">Chroma Key Magenta #FF00FF</option>
                </select>
              </div>

              <Slider
                label="Box / Backdrop Opacity"
                value={config.bgOpacity}
                min={0}
                max={100}
                unit="%"
                onChange={(v) => onChange({ bgOpacity: v })}
              />

              <div className="grid grid-cols-2 gap-2">
                <Slider
                  label="Pad X"
                  value={config.boxPaddingX}
                  min={0}
                  max={60}
                  unit="px"
                  onChange={(v) => onChange({ boxPaddingX: v })}
                />
                <Slider
                  label="Pad Y"
                  value={config.boxPaddingY}
                  min={0}
                  max={40}
                  unit="px"
                  onChange={(v) => onChange({ boxPaddingY: v })}
                />
              </div>
            </div>

            <div className="space-y-3">
              <Slider
                label="Auto-clear after silence (0 = never)"
                value={config.autoClearSec}
                min={0}
                max={20}
                unit="s"
                onChange={(v) => onChange({ autoClearSec: v })}
              />

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-900 border border-white/5">
                <label className="text-xs text-zinc-300 font-medium cursor-pointer flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={config.showSpeakerBadge}
                    onChange={(e) => onChange({ showSpeakerBadge: e.target.checked })}
                    className="accent-[#c6a35a]"
                  />
                  Show Speaker Badge
                </label>
                <input
                  type="text"
                  value={config.speakerLabel}
                  onChange={(e) => onChange({ speakerLabel: e.target.value })}
                  placeholder="e.g. Diễn giả"
                  className="bg-zinc-800 border border-white/10 rounded px-2 py-1 text-xs text-zinc-200 w-28 text-right focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: API & TRANSLATION ENGINE */}
        {activeTab === "api" && (
          <div className="space-y-4">
            {/* ROOM PIN & SERVER KEY STATUS */}
            <div className="p-3 rounded-xl bg-zinc-900/60 border border-white/5 space-y-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-brand-gold flex items-center gap-1.5">
                <Key size={14} /> Room PIN & Server Keys
              </span>
              <div>
                <Label>Room PIN {pinRequired ? "(required by this server)" : "(not enabled on this server)"}</Label>
                <input
                  type="password"
                  value={roomPin}
                  onChange={(e) => {
                    setRoomPin(e.target.value);
                    setStoredPin(e.target.value);
                  }}
                  placeholder={pinRequired ? "Enter LIVECAP_PIN" : "Only needed when LIVECAP_PIN is set"}
                  className={selectCls}
                />
                <p className="text-[10px] text-zinc-500 mt-1">
                  Saved only in this browser. Required for any PC that sends captions to a server started with
                  LIVECAP_PIN. Output screens (LED / vMix / OBS) only read and never need it.
                </p>
              </div>
              <div className="text-[11px] text-zinc-400 space-y-0.5">
                <div>
                  Server .env.local keys:{" "}
                  {serverKeys
                    ? (["openrouter", "deepl", "openai"] as const)
                        .map((k) => `${k} ${serverKeys[k] ? "✓" : "–"}`)
                        .join(" · ")
                    : "checking…"}
                </div>
                <div className="text-zinc-500">
                  Keys in .env.local never leave this PC. Keys typed below are stored in this browser only and are no
                  longer sent to output screens or other devices.
                </div>
              </div>
            </div>

            {/* SPEECH-TO-TEXT ENGINE SELECTION */}
            <div className="p-3 rounded-xl bg-zinc-900/60 border border-white/5 space-y-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-brand-gold flex items-center gap-1.5">
                <Mic size={14} /> Động Cơ Nhận Diện Giọng Nói (STT Engine)
              </span>

              <div>
                <Label>Công Nghệ STT Hoạt Động</Label>
                <select
                  className={selectCls}
                  value={config.sttEngine || "webspeech"}
                  onChange={(e) => onChange({ sttEngine: e.target.value as STTEngine })}
                >
                  <option value="webspeech">🌐 Web Speech API (Google Chrome / Edge Built-in, Free)</option>
                  <option value="openrouter">☁️ OpenRouter API (openai/gpt-transcribe - Cloud STT)</option>
                  <option value="local-gpu">⚡ Local Hardware GPU (Intel Arc A750 / NVIDIA / CPU Offline)</option>
                </select>
              </div>

              {config.sttEngine === "webspeech" && (
                <div className="p-2.5 rounded-lg bg-blue-950/40 border border-blue-800/40 text-xs text-blue-300">
                  Sử dụng công nghệ Web Speech Recognition tích hợp sẵn trên Chrome và Microsoft Edge. Tốc độ nhận diện thời gian thực, không tốn chi phí API.
                </div>
              )}

              {config.sttEngine === "openrouter" && (
                <div className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-800/40 text-xs text-amber-300">
                  Truyền âm thanh trực tiếp đến OpenRouter Speech-to-Text API với mô hình <b>openai/gpt-transcribe</b>. Độ chính xác phiên âm tiếng Hàn/tiếng Anh cực cao.
                </div>
              )}

              {config.sttEngine === "local-gpu" && (
                <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800/40 text-xs text-emerald-300">
                  Sử dụng phần cứng máy chủ cục bộ (Card đồ họa rời <b>Intel Arc A750 / NVIDIA CUDA</b> hoặc CPU đa nhân) qua Whisper AI hoàn toàn offline, độ trễ cực thấp.
                </div>
              )}
            </div>

            {/* OPENROUTER API CONFIGURATION */}
            <div className="p-3 rounded-xl bg-zinc-900/60 border border-white/5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <Sparkles size={14} /> OpenRouter API (openai/gpt-transcribe)
                </span>
                <a
                  href="https://openrouter.ai/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-zinc-400 hover:text-brand-gold underline"
                >
                  Lấy API Key ↗
                </a>
              </div>

              <div>
                <Label>OpenRouter API Key (sk-or-v1-...)</Label>
                <input
                  type="password"
                  value={config.openrouterApiKey || ""}
                  onChange={(e) => onChange({ openrouterApiKey: e.target.value })}
                  placeholder="sk-or-v1-xxxxxxxx..."
                  className={selectCls}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>STT Model</Label>
                  <input
                    type="text"
                    value={config.openrouterModel || "openai/gpt-transcribe"}
                    onChange={(e) => onChange({ openrouterModel: e.target.value })}
                    placeholder="openai/gpt-transcribe"
                    className={selectCls}
                  />
                </div>
                <div>
                  <Label>LLM Dịch Thuật</Label>
                  <select
                    className={selectCls}
                    value={config.openrouterTranslateModel || "google/gemini-2.5-flash"}
                    onChange={(e) => onChange({ openrouterTranslateModel: e.target.value })}
                  >
                    <option value="google/gemini-2.5-flash">Gemini 2.5 Flash (Nhanh & Tốt)</option>
                    <option value="openai/gpt-4o-mini">GPT-4o Mini</option>
                    <option value="deepseek/deepseek-chat">DeepSeek V3</option>
                    <option value="anthropic/claude-3.5-haiku">Claude 3.5 Haiku</option>
                  </select>
                </div>
              </div>
            </div>

            {/* LOCAL HARDWARE ACCELERATION CARD (NVIDIA & INTEL ARC) */}
            <div className="p-3 rounded-xl bg-zinc-900/60 border border-white/5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <Cpu size={14} /> Local GPU Server (NVIDIA & INTEL Arc)
                </span>
                <button
                  type="button"
                  onClick={checkLocalGpuStatus}
                  className="text-[10px] text-zinc-400 hover:text-emerald-400 flex items-center gap-1 transition-colors"
                >
                  <RefreshCw size={10} className={localGpuStatus === "checking" ? "animate-spin" : ""} />
                  Làm Mới
                </button>
              </div>

              {/* Status Banner */}
              <div
                className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${
                  localGpuStatus === "online"
                    ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
                    : localGpuStatus === "checking"
                    ? "bg-zinc-900 border-zinc-700 text-zinc-400"
                    : "bg-red-950/40 border-red-500/40 text-red-300"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      localGpuStatus === "online"
                        ? "bg-emerald-400 animate-pulse"
                        : localGpuStatus === "checking"
                        ? "bg-amber-400"
                        : "bg-red-500"
                    }`}
                  />
                  <div>
                    <div className="font-bold">
                      {localGpuStatus === "online"
                        ? `Máy chủ GPU Sẵn Sàng`
                        : localGpuStatus === "checking"
                        ? "Đang kiểm tra kết nối..."
                        : "Không tìm thấy máy chủ GPU"}
                    </div>
                    <div className="text-[10px] opacity-80">
                      {localGpuStatus === "online"
                        ? (localGpuDetails?.active_device_name || "Phần cứng được tăng tốc")
                        : "Khởi động tệp run_local_gpu_server.bat trong thư mục LiveCap"}
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/40">
                  :8000
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Server URL</Label>
                  <input
                    type="text"
                    value={config.localGpuUrl || "http://127.0.0.1:8000"}
                    onChange={(e) => onChange({ localGpuUrl: e.target.value })}
                    className={selectCls}
                  />
                </div>
                <div>
                  <Label>Mô Hình Whisper</Label>
                  <select
                    className={selectCls}
                    value={config.localGpuModel || "base"}
                    onChange={(e) => onChange({ localGpuModel: e.target.value })}
                  >
                    <option value="tiny">Tiny (~39M - Cực nhanh ~40ms)</option>
                    <option value="base">Base (~74M - Khuyên dùng ~90ms)</option>
                    <option value="small">Small (~244M - Rất chính xác)</option>
                  </select>
                </div>
              </div>

              <Slider
                label="Độ dài tối đa mỗi đoạn (tự cắt sớm khi diễn giả ngừng nói)"
                value={config.sttChunkIntervalSec || 8}
                min={4}
                max={15}
                step={1}
                unit="s"
                onChange={(v) => onChange({ sttChunkIntervalSec: v })}
              />
            </div>

            {/* TRANSLATION ENGINE SELECTION */}
            <div className="p-3 rounded-xl bg-zinc-900/60 border border-white/5 space-y-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-brand-gold flex items-center gap-1.5">
                <Zap size={14} /> Translation Engine Selection
              </span>

              <div>
                <Label>Active Translation Provider</Label>
                <select
                  className={selectCls}
                  value={config.translationEngine || "auto"}
                  onChange={(e) =>
                    onChange({ translationEngine: e.target.value as TranslationEngine })
                  }
                >
                  <option value="auto">
                    ⭐ Auto (Recommended: OpenRouter LLM if a key exists, else DeepL, else free Google)
                  </option>
                  <option value="google-free">
                    🟢 Google Neural Translate (Built-in Free, Multi-mirror Fallback, ~150ms)
                  </option>
                  <option value="openrouter">
                    🟠 OpenRouter LLM Translation (Gemini 2.5 Flash / GPT-4o-mini / DeepSeek)
                  </option>
                  <option value="openai">
                    🟣 OpenAI API (GPT-4o-mini / Custom API Key)
                  </option>
                  <option value="deepl">
                    🔷 DeepL Translation API (DeepL Auth Key)
                  </option>
                </select>
              </div>

              <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800/40 text-xs text-emerald-300 flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                <span>
                  {config.translationEngine === "openrouter"
                    ? "OpenRouter Engine selected. Using your OpenRouter API Key configured above."
                    : config.translationEngine === "openai"
                    ? "OpenAI Engine selected. Provide your API Key below."
                    : config.translationEngine === "deepl"
                    ? "DeepL Engine selected. Provide your Auth Key below."
                    : config.translationEngine === "google-free"
                    ? "Free Google mirrors only. No SLA: may be rate-limited during long events. The console warns you if translation fails."
                    : "Auto: uses the best engine with a key (from this browser or the server's .env.local) and falls back to free Google if it fails. The console warns you on fallback."}
                </span>
              </div>
            </div>

            {config.translationEngine === "openai" && (
              <div className="p-3 rounded-xl bg-zinc-900/60 border border-white/5 space-y-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-purple-400">
                  OpenAI Configuration
                </span>
                <div>
                  <Label>OpenAI API Key (sk-...)</Label>
                  <input
                    type="password"
                    value={config.openaiApiKey || ""}
                    onChange={(e) => onChange({ openaiApiKey: e.target.value })}
                    placeholder="sk-proj-..."
                    className={selectCls}
                  />
                </div>
                <div>
                  <Label>Model</Label>
                  <select
                    className={selectCls}
                    value={config.openaiModel || "gpt-4o-mini"}
                    onChange={(e) => onChange({ openaiModel: e.target.value })}
                  >
                    <option value="gpt-4o-mini">gpt-4o-mini (Recommended - Low Latency)</option>
                    <option value="gpt-4o">gpt-4o (High Intelligence)</option>
                  </select>
                </div>
              </div>
            )}

            {config.translationEngine === "deepl" && (
              <div className="p-3 rounded-xl bg-zinc-900/60 border border-white/5 space-y-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400">
                  DeepL Configuration
                </span>
                <div>
                  <Label>DeepL Auth Key</Label>
                  <input
                    type="password"
                    value={config.deeplApiKey || ""}
                    onChange={(e) => onChange({ deeplApiKey: e.target.value })}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:fx"
                    className={selectCls}
                  />
                </div>
              </div>
            )}

            {/* Interactive Test Button */}
            <div className="p-3 rounded-xl bg-zinc-900/60 border border-white/5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-300">
                  Live API Connection Test
                </span>
                <button
                  type="button"
                  onClick={handleTestApi}
                  disabled={testStatus === "testing"}
                  className="px-3 py-1 rounded-lg bg-brand-gold hover:bg-brand-gold/90 text-black font-bold text-xs flex items-center gap-1 transition-all"
                >
                  <Zap size={12} /> {testStatus === "testing" ? "Testing..." : "Test Translation"}
                </button>
              </div>

              {testStatus === "success" && (
                <div className="p-2.5 rounded-lg bg-zinc-950 border border-emerald-500/40 text-xs space-y-1">
                  <div className="flex items-center justify-between text-emerald-400 font-mono text-[10px]">
                    <span>✓ Connection OK{testEngine ? ` · engine: ${testEngine}` : ""}</span>
                    <span>Latency: {testLatency}ms</span>
                  </div>
                  <div className="text-zinc-400 text-[11px]">
                    Input: &quot;안녕하세요, 실시간 번역 테스트입니다.&quot;
                  </div>
                  <div className="text-zinc-100 font-semibold">{testResult}</div>
                </div>
              )}

              {testStatus === "error" && (
                <div className="p-2.5 rounded-lg bg-red-950/60 border border-red-500/40 text-xs text-red-300 space-y-1">
                  <div className="font-bold">✕ Error</div>
                  <div className="text-[11px]">{testResult}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: GLOSSARY DICTIONARY */}
        {activeTab === "glossary" && (
          <div className="space-y-3">
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Tự động thay thế tên diễn giả, thương hiệu, hoặc thuật ngữ chuyên môn ngay khi dịch sang tiếng Việt.
            </p>

            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
              {config.customGlossary.map((g, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 text-xs bg-zinc-900 border border-white/5 rounded-lg px-2.5 py-1.5"
                >
                  <span className="flex-1 truncate text-zinc-300 font-mono">{g.from}</span>
                  <span className="text-zinc-600 font-bold">→</span>
                  <span className="flex-1 truncate text-brand-gold font-semibold">{g.to}</span>
                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        customGlossary: config.customGlossary.filter((_, j) => j !== i),
                      })
                    }
                    className="text-zinc-500 hover:text-red-400 p-1"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-1.5 pt-1">
              <input
                className={selectCls}
                placeholder="Từ gốc / Tên VIP"
                value={newFrom}
                onChange={(e) => setNewFrom(e.target.value)}
              />
              <input
                className={selectCls}
                placeholder="Dịch sang tiếng Việt"
                value={newTo}
                onChange={(e) => setNewTo(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addGlossary()}
              />
              <button
                type="button"
                onClick={addGlossary}
                className="px-3 rounded-lg bg-brand-gold text-black font-bold flex items-center justify-center shrink-0"
              >
                <Plus size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
