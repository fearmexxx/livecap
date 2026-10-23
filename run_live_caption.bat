@echo off
title VBE Live Caption Studio (vMix & LED)
echo ========================================================
echo        VBE LIVE CAPTION STUDIO - vMix & LED
echo   Korean / English -^> Vietnamese Real-Time Subtitles
echo ========================================================
echo.
echo Starting web server on http://localhost:3000 ...
echo Opening Operator Console in default browser...
echo.

start "" "http://localhost:3000/caption"
npm run dev

pause
