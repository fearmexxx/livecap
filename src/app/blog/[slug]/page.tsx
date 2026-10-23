"use client";

import { use } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Calendar, User, Share2, Clock, CheckCircle2 } from "lucide-react";

const blogContent: Record<string, { title: string, image: string, date: string, author: string, category: string, readTime: string, content: React.ReactNode }> = {
    "university-activation-hcmc-gen-z": {
        title: "University Activations: Connecting Brands with Gen Z",
        image: "/vbe_university_activation_hcmc.png",
        date: "March 20, 2026",
        author: "VBE Strategy",
        category: "University Outreach",
        readTime: "7 min read",
        content: (
            <>
                <p>In the heart of Vietnam's economic engine, the student demographic represents the most dynamic and forward-thinking consumer segment. At VBE, we've engineered a unique bridge between global brands and these campus-based audiences through specialized University Activations.</p>
                <h2>The Power of On-Campus Presence</h2>
                <p>Traditional advertising often fails to break through the noise of a student's digital life. However, a high-tech physical activation inside a top-tier HCMC university campus creates a touchpoint that is impossible to ignore. We don't just set up booths; we build ecosystems.</p>
                <blockquote>"Authentic engagement on campus isn't about the volume of the music; it's about the technical value of the experience."</blockquote>
                <h2>Strategic University Networks</h2>
                <p>Our deep connections with the administration of major universities across Ho Chi Minh City allow for seamless logistics and high-trust environment for brands to showcase their latest innovations.</p>
            </>
        )
    },
    "vbe-pinnacle-professional-events": {
        title: "VBE – The Pinnacle of Professional Events",
        image: "/vbe_event_production_hero_1773047889779.png",
        date: "March 15, 2026",
        author: "VBE Editorial",
        category: "Event Production",
        readTime: "6 min read",
        content: (
            <>
                <p>In the rapidly evolving landscape of Vietnam's entertainment industry, VBE has emerged as the definitive benchmark for professional event production. Our journey from a boutique technical agency to an all-in-one production powerhouse is fueled by a singular vision: to bridge the gap between creative concept and flawless execution.</p>
                <h2>The Architecture of an Impactful Event</h2>
                <p>Professional event production is more than just lighting and sound; it's the orchestration of sensory experiences. At VBE, we approach every project—from the grand 'Expert Challenge' reality show to high-stakes corporate galas—with an engineering mindset.</p>
                <blockquote>"We don't just produce events; we engineer memories that resonate across both physical and digital spaces."</blockquote>
                <h2>Hybrid Excellence: The New Standard</h2>
                <p>The modern audience is no longer confined to seats in a hall. Today's events exist simultaneously on-site and across a myriad of digital platforms. VBE's unique 4K wireless transmission systems allow us to deliver high-definition, low-latency streams to YouTube, Facebook, and TikTok.</p>
            </>
        )
    },
    "creativity-harmonizes-with-technology": {
        title: "Where Creativity Harmonizes with Technology",
        image: "/vbe_livestream_studio_hcmc_1773047910284.png",
        date: "February 22, 2026",
        author: "Tech Team",
        category: "Innovation",
        readTime: "5 min read",
        content: (
            <>
                <p>Located in the vibrant heart of District 10, Ho Chi Minh City, the VBE LIVE Studio stands as a testament to our core philosophy: that creativity and technology are not separate entities.</p>
                <h2>The 300sqm Canvas</h2>
                <p>Our flagship studio isn't just a room; it's a high-tech ecosystem. Equipped with a comprehensive green screen wrap, professional acoustics, and an integrated 4K workflow, the 300sqm space allows brands to manifest environments that would be impossible in a traditional setting.</p>
            </>
        )
    },
    "future-4k-wireless-broadcasting": {
        title: "The Future of 4K Wireless Broadcasting",
        image: "/vbe_production_team_working_1773047957239.png",
        date: "January 10, 2026",
        author: "Broadcast Ops",
        category: "Livestreaming",
        readTime: "8 min read",
        content: (
            <>
                <p>The shift to 4K is no longer optional for premium brands. As display technology advances, the standard for broadcast quality must follow. VBE is at the forefront of this transition in Vietnam.</p>
                <h2>Wireless Redundancy</h2>
                <p>One of the biggest challenges in live production is cable management and signal reliability. Our proprietary wireless systems allow for 4K video transmission with zero perceptible latency, providing directors with unparalleled creative freedom.</p>
            </>
        )
    },
    "ar-vr-brand-activation-trends": {
        title: "AR/VR: Immersive Brand Activation Trends",
        image: "/vbe_ar_vr_activation_1773047923524.png",
        date: "December 05, 2025",
        author: "Creative Lead",
        category: "Technology",
        readTime: "7 min read",
        content: (
            <>
                <p>Activation is about engagement. In 2026, engagement means immersion. By integrating AR (Augmented Reality) into physical event spaces, we allow attendees to interact with a layer of digital storytelling that enriches the physical environment.</p>
                <h2>Personalized Immersion</h2>
                <p>VR experiences at events allow brands to transport guests to factory tours, virtual worlds, or deep-sea explorations without leaving the venue.</p>
            </>
        )
    }
};

export default function BlogPost({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = use(params);
    const post = blogContent[slug] || blogContent["vbe-pinnacle-professional-events"];

    return (
        <div className="min-h-screen bg-premium-black text-white p-6 md:p-12">
            <main className="max-w-4xl mx-auto mt-24 space-y-12 animate-fade-in">
                <Link href="/blog" className="inline-flex items-center gap-2 text-zinc-500 hover:text-brand-gold transition-colors font-bold uppercase tracking-[0.2em] text-[10px]">
                    <ArrowLeft size={14} /> Back to Library
                </Link>

                <article className="space-y-12 pb-32">
                    <header className="space-y-12">
                        <div className="space-y-6">
                            <div className="inline-block px-4 py-1.5 border border-brand-gold/30 bg-brand-gold/5 rounded-full text-[10px] font-bold uppercase tracking-widest text-brand-gold">
                                {post.category}
                            </div>
                            <h1 className="text-4xl md:text-7xl font-bold leading-tight tracking-tight text-gradient">{post.title}</h1>
                        </div>

                        <div className="relative aspect-video rounded-[3rem] overflow-hidden border border-zinc-800 shadow-3xl">
                            <Image
                                src={post.image}
                                alt={post.title}
                                fill
                                className="object-cover"
                                priority
                            />
                        </div>

                        <div className="flex flex-wrap gap-8 text-[10px] text-zinc-500 font-bold uppercase tracking-[0.2em] border-y border-zinc-900 py-8 items-center">
                            <span className="flex items-center gap-2 bg-zinc-900 px-4 py-2 rounded-full border border-white/5"><User size={12} className="text-brand-gold" /> {post.author}</span>
                            <span className="flex items-center gap-2 bg-zinc-900 px-4 py-2 rounded-full border border-white/5"><Calendar size={12} className="text-brand-gold" /> {post.date}</span>
                            <span className="flex items-center gap-2 bg-zinc-900 px-4 py-2 rounded-full border border-white/5"><Clock size={12} className="text-brand-gold" /> {post.readTime}</span>
                            <button className="flex items-center gap-2 hover:text-brand-gold ml-auto transition-colors border border-zinc-800 hover:border-brand-gold/30 px-6 py-2 rounded-full">
                                <Share2 size={12} /> Share
                            </button>
                        </div>
                    </header>

                    <div className="prose prose-invert prose-brand max-w-none text-zinc-300 leading-relaxed text-xl space-y-12 blog-content">
                        {post.content}
                        <div className="grid grid-cols-2 gap-4 not-prose py-8">
                            <div className="p-8 glass rounded-3xl border-zinc-800 flex flex-col gap-4">
                                <CheckCircle2 className="text-brand-gold" size={32} />
                                <h4 className="font-bold text-lg">Engineering Precision</h4>
                                <p className="text-zinc-500 text-sm">Every broadcast step is calculated and stress-tested before the signal goes live.</p>
                            </div>
                            <div className="p-8 glass rounded-3xl border-zinc-800 flex flex-col gap-4">
                                <CheckCircle2 className="text-brand-gold" size={32} />
                                <h4 className="font-bold text-lg">Creative Soul</h4>
                                <p className="text-zinc-500 text-sm">Tech is nothing without a story that resonates with the Vietnamese audience.</p>
                            </div>
                        </div>
                    </div>
                </article>

                <section className="pt-20 border-t border-zinc-900 text-center space-y-8 pb-40">
                    <div className="inline-block px-4 py-1.5 border border-white/10 rounded-full text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-4">
                        Next Level Activation
                    </div>
                    <h3 className="text-3xl md:text-5xl font-bold tracking-tight">Ready to engineer your impact?</h3>
                    <p className="text-zinc-500 max-w-xl mx-auto">Skip the guesswork. Let our technical production team design a hybrid ecosystem for your brand.</p>
                    <Link href="/contact" className="inline-block px-12 py-6 bg-brand-gold text-premium-black font-bold rounded-[2rem] hover:scale-105 transition-transform shadow-lg shadow-brand-gold/20 tracking-widest uppercase text-xs">
                        Request Strategy Consultation
                    </Link>
                </section>
            </main>

            <footer className="py-20 text-center border-t border-zinc-900 mt-20">
                <p className="text-zinc-600 text-[10px] font-bold tracking-widest uppercase">Vietnam Broadcasting & Entertainment © 2026</p>
            </footer>
        </div>
    );
}
