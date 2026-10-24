import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30; // 30s timeout for transcription

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  try {
    const formData = await req.formData();
    const file = formData.get("file") as Blob | null;
    const sttEngine = (formData.get("sttEngine") as string) || "openrouter";
    const sourceLang = (formData.get("sourceLang") as string) || "ko-KR";
    const openrouterApiKey = (formData.get("openrouterApiKey") as string) || process.env.OPENROUTER_API_KEY || "";
    const openrouterModel = (formData.get("openrouterModel") as string) || "openai/gpt-transcribe";
    const localGpuUrl = (formData.get("localGpuUrl") as string) || "http://127.0.0.1:8000";
    const localGpuModel = (formData.get("localGpuModel") as string) || "base";

    if (!file || file.size === 0) {
      return NextResponse.json({ text: "", latencyMs: 0 });
    }

    // Determine 2-letter language code
    let langCode = "ko";
    if (sourceLang.startsWith("en")) langCode = "en";
    else if (sourceLang.startsWith("ko")) langCode = "ko";
    else if (sourceLang !== "auto") langCode = sourceLang.substring(0, 2);

    // ==========================================
    // 1. OPENROUTER CLOUD TRANSCRIPTION
    // Model: openai/gpt-transcribe
    // ==========================================
    if (sttEngine === "openrouter") {
      if (!openrouterApiKey.trim()) {
        return NextResponse.json(
          { error: "OpenRouter API Key is required for openai/gpt-transcribe STT" },
          { status: 400 }
        );
      }

      const openrouterFormData = new FormData();
      // Ensure file has filename
      const audioFile = new File([file], "speech.webm", { type: file.type || "audio/webm" });
      openrouterFormData.append("file", audioFile);
      openrouterFormData.append("model", openrouterModel);
      if (sourceLang !== "auto") {
        openrouterFormData.append("language", langCode);
      }
      openrouterFormData.append("prompt", "Live conference presentation speech recognition");

      const response = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openrouterApiKey.trim()}`,
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "LiveCap Live Captioning",
        },
        body: openrouterFormData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("OpenRouter Transcription Error:", response.status, errorText);
        return NextResponse.json(
          {
            error: `OpenRouter error (${response.status}): ${errorText}`,
            text: "",
          },
          { status: response.status }
        );
      }

      const data = await response.json();
      const latencyMs = Date.now() - startTime;

      return NextResponse.json({
        text: data.text || "",
        engine: "openrouter",
        model: openrouterModel,
        latencyMs,
      });
    }

    // ==========================================
    // 2. LOCAL GPU SERVER (NVIDIA & INTEL Arc)
    // Server: http://127.0.0.1:8000
    // ==========================================
    if (sttEngine === "local-gpu") {
      const localFormData = new FormData();
      const audioFile = new File([file], "speech.webm", { type: file.type || "audio/webm" });
      localFormData.append("file", audioFile);
      localFormData.append("model", localGpuModel);
      if (sourceLang !== "auto") {
        localFormData.append("language", langCode);
      }

      const endpoint = `${localGpuUrl.replace(/\/$/, "")}/v1/audio/transcriptions`;
      const response = await fetch(endpoint, {
        method: "POST",
        body: localFormData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Local GPU Whisper Error:", response.status, errorText);
        return NextResponse.json(
          {
            error: `Local GPU Whisper Server error (${response.status}): ${errorText}. Make sure local_gpu_whisper_server.py is running.`,
            text: "",
          },
          { status: response.status }
        );
      }

      const data = await response.json();
      const latencyMs = Date.now() - startTime;

      return NextResponse.json({
        text: data.text || "",
        engine: "local-gpu",
        device: data.device || "GPU",
        latencyMs,
      });
    }

    return NextResponse.json({ error: `Unsupported STT engine: ${sttEngine}` }, { status: 400 });
  } catch (err: any) {
    console.error("Transcribe API Exception:", err.message || err);
    return NextResponse.json(
      {
        error: err.message || "Failed to transcribe audio",
        text: "",
        latencyMs: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}
