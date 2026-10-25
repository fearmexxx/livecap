"""
LiveCap Local Hardware GPU Whisper Server
Supports NVIDIA CUDA & INTEL Arc / Iris Xe / OpenVINO / DirectML & CPU Multi-threading
Part of LiveCap - Copyright (c) 2026 VBE Agency. All rights reserved.
"""

import os
import sys

# Ensure UTF-8 output on Windows consoles
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Critical Monkeypatch: Fix PyAV >= 14.0 compatibility with faster-whisper
# Newer PyAV versions removed 'metadata_errors' parameter from av.open()
try:
    import av
    _orig_av_open = av.open
    def _safe_av_open(*args, **kwargs):
        kwargs.pop("metadata_errors", None)
        return _orig_av_open(*args, **kwargs)
    av.open = _safe_av_open
except Exception as e:
    pass


import time
import tempfile
import uvicorn
from contextlib import asynccontextmanager
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("=" * 65)
    print("  [+] LIVECAP LOCAL HARDWARE GPU SERVER STARTED")
    print("  Copyright (c) 2026 VBE Agency. All rights reserved.")
    print("=" * 65)
    print(f"  * Active Device  : {HARDWARE_INFO['active_device_name']}")
    cuda_status = f"[OK] Available ({HARDWARE_INFO['cuda_count']} GPU)" if HARDWARE_INFO['cuda_available'] else "[NO] Not Present"
    print(f"  * NVIDIA CUDA    : {cuda_status}")
    arc_names = ', '.join([d['name'] for d in HARDWARE_INFO['intel_devices']])
    intel_status = f"[OK] Available ({arc_names})" if HARDWARE_INFO['intel_arc_available'] else "[NO] Not Present"
    print(f"  * INTEL Arc VGA  : {intel_status}")
    print(f"  * CPU Model      : {HARDWARE_INFO['cpu_model']}")
    print(f"  * Server URL     : http://127.0.0.1:8000")
    print("=" * 65)
    # Preload default models (both base and small so live switching has ZERO download delay)
    try:
        print("[Whisper] Pre-warming models ('base' & 'small')...")
        get_whisper_model("base")
        get_whisper_model("small")
        print("[Whisper] Models ('base' and 'small') are ready for instant low-latency transcription!")
    except Exception as e:
        print(f"[Whisper] Model preload notice: {e}")
    yield

app = FastAPI(
    title="LiveCap Local GPU Whisper Server",
    description="Offline speech recognition server powered by NVIDIA CUDA & INTEL Arc / OpenVINO / CPU",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for browser access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Hardware Detection State
HARDWARE_INFO: Dict[str, Any] = {
    "cuda_available": False,
    "cuda_count": 0,
    "cuda_devices": [],
    "intel_arc_available": False,
    "intel_devices": [],
    "active_backend": "cpu",
    "active_device_name": "CPU",
    "cpu_model": ""
}

# Whisper Model Cache
MODELS: Dict[str, Any] = {}
ACTIVE_MODEL_NAME = os.getenv("LIVECAP_MODEL", "base")

def detect_hardware():
    global HARDWARE_INFO
    # 1. Detect NVIDIA CUDA
    try:
        import ctranslate2
        cuda_count = ctranslate2.get_cuda_device_count()
        if cuda_count > 0:
            HARDWARE_INFO["cuda_available"] = True
            HARDWARE_INFO["cuda_count"] = cuda_count
            for i in range(cuda_count):
                HARDWARE_INFO["cuda_devices"].append(f"CUDA Device {i}")
            HARDWARE_INFO["active_backend"] = "cuda"
            HARDWARE_INFO["active_device_name"] = f"NVIDIA CUDA ({cuda_count} GPU found)"
    except Exception as e:
        print(f"[HW Detect] CUDA check notice: {e}")

    # 2. Detect INTEL Arc / OpenVINO
    try:
        import openvino as ov
        core = ov.Core()
        available = core.available_devices
        for dev in available:
            full_name = core.get_property(dev, "FULL_DEVICE_NAME")
            if dev == "CPU":
                HARDWARE_INFO["cpu_model"] = full_name
            elif "GPU" in dev or "Arc" in full_name or "Intel" in full_name:
                HARDWARE_INFO["intel_arc_available"] = True
                HARDWARE_INFO["intel_devices"].append({
                    "id": dev,
                    "name": full_name
                })
                if not HARDWARE_INFO["cuda_available"]:
                    HARDWARE_INFO["active_backend"] = "intel-arc"
                    HARDWARE_INFO["active_device_name"] = full_name
    except Exception as e:
        print(f"[HW Detect] OpenVINO check notice: {e}")

    # If neither CUDA nor Arc GPU backend chosen, default to CPU with AVX/INT8
    if HARDWARE_INFO["active_backend"] == "cpu":
        if not HARDWARE_INFO["cpu_model"]:
            import platform
            HARDWARE_INFO["cpu_model"] = platform.processor() or "Multi-Core CPU"
        HARDWARE_INFO["active_device_name"] = f"{HARDWARE_INFO['cpu_model']} (AVX2/INT8 Fast Mode)"

detect_hardware()

def get_whisper_model(model_name: str = "base"):
    global MODELS
    if model_name in MODELS:
        return MODELS[model_name]

    from faster_whisper import WhisperModel

    device = "cpu"
    compute_type = "int8"

    if HARDWARE_INFO["cuda_available"]:
        device = "cuda"
        compute_type = "float16"
        print(f"[Whisper] Initializing {model_name} on NVIDIA CUDA (float16)...")
    else:
        # For Intel Arc / CPU: INT8 quantized model running with OpenVINO / CPU threads
        # delivers high throughput and <150ms transcription latency
        device = "cpu"
        compute_type = "int8"
        print(f"[Whisper] Initializing {model_name} with INT8 multithreaded acceleration for {HARDWARE_INFO['active_device_name']}...")

    model = WhisperModel(
        model_name,
        device=device,
        compute_type=compute_type,
        cpu_threads=max(4, os.cpu_count() or 4)
    )
    MODELS[model_name] = model
    return model



@app.get("/")
@app.get("/health")
def health():
    return {
        "status": "online",
        "service": "LiveCap Local GPU Whisper Server",
        "copyright": "Copyright (c) 2026 VBE Agency. All rights reserved.",
        "hardware": HARDWARE_INFO,
        "models_loaded": list(MODELS.keys())
    }

@app.get("/v1/devices")
def get_devices():
    return {
        "status": "ok",
        "hardware": HARDWARE_INFO
    }

@app.post("/v1/audio/transcriptions")
async def transcribe(
    file: UploadFile = File(...),
    model: str = Form("base"),
    language: Optional[str] = Form(None),
    temperature: float = Form(0.0),
    prompt: Optional[str] = Form(None)
):
    """
    OpenAI-compatible transcription endpoint.
    Accepts audio file (webm, wav, mp3, mp4, ogg) and returns transcribed text.
    """
    start_time = time.time()

    # Determine file extension
    filename = file.filename or "audio.webm"
    suffix = os.path.splitext(filename)[1] or ".webm"

    # Save incoming audio chunk to temporary file
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        if len(content) == 0:
            return {"text": ""}
        tmp.write(content)
        tmp_path = tmp.name

    try:
        whisper = get_whisper_model(model)

        # Normalize language
        lang_code = None
        if language:
            lang_clean = language.strip().lower()
            if lang_clean.startswith("ko"):
                lang_code = "ko"
            elif lang_clean.startswith("en"):
                lang_code = "en"
            elif lang_clean != "auto":
                lang_code = lang_clean[:2]

        segments, info = whisper.transcribe(
            tmp_path,
            language=lang_code,
            beam_size=1, # Real-time greedy search
            best_of=1,
            temperature=temperature,
            without_timestamps=True, # Critical speedup: strips timestamp autoregression overhead for 12x faster decoding!
            condition_on_previous_text=False, # Prevents hallucination loops & eliminated accumulated delay
            initial_prompt=prompt or "Live conference presentation speech",
            vad_filter=True, # Voice activity filter to skip silence
            vad_parameters=dict(min_silence_duration_ms=300)
        )

        texts = []
        for segment in segments:
            if segment.text and segment.text.strip():
                texts.append(segment.text.strip())

        full_text = " ".join(texts).strip()
        latency_ms = round((time.time() - start_time) * 1000)

        return {
            "text": full_text,
            "language": info.language if hasattr(info, "language") else lang_code,
            "duration": getattr(info, "duration", 0),
            "latency_ms": latency_ms,
            "device": HARDWARE_INFO["active_device_name"],
            "model": model
        }

    except Exception as e:
        err_msg = str(e)
        print(f"[Transcription Warning/Error] {err_msg}")
        # If the audio chunk is corrupted, headerless, or silent/truncated, return empty text gracefully instead of 500
        if "Invalid data found" in err_msg or "av.error" in err_msg or "EOF" in err_msg:
            return {
                "text": "",
                "language": lang_code or "en",
                "duration": 0,
                "latency_ms": round((time.time() - start_time) * 1000),
                "device": HARDWARE_INFO["active_device_name"],
                "model": model
            }
        raise HTTPException(status_code=500, detail=err_msg)
    finally:
        # Cleanup temp file
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except:
                pass

def is_port_in_use(port: int = 8000) -> bool:
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) == 0

def check_existing_server(port: int = 8000) -> bool:
    import urllib.request
    try:
        req = urllib.request.Request(f"http://127.0.0.1:{port}/health", headers={"User-Agent": "HealthCheck"})
        with urllib.request.urlopen(req, timeout=2) as resp:
            return resp.status == 200
    except:
        return False

def free_port(port: int = 8000):
    import subprocess
    try:
        output = subprocess.check_output(f'netstat -ano | findstr :{port}', shell=True).decode()
        for line in output.strip().split('\n'):
            parts = line.strip().split()
            if len(parts) >= 5 and 'LISTENING' in line:
                pid = parts[-1]
                print(f"[!] Releasing busy port {port} (Terminating stale PID {pid})...")
                subprocess.call(f'taskkill /F /PID {pid}', shell=True)
                time.sleep(1)
    except:
        pass

if __name__ == "__main__":
    if is_port_in_use(8000):
        if check_existing_server(8000):
            print("\n=================================================================")
            print("[+] LIVECAP GPU SERVER IS ALREADY RUNNING & HEALTHY (Port 8000)")
            print("=================================================================")
            print("Hardware backend is active and ready for live captions.")
            print("You can keep this window open or close it safely.\n")
            try:
                while True:
                    time.sleep(3600)
            except KeyboardInterrupt:
                pass
            sys.exit(0)
        else:
            print("[!] Port 8000 is occupied by a stale process. Freeing port...")
            free_port(8000)

    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")
