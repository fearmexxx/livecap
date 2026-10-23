"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, Play } from "lucide-react";

const HERO_SLIDES = [
  {
    image: "/vbe_kickoff_event_luxury.png",
    title: "CORPORATE CHRONICLES.",
    subtitle: "Engineering high-stakes kick-offs and year-end milestones for industry leaders.",
    accent: "Corporate Excellence"
  },
  {
    image: "/vbe_university_activation_hcmc.png",
    title: "CAMPUS CATALYSTS.",
    subtitle: "Connecting global brands with the next generation through top-tier university activations.",
    accent: "Education Outreach"
  },
  {
    image: "/saigon_outdoor_brand_activation_1773051797433.png",
    title: "URBAN ADRENALINE.",
    subtitle: "Transforming Nguyen Hue and central hubs into high-engagement digital playgrounds.",
    accent: "City-Scale Impact"
  }
];

export default function Home() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setIsLoaded(true);
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % HERO_SLIDES.length);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  const nextSlide = () => setCurrentSlide((prev) => (prev + 1) % HERO_SLIDES.length);
  const prevSlide = () => setCurrentSlide((prev) => (prev - 1 + HERO_SLIDES.length) % HERO_SLIDES.length);

  return (
    <div className="relative min-h-screen selection:bg-brand-gold selection:text-white font-display">
      <div className="grain-overlay"></div>

      {/* Abstract Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-brand-gold/10 blur-[120px] rounded-full animate-float"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-brand-gold/5 blur-[120px] rounded-full animate-float" style={{ animationDelay: '-3s' }}></div>
      </div>

      {/* Hero Section */}
      <main className="relative pt-32 pb-20 px-6 md:px-12 max-w-7xl mx-auto overflow-hidden">
        <section className="relative min-h-[85vh] flex flex-col justify-center">
          {/* Hero Slider Background */}
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-full lg:w-[65%] h-[90%] -z-10 overflow-hidden">
            <div className="relative w-full h-full group">
              {HERO_SLIDES.map((slide, idx) => (
                <div
                  key={idx}
                  className={`absolute inset-0 transition-all duration-1000 ease-[cubic-bezier(0.23,1,0.32,1)] transform ${idx === currentSlide ? "opacity-100 scale-100" : "opacity-0 scale-105 pointer-events-none"
                    }`}
                >
                  <Image
                    src={slide.image}
                    alt={slide.title}
                    fill
                    className="object-cover rounded-3xl lg:rounded-l-[8rem] border-l border-white/5 shadow-2xl brightness-75 grayscale-[20%] group-hover:grayscale-0 transition-all duration-1000"
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-premium-black via-premium-black/40 to-transparent lg:rounded-l-[8rem]"></div>
                  <div className="absolute inset-0 hero-gradient-overlay"></div>
                </div>
              ))}

              {/* Slider Controls - Minimalist */}
              <div className="absolute bottom-10 right-10 flex flex-col gap-4 z-10 translate-x-4 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all">
                <button onClick={prevSlide} className="w-14 h-14 rounded-full border border-white/10 glass flex items-center justify-center hover:bg-brand-gold hover:text-black transition-all">
                  <ChevronLeft size={20} />
                </button>
                <button onClick={nextSlide} className="w-14 h-14 rounded-full border border-white/10 glass flex items-center justify-center hover:bg-brand-gold hover:text-black transition-all">
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
          </div>

          <div className="max-w-4xl space-y-10 relative">
            <div className={`overflow-hidden transition-all duration-700 ${isLoaded ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}`}>
              <div className="inline-flex items-center gap-3 px-5 py-2 rounded-full border border-white/10 bg-white/5 text-[10px] md:text-xs font-bold uppercase tracking-[0.3em] text-zinc-400 backdrop-blur-xl">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-gold"></span>
                VBE Event Engineering
              </div>
            </div>

            <div className="space-y-4">
              <h1 className="text-6xl md:text-8xl lg:text-[10rem] font-bold tracking-tighter leading-[0.8] text-white">
                <span className="text-reveal-wrap">
                  <span className={`block text-reveal-item ${isLoaded ? "translate-y-0" : "translate-y-full"}`}>
                    {HERO_SLIDES[currentSlide].title.split(' ')[0]}
                  </span>
                </span>
                <br />
                <span className="text-reveal-wrap">
                  <span className={`block font-luxury italic font-light text-brand-gold text-reveal-item`} style={{ transitionDelay: '0.2s' }}>
                    {HERO_SLIDES[currentSlide].title.split(' ').slice(1).join(' ')}
                  </span>
                </span>
              </h1>
            </div>

            <p className="text-lg md:text-xl text-zinc-500 max-w-xl leading-relaxed font-medium font-luxury italic">
              {HERO_SLIDES[currentSlide].subtitle}
            </p>

            <div className="flex flex-wrap gap-8 pt-6 items-center">
              <a href="/services" className="group relative px-12 py-6 overflow-hidden rounded-full">
                <div className="absolute inset-0 bg-brand-gold transition-transform group-hover:scale-105"></div>
                <span className="relative z-10 text-premium-black font-bold uppercase tracking-widest text-[10px]">Identify Excellence</span>
              </a>
              <a href="/calculator" className="flex items-center gap-4 text-zinc-400 hover:text-brand-gold transition-colors font-bold uppercase tracking-widest text-[10px] group">
                <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center group-hover:border-brand-gold/50 transition-all">
                  <Play size={14} fill="currentColor" className="ml-1" />
                </div>
                Project Impact
              </a>
            </div>
          </div>
        </section>

        {/* The New "Human" Narrative Section */}
        <section className="py-60 grid grid-cols-1 lg:grid-cols-12 gap-20 items-center">
          <div className="lg:col-span-5 space-y-12">
            <div className="space-y-6">
              <span className="font-luxury italic text-brand-gold text-2xl">01. Our Philosophy</span>
              <h2 className="text-5xl md:text-7xl font-bold leading-tight">WE DON'T DO PLAIN.<br />WE DO POWER.</h2>
            </div>
            <p className="text-xl text-zinc-500 leading-relaxed font-light">
              VBE specializes in events that demand more than just a stage. From high-stakes **Corporate Kick-offs** to **University Brand Activations**, we leverage our deep connections with top-tier campuses to connect your brand with Vietnam's most dynamic audiences.
            </p>
            <div className="pt-10 grid grid-cols-2 gap-10 border-t border-white/5">
              <div>
                <div className="text-4xl font-bold text-white mb-2">AGILE<span className="text-brand-gold text-2xl">CORE</span></div>
                <p className="text-xs uppercase tracking-widest text-zinc-600 font-bold">In-house Studio</p>
              </div>
              <div>
                <div className="text-4xl font-bold text-white mb-2">TOP<span className="text-brand-gold text-2xl">UNIS</span></div>
                <p className="text-xs uppercase tracking-widest text-zinc-600 font-bold">Strategic Network</p>
              </div>
            </div>
          </div>
          <div className="lg:col-span-7 relative">
            <div className="aspect-[4/5] relative rounded-[4rem] overflow-hidden border border-white/5 shadow-2xl">
              <Image
                src="/vbe_university_activation_hcmc.png"
                alt="University Activation"
                fill
                className="object-cover scale-110 hover:scale-100 transition-transform duration-[2s]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-premium-black via-transparent to-transparent"></div>
            </div>
            {/* Float Card */}
            <div className="absolute -bottom-10 -left-10 glass p-10 rounded-3xl max-w-sm border-white/10 hidden md:block animate-float">
              <p className="font-luxury italic text-zinc-300 text-lg mb-4">"VBE's connection to the student demographic transformed our campus outreach program."</p>
              <div className="h-px bg-white/10 w-20 mb-4"></div>
              <p className="text-[10px] uppercase tracking-widest font-bold text-brand-gold text-brand-gold">Brand Manager, Tech Global</p>
            </div>
          </div>
        </section>

        {/* Portfolio - More Organic Layout */}
        <section id="portfolio" className="py-40 space-y-32">
          <div className="flex flex-col md:flex-row justify-between items-end gap-10">
            <h2 className="text-6xl md:text-9xl font-bold tracking-tighter">FLAGSHIP<br /><span className="font-luxury italic font-light text-brand-gold">ARCHIVES.</span></h2>
            <p className="text-zinc-500 max-w-xs text-sm uppercase tracking-widest leading-relaxed">Curated moments of technical audacity, campus energy, and corporate precision.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-32">
            {[
              { name: "Global Kick-off", category: "Corporate", img: "/vbe_kickoff_event_luxury.png", offset: false },
              { name: "Arena of Computers", category: "Univ. Activation", img: "/vbe_university_activation_hcmc.png", offset: true },
              { name: "ROG Invitational", category: "Specialized Event", img: "/vbe_ar_vr_activation_1773047923524.png", offset: false },
              { name: "Year-End Vision", category: "Gala & Production", img: "/saigon_luxury_gala_dinner_1773051811525.png", offset: true }
            ].map((project, idx) => (
              <div key={idx} className={`group space-y-8 ${project.offset ? "md:translate-y-24" : ""}`}>
                <div className="relative aspect-[16/11] overflow-hidden rounded-[3rem] border border-white/5 bg-zinc-900 shadow-xl cursor-none-custom">
                  <Image
                    src={project.img}
                    alt={project.name}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-1000 grayscale-[40%] group-hover:grayscale-0"
                  />
                  <div className="absolute inset-0 bg-brand-gold mix-blend-overlay opacity-0 group-hover:opacity-10 transition-opacity"></div>
                  <div className="absolute top-10 right-10 w-16 h-16 rounded-full glass border-white/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all scale-75 group-hover:scale-100">
                    <ArrowRight className="text-brand-gold" />
                  </div>
                </div>
                <div className="space-y-2 px-4">
                  <div className="flex items-center gap-4">
                    <span className="text-zinc-600 text-[10px] font-bold uppercase tracking-[0.3em]">{project.category}</span>
                    <div className="h-px bg-white/5 flex-1"></div>
                  </div>
                  <h3 className="text-4xl font-bold group-hover:text-brand-gold transition-colors">{project.name}</h3>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-60 text-center relative overflow-hidden">
          <div className="absolute inset-0 mask-organic opacity-5">
            <div className="absolute inset-0 bg-brand-gold blur-[100px]"></div>
          </div>
          <div className="relative space-y-12">
            <span className="font-luxury italic text-brand-gold text-2xl block">Ready to initiate your next milestone?</span>
            <h2 className="text-6xl md:text-[8rem] font-bold tracking-tighter leading-none mb-12">START THE<br /><span className="text-gradient">ENGINE.</span></h2>
            <Link href="/contact" className="inline-block px-14 py-8 rounded-full border border-brand-gold text-brand-gold hover:bg-brand-gold hover:text-black font-bold uppercase tracking-[0.4em] text-xs transition-all hover:scale-105 active:scale-95">
              Launch Activation
            </Link>
          </div>
        </section>
      </main>

      {/* Shared Footer with enhanced look */}
      <footer className="py-20 px-6 md:px-12 border-t border-zinc-900 bg-black relative z-10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-10">
          <div className="space-y-4 text-center md:text-left">
            <div className="text-2xl font-bold tracking-tighter flex items-center gap-2 justify-center md:justify-start">
              VBE <span className="text-xs font-luxury italic text-brand-gold border-l border-white/20 pl-2">Events & Engineering</span>
            </div>
            <p className="text-zinc-600 text-xs uppercase tracking-widest max-w-xs leading-relaxed">
              Connecting global brands with local energy through specialized events.
            </p>
          </div>
          <div className="flex gap-12 text-zinc-500 text-[10px] font-bold uppercase tracking-[0.4em]">
            <a href="https://fb.com/VBEltd" className="hover:text-brand-gold transition-colors">FB</a>
            <a href="#" className="hover:text-brand-gold transition-colors">TT</a>
            <a href="#" className="hover:text-brand-gold transition-colors">LN</a>
          </div>
          <p className="text-zinc-700 text-[10px] uppercase tracking-widest font-bold">© 2026 Vietnam Broadcasting & Ent.</p>
        </div>
      </footer>
    </div>
  );
}
