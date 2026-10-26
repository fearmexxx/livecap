# VBE LiveCap Studio — Production Playbook & Go-To-Market (GTM) Strategy

> [!IMPORTANT]
> **Current Status**: Production Build Ready (`v1.1.0`) — Equipped with **Multi-Room Hub**, **Multi-Device LAN Sync**, **Multi-Speaker Attribution**, **LED Stage Wall Calibration HUD**, and **Local GPU (Intel Arc / NVIDIA) + OpenRouter + WebSpeech Hybrid STT**.

---

## 1. Architecture Overview (Multi-Room, Multi-Device, Multi-Speaker)

```mermaid
flowchart LR
    subgraph StageInputs["🎙️ Stage & Room Audio Inputs"]
        Mic1["Operator Console 1\n(Main Stage Mic / Mixer)"]
        Mic2["Remote Mic Node 2\n(Panelist Wireless Mic)"]
        Mic3["Breakout Room PC\n(Hall B Mixer)"]
    end

    subgraphSTTEngines["⚡ Hybrid STT & Translation"]
        WS["Web Speech API\n(Zero-Cost Realtime)"]
        GPU["Local GPU Server :8000\n(Intel Arc A750 / NVIDIA)"]
        OR["OpenRouter Cloud\n(openai/gpt-transcribe)"]
    end

    subgraph SyncHub["🔄 Multi-Room Sync Hub (/api/caption/sync)"]
        RoomA["Room: hall-a\n(History + Speaker Tags + Presence)"]
        RoomB["Room: hall-b\n(Isolated Session State)"]
    end

    subgraph Outputs["📺 Live Event Outputs"]
        LED["Stage LED Wall (/caption/led)\nAuto-Hiding Calibration HUD"]
        VMIX["vMix / OBS Alpha Overlay\n(/caption/overlay)"]
        WIN["Stage Teleprompter Window\n(/caption/window)"]
        EXP["Post-Event Exports\n(.SRT / .VTT / .TXT / .JSON)"]
    end

    Mic1 & Mic2 --> WS & GPU & OR
    Mic3 --> WS & GPU & OR
    WS & GPU & OR --> RoomA & RoomB
    RoomA --> LED & VMIX & WIN & EXP
    RoomB --> LED & VMIX
```

---

## 2. In-House Event Testing Playbook (Live LED & Multi-Room Checklist)

### A. Pre-Event Hardware & Audio Routing (T-60 mins)
1. **Sound Mixer to Operator PC**:
   - Connect the venue mixing console's **AUX / Sub-Group Output** (carrying only speaker microphones, excluding background music) into the LiveCap PC via USB Audio Interface.
   - Open [ConsoleSettings.tsx](file:///e:/2026/livecap/src/components/caption/ConsoleSettings.tsx) $\rightarrow$ **Audio & Mic** tab $\rightarrow$ Select the USB Audio Interface and run the **3-Second Loopback Test** to verify clean signal (`45% – 75%` on the VU meter).
2. **Local GPU Server Warmup**:
   - Run [run_local_gpu_server.bat](file:///e:/2026/livecap/run_local_gpu_server.bat) (`http://127.0.0.1:8000`). Both `base` and `small` Whisper models are pre-warmed at startup with `without_timestamps=True` and `vad_filter=True` for sub-second inference on Intel Arc A750 / NVIDIA CUDA.
3. **Speaker Roster & Glossary Setup**:
   - Click **Speakers $\rightarrow$ Quản lý** in [page.tsx](file:///e:/2026/livecap/src/app/caption/page.tsx) to enter all keynote speakers, panelists, and moderators with their respective badge colors and default languages (`🇰🇷 ko-KR` or `🇺🇸 en-US`).
   - Add event-specific brand names, VIP names, and technical terms in the **Glossary** tab.

### B. Multi-Room & LED Wall Setup (T-30 mins)
1. **LED Wall Calibration**:
   - Click **LED Stage** to open `/caption/led?session=hall-a`.
   - Move the window to the LED Processor output display and double-click (or press `F11`) for fullscreen.
   - Hover the mouse at the top-right corner of the LED screen to reveal the **Stage Calibration HUD**: adjust font size (`+` / `-`) and switch between **Rolling Ledger** (multi-line stage wall) and **Bilingual Lower-Third**.
2. **Live Speaker Switching During Panels**:
   - Use keyboard shortcuts `Alt + 1` through `Alt + 9` (or click the speaker pills) to switch the active speaker in real time. Each line on the LED wall and in the exported transcript is color-coded and tagged with the speaker's name and role.

---

## 3. Next Phase Roadmap (Phase 2 & Phase 3 Engineering)

| Phase | Milestone | Technical Implementation | Target Use Case |
| :--- | :--- | :--- | :--- |
| **Phase 2.1** | **WebSocket / WebRTC Sub-50ms Bus** | Replace HTTP 300ms LAN polling with persistent WebSocket rooms + binary audio streaming to the GPU server | Large multi-hall conventions with 50+ concurrent screens |
| **Phase 2.2** | **Automatic Speaker Diarization (Multi-Channel ASIO)** | Capture multi-track USB mixer channels simultaneously (Ch 1 = Mic 1, Ch 2 = Mic 2) with automatic per-channel VAD | Panel discussions without manual `Alt+1..9` operator switching |
| **Phase 2.3** | **Audience Mobile QR Portal (BYOD)** | Lightweight mobile web view via QR code where attendees select their own target language (VI / EN / KO / JA / ZH) | International summits & tourist conferences |
| **Phase 3.0** | **NDI® Native Stream & Hardware Appliance** | Direct NDI® video+alpha output over LAN without HDMI capture cards; pre-packaged Mini-PC + GPU appliance | Turnkey B2B rental & enterprise sales |

---

## 4. Go-To-Market (GTM) Strategy

### Target Customer Segments
1. **In-House & Agency Event Production (VBE Event Group Core Advantage)**:
   - Value Proposition: Replace or augment human simultaneous interpreters and manual stenographers with instant bilingual LED stage walls and vMix livestream overlays.
2. **5-Star Hotels, Convention Centers & Exhibition Organizers (B2B Partnership)**:
   - Bundle LiveCap Studio as a premium add-on for Korea–Vietnam / Global–Vietnam summits, tech expos, and corporate town halls.
3. **Broadcast & Livestream Studios**:
   - Zero-latency Alpha Channel overlay (`/caption/overlay`) + instant post-event `.SRT` / `.VTT` export for YouTube/TikTok highlight reels within 60 seconds of event wrap.

### Packaging & Pricing Model
- **Tier 1 — Event Rental / Managed Service (Per-Event)**:
  - Turnkey on-site deployment (LiveCap Server + Operator + LED/vMix integration) billed per event day.
- **Tier 2 — Pro Studio SaaS License (Monthly / Annual)**:
  - Cloud + Local GPU hybrid software license for AV production houses, supporting unlimited rooms and custom branding.
- **Tier 3 — Enterprise On-Premise Appliance**:
  - Offline-first Local GPU Box (Intel Arc / NVIDIA RTX) for government, banking, and confidential corporate boardrooms requiring 100% air-gapped transcription.
