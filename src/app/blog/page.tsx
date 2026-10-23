"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Calendar, User, Search } from "lucide-react";

const blogPosts = [
    {
        title: "University Activations: Connecting Brands with Gen Z",
        slug: "university-activation-hcmc-gen-z",
        excerpt: "Leveraging VBE's strategic university network to create high-impact, tech-driven campus experiences in Ho Chi Minh City.",
        date: "March 2026",
        author: "VBE Strategy",
        category: "University Outreach",
        image: "/vbe_university_activation_hcmc.png"
    },
    {
        title: "VBE – The Pinnacle of Professional Events",
        slug: "vbe-pinnacle-professional-events",
        excerpt: "Exploring the technical excellence and creative vision behind Vietnam's most impactful brand activations.",
        date: "March 2026",
        author: "VBE Editorial",
        category: "Event Production",
        image: "/vbe_event_production_hero_1773047889779.png"
    },
    {
        title: "Where Creativity Harmonizes with Technology",
        slug: "creativity-harmonizes-with-technology",
        excerpt: "How our 300sqm District 10 studio is redefining the boundaries of livestreaming and virtual experiences.",
        date: "Feb 2026",
        author: "Tech Team",
        category: "Innovation",
        image: "/vbe_livestream_studio_hcmc_1773047910284.png"
    },
    {
        title: "The Future of 4K Wireless Broadcasting",
        slug: "future-4k-wireless-broadcasting",
        excerpt: "Deep dive into the technology powering the next generation of multi-platform digital events.",
        date: "Jan 2026",
        author: "Broadcast Ops",
        category: "Livestreaming",
        image: "/vbe_production_team_working_1773047957239.png"
    },
    {
        title: "AR/VR: Immersive Brand Activation Trends",
        slug: "ar-vr-brand-activation-trends",
        excerpt: "How augmented and virtual reality are transforming customer engagement in Ho Chi Minh City.",
        date: "Dec 2025",
        author: "Creative Lead",
        category: "Technology",
        image: "/vbe_ar_vr_activation_1773047923524.png"
    },
    {
        title: "3D Virtual Stage Design for 2026",
        slug: "3d-virtual-stage-design-2026",
        excerpt: "A look at the aesthetic trends driving professional virtual stage creation for global events.",
        date: "Nov 2025",
        author: "Design Lab",
        category: "Design",
        image: "/vbe_3d_stage_design_render_2026_1773047974777.png"
    },
    {
        title: "HCMC Event Skyline: Digital Connectivity",
        slug: "hcmc-event-skyline-digital-connectivity",
        excerpt: "Connecting the city's event landscape through ultra-low latency broadcasting technology.",
        date: "Oct 2025",
        author: "Strategy Dept",
        category: "Vision",
        image: "/vbe_hcmc_event_skyline_concept_1773047990238.png"
    },
    {
        title: "Mastering Interactive Livestreaming Scripts",
        slug: "interactive-livestreaming-scripts",
        excerpt: "Engagement tactics that keep audiences glued to their screens during live broadcasts.",
        date: "Sept 2025",
        author: "Content Team",
        category: "Livestreaming",
        image: "/vbe_production_team_working_1773047957239.png"
    },
    {
        title: "The Rise of Hybrid Events in SE Asia",
        slug: "hybrid-events-southeast-asia",
        excerpt: "Analyzing the permanent shift toward events that live both on-site and online.",
        date: "Aug 2025",
        author: "Market Insights",
        category: "Event Production",
        image: "/vbe_event_production_hero_1773047889779.png"
    },
    {
        title: "AI in Event Management: Beyond the Hype",
        slug: "ai-event-management-trends",
        excerpt: "Practical applications of artificial intelligence in stream automation and audience analytics.",
        date: "July 2025",
        author: "Tech Team",
        category: "Innovation",
        image: "/vbe_livestream_studio_hcmc_1773047910284.png"
    },
    {
        title: "Sustainable Broadcast Practices",
        slug: "sustainable-broadcast-practices",
        excerpt: "Reducing the carbon footprint of digital events through optimized technical workflows.",
        date: "June 2025",
        author: "VBE Eco",
        category: "Ethics",
        image: "/vbe_production_team_working_1773047957239.png"
    },
    {
        title: "Top 5 Mistakes in Product Launch Events",
        slug: "product-launch-event-mistakes",
        excerpt: "Avoid these common pitfalls to ensure your next high-stakes reveal is flawless.",
        date: "May 2025",
        author: "Consultancy",
        category: "Strategy",
        image: "/vbe_event_production_hero_1773047889779.png"
    },
    {
        title: "Crafting High-Resolution 1080p@60 Streams",
        slug: "technical-guide-high-res-streams",
        excerpt: "A deep dive into bitrates, encoding, and redundancy for professional-grade broadcasts.",
        date: "April 2025",
        author: "Broadcast Ops",
        category: "Tech Guide",
        image: "/vbe_production_team_working_1773047957239.png"
    }
];

export default function BlogListing() {
    const [searchQuery, setSearchQuery] = useState("");

    const filteredPosts = blogPosts.filter((post) => {
        const query = searchQuery.toLowerCase();
        return (
            post.title.toLowerCase().includes(query) ||
            post.category.toLowerCase().includes(query) ||
            post.excerpt.toLowerCase().includes(query)
        );
    });

    return (
        <div className="min-h-screen bg-premium-black text-white p-6 md:p-12">
            <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-brand-gold/10 blur-[120px] rounded-full animate-float"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-brand-gold/5 blur-[120px] rounded-full animate-float" style={{ animationDelay: '-3s' }}></div>
            </div>

            <main className="max-w-7xl mx-auto mt-24 space-y-20">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
                    <div className="max-w-3xl space-y-6">
                        <h1 className="text-5xl md:text-8xl font-bold text-gradient">BLOG & INSIGHTS.</h1>
                        <p className="text-xl text-zinc-400 leading-relaxed uppercase tracking-wider font-medium">
                            A comprehensive library of broadcasting wisdom and event innovation.
                        </p>
                    </div>
                    <div className="relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-brand-gold transition-colors" size={20} />
                        <input
                            type="text"
                            placeholder="Search concepts..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-zinc-900/50 border border-zinc-800 rounded-full py-3 pl-12 pr-6 w-full md:w-80 focus:outline-none focus:border-brand-gold transition-all"
                        />
                    </div>
                </div>

                {filteredPosts.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-12 gap-x-8">
                        {filteredPosts.map((post, idx) => (
                            <Link
                                key={post.slug}
                                href={`/blog/${post.slug}`}
                                className="group flex flex-col space-y-6 animate-fade-in"
                                style={{ animationDelay: `${idx * 0.1}s` }}
                            >
                                <div className="aspect-[4/3] relative overflow-hidden rounded-[2.5rem] border border-zinc-800 group-hover:border-brand-gold/30 transition-all shadow-2xl">
                                    <Image
                                        src={post.image}
                                        alt={post.title}
                                        fill
                                        className="object-cover group-hover:scale-110 transition-transform duration-700 opacity-80 group-hover:opacity-100"
                                    />
                                    <div className="absolute bottom-6 left-6 px-4 py-1.5 bg-zinc-950/80 backdrop-blur-md text-brand-gold text-[10px] font-bold uppercase tracking-widest rounded-full border border-white/5">
                                        {post.category}
                                    </div>
                                </div>

                                <div className="space-y-4 px-2">
                                    <div className="flex items-center gap-4 text-[10px] text-zinc-500 font-bold uppercase tracking-[0.2em]">
                                        <span>{post.date}</span>
                                        <span className="w-1 h-1 bg-zinc-800 rounded-full"></span>
                                        <span>{post.author}</span>
                                    </div>

                                    <h2 className="text-2xl font-bold leading-tight group-hover:text-brand-gold transition-colors pr-4">
                                        {post.title}
                                    </h2>

                                    <p className="text-zinc-400 text-sm leading-relaxed line-clamp-2">
                                        {post.excerpt}
                                    </p>
                                </div>
                            </Link>
                        ))}
                    </div>
                ) : (
                    <div className="py-20 text-center animate-fade-in">
                        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-zinc-900 border border-zinc-800 mb-6">
                            <Search className="text-zinc-600" size={32} />
                        </div>
                        <h3 className="text-2xl font-bold text-white mb-2">No matching insights found.</h3>
                        <p className="text-zinc-500 max-w-sm mx-auto">
                            Try adjusting your search terms or browsing our recent categories.
                        </p>
                        <button 
                            onClick={() => setSearchQuery("")}
                            className="mt-8 text-brand-gold text-sm font-bold uppercase tracking-widest hover:underline"
                        >
                            Clear Search
                        </button>
                    </div>
                )}
            </main>

            <footer className="py-20 text-center border-t border-zinc-900 mt-32">
                <p className="text-zinc-600 text-sm font-medium tracking-widest uppercase">Vietnam Broadcasting & Entertainment Engineering Group</p>
            </footer>
        </div>
    );
}
