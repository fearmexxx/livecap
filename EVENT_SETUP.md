# Event setup: one LiveCap PC per room

This is the recommended way to run LiveCap when an event has several rooms (for example 4 breakout
rooms in one hall). Each room runs its own complete copy of LiveCap on its own PC. The rooms do not
share a network or a server, so a problem in one room never affects the others.

## What each room needs

| Item | Notes |
| --- | --- |
| Windows laptop or Mac | Google Chrome. 8 GB RAM is enough for Web Speech or OpenRouter. Nothing else to install. |
| Audio feed | Line out / aux send from the room's sound desk into a USB audio interface. Avoid a room mic: it picks up audience noise and the PA echo. |
| Internet | A 5G router used only by this laptop. Speech recognition and translation run in the cloud and need well under 1 Mbps. |
| Backup internet | A second SIM on a different carrier, or a phone hotspot. |
| Output | LED: second HDMI output to the LED processor. vMix / OBS on the same laptop: browser input. |

## Prepare at the office (once, about 15 minutes for all laptops)

1. **Get the download.** Use the ready-made zip for each laptop type:
   `LiveCap-<version>-win-x64.zip` (Windows), `LiveCap-<version>-darwin-arm64.zip` (Mac M1 to M4) or
   `LiveCap-<version>-darwin-x64.zip` (older Intel Mac). To build them yourself: `npm ci && npm run portable`
   (output in `dist/portable/`). Each zip contains its own Node.js, so the laptop needs no Node, npm or git.
2. **Add the translation key once.** Unzip one copy, open `livecap.env` in Notepad / TextEdit and paste an
   OpenRouter key after `OPENROUTER_API_KEY=`. With a key, the "Auto" engine uses Gemini 2.5 Flash, which handles
   Korean better than free Google and avoids the free endpoints' rate limits. Without a key, Auto uses free Google.
   Then copy this folder (not the original zip) to every laptop, for example to the Desktop.
3. **Set up every hall on one laptop.** Start LiveCap (below), switch between Hall 1 to Hall 5 with the
   top-left room switcher and fill in each hall's speakers, glossary, event context and display style.
   Then **Export → Cài đặt sự kiện → Lưu file cài đặt** saves one `LiveCap_event_settings_<date>.json`.
4. **Load it on the other laptops.** On each laptop: **Export → Nạp file cài đặt** and pick that file. Every hall's
   setup is loaded; each laptop keeps its own microphone choice and keys.

## At the venue, per room

1. Connect the sound desk feed, the 5G router and the LED / vMix output.
2. Start LiveCap:
   - **Windows:** double-click **`START LiveCap.bat`**. If SmartScreen appears: More info → Run anyway.
   - **Mac:** the first time, right-click **`START LiveCap.command`** → Open → Open. After that, double-click.
3. Type the hall number (1 to 5) and press Enter. The laptop remembers it, so next time just press Enter.
   Chrome opens the console for that hall. Keep the black window open all day; closing it stops LiveCap.
4. In the console:
   - Pick the audio interface under **Audio & Mic** and check the VU meter moves when the speaker talks.
   - Under **API & AI**, keep STT on **Web Speech API** and Translation on **Auto**. Click **Test Translation**.
   - Pick the speaker language (한국어 / English) at the top.
5. Outputs on the same laptop (the black window prints these with the right hall number, here Hall 2):
   - **LED screen:** click **LED Stage**, drag the window to the LED output, press F11.
   - **vMix:** Add Input → Web Browser → `http://localhost:3000/caption/overlay?session=hall-2`, 1920×1080, transparent.
   - **OBS:** Sources → Browser → URL `http://localhost:3000/caption/overlay?session=hall-2`, width 1920, height 1080.
     The background is already transparent.
6. Press **START CAPTION**. Use the **Test** phrases first if you want to check the LED without a speaker.

If the black window says port 3000 is busy, another LiveCap is already running: close it, or set `PORT=3001`
in `livecap.env`.

### Developer route (running from the source code)

With Node.js 20+ installed you can still run from a git checkout: `start_room.bat` (Windows) or
`./start_room.sh` (Mac/Linux). Keys then go in `.env.local` (copy `.env.example`). Run `start_room.bat rebuild`
after `git pull`.

## If vMix or the LED runs on a second PC in the same room

Connect the two PCs to the same room router or with a cable, then:

1. On the caption laptop, set `LIVECAP_PIN=` to a PIN of your choice and `LIVECAP_LAN=1` in `livecap.env`
   (developer route: `.env.local` and `start_room.bat lan`).
2. Start LiveCap as usual. Find the laptop's IP address (Windows: `ipconfig`; Mac: System Settings → Wi-Fi → Details).
3. On the vMix PC, use `http://<caption-pc-ip>:3000/caption/overlay?session=hall-N`. Output pages only read captions and
   never need the PIN.
4. Anyone who wants to *send* captions from another device must enter the PIN in
   **API & AI → Room PIN**. Guests on the same Wi-Fi cannot change the screens.

Note: Chrome only allows the microphone on `localhost` or HTTPS, so always run the console on the PC
that has the audio feed.

## Warnings on the console

- **Amber bar "Translation failed, the screen is showing the original language"**: the internet is down
  or every translation engine is failing. Switch to the backup internet.
- **Amber bar "...using free Google fallback"**: the OpenRouter / DeepL key failed (credit, typo). Captions
  continue on free Google; fix the key at the break.
- **Amber bar "Room PIN required"**: this console is talking to a server started with `LIVECAP_PIN`;
  enter the PIN under **API & AI → Room PIN**.
- **Amber bar "Speech-to-text is falling behind"**: OpenRouter or the local GPU is answering slower than
  the speaker talks. Check the internet, or switch STT to Web Speech API.

## Choosing the speech-to-text engine

| Engine | When to use |
| --- | --- |
| Web Speech API (default) | Best live feel (words appear as spoken). Free. Chrome only, needs internet. |
| OpenRouter `gpt-transcribe` | Higher accuracy for accented speech. Paid. Captions appear per sentence (cut at the speaker's pauses, max 8 s). |
| Local GPU (`run_local_gpu_server.bat` on Windows, `./run_local_gpu_server.sh` on Mac) | NVIDIA GPU PCs, or Apple Silicon Macs (M1–M4, runs on the Mac's GPU via MLX). Speech stays on the PC, but translation still needs internet. On Windows run `pip install -r requirements.txt` first; the Mac script sets everything up on first run. Without NVIDIA or Apple Silicon it runs on the CPU and is slow. |

## Rehearsal checklist

- [ ] Run each room PC for 2 to 3 hours on its 5G router with a real speaker or a recording.
- [ ] Unplug the 5G router for 30 seconds and check captions recover after reconnecting.
- [ ] Check Vietnamese diacritics are readable on the actual LED wall from the back row.
- [ ] Export TXT / SRT at the end of the rehearsal to confirm transcripts save.
