LIVECAP - live Vietnamese subtitles for one hall
================================================

What you need on this laptop
- Google Chrome (or Microsoft Edge on Windows)
- Internet (5G router or venue Wi-Fi)
- The sound desk feed into a USB audio interface (better than a room microphone)
Nothing else to install.

1. START
   Windows: double-click  "START LiveCap.bat"
   Mac:     double-click  "START LiveCap.command"
            First time only, if macOS says it "cannot be opened" or "not verified": click Done, open
            System Settings -> Privacy & Security, scroll down, click "Open Anyway", confirm.
            Then double-click again. After that it always opens straight away.
   Type this laptop's hall number (1-5) and press Enter. It is remembered next time.
   Chrome opens the LiveCap console for that hall. Keep the black window open all day.

   If Windows shows "Windows protected your PC": click "More info" -> "Run anyway".

2. SET UP THE HALL (in the console)
   - Audio & Mic: choose the USB audio interface; the meter must move when the speaker talks.
   - API & AI: click "Test Translation".
   - Pick the speaker's language at the top: 한국어 or English.
   - If you received an event settings file: Export -> "Nạp file cài đặt" -> choose the file.
     It loads speakers, glossary and event context for every hall.

3. SCREENS
   - LED: click "LED Stage", drag the window to the LED output, press F11.
   - vMix: Add Input -> Web Browser -> http://localhost:3000/caption/overlay?session=hall-N (1920x1080)
   - OBS:  Sources -> Browser -> same URL, 1920x1080 (background is already transparent)
   (replace N with the hall number)

4. GO LIVE
   Press START CAPTION. Use the TEST buttons first to check the LED without a speaker.

Better translation (recommended)
   Open livecap.env with Notepad / TextEdit, paste an OpenRouter key after OPENROUTER_API_KEY=,
   save, close the black window and start again.

Warnings in the console
   Amber "Translation failed"      -> internet is down: switch to the backup hotspot.
   Amber "...free Google fallback" -> the OpenRouter key failed; captions continue, fix the key at the break.
