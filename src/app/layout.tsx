import type { Metadata } from "next";
import { Outfit, Cormorant_Garamond } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-serif",
});

export const metadata: Metadata = {
  title: "LiveCap Studio - Real-Time AI Live Captioning & Translation",
  description: "Professional Korean & English to Vietnamese live speech-to-text and AI translation studio for vMix broadcasts, LED stage walls, and multi-session conferences by VBE Agency.",
  keywords: [
    "live captioning",
    "vmix subtitle overlay",
    "stage led subtitles",
    "ai live translation",
    "korean to vietnamese subtitle",
    "openrouter gpt-transcribe",
    "faster-whisper local gpu",
    "vbe agency",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${outfit.variable} ${cormorant.variable} antialiased bg-[#070709] text-zinc-100 selection:bg-brand-gold selection:text-white`}
      >
        {children}
      </body>
    </html>
  );
}
