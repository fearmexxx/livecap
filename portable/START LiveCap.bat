@echo off
setlocal EnableDelayedExpansion
title LiveCap - keep this window open
cd /d "%~dp0"

rem ---- Load settings from livecap.env (KEY=VALUE lines, # comments) ----
if exist "livecap.env" (
  for /f "usebackq eol=# tokens=1,* delims==" %%A in ("livecap.env") do (
    if not "%%B"=="" set "%%A=%%B"
  )
)
if "%PORT%"=="" set "PORT=3000"

rem ---- Which hall is this laptop? Remembered in hall.txt ----
set "HALL="
if exist "hall.txt" set /p HALL=<hall.txt
echo.
echo  =====================================================
echo    LIVECAP - Live Vietnamese subtitles
echo  =====================================================
echo.
if "!HALL!"=="" (
  set /p "HALL=  Which hall is this laptop? Type a number 1-5 and press Enter: "
) else (
  set "NEWHALL="
  set /p "NEWHALL=  This laptop is Hall !HALL!. Press Enter to keep, or type another number: "
  if not "!NEWHALL!"=="" set "HALL=!NEWHALL!"
)
if "!HALL!"=="" set "HALL=1"
> "hall.txt" echo !HALL!

set "HOSTNAME=127.0.0.1"
if "%LIVECAP_LAN%"=="1" (
  if "%LIVECAP_PIN%"=="" (
    echo.
    echo  [!] LIVECAP_LAN=1 needs a LIVECAP_PIN in livecap.env. Starting for this laptop only.
  ) else (
    set "HOSTNAME=0.0.0.0"
  )
)

rem ---- Is the port already taken? ----
rem LiveCap already running there: just open the console. Another program: use the next free port.
curl.exe -s -m 2 "http://localhost:%PORT%/api/caption/translate" 2>nul | findstr /c:"serverKeys" >nul 2>&1
if not errorlevel 1 (
  echo.
  echo  LiveCap is already running. Opening the console for Hall !HALL!.
  start "" "http://localhost:%PORT%/caption?session=hall-!HALL!"
  timeout /t 3 >nul
  exit /b 0
)
set "WANTED_PORT=%PORT%"
set /a "MAX_PORT=%PORT%+20"
:findport
netstat -an | findstr /r /c:":!PORT! .*LISTENING" >nul 2>&1
if not errorlevel 1 (
  set /a "PORT=!PORT!+1"
  if !PORT! gtr !MAX_PORT! (
    echo  [!] No free port found near !WANTED_PORT!.
    pause
    exit /b 1
  )
  goto findport
)
if not "!PORT!"=="!WANTED_PORT!" (
  echo.
  echo  [!] Port !WANTED_PORT! is used by another program, so LiveCap uses port !PORT!.
  echo      Settings saved under the other port do not carry over: set PORT=!PORT! in livecap.env
  echo      to keep this port, or close the other program and start again.
)

set "URL=http://localhost:!PORT!/caption?session=hall-!HALL!"
echo.
echo  Starting LiveCap for Hall !HALL! ...
echo    Console : !URL!
echo    LED     : http://localhost:!PORT!/caption/led?session=hall-!HALL!
echo    vMix/OBS: http://localhost:!PORT!/caption/overlay?session=hall-!HALL!
echo.
echo  Keep this window open during the event. Close it to stop LiveCap.
echo.

rem Open Chrome if installed, otherwise Edge (both support live speech recognition)
set "BROWSER=msedge"
reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe" >nul 2>&1 && set "BROWSER=chrome"
reg query "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe" >nul 2>&1 && set "BROWSER=chrome"
start "" /b cmd /c "timeout /t 3 /nobreak >nul & start "" !BROWSER! "!URL!""

"node\node.exe" "app\server.js"
echo.
echo  LiveCap stopped. If you saw an error above about port %PORT%, LiveCap may already be running,
echo  or another program uses the port: change PORT in livecap.env.
pause
