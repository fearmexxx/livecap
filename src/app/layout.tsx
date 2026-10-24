import type { Metadata } from "next";
import { Outfit, Roboto } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

const roboto = Roboto({
  subsets: ["vietnamese", "latin"],
  weight: ["300", "400", "500", "700", "900"],
  variable: "--font-roboto",
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
        className={`${outfit.variable} ${roboto.variable} antialiased bg-[#070709] text-zinc-100 selection:bg-brand-gold selection:text-white`}
      >
        {children}
      </body>
    </html>
  );
}
