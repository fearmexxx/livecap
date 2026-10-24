@echo off
title VBE Live Caption Studio (vMix & LED)
echo ========================================================
echo        VBE LIVE CAPTION STUDIO - vMix & LED
echo   Korean / English -^> Vietnamese Real-Time Subtitles
echo   Copyright (c) 2026 VBE Agency. All rights reserved.
echo ========================================================
echo.
cd /d "%~dp0"

echo [1/2] Launching Local Hardware GPU Server (Port 8000)...
start "LiveCap GPU Whisper Server" cmd /k "python local_gpu_whisper_server.py"

echo [2/2] Starting LiveCap Web Studio on http://localhost:3000 ...
timeout /t 2 /nobreak >nul
start "" "http://localhost:3000/caption"
npm run dev

pause
