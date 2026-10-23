"use client";

import { useState } from "react";
import Image from "next/image";

export default function Contact() {
    const [status, setStatus] = useState<"idle" | "submitting" | "success">("idle");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus("submitting");
        const formData = new FormData(e.target as HTMLFormElement);
        const response = await fetch("https://formspree.io/f/maqpjwpr", {
            method: "POST",
            body: formData,
            headers: {
                'Accept': 'application/json'
            }
        });
        if (response.ok) {
            setStatus("success");
        } else {
            setStatus("idle");
            alert("Something went wrong. Please try again.");
        }
    };

    return (
        <div className="min-h-screen bg-premium-black text-white p-6 md:p-12">
            <main className="max-w-7xl mx-auto mt-20 grid grid-cols-1 lg:grid-cols-2 gap-20">
                <div className="space-y-12">
                    <div className="space-y-6">
                        <h1 className="text-5xl md:text-8xl font-bold text-gradient">LET'S TALK.</h1>
                        <p className="text-xl text-zinc-400 leading-relaxed">
                            Whether you're planning a massive gaming tournament or a high-end corporate gala, our team in Ho Chi Minh City is ready to bring your vision to life.
                        </p>
                    </div>

                    <div className="space-y-8">
                        <div className="flex gap-6 items-start">
                            <div className="w-12 h-12 rounded-full border border-brand-gold/30 flex items-center justify-center shrink-0">
                                📍
                            </div>
                            <div className="space-y-2">
                                <h3 className="font-bold text-brand-gold uppercase tracking-widest text-sm">Main Office</h3>
                                <p className="text-zinc-300">466/19 Nguyen Tat Thanh, Ward 18, District 4</p>
                            </div>
                        </div>

                        <div className="flex gap-6 items-start">
                            <div className="w-12 h-12 rounded-full border border-brand-gold/30 flex items-center justify-center shrink-0">
                                🎙️
                            </div>
                            <div className="space-y-2">
                                <h3 className="font-bold text-brand-gold uppercase tracking-widest text-sm">VBE LIVE Studio</h3>
                                <p className="text-zinc-300">772 EFG Su Van Hanh, Ward 12, District 10</p>
                            </div>
                        </div>

                        <div className="flex gap-6 items-start">
                            <div className="w-12 h-12 rounded-full border border-brand-gold/30 flex items-center justify-center shrink-0">
                                ✉️
                            </div>
                            <div className="space-y-2">
                                <h3 className="font-bold text-brand-gold uppercase tracking-widest text-sm">Email</h3>
                                <p className="text-zinc-300">contact@vbe.vn</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="glass p-8 md:p-12 rounded-[2.5rem] border-zinc-800">
                    {status === "success" ? (
                        <div className="h-full flex flex-col items-center justify-center text-center space-y-6 py-20">
                            <div className="w-20 h-20 rounded-full bg-brand-gold/10 border border-brand-gold/40 flex items-center justify-center text-4xl">
                                ✓
                            </div>
                            <h2 className="text-3xl font-bold">Message Received!</h2>
                            <p className="text-zinc-500">We'll get back to you within 24 hours.</p>
                            <button
                                onClick={() => setStatus("idle")}
                                className="text-brand-gold font-bold uppercase tracking-widest text-xs hover:underline"
                            >
                                Send another message
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-8">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-3">
                                    <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">Your Name</label>
                                    <input required name="name" type="text" className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 focus:outline-none focus:border-brand-gold transition-colors" placeholder="Full Name" />
                                </div>
                                <div className="space-y-3">
                                    <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">Phone Number</label>
                                    <input required name="phone" type="tel" className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 focus:outline-none focus:border-brand-gold transition-colors" placeholder="+84 ..." />
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">Email Address</label>
                                <input required name="email" type="email" className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 focus:outline-none focus:border-brand-gold transition-colors" placeholder="email@example.com" />
                            </div>

                            <div className="space-y-3">
                                <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">Project Details</label>
                                <textarea required name="message" rows={4} className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 focus:outline-none focus:border-brand-gold transition-colors resize-none" placeholder="Tell us about your event..."></textarea>
                            </div>

                            <button
                                disabled={status === "submitting"}
                                className="w-full py-5 bg-brand-gold text-premium-black font-bold rounded-xl hover:bg-brand-gold-dark transition-all disabled:opacity-50"
                            >
                                {status === "submitting" ? "Sending..." : "Submit Inquiry"}
                            </button>
                        </form>
                    )}
                </div>
            </main>
        </div>
    );
}
