"use client";

import { useState } from "react";
import Image from "next/image";
import { Sparkles, Target, Zap, Globe, ArrowRight, CheckCircle2 } from "lucide-react";

type EventGoal = "awareness" | "engagement" | "conversion" | "innovation";
type EventScale = "boutique" | "regional" | "national" | "global";

export default function EventConfigurator() {
    const [goal, setGoal] = useState<EventGoal>("awareness");
    const [scale, setScale] = useState<EventScale>("regional");
    const [addons, setAddons] = useState<string[]>([]);

    const toggleAddon = (id: string) => {
        setAddons(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]);
    };

    const calculateImpact = () => {
        let base = 75;
        if (scale === "global") base += 15;
        if (scale === "national") base += 10;
        base += addons.length * 5;
        return Math.min(base, 99);
    };

    return (
        <div className="min-h-screen bg-premium-black text-white p-6 md:p-12">
            {/* Background */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-brand-gold/10 blur-[120px] rounded-full animate-float"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-brand-gold/5 blur-[120px] rounded-full animate-float" style={{ animationDelay: '-3s' }}></div>
            </div>

            <main className="max-w-5xl mx-auto mt-20 space-y-20">
                <div className="text-center space-y-6 max-w-3xl mx-auto">
                    <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-gradient leading-[1.1]">
                        CONFIGURE YOUR VISION.
                    </h1>
                    <p className="text-zinc-400 text-lg">
                        Define your objectives and scale. Our algorithm will outline the optimal technical ecosystem for your next high-impact activation.
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                    <div className="lg:col-span-2 space-y-16">
                        {/* Step 1: Goal */}
                        <section className="space-y-8">
                            <h2 className="text-xs font-bold uppercase tracking-[0.3em] text-brand-gold flex items-center gap-3">
                                <span className="w-8 h-px bg-brand-gold/30"></span>
                                01. Define Primary Objective
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {[
                                    { id: "awareness", label: "Brand Awareness", icon: <Globe size={20} />, text: "Maximize reach and visual impact." },
                                    { id: "engagement", label: "Audience Engagement", icon: <Zap size={20} />, text: "Interactive experiences and real-time social buzz." },
                                    { id: "conversion", label: "Performance & ROI", icon: <Target size={20} />, text: "Lead generation and direct sales focus." },
                                    { id: "innovation", label: "Tech Showcase", icon: <Sparkles size={20} />, text: "Showcase AR, VR, and Metaverse capabilities." }
                                ].map((item) => (
                                    <button
                                        key={item.id}
                                        onClick={() => setGoal(item.id as EventGoal)}
                                        className={`p-6 rounded-2xl border text-left transition-all group ${goal === item.id
                                            ? "bg-brand-gold/10 border-brand-gold shadow-[0_0_30px_-10px_rgba(212,175,55,0.3)]"
                                            : "bg-zinc-900/50 border-zinc-800 hover:border-zinc-700"
                                            }`}
                                    >
                                        <div className={`mb-4 w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${goal === item.id ? "bg-brand-gold text-premium-black" : "bg-zinc-800 text-zinc-500 group-hover:text-zinc-300"
                                            }`}>
                                            {item.icon}
                                        </div>
                                        <h3 className="font-bold mb-1">{item.label}</h3>
                                        <p className="text-xs text-zinc-500">{item.text}</p>
                                    </button>
                                ))}
                            </div>
                        </section>

                        {/* Step 2: Scale */}
                        <section className="space-y-8">
                            <h2 className="text-xs font-bold uppercase tracking-[0.3em] text-brand-gold flex items-center gap-3">
                                <span className="w-8 h-px bg-brand-gold/30"></span>
                                02. Select Operational Scale
                            </h2>
                            <div className="flex flex-wrap gap-4">
                                {["boutique", "regional", "national", "global"].map((s) => (
                                    <button
                                        key={s}
                                        onClick={() => setScale(s as EventScale)}
                                        className={`px-8 py-4 rounded-xl border text-sm font-bold capitalize transition-all ${scale === s
                                            ? "bg-white text-black border-white"
                                            : "border-zinc-800 text-zinc-500 hover:border-zinc-600"
                                            }`}
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </section>

                        {/* Step 3: Add-ons */}
                        <section className="space-y-8">
                            <h2 className="text-xs font-bold uppercase tracking-[0.3em] text-brand-gold flex items-center gap-3">
                                <span className="w-8 h-px bg-brand-gold/30"></span>
                                03. High-End Integrations
                            </h2>
                            <div className="space-y-4">
                                {[
                                    { id: "4k", label: "4K Multi-Cam Wireless Streaming", desc: "Broadcast standard for YouTube & TikTok." },
                                    { id: "ar", label: "Augmented Reality (AR) Overlays", desc: "Interactive graphics for live audiences." },
                                    { id: "3d", label: "3D Virtual Stage Design", desc: "Customized metaverse environments." },
                                    { id: "hybrid", label: "Hybrid Engagement Ecosystem", desc: "Bridging physical and digital viewers." }
                                ].map((addon) => (
                                    <label
                                        key={addon.id}
                                        className={`flex items-center justify-between p-5 rounded-2xl border cursor-pointer transition-all ${addons.includes(addon.id) ? "border-brand-gold/50 bg-brand-gold/5" : "border-zinc-900 bg-zinc-950/50 hover:border-zinc-800"
                                            }`}
                                    >
                                        <div className="flex gap-4 items-center">
                                            <div onClick={() => toggleAddon(addon.id)} className={`w-6 h-6 rounded border flex items-center justify-center transition-colors ${addons.includes(addon.id) ? "bg-brand-gold border-brand-gold" : "border-zinc-700"
                                                }`}>
                                                {addons.includes(addon.id) && <CheckCircle2 size={14} className="text-premium-black" />}
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-bold">{addon.label}</h4>
                                                <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{addon.desc}</p>
                                            </div>
                                        </div>
                                        <input
                                            type="checkbox"
                                            className="hidden"
                                            checked={addons.includes(addon.id)}
                                            onChange={() => toggleAddon(addon.id)}
                                        />
                                    </label>
                                ))}
                            </div>
                        </section>
                    </div>

                    {/* Results / CTA Card */}
                    <div className="lg:sticky lg:top-32 h-fit">
                        <div className="glass p-8 rounded-[2.5rem] border-brand-gold/20 space-y-8">
                            <div className="space-y-2">
                                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Estimated Project Impact</span>
                                <div className="text-6xl font-bold text-brand-gold">{calculateImpact()}%</div>
                                <div className="w-full h-1 bg-zinc-900 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-brand-gold transition-all duration-1000"
                                        style={{ width: `${calculateImpact()}%` }}
                                    ></div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h4 className="text-sm font-bold uppercase tracking-widest italic text-zinc-400">Strategy Insights</h4>
                                <ul className="space-y-3">
                                    <li className="text-xs text-zinc-300 flex gap-2">
                                        <span className="text-brand-gold">✓</span>
                                        Optimized for {goal}
                                    </li>
                                    <li className="text-xs text-zinc-300 flex gap-2">
                                        <span className="text-brand-gold">✓</span>
                                        {scale} deployment ready
                                    </li>
                                    {addons.length > 0 && (
                                        <li className="text-xs text-zinc-300 flex gap-2">
                                            <span className="text-brand-gold">✓</span>
                                            {addons.length} tech integrations selected
                                        </li>
                                    )}
                                </ul>
                            </div>

                            <a
                                href="/contact"
                                className="flex items-center justify-center gap-3 w-full py-5 bg-brand-gold text-premium-black font-bold rounded-2xl hover:bg-brand-gold-dark transition-all transform hover:scale-[1.02]"
                            >
                                Get Detailed Quote <ArrowRight size={18} />
                            </a>

                            <p className="text-[10px] text-center text-zinc-500 leading-relaxed uppercase tracking-widest">
                                Your configuration will be shared with our producers for a curated strategy.
                            </p>
                        </div>
                    </div>
                </div>
            </main>

            <footer className="py-20 text-center border-t border-zinc-900 mt-20">
                <p className="text-zinc-600 text-sm">© 2026 Vietnam Broadcasting & Entertainment.</p>
            </footer>
        </div>
    );
}
