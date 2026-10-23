"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

const navLinks = [
    { name: "Services", href: "/services" },
    { name: "Estimator", href: "/calculator" },
    { name: "Portfolio", href: "/#portfolio" },
    { name: "Blog", href: "/blog" },
    { name: "Live Captions", href: "/caption" },
    { name: "Contact", href: "/contact" },
];

export default function Navbar() {
    const pathname = usePathname();

    // Do not render website navbar on captioning workspace or vMix/LED overlay windows
    if (pathname?.startsWith("/caption")) {
        return null;
    }

    return (
        <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-4 md:px-12 flex justify-between items-center glass border-b border-white/5">
            <Link href="/" className="flex items-center gap-3 group">
                <div className="relative w-10 h-10 overflow-hidden rounded-lg border border-brand-gold/20 group-hover:border-brand-gold/50 transition-colors">
                    <Image
                        src="/vbe logo new.jpg"
                        alt="VBE Logo"
                        fill
                        className="object-cover"
                    />
                </div>
                <div className="text-2xl font-bold tracking-tighter text-brand-gold">VBE</div>
            </Link>

            <div className="hidden md:flex gap-8 text-sm font-medium uppercase tracking-widest items-center">
                {navLinks.map((link) => {
                    const isActive = pathname === link.href;
                    const isCaption = link.href === "/caption";
                    return (
                        <Link
                            key={link.name}
                            href={link.href}
                            className={`transition-colors flex items-center gap-1.5 ${
                                isCaption
                                    ? "text-brand-gold font-semibold px-3 py-1 rounded-full border border-brand-gold/30 bg-brand-gold/10 hover:bg-brand-gold/20"
                                    : isActive
                                    ? "text-brand-gold"
                                    : "text-zinc-400 hover:text-brand-gold"
                            }`}
                        >
                            {isCaption && <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
                            {link.name}
                        </Link>
                    );
                })}
            </div>

            <div className="md:hidden flex items-center gap-2">
                <Link
                    href="/caption"
                    className="text-xs px-2.5 py-1 rounded-full border border-brand-gold/40 text-brand-gold bg-brand-gold/10 flex items-center gap-1"
                >
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    Live Captions
                </Link>
                <button className="text-brand-gold p-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                </button>
            </div>
        </nav>
    );
}
