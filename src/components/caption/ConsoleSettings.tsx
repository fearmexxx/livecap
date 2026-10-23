"use client";

import React, { useState } from "react";
import { CaptionConfig, GlossaryEntry } from "@/lib/caption/types";
import { Plus, Trash2 } from "lucide-react";

interface Props {
  config: CaptionConfig;
  onChange: (patch: Partial<CaptionConfig>) => void;
}

const Label = ({ children }: { children: React.ReactNode }) => (
  <label className="block text-[11px] uppercase tracking-wider text-zinc-500 mb-1">{children}</label>
);

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="border-b border-white/5 pb-4 mb-4 last:border-0">
    <h3 className="text-xs font-bold uppercase tracking-widest text-brand-gold mb-3">{title}</h3>
    <div className="space-y-3">{children}</div>
  </div>
);

const selectCls =
  "w-full bg-zinc-900 border border-white/10 rounded-md px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-brand-gold/60";

function Slider({
  label, value, min, max, step = 1, unit = "", onChange,
}: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex justify-between">
        <Label>{label}</Label>
        <span className="text-[11px] font-mono text-zinc-400">{value}{unit}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#c6a35a]"
      />
    </div>
  );
}

function Segmented<T extends string>({
  value, options, onChange,
}: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-md overflow-hidden border border-white/10">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 px-2 py-1.5 text-xs transition-colors ${
            value === o.value ? "bg-brand-gold text-black font-semibold" : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function ConsoleSettings({ config, onChange }: Props) {
  const [newFrom, setNewFrom] = useState("");
  const [newTo, setNewTo] = useState("");

  const addGlossary = () => {
    if (!newFrom.trim() || !newTo.trim()) return;
    const next: GlossaryEntry[] = [...config.customGlossary, { from: newFrom.trim(), to: newTo.trim() }];
    onChange({ customGlossary: next });
    setNewFrom("");
    setNewTo("");
  };

  return (
    <div className="text-sm">
      <Section title="Layout">
        <div>
          <Label>Display mode</Label>
          <Segmented
            value={config.displayMode}
            onChange={(v) => onChange({ displayMode: v })}
            options={[
              { value: "bilingual", label: "Song ngữ" },
              { value: "vietnamese-only", label: "Chỉ tiếng Việt" },
              { value: "rolling-ledger", label: "Cuộn nhiều dòng" },
            ]}
          />
        </div>
        <div>
          <Label>Vertical position</Label>
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
          <Label>Text alignment</Label>
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
        <Slider label="Max width" value={config.maxWidthPercent} min={40} max={100} unit="%" onChange={(v) => onChange({ maxWidthPercent: v })} />
        <Slider label="Lines (rolling mode)" value={config.maxLines} min={1} max={8} onChange={(v) => onChange({ maxLines: v })} />
        <Slider label="Auto-hide after silence (0 = never)" value={config.autoClearSec} min={0} max={30} unit="s" onChange={(v) => onChange({ autoClearSec: v })} />
      </Section>

      <Section title="Typography">
        <Slider label="Vietnamese font size" value={config.fontSize} min={16} max={140} unit="px" onChange={(v) => onChange({ fontSize: v })} />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Font</Label>
            <select className={selectCls} value={config.fontFamily} onChange={(e) => onChange({ fontFamily: e.target.value })}>
              <option value="Outfit, sans-serif">Outfit</option>
              <option value="Arial, Helvetica, sans-serif">Arial</option>
              <option value="'Segoe UI', Tahoma, sans-serif">Segoe UI</option>
              <option value="Roboto, 'Segoe UI', sans-serif">Roboto</option>
              <option value="'Times New Roman', serif">Times New Roman</option>
            </select>
          </div>
          <div>
            <Label>Weight</Label>
            <select className={selectCls} value={config.fontWeight} onChange={(e) => onChange({ fontWeight: e.target.value as CaptionConfig["fontWeight"] })}>
              <option value="400">Regular</option>
              <option value="600">Semi-bold</option>
              <option value="700">Bold</option>
              <option value="800">Extra-bold</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Vietnamese color</Label>
            <input type="color" value={config.vietnameseColor} onChange={(e) => onChange({ vietnameseColor: e.target.value })} className="w-full h-8 rounded bg-transparent cursor-pointer" />
          </div>
          <div>
            <Label>Original (KR/EN) color</Label>
            <input type="color" value={config.originalColor} onChange={(e) => onChange({ originalColor: e.target.value })} className="w-full h-8 rounded bg-transparent cursor-pointer" />
          </div>
        </div>
        <div>
          <Label>Outline (readability on video)</Label>
          <Segmented
            value={config.textStroke}
            onChange={(v) => onChange({ textStroke: v })}
            options={[
              { value: "none", label: "None" },
              { value: "sm", label: "S" },
              { value: "md", label: "M" },
              { value: "lg", label: "L" },
              { value: "xl", label: "XL" },
            ]}
          />
        </div>
      </Section>

      <Section title="Background">
        <div>
          <Label>Window background</Label>
          <select className={selectCls} value={config.bgStyle} onChange={(e) => onChange({ bgStyle: e.target.value as CaptionConfig["bgStyle"] })}>
            <option value="transparent">Transparent (vMix alpha) + caption box</option>
            <option value="black-box">Solid black (LED / projector)</option>
            <option value="frosted-glass">Dark frosted glass</option>
            <option value="chroma-green">Chroma key green #00FF00</option>
            <option value="chroma-blue">Chroma key blue #0000FF</option>
            <option value="chroma-magenta">Chroma key magenta #FF00FF</option>
          </select>
        </div>
        <Slider label="Box / background opacity" value={config.bgOpacity} min={0} max={100} unit="%" onChange={(v) => onChange({ bgOpacity: v })} />
        <div className="grid grid-cols-3 gap-2">
          <Slider label="Pad X" value={config.boxPaddingX} min={0} max={80} onChange={(v) => onChange({ boxPaddingX: v })} />
          <Slider label="Pad Y" value={config.boxPaddingY} min={0} max={60} onChange={(v) => onChange({ boxPaddingY: v })} />
          <Slider label="Radius" value={config.borderRadius} min={0} max={40} onChange={(v) => onChange({ borderRadius: v })} />
        </div>
      </Section>

      <Section title="Speaker badge">
        <label className="flex items-center gap-2 text-zinc-300">
          <input type="checkbox" checked={config.showSpeakerBadge} onChange={(e) => onChange({ showSpeakerBadge: e.target.checked })} className="accent-[#c6a35a]" />
          Show speaker / language badge
        </label>
        <input
          className={selectCls}
          value={config.speakerLabel}
          onChange={(e) => onChange({ speakerLabel: e.target.value })}
          placeholder="e.g. Mr. Kim – CEO Samsung"
        />
      </Section>

      <Section title="Glossary (names & terms)">
        <p className="text-[11px] text-zinc-500">Applied to Vietnamese output. Use to fix names, brands, technical terms.</p>
        <div className="max-h-40 overflow-y-auto space-y-1">
          {config.customGlossary.map((g, i) => (
            <div key={i} className="flex items-center gap-1 text-xs bg-zinc-900 rounded px-2 py-1">
              <span className="flex-1 truncate text-zinc-300">{g.from}</span>
              <span className="text-zinc-600">→</span>
              <span className="flex-1 truncate text-brand-gold">{g.to}</span>
              <button
                onClick={() => onChange({ customGlossary: config.customGlossary.filter((_, j) => j !== i) })}
                className="text-zinc-600 hover:text-red-400"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-1">
          <input className={selectCls} placeholder="Term in output" value={newFrom} onChange={(e) => setNewFrom(e.target.value)} />
          <input className={selectCls} placeholder="Replace with" value={newTo} onChange={(e) => setNewTo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addGlossary()} />
          <button onClick={addGlossary} className="px-2 rounded bg-brand-gold text-black"><Plus size={14} /></button>
        </div>
      </Section>
    </div>
  );
}
