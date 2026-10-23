import Image from "next/image";
import { Radio, Video, Zap, Cpu, Globe, Users, ArrowRight, GraduationCap, Target, Rocket } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const ServiceCard = ({ title, description, items, icon: Icon, color, image }: { title: string, description: string, items: string[], icon: LucideIcon, color: string, image: string }) => (
    <div className={`glass rounded-[3rem] border-zinc-800 hover:border-${color}/30 transition-all group overflow-hidden flex flex-col`}>
        <div className="aspect-video relative overflow-hidden bg-zinc-900 border-b border-white/5">
            <Image
                src={image}
                alt={title}
                fill
                className="object-cover opacity-60 group-hover:opacity-90 group-hover:scale-105 transition-all duration-700"
            />
        </div>
        <div className="p-8 md:p-12 flex-1 flex flex-col">
            <div className={`w-16 h-16 mb-8 rounded-2xl bg-zinc-900/80 backdrop-blur-md flex items-center justify-center text-${color} group-hover:scale-110 transition-transform border border-white/5 shadow-2xl`}>
                <Icon size={32} />
            </div>
            <h2 className="text-3xl font-bold mb-4 tracking-tight">{title}</h2>
            <p className="text-zinc-500 mb-8 leading-relaxed text-sm flex-1 font-luxury italic">{description}</p>
            <ul className="space-y-4 mb-10">
                {items.map((item, idx) => (
                    <li key={idx} className="flex gap-3 items-center text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                        <span className={`w-1.5 h-1.5 rounded-full bg-${color} shadow-lg shadow-${color}/50`}></span>
                        {item}
                    </li>
                ))}
            </ul>
        </div>
    </div>
);

export default function Services() {
    return (
        <div className="min-h-screen bg-premium-black text-white p-6 md:p-12 font-display">
            <div className="grain-overlay"></div>

            <main className="max-w-7xl mx-auto mt-20 space-y-32 relative">
                <div className="max-w-3xl space-y-6">
                    <h1 className="text-5xl md:text-8xl font-bold">
                        AGILE <br />
                        <span className="font-luxury italic font-light text-brand-gold">ENGINEERING.</span>
                    </h1>
                    <p className="text-xl text-zinc-500 leading-relaxed font-luxury italic">
                        Precision execution for high-stakes corporate milestones and high-energy campus activations. We bridge the gap between global brands and local audiences.
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                    <ServiceCard
                        title="Corporate Milestones"
                        description="Specialized engineering for Kick-offs, Year-End Parties (YEP), and high-pressure executive events. We handle the technical adrenaline, so you can focus on the vision."
                        color="brand-gold"
                        image="/vbe_kickoff_event_luxury.png"
                        icon={Rocket}
                        items={["Corporate Kick-off engineering", "Year-End Party production", "Hybrid Executive summits", "VTV-standard broadcast management"]}
                    />
                    <ServiceCard
                        title="University Activations"
                        description="Leveraging deep connections with top-tier HCMC universities to create high-impact activations that resonate with the next generation of consumers."
                        color="white"
                        image="/vbe_university_activation_hcmc.png"
                        icon={GraduationCap}
                        items={["On-campus brand ecosystems", "Student demographic engagement", "Top-tier HCMC university networks", "Interactive tech booths & experiences"]}
                    />
                    <ServiceCard
                        title="Agile In-house Studio"
                        description="A highly optimized production environment for digital content, product reveals, and high-fidelity livestreaming. Boutique quality, global reach."
                        color="brand-gold"
                        image="/vbe_livestream_studio_hcmc_1773047910284.png"
                        icon={Radio}
                        items={["4K Multi-platform streaming", "Product reveal production", "In-house editorial & post", "Agile broadcast workflow"]}
                    />
                    <ServiceCard
                        title="Specialized Events"
                        description="From national gaming tournaments to exclusive tech showcases. We design the infrastructure for immersive, high-stakes brand moments."
                        color="white"
                        image="/vbe_ar_vr_activation_1773047923524.png"
                        icon={Target}
                        items={["National Gaming Tournaments", "Tech Brand showcases", "Interactive fabrication", "Experimental event tech"]}
                    />
                </div>

                {/* Studio Section */}
                <section className="glass rounded-[3rem] p-8 md:p-20 overflow-hidden relative border-white/5 bg-black">
                    <div className="absolute top-0 right-0 w-1/3 h-full bg-brand-gold/5 blur-[100px] -z-10"></div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                        <div className="space-y-8">
                            <h2 className="text-4xl md:text-7xl font-bold">IN-HOUSE<br /><span className="font-luxury italic font-light text-brand-gold tracking-tight">STUDIO</span></h2>
                            <p className="text-zinc-500 text-lg leading-relaxed font-luxury italic">
                                Our agile production space is designed for rapid high-fidelity output. Perfect for digital-first brands needing broadcast standards in a boutique environment.
                            </p>
                            <div className="flex gap-8">
                                <div>
                                    <div className="text-3xl font-bold text-white">4K<span className="text-brand-gold text-lg">READY</span></div>
                                    <div className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold">Broadcast Tech</div>
                                </div>
                                <div>
                                    <div className="text-3xl font-bold text-white">HI<span className="text-brand-gold text-lg">FI</span></div>
                                    <div className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold">Audio/Visual</div>
                                </div>
                            </div>
                            <a href="/contact" className="inline-block px-10 py-5 border border-brand-gold text-brand-gold font-bold rounded-full hover:bg-brand-gold hover:text-black transition-all uppercase tracking-widest text-[10px]">
                                Discuss a Project
                            </a>
                        </div>
                        <div className="relative aspect-video rounded-3xl overflow-hidden border border-white/5 group shadow-2xl">
                            <Image
                                src="/vbe_livestream_studio_hcmc_1773047910284.png"
                                alt="Agile Studio Environment"
                                fill
                                className="object-cover group-hover:scale-110 transition-transform duration-[2s]"
                            />
                            <div className="absolute inset-0 bg-brand-gold/5 pointer-events-none"></div>
                        </div>
                    </div>
                </section>
            </main>

            <footer className="py-20 px-6 md:px-12 mt-32 border-t border-zinc-950 text-center">
                <p className="text-zinc-700 text-[10px] items-center uppercase tracking-widest font-bold">© 2026 Vietnam Broadcasting & Ent.</p>
            </footer>
        </div>
    );
}
