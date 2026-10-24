# 🎙️ VBE Live Caption Studio — vMix & LED Stage Broadcast

> **Professional Real-Time Live Captioning & Translation Software for International Conferences**  
> Speech-to-Text & Neural Translation from **Korean (한국어)** and **English** into **Vietnamese (Tiếng Việt)**.  
> Built for **vMix Alpha Overlays** and **Stage LED Screen / Projector Projection**.

---

## 🌟 Overview

**VBE Live Caption Studio** is a broadcast-grade web & Windows solution engineered for corporate conferences, global tech summits, and live broadcasts where speakers deliver presentations in **Korean** or **English**, and the live audience requires instant, accurate **Vietnamese** subtitling.

Designed specifically for event production crews, broadcast engineers, and AV technicians.

---

## ✨ Key Features

- **Dual-Language Speech Recognition & Fast Translation**:
  - Instant one-click toggle between **🇰🇷 Korean (`ko-KR`)** and **🇺🇸 English (`en-US`)**.
  - Ultra-low latency streaming translation to **🇻🇳 Vietnamese (`vi`)** (~200ms - 400ms).
  - **Triple STT Engine Architecture**:
    - 🌐 **Web Speech API**: Zero-cost, realtime in Google Chrome & Microsoft Edge.
    - ☁️ **OpenRouter Cloud STT (`openai/gpt-transcribe`)**: High-accuracy transcription using OpenAI's specialized audio model, with translation options powered by Gemini 2.5 Flash, GPT-4o-mini, and DeepSeek.
    - ⚡ **Local Hardware GPU Acceleration (NVIDIA CUDA & INTEL Arc / Iris Xe)**: Local standalone server running faster-whisper with Intel Arc A750 / Iris Xe (OpenVINO) or NVIDIA RTX/GTX (CUDA) acceleration for 100% offline security and ultra-low latency.
  - Shows real-time interim words as the speaker speaks, finalizing punctuation and grammar on speech pause.
  - Automatic silence reconnection: keeps listening continuously across multi-hour summit keynotes.

- **vMix Seamless Alpha Transparency**:
  - Direct URL: `http://localhost:3000/caption/overlay`
  - 100% transparent alpha channel (RGBA) designed to be added as a **Web Browser Input** in vMix.
  - Outlined typography (1px - 4px black stroke) ensures crystal-clear legibility over any live camera feed, stage lighting, or presentation slides.
  - Optional pure Chroma Key backgrounds (Green `#00FF00`, Blue `#0000FF`, Magenta `#FF00FF`) for hardware video switchers.

- **Fully Configurable & Resizable Output Windows**:
  - Dedicated pop-out URL: `http://localhost:3000/caption/window`
  - Drag and scale window borders to any custom aspect ratio (e.g., Lower-Third `1920×280`, Full HD `1920×1080`, Ultrawide LED Banner `2560×600`).
  - **"Clean Broadcast" mode** (`H` / `ESC`): hides all toolbar controls for pristine window capture or screen grab.

- **Stage LED Wall & Projector Mode**:
  - High-contrast URL: `http://localhost:3000/caption/led`
  - Pure black background (`#000000`) prevents stage backlight leakage.
  - Large, anti-glare typography (up to 140px) readable from the back row of large auditoriums.
  - Double-click or press `F11` to trigger full-screen mode on secondary stage display outputs.

- **Event Operator Control Console**:
  - URL: `http://localhost:3000/caption`
  - **Audio VU Meter**: Real-time visual audio level bar to monitor soundboard / line-in levels.
  - **Panic / Clear Screen**: Instant blanking of live captions if the speaker pauses, coughs, or changes session.
  - **Pinned Announcements**: Push urgent VIP messages, Q&A notifications, or coffee break countdowns directly to the screens.
  - **Custom Glossary Dictionary**: Replace mistranscribed terms, VIP names, or company acronyms (e.g. `AI -> Trí tuệ nhân tạo`, `CEO -> Tổng giám đốc`, `VBE -> VBE Agency`).
  - **Test Speech Simulator**: Pre-loaded Korean and English keynote phrases to calibrate vMix and LED screens before showtime without speaking into the mic.

---

## 🖥️ Screen Endpoints & URLs

| Endpoint | URL | Description |
| :--- | :--- | :--- |
| **Operator Console** | `http://localhost:3000/caption` | Technician control dashboard |
| **vMix Browser Overlay** | `http://localhost:3000/caption/overlay` | Transparent alpha layer for vMix Web Browser input |
| **Resizable Window** | `http://localhost:3000/caption/window` | Floating resizable pop-out window for NDI / Window Capture |
| **Stage LED Wall** | `http://localhost:3000/caption/led` | High-contrast full-screen output for LED processors |

---

## 🚀 Quick Start Guide

### Prerequisites
- [Node.js](https://nodejs.org/) v18.0 or higher.
- Google Chrome or Microsoft Edge (recommended for Web Speech API audio processing).

### Installation & Startup

1. **Clone repository**:
   ```bash
   git clone https://github.com/fearmexxx/livecap.git
   cd livecap
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run the software**:
   - On Windows: Double-click **`run_live_caption.bat`**
   - Or in terminal:
     ```bash
     npm run dev
     ```

4. Open your browser to `http://localhost:3000/caption`.

---

## 🎬 vMix Integration Step-by-Step

1. Launch your Next.js server (`http://localhost:3000`).
2. In **vMix**, click **Add Input** at the bottom left $\rightarrow$ select **Web Browser**.
3. In the URL field, paste:
   ```text
   http://localhost:3000/caption/overlay
   ```
4. Set Resolution:
   - **Width**: `1920`
   - **Height**: `1080` (or `1920×300` for lower-third crop)
5. Ensure **"Transparent"** is checked. Click **OK**.
6. Assign this input to **Overlay 1** or **Overlay 2** on your vMix transition bar.
7. Subtitles will overlay in real-time onto your live broadcast feed with 0 background artifacts!

---

## 📽️ Projecting to Stage LED Screen

1. Connect an HDMI or DisplayPort cable from the PC to your LED Video Processor (Novastar, Colorlight, Barco, etc.).
2. In Windows Display Settings, set the display mode to **Extend** (`Win + P` $\rightarrow$ Extend).
3. On the Operator Console, click **"LED Stage View"** (or open `http://localhost:3000/caption/led`).
4. Drag the window onto your secondary LED monitor.
5. Press **F11** (or double click anywhere) to enter full screen.

---

## 🌐 Multi-PC LAN Setup (Operator Laptop $\leftrightarrow$ vMix PC)

If your audio engineer is on a laptop and vMix runs on a separate broadcast PC connected to the same Wi-Fi / Local Area Network:
1. Find the IP address of the operator machine (e.g., `192.168.1.50`).
2. On the vMix machine, add the Web Browser Input pointing to:
   ```text
   http://192.168.1.50:3000/caption/overlay
   ```
3. All captions, style changes, and panic-clear events synchronize across the LAN in real-time.

---

## ⌨️ Keyboard Shortcuts (Resizable Window)

- `H`: Toggle toolbar visibility (Clean broadcast mode)
- `ESC`: Restore toolbar controls
- `F`: Toggle Fullscreen

---

## 🏗️ Architecture & Technology Stack

- **Framework**: Next.js 16 (App Router), React 19, TypeScript
- **Styling**: Tailwind CSS v4, Lucide Icons, Framer Motion
- **Speech Ingestion**: Web Speech API (`webkitSpeechRecognition`), Web Audio API (`AnalyserNode` VU meter)
- **Neural Translation**: High-speed translation endpoint with in-memory LRU caching, regex glossary mapper, and diacritic handling
- **Real-Time IPC & Sync**: `BroadcastChannel` API + `localStorage` fallback + Server-Sent Events / state polling

---

## 📄 License & Copyright

**Copyright © 2026 VBE Agency. All rights reserved.**

Developed and engineered by **VBE Agency** — specializing in premium event production, corporate kick-offs, high-stakes brand activations, and live broadcast engineering in Ho Chi Minh City & Vietnam.

Unauthorized copying, distribution, or modification of this software without prior permission from VBE Agency is strictly prohibited.
