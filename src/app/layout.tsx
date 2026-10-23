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
  title: "VBE - Premium Event Production & Activation in Ho Chi Minh City",
  description: "VBE specializes in event producing, campaign running, and brand activations. Elevating experiences in HCMC with premium execution and creative strategies.",
  keywords: ["event production hcmc", "marketing activation vietnam", "campaign running", "vbe vn", "event organizer saigon"],
};

import Navbar from "@/components/Navbar";
import Starfield from "@/components/Starfield";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${outfit.variable} ${cormorant.variable} antialiased selection:bg-brand-gold selection:text-white`}>
        <Starfield />
        <Navbar />
        {children}
      </body>
    </html>
  );
}

