"use client";

import React, { useState } from "react";
import { CaptionConfig, GlossaryEntry, TranslationEngine } from "@/lib/caption/types";
import { Plus, Trash2, CheckCircle2, Zap, Sliders, Volume2, Key, BookOpen, LayoutTemplate } from "lucide-react";

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
  const [activeTab, setActiveTab] = useState<"display" | "audio" | "api" | "glossary">("display");

  // API test state
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testLatency, setTestLatency] = useState<number | null>(null);

  // Glossary new entry
  const [newFrom, setNewFrom] = useState("");
  const [newTo, setNewTo] = useState("");

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

  const handleTestApi = async () => {
    setTestStatus("testing");
    setTestResult(null);
    const start = Date.now();
    try {
      const res = await fetch("/api/caption/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "안녕하세요, 실시간 번역 테스트입니다.",
          sourceLang: "ko",
          targetLang: "vi",
          engine: config.translationEngine || "google-free",
          openaiApiKey: config.openaiApiKey,
          openaiModel: config.openaiModel,
          deeplApiKey: config.deeplApiKey,
        }),
      });

      const data = await res.json();
      const latency = Date.now() - start;
      if (data.translatedText) {
        setTestStatus("success");
        setTestResult(data.translatedText);
        setTestLatency(latency);
      } else {
        setTestStatus("error");
        setTestResult(data.error || "Translation returned empty string");
      }
    } catch (err: any) {
      setTestStatus("error");
      setTestResult(err.message || "Failed to reach translation endpoint");
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden select-none">
      {/* Tab Navigation Header */}
      <div className="flex border-b border-white/10 bg-zinc-950/70 p-1 gap-1 shrink-0">
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
          onClick={() => setActiveTab("audio")}
          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            activeTab === "audio"
              ? "bg-brand-gold text-black shadow"
              : "text-zinc-400 hover:text-white hover:bg-zinc-900"
          }`}
        >
          <Volume2 size={13} /> Audio
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
      <div className="flex-1 overflow-y-auto p-3 space-y-4 pr-1.5 scrollbar-thin scrollbar-thumb-zinc-700">
        {/* TAB 1: DISPLAY & STYLING */}
        {activeTab === "display" && (
          <div className="space-y-4">
            {/* Display Mode */}
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

            {/* Position & Alignment */}
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

            {/* Typography */}
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
                    <option value="Outfit, sans-serif">Outfit (Default)</option>
                    <option value="Arial, Helvetica, sans-serif">Arial</option>
                    <option value="'Segoe UI', Tahoma, sans-serif">Segoe UI</option>
                    <option value="Roboto, sans-serif">Roboto</option>
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

            {/* Background Style */}
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

            {/* Auto-clear & Speaker badge */}
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

        {/* TAB 2: AUDIO & HARDWARE CONFIG */}
        {activeTab === "audio" && (
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-zinc-900/60 border border-white/5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-brand-gold">
                  Audio Input Source
                </span>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                    audioLevel > 5
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                      : "bg-zinc-800 text-zinc-500"
                  }`}
                >
                  {audioLevel > 5 ? "Audio Signal Active" : "No Signal Detected"}
                </span>
              </div>

              <div>
                <Label>Select Microphone / Mixer Line-In</Label>
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

              {/* Live VU Meter */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <Label>Input Level (VU Meter)</Label>
                  <span className="text-[11px] font-mono text-zinc-300 font-bold">{audioLevel}%</span>
                </div>
                <div className="w-full h-3 bg-zinc-950 rounded-full overflow-hidden border border-white/10 p-0.5">
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
                label="Software Gain Booster (Amplifier)"
                value={config.audioGain || 1.5}
                min={1}
                max={4}
                step={0.1}
                unit="x"
                onChange={(v) => onChange({ audioGain: v })}
              />

              {/* Permission Grant Button */}
              {onRequestMicPermission && (
                <button
                  type="button"
                  onClick={onRequestMicPermission}
                  className="w-full py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 border border-white/10 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Volume2 size={14} className="text-brand-gold" />
                  Grant / Refresh Microphone Permission
                </button>
              )}
            </div>

            {/* Troubleshooting Guide Card */}
            <div className="p-3 rounded-xl bg-zinc-900/40 border border-white/5 space-y-2 text-xs text-zinc-400 leading-relaxed">
              <span className="font-bold text-zinc-200 block text-xs">
                💡 Lưu ý khi thu âm từ Micro PC / Bàn Mixer:
              </span>
              <ul className="list-disc list-inside space-y-1 text-[11px]">
                <li>
                  Trình duyệt cần được cấp quyền Micro (bấm biểu tượng ổ khóa cạnh URL trên thanh địa chỉ).
                </li>
                <li>
                  Nếu thu từ bàn mixer sự kiện qua cổng Line-In hoặc Virtual Audio Cable, hãy chọn đúng thiết bị trong danh sách trên.
                </li>
                <li>
                  Nếu âm lượng micro quá nhỏ, hãy tăng thanh <strong>Gain Booster (1.5x - 4.0x)</strong>.
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* TAB 3: API & TRANSLATION ENGINE */}
        {activeTab === "api" && (
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-zinc-900/60 border border-white/5 space-y-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-brand-gold flex items-center gap-1.5">
                <Zap size={14} /> Translation Engine Selection
              </span>

              <div>
                <Label>Active Translation Provider</Label>
                <select
                  className={selectCls}
                  value={config.translationEngine || "google-free"}
                  onChange={(e) =>
                    onChange({ translationEngine: e.target.value as TranslationEngine })
                  }
                >
                  <option value="google-free">
                    🟢 Google Neural Translate (Built-in Free, No Key Required, ~200ms)
                  </option>
                  <option value="openai">
                    🟣 OpenAI API (GPT-4o-mini / Custom API Key)
                  </option>
                  <option value="deepl">
                    🔷 DeepL Translation API (DeepL Auth Key)
                  </option>
                </select>
              </div>

              {/* Status Banner */}
              <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800/40 text-xs text-emerald-300 flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                <span>
                  {config.translationEngine === "openai"
                    ? "OpenAI Engine selected. Provide your API Key below."
                    : config.translationEngine === "deepl"
                    ? "DeepL Engine selected. Provide your Auth Key below."
                    : "Đang sử dụng API dịch tự động tích hợp sẵn (Google GTX). Hoàn toàn miễn phí, không giới hạn ký tự và không cần API key."}
                </span>
              </div>
            </div>

            {/* OpenAI Settings if selected */}
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

            {/* DeepL Settings if selected */}
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
                    <span>✓ Connection OK</span>
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
