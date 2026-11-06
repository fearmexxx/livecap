#!/usr/bin/env bash
# LiveCap local speech-to-text server for macOS / Linux.
# On Apple Silicon (M1-M4) Whisper runs on the Mac's GPU through MLX; elsewhere on NVIDIA CUDA or the CPU.
# First run creates a private Python environment (.venv-whisper) and installs everything, then downloads
# the Whisper models (~200 MB for base + small). Later runs start in a few seconds.
set -euo pipefail
cd "$(dirname "$0")"

PY="${PYTHON:-python3}"
command -v "$PY" >/dev/null || { echo "[ERROR] Python 3.10+ is required. On macOS: brew install python@3.12"; exit 1; }
"$PY" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' || {
  echo "[ERROR] Python 3.10 or newer is required (found $("$PY" --version)). On macOS: brew install python@3.12"
  echo "        then run: PYTHON=python3.12 ./run_local_gpu_server.sh"
  exit 1
}

if [ ! -x .venv-whisper/bin/python ]; then
  echo "[1/2] Creating Python environment and installing Whisper (first run only, a few minutes)..."
  "$PY" -m venv .venv-whisper
  .venv-whisper/bin/pip install --upgrade pip >/dev/null
  .venv-whisper/bin/pip install -r requirements.txt
elif [ requirements.txt -nt .venv-whisper/.installed ]; then
  .venv-whisper/bin/pip install -r requirements.txt
fi
touch .venv-whisper/.installed

echo "[2/2] Starting LiveCap local speech server on http://127.0.0.1:8000 ..."
exec .venv-whisper/bin/python local_gpu_whisper_server.py
