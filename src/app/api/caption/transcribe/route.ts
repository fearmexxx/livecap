import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30; // 30s timeout for transcription

async function fetchWithTimeout(url: string, init: RequestInit, ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  try {
    const formData = await req.formData();
    const file = formData.get("file") as Blob | null;
    const sttEngine = (formData.get("sttEngine") as string) || "openrouter";
    const sourceLang = (formData.get("sourceLang") as string) || "ko-KR";
    const prompt = ((formData.get("prompt") as string) || "").slice(0, 800);
    const openrouterApiKey =
      (formData.get("openrouterApiKey") as string) || process.env.OPENROUTER_API_KEY || "";
    const openrouterModel = (formData.get("openrouterModel") as string) || "openai/gpt-transcribe";
    const localGpuUrl =
      (formData.get("localGpuUrl") as string) || process.env.LIVECAP_GPU_URL || "http://127.0.0.1:8000";
    const localGpuModel = (formData.get("localGpuModel") as string) || "base";

    if (!file || file.size === 0) {
      return NextResponse.json({ text: "", latencyMs: 0 });
    }

    let langCode = "ko";
    if (sourceLang.startsWith("en")) langCode = "en";
    else if (sourceLang.startsWith("ko")) langCode = "ko";
    else if (sourceLang !== "auto") langCode = sourceLang.substring(0, 2);

    const audioFile = new File([file], "speech.webm", { type: file.type || "audio/webm" });

    // ==========================================
    // 1. OPENROUTER CLOUD TRANSCRIPTION
    // ==========================================
    if (sttEngine === "openrouter") {
      if (!openrouterApiKey.trim()) {
        return NextResponse.json(
          { error: "OpenRouter API Key is required for cloud STT (set it in API & AI tab or livecap.env)" },
          { status: 400 }
        );
      }

      const fd = new FormData();
      fd.append("file", audioFile);
      fd.append("model", openrouterModel);
      if (sourceLang !== "auto") fd.append("language", langCode);
      fd.append("prompt", prompt || "Live conference presentation speech.");

      const response = await fetchWithTimeout(
        "https://openrouter.ai/api/v1/audio/transcriptions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openrouterApiKey.trim()}`,
            "HTTP-Referer": "https://livecap.vbe.vn",
            "X-Title": "VBE LiveCap Studio",
          },
          body: fd,
        },
        20000
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("OpenRouter Transcription Error:", response.status, errorText);
        return NextResponse.json(
          { error: `OpenRouter error (${response.status}): ${errorText.slice(0, 300)}`, text: "" },
          { status: response.status }
        );
      }

      const data = await response.json();
      return NextResponse.json({
        text: data.text || "",
        engine: "openrouter",
        model: openrouterModel,
        latencyMs: Date.now() - startTime,
      });
    }

    // ==========================================
    // 2. LOCAL GPU SERVER (NVIDIA / Intel / CPU faster-whisper)
    // ==========================================
    if (sttEngine === "local-gpu") {
      const fd = new FormData();
      fd.append("file", audioFile);
      fd.append("model", localGpuModel);
      if (sourceLang !== "auto") fd.append("language", langCode);
      if (prompt) fd.append("prompt", prompt);

      const endpoint = `${localGpuUrl.replace(/\/$/, "")}/v1/audio/transcriptions`;
      let response: Response;
      try {
        response = await fetchWithTimeout(endpoint, { method: "POST", body: fd }, 20000);
      } catch (e: any) {
        return NextResponse.json(
          {
            error: `Cannot reach Local GPU server at ${localGpuUrl} (${e?.name === "AbortError" ? "timeout" : e?.message}). Start START_GPU_SERVER.bat.`,
            text: "",
          },
          { status: 502 }
        );
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Local GPU Whisper Error:", response.status, errorText);
        return NextResponse.json(
          { error: `Local GPU server error (${response.status}): ${errorText.slice(0, 300)}`, text: "" },
          { status: response.status }
        );
      }

      const data = await response.json();
      return NextResponse.json({
        text: data.text || "",
        engine: "local-gpu",
        device: data.device || "GPU",
        latencyMs: Date.now() - startTime,
      });
    }

    return NextResponse.json({ error: `Unsupported STT engine: ${sttEngine}` }, { status: 400 });
  } catch (err: any) {
    console.error("Transcribe API Exception:", err.message || err);
    return NextResponse.json(
      { error: err.message || "Failed to transcribe audio", text: "", latencyMs: Date.now() - startTime },
      { status: 500 }
    );
  }
}
