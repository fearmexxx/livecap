@echo off
title "LiveCap Studio (vMix & LED) - VBE Agency"
echo ========================================================
echo        VBE LIVE CAPTION STUDIO - vMix ^& LED
echo   Korean / English -^> Vietnamese Real-Time Subtitles
echo   Copyright (c) 2026 VBE Agency. All rights reserved.
echo ========================================================
echo.
cd /d "%~dp0"

echo [1/2] Launching Local Hardware GPU Server (Port 8000)...
start "LiveCap GPU Whisper Server" cmd /k "python local_gpu_whisper_server.py"

echo [2/2] Starting LiveCap Web Studio on http://localhost:3000 ...
echo Notice: Webpack server may take 5-8 seconds to compile on first launch.
echo If your browser opens early, simply click 'Reload' (F5).
echo.
start "" cmd /c "timeout /t 6 /nobreak >nul && start http://localhost:3000/"
npm run dev

pause
