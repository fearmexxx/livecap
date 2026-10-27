# Event setup: one LiveCap PC per room

This is the recommended way to run LiveCap when an event has several rooms (for example 4 breakout
rooms in one hall). Each room runs its own complete copy of LiveCap on its own PC. The rooms do not
share a network or a server, so a problem in one room never affects the others.

## What each room needs

| Item | Notes |
| --- | --- |
| Windows PC or laptop | Node.js 20 LTS+, Google Chrome. 8 GB RAM is enough for Web Speech or OpenRouter. |
| Audio feed | Line out / aux send from the room's sound desk into a USB audio interface. Avoid a room mic: it picks up audience noise and the PA echo. |
| Internet | A 5G router used only by this PC. Speech recognition and translation run in the cloud and need well under 1 Mbps. |
| Backup internet | A second SIM on a different carrier, or a phone hotspot. |
| Output | LED: second HDMI output to the LED processor. vMix / OBS on the same PC: browser input. |

## First-time install (do this at the office, not at the venue)

1. Install Node.js 20 LTS from https://nodejs.org and Google Chrome.
2. Download or clone this repository to the PC, for example `C:\LiveCap`.
3. Optional but recommended: copy `.env.example` to `.env.local` and paste an OpenRouter key into
   `OPENROUTER_API_KEY=`. With a key, the "Auto" translation engine uses Gemini 2.5 Flash, which handles
   Korean better than free Google and is not subject to the free endpoints' rate limits. The key stays on this PC.
4. Double-click **`start_room.bat`**. The first run installs and builds (a few minutes), then opens the
   console at `http://localhost:3000/caption`.

After updating the code (`git pull`), run `start_room.bat rebuild` once.

## At the venue, per room

1. Connect the sound desk feed, the 5G router and the LED / vMix output.
2. Run `start_room.bat`. Keep its black window open all day.
3. In the console:
   - Pick the audio interface under **Audio & Mic** and check the VU meter moves when the speaker talks.
   - Under **API & AI**, keep STT on **Web Speech API** and Translation on **Auto**. Click **Test Translation**.
   - Pick the speaker language (한국어 / English) at the top.
4. Outputs on the same PC:
   - **LED screen:** click **LED Stage**, drag the window to the LED output, press F11.
   - **vMix:** Add Input → Web Browser → `http://localhost:3000/caption/overlay`, 1920×1080, transparent.
   - **OBS:** Sources → Browser → URL `http://localhost:3000/caption/overlay`, width 1920, height 1080.
     The background is already transparent.
5. Press **START CAPTION**. Use the **Test** phrases first if you want to check the LED without a speaker.

Give each room's console a different room name (top-left session switcher) so exported transcripts are
labelled per room.

## If vMix or the LED runs on a second PC in the same room

Connect the two PCs to the same room router or with a cable, then:

1. On the caption PC, copy `.env.example` to `.env.local` and set `LIVECAP_PIN=` to a PIN of your choice.
2. Start with `start_room.bat lan`. The window prints this PC's IP address.
3. On the vMix PC, use `http://<caption-pc-ip>:3000/caption/overlay`. Output pages only read captions and
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
| Local GPU (`run_local_gpu_server.bat`) | NVIDIA GPU PCs. Speech stays on the PC, but translation still needs internet. Run `pip install -r requirements.txt` first. Without NVIDIA it runs on the CPU and is slow. |

## Rehearsal checklist

- [ ] Run each room PC for 2 to 3 hours on its 5G router with a real speaker or a recording.
- [ ] Unplug the 5G router for 30 seconds and check captions recover after reconnecting.
- [ ] Check Vietnamese diacritics are readable on the actual LED wall from the back row.
- [ ] Export TXT / SRT at the end of the rehearsal to confirm transcripts save.
