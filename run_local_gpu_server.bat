@echo off
title LiveCap Local GPU Hardware Acceleration Server
color 0B
echo =========================================================================
echo       LIVECAP - LOCAL HARDWARE GPU ACCELERATION SERVER
echo       Supports NVIDIA CUDA, INTEL Arc A750 / Iris Xe, CPU Multithread
echo       Copyright (c) 2026 VBE Agency. All rights reserved.
echo =========================================================================
echo.
cd /d "%~dp0"

echo [1/2] Checking Python environment...
python --version
if errorlevel 1 (
    echo [ERROR] Python is not found. Please install Python 3.10+ from python.org
    pause
    exit /b
)

echo [2/2] Starting LiveCap Local GPU Whisper Server on port 8000...
python local_gpu_whisper_server.py

pause
