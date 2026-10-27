@echo off
setlocal
title LiveCap Room Server - VBE Agency
cd /d "%~dp0"

rem Usage:
rem   start_room.bat            Standalone room PC: only this PC can open LiveCap (recommended)
rem   start_room.bat lan        Also serve output pages to other PCs on this room's network (needs LIVECAP_PIN)
rem   start_room.bat rebuild    Rebuild after updating the code, then start standalone
rem   start_room.bat lan 3001   Optional port as the second argument (default 3000)

set "MODE=%~1"
set "PORT=%~2"
if "%MODE%"=="" set "MODE=local"
if "%PORT%"=="" set "PORT=3000"
set "REBUILD=0"
if /I "%MODE%"=="rebuild" (
  set "REBUILD=1"
  set "MODE=local"
)

echo ========================================================
echo   VBE LIVE CAPTION STUDIO - Room Server
echo   Korean / English to Vietnamese live subtitles
echo ========================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed. Install Node.js 20 LTS or newer from https://nodejs.org
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [1/3] Installing dependencies, first run only...
  call npm ci
  if errorlevel 1 call npm install
  if errorlevel 1 goto :fail
)

if "%REBUILD%"=="1" if exist ".next" rmdir /s /q ".next"
if not exist ".next\BUILD_ID" (
  echo [2/3] Building the production version, first run only, about 1 minute...
  call npm run build
  if errorlevel 1 goto :fail
)

set "HOST=127.0.0.1"
if /I "%MODE%"=="lan" (
  findstr /R /B /C:"LIVECAP_PIN=..*" ".env.local" >nul 2>nul
  if errorlevel 1 (
    echo [ERROR] LAN mode needs a room PIN so guests on the network cannot change the screens.
    echo         Copy .env.example to .env.local and set LIVECAP_PIN=your-pin
    pause
    exit /b 1
  )
  set "HOST=0.0.0.0"
)

echo [3/3] Starting LiveCap on port %PORT% in %MODE% mode...
echo.
echo   Operator console : http://localhost:%PORT%/caption
echo   LED stage output : http://localhost:%PORT%/caption/led
echo   vMix / OBS input : http://localhost:%PORT%/caption/overlay
if /I "%MODE%"=="lan" (
  echo.
  echo   Other PCs on this network use this PC's address instead of localhost:
  ipconfig | findstr /C:"IPv4"
)
echo.
echo   Keep this window open during the event. Close it to stop LiveCap.
echo.

start "" cmd /c "timeout /t 4 /nobreak >nul && start http://localhost:%PORT%/caption"
call npx next start -H %HOST% -p %PORT%
goto :eof

:fail
echo.
echo [ERROR] Setup failed. Check the messages above, your internet connection, and try again.
pause
exit /b 1
