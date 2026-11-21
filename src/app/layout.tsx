import type { Metadata } from "next";
// Fonts ship with the app (no Google Fonts download at build time or on show day)
import "@fontsource-variable/outfit";
import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/400-italic.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import "@fontsource/roboto/700-italic.css";
import "@fontsource/roboto/900.css";
import "./globals.css";

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
        className={`antialiased bg-[#070709] text-zinc-100 selection:bg-brand-gold selection:text-white`}
      >
        {children}
      </body>
    </html>
  );
}
