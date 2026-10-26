# VBE LiveCap Studio — Project Status, Architecture & Handover Guide

**Project Path**: `E:\2026\livecap`
**GitHub Repository**: `https://github.com/fearmexxx/livecap.git` (`branch: main`)
**Last Updated**: 2026-10-26

---

## 1. Executive Summary & Current Status
**VBE LiveCap Studio** is a standalone Next.js 16 + React 19 + Python FastAPI (`faster-whisper`) real-time speech-to-text (Korean `ko-KR` & English `en-US`) and AI Vietnamese translation system designed for live conferences, LED stage walls, and vMix/OBS broadcast overlays.

### Completed Milestones
1. **Standalone Extraction**: Separated cleanly from the `vbe.vn` corporate repo into `E:\2026\livecap`.
2. **Full HD 1080p Operator Console (`/caption`)**:
   - Compact 2-column dark broadcast layout (`h-screen`) with collapsible live preview, live VU meter, gain booster (`1.0x – 4.0x`), 3-second mic loopback tester, pinned emergency stage announcements, and scrollable transcript feed.
   - Configured **Roboto** (`subsets: ["vietnamese", "latin"]`) as default font across all displays for clean Vietnamese diacritics.
3. **Hybrid 3-Engine Speech-to-Text (STT)**:
   - **Web Speech API** (Chrome/Edge built-in, zero-cost, real-time interim + final results).
   - **OpenRouter Cloud STT** (`openai/gpt-transcribe` via `/api/caption/transcribe`).
   - **Local Hardware GPU Whisper Server** (`local_gpu_whisper_server.py` on port `8000`, supporting NVIDIA CUDA `float16`, Intel Arc A750 / OpenVINO / CPU `int8` multithreading, pre-warming `base` and `small` models).
4. **Multi-Room / Multi-Hall & Multi-Device Hub (`/api/caption/sync`)**:
   - Supports isolated rooms (`?session=hall-a`, `?session=hall-b`, `?session=track-1`, or any custom slug) with server-retained room history (`100` lines/room) and connected device tracking (`operator`, `mic-node`, `led`, `vmix`, `viewer`).
   - Multiple capture devices can stream captions into the same room concurrently.
5. **5-Speaker Default Roster & 1-Click / Hotkey Switching (`Alt+1` .. `Alt+9`)**:
   - Each room has a customizable roster of 5+ speakers (`SpeakerProfile`), each with Name, Role, Badge Color, Default Language (`ko-KR` / `en-US`), and optional dedicated Microphone Device ID.
   - Color-coded speaker badges render on the **Stage LED Wall** (`rolling-ledger` & `bilingual` modes) and **vMix Overlay**.
6. **Stage LED Wall Calibration HUD (`/caption/led`)**:
   - Auto-hiding top-right hover HUD on the LED output screen allowing on-the-fly font size (`+`/`-`), display mode switching, device count verification, and fullscreen toggle (`F11` / double-click).
7. **Translation Accuracy & ASR Pipeline Audit/Upgrade (`textProcessing.ts` + `speechEngine.ts`)**:
   - **Sentence Assembler (`SentenceAssembler`)**: Buffers short ASR fragments into complete grammatical sentences before translating, eliminating broken phrase-by-phrase literal translations.
   - **VAD-Based Audio Segmentation (`startVadSegmentation`)**: Cuts audio chunks for Whisper/OpenRouter on natural speech pauses (`550ms` silence after speech) rather than fixed 3-second slices that chop words in half.
   - **No Dropped Speech Queue**: Replaced the single-chunk drop guard with a FIFO segment queue (`MAX_SEGMENT_QUEUE = 4`) and ordered translation emission (`drainPending`) so sentences always appear in spoken order.
   - **Context-Aware AI Interpreter Prompt (`buildInterpreterMessages`)**: Sends the previous 3 sentences as read-only context, current speaker name, event topic/domain (`eventContext`), and mandatory glossary pairs to OpenRouter (`google/gemini-2.5-flash` / `gpt-4o-mini`) and OpenAI.
   - **Pre- & Post-Translation Glossary Enforcement**: Protects Korean Hangul (`삼성전자`) and English acronyms (`AI`, `VBE`, `HCMC`) before calling Google/DeepL and verifies them post-translation.
   - **Whisper Hallucination Filter (`isLikelyHallucination` + segment confidence checks)**: Filters out silence hallucinations (`"Thank you for watching"`, `"시청해 주셔서 감사합니다"`, repetition loops, and high `no_speech_prob` segments).
8. **Automated Unit Test Suite (`npm test`)**:
   - 10 unit tests across 3 suites in `src/lib/caption/__tests__/livecap.test.ts` testing multi-room isolation, multi-device ordering, device TTL pruning, `SentenceAssembler`, hallucination filtering, context prompts, glossary boundaries, and `.TXT`/`.SRT`/`.VTT`/`.JSON` exports.

---

## 2. Key File Map (`E:\2026\livecap`)
| File Path | Responsibility |
| :--- | :--- |
| `src/lib/caption/types.ts` | Core TypeScript types (`CaptionConfig`, `CaptionItem`, `SpeakerProfile`, `ConnectedDevice`, `DEFAULT_SPEAKERS` with 5 speakers, `DEFAULT_CAPTION_CONFIG`). |
| `src/lib/caption/textProcessing.ts` | `SentenceAssembler`, `isLikelyHallucination`, `preApplyGlossary`, `postApplyGlossary`, `buildInterpreterMessages`, `cleanLlmOutput`. |
| `src/lib/caption/speechEngine.ts` | `LiveSpeechEngine`: WebAudio RMS/VAD analyzer, Web Speech recognizer with sentence assembly, VAD audio recorder + FIFO queue for Whisper/OpenRouter, ordered translation dispatcher. |
| `src/lib/caption/roomStore.ts` | `MultiRoomHub`: Server-side state per room (`history`, `currentCaption`, `config`, `devices` presence, TTL pruning). |
| `src/lib/caption/sync.ts` | `CaptionSyncService`: Triple-layer sync (`BroadcastChannel` + `localStorage` + `/api/caption/sync` LAN polling). |
| `src/lib/caption/useCaptionReceiver.ts` | React hook for `/caption/led`, `/caption/overlay`, and `/caption/window` outputs. |
| `src/lib/caption/transcriptUtils.ts` | `.TXT`, `.SRT`, `.VTT`, and `.JSON` transcript exporters with speaker tags. |
| `src/app/api/caption/translate/route.ts` | Multi-engine translation API (`openrouter`, `openai`, `deepl`, and 3-tier `google-free` fallback) with context window, event context, and LRU cache. |
| `src/app/api/caption/transcribe/route.ts` | Audio chunk proxy to OpenRouter (`openai/gpt-transcribe`) or Local GPU Server (`:8000`) with dynamic Whisper prompt injection. |
| `src/app/api/caption/sync/route.ts` | GET/POST endpoint for multi-room state, device heartbeats, and `action=list-sessions`. |
| `src/app/caption/page.tsx` | Main Operator Console UI (header, outputs bar, 5-speaker switcher bar + modal, preview, emergency pin bar, transcript log, export modal, room manager modal). |
| `src/components/caption/ConsoleSettings.tsx` | 4-tab right-hand settings panel (`Audio & Mic`, `Display`, `API & AI` including `eventContext`, `Glossary`). |
| `src/app/caption/led/page.tsx` | Fullscreen Stage LED Wall view with auto-hiding top-right calibration HUD. |
| `local_gpu_whisper_server.py` | FastAPI + `faster-whisper` server (CUDA / Intel Arc OpenVINO / CPU INT8) with VAD & confidence filtering. |
| `src/lib/caption/__tests__/livecap.test.ts` | Node.js test runner suite (`npm test`). |

---

## 3. Remaining / Next-Step Tasks (For Immediate Continuation in Another App)

### Task A — 5-Hall Event Deployment Bundle & Launcher Scripts
The upcoming event requires **5 independent halls, each with its own laptop + audio mixer + 5-speaker set**:
1. **Hall Presets (`hall-1` .. `hall-5`)**:
   - Update `PRESET_SESSIONS` in `src/app/caption/page.tsx` or add a 1-click **5-Hall Preset Loader** (`Hall 1` .. `Hall 5`) so each laptop can be launched directly into its assigned hall (`http://localhost:3000/caption?session=hall-1` .. `hall-5`).
   - Add JSON **Import / Export Config & Speaker Roster** button in `ConsoleSettings.tsx` so an operator can prepare the 5 halls' speaker names, glossaries, and event contexts beforehand and load `hall-1.json` .. `hall-5.json` on each laptop in 5 seconds.
2. **Portable Production Bundle & Batch Launchers**:
   - Create a clean `dist` / portable launcher script (`START_HALL_PRODUCTION.bat`) that runs the pre-built Next.js production server (`npm run start`, which starts in ~2s instead of `npm run dev`) + optional `local_gpu_whisper_server.py`, and prompts the operator for Hall number (`1–5`) to open both the Operator Console (`/caption?session=hall-N`) and Stage LED window (`/caption/led?session=hall-N`).
   - Note on `node_modules`: `E:\2026\livecap\node_modules` is currently a symlink/junction to `E:\2026\vbe\node_modules`. When copying `E:\2026\livecap` to 5 standalone event laptops, either run `npm ci --omit=dev` (or copy real `node_modules`) or configure `output: "standalone"` in `next.config.ts` so the bundle is self-contained without needing `E:\2026\vbe`.

### Task B — Recommended Live Event Settings for Highest Translation Accuracy
- **Best Translation Quality**: Set **Translation Engine** = `OpenRouter LLM` (`google/gemini-2.5-flash` or `openai/gpt-4o-mini`), set `OPENROUTER_API_KEY` in `.env.local` (or UI), and fill in the **Ngữ cảnh sự kiện (Event Context)** box + **Glossary** for each hall.
- **Best STT Setup for Mixer Input**: Connect the mixer's AUX/Sub-group (voice only, no BGM) via USB audio interface; use **Web Speech API** if stable wired Ethernet is available, or **Local GPU (`small` model)** / **OpenRouter (`openai/gpt-transcribe`)** with VAD segmentation (`6s` max segment).

---

## 4. Quick Commands Reference
```powershell
# 1. Run automated unit tests (10 tests)
cd E:\2026\livecap
npm test

# 2. Build production bundle
npm run build

# 3. Start production web server (Port 3000)
npm run start

# 4. Start Local GPU Whisper server (Port 8000, or set LIVECAP_GPU_PORT=8008 if 8000 is used by Green Tunnel)
python local_gpu_whisper_server.py
```
