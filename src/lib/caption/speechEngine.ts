import { CaptionConfig, CaptionItem, SourceLanguage } from "./types";

export interface SpeechEngineCallbacks {
  onInterimCaption: (caption: CaptionItem) => void;
  onFinalCaption: (caption: CaptionItem) => void;
  onAudioLevel?: (level: number) => void; // 0 - 100 VU level
  onError?: (error: string) => void;
  onStatusChange?: (status: "idle" | "listening" | "reconnecting" | "paused") => void;
}

export class LiveSpeechEngine {
  private recognition: any = null;
  private isListening: boolean = false;
  private isMonitoringAudio: boolean = false;
  private currentLanguage: SourceLanguage = "ko-KR";
  private callbacks: SpeechEngineCallbacks;
  private debounceTimer: any = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private gainNode: GainNode | null = null;
  private mediaStream: MediaStream | null = null;
  private animFrameId: number | null = null;
  private restartTimeout: any = null;
  private currentMicId: string = "default";
  private customGlossary: Array<{ from: string; to: string }> = [];
  private interimSeq: number = 0;
  private config: Partial<CaptionConfig> = {};
  private gainMultiplier: number = 1.5;
  private activeRecorder: MediaRecorder | null = null;
  private chunkSliceTimeout: any = null;
  private isProcessingChunk: boolean = false;

  constructor(callbacks: SpeechEngineCallbacks) {
    this.callbacks = callbacks;
  }

  public setConfig(config: CaptionConfig) {
    this.config = config;
    this.customGlossary = config.customGlossary || [];
    this.gainMultiplier = config.audioGain || 1.5;
    if (this.gainNode) {
      this.gainNode.gain.value = this.gainMultiplier;
    }
  }

  private getActiveSpeakerMeta() {
    const speakers = this.config.speakers || [];
    const active = speakers.find((s) => s.id === this.config.activeSpeakerId);
    if (active) {
      return {
        speakerId: active.id,
        speakerName: active.name,
        speakerRole: active.role,
        speakerColor: active.color,
      };
    }
    return {
      speakerName: this.config.speakerLabel || "Diễn giả",
    };
  }

  public setGlossary(glossary: Array<{ from: string; to: string }>) {
    this.customGlossary = glossary;
  }

  public setAudioGain(gain: number) {
    this.gainMultiplier = gain;
    if (this.gainNode) {
      this.gainNode.gain.value = gain;
    }
  }

  public setLanguage(lang: SourceLanguage) {
    this.currentLanguage = lang;
    if (this.recognition && this.isListening) {
      this.stop();
      setTimeout(() => this.start(this.currentLanguage, this.currentMicId), 200);
    }
  }

  // Audio stream monitoring (Active even during standby so the operator can test VU meter)
  public async startAudioAnalysis(deviceId = "default") {
    try {
      this.currentMicId = deviceId;
      this.isMonitoringAudio = true;

      if (this.animFrameId) {
        cancelAnimationFrame(this.animFrameId);
        this.animFrameId = null;
      }

      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach((t) => t.stop());
        this.mediaStream = null;
      }

      if (this.audioContext && this.audioContext.state !== "closed") {
        await this.audioContext.close();
        this.audioContext = null;
      }

      // Constraints optimized for both USB and Bluetooth Handsfree (16000 Hz) mics
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: false, // Prevents Chrome APM from muting 16kHz Bluetooth streams
        noiseSuppression: false,
        autoGainControl: true,
      };

      if (deviceId && deviceId !== "default") {
        audioConstraints.deviceId = { ideal: deviceId };
      }

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
      });

      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

      // Ensure AudioContext is actively resumed
      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }

      const source = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Gain booster node
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = this.gainMultiplier;

      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 128;
      this.analyser.smoothingTimeConstant = 0.2;

      source.connect(this.gainNode);
      this.gainNode.connect(this.analyser);

      const bufferLength = this.analyser.fftSize;
      const dataArray = new Uint8Array(bufferLength);

      // Time-domain RMS volume calculation (100% reliable across all sample rates & Bluetooth headsets)
      const checkVolume = () => {
        if (!this.analyser || !this.isMonitoringAudio) return;
        this.analyser.getByteTimeDomainData(dataArray);

        let sumSquares = 0;
        for (let i = 0; i < bufferLength; i++) {
          const norm = (dataArray[i] - 128) / 128; // -1.0 to 1.0
          sumSquares += norm * norm;
        }
        const rms = Math.sqrt(sumSquares / bufferLength);

        // Map RMS to dynamic 0 - 100 VU scale
        const level = Math.min(100, Math.round(rms * 100 * 3.5 * this.gainMultiplier));

        if (this.callbacks.onAudioLevel) {
          this.callbacks.onAudioLevel(level);
        }

        this.animFrameId = requestAnimationFrame(checkVolume);
      };

      checkVolume();
    } catch (err: any) {
      console.warn("Audio level meter warning:", err.message);
      this.callbacks.onError?.(
        `Microphone initialization: ${err.message}. Please check browser microphone permissions.`
      );
    }
  }

  public async start(lang: SourceLanguage = "ko-KR", deviceId = "default") {
    this.currentLanguage = lang;
    this.currentMicId = deviceId;

    if (typeof window === "undefined") return;

    try {
      // 1. Start audio analysis & VU meter (works across all STT engines)
      await this.startAudioAnalysis(deviceId);

      const sttEngine = this.config.sttEngine || "webspeech";

      // 2. Hardware / Cloud Chunked STT (OpenRouter / Local GPU)
      if (sttEngine === "openrouter" || sttEngine === "local-gpu") {
        this.isListening = true;
        this.callbacks.onStatusChange?.("listening");
        this.startChunkRecording();
        return;
      }

      // 3. Web Speech API (Default Chrome / Edge)
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (!SpeechRecognition) {
        this.callbacks.onError?.(
          "Web Speech API is not supported in this browser. Please use Google Chrome/Edge, or switch to OpenRouter / Local GPU STT in settings."
        );
        return;
      }

      // Initialize continuous speech recognition
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.maxAlternatives = 1;
      this.recognition.lang = lang === "auto" ? "ko-KR" : lang;

      this.recognition.onstart = () => {
        this.isListening = true;
        this.callbacks.onStatusChange?.("listening");
      };

      this.recognition.onerror = (event: any) => {
        if (event.error === "no-speech") {
          return;
        }
        if (event.error === "not-allowed") {
          this.callbacks.onError?.(
            "Microphone access was denied. Please click the Lock icon in your address bar and allow Microphone."
          );
          this.stop();
          return;
        }
        console.warn("Speech recognition notice:", event.error);
        this.callbacks.onStatusChange?.("reconnecting");
      };

      this.recognition.onend = () => {
        if (this.isListening) {
          this.callbacks.onStatusChange?.("reconnecting");
          this.restartTimeout = setTimeout(() => {
            if (this.isListening) {
              try {
                this.recognition?.start();
              } catch (e) {
                // start collision ignore
              }
            }
          }, 250);
        } else {
          this.callbacks.onStatusChange?.("idle");
        }
      };

      this.recognition.onresult = async (event: any) => {
        let interimText = "";
        let finalText = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalText += transcript;
          } else {
            interimText += transcript;
          }
        }

        const sourceCode = this.currentLanguage.startsWith("ko") ? "ko" : "en";

        if (finalText.trim()) {
          const activeText = finalText.trim();
          clearTimeout(this.debounceTimer);
          this.interimSeq++;

          const id = "cap_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6);
          try {
            const translated = await this.translate(activeText, sourceCode);
            const finalItem: CaptionItem = {
              id,
              timestamp: Date.now(),
              sourceLang: sourceCode,
              sourceText: activeText,
              translatedText: translated,
              isFinal: true,
              ...this.getActiveSpeakerMeta(),
            };
            this.callbacks.onFinalCaption(finalItem);
          } catch (e) {
            // fallback
          }
        } else if (interimText.trim()) {
          const activeText = interimText.trim();
          clearTimeout(this.debounceTimer);
          const seq = ++this.interimSeq;

          this.debounceTimer = setTimeout(async () => {
            try {
              const translated = await this.translate(activeText, sourceCode);
              if (seq !== this.interimSeq) return;
              const interimItem: CaptionItem = {
                id: "interim_live",
                timestamp: Date.now(),
                sourceLang: sourceCode,
                sourceText: activeText,
                translatedText: translated,
                isFinal: false,
                ...this.getActiveSpeakerMeta(),
              };
              this.callbacks.onInterimCaption(interimItem);
            } catch (err) {
              // fallback
            }
          }, 250);
        }
      };

      this.recognition.start();
    } catch (err: any) {
      this.callbacks.onError?.(err?.message || "Error starting speech recognition");
    }
  }

  private async processAudioChunk(blob: Blob) {
    if (!this.isListening || blob.size < 2500) return;
    if (this.isProcessingChunk) {
      // Prevent queue buildup if previous chunk is still in flight (keeps transcription real-time)
      return;
    }
    const sourceCode = this.currentLanguage.startsWith("ko") ? "ko" : "en";

    try {
      this.isProcessingChunk = true;
      const formData = new FormData();
      formData.append("file", blob, "chunk.webm");
      formData.append("sttEngine", this.config.sttEngine || "openrouter");
      formData.append("sourceLang", this.currentLanguage);
      if (this.config.openrouterApiKey) formData.append("openrouterApiKey", this.config.openrouterApiKey);
      if (this.config.openrouterModel) formData.append("openrouterModel", this.config.openrouterModel);
      if (this.config.localGpuUrl) formData.append("localGpuUrl", this.config.localGpuUrl);
      if (this.config.localGpuModel) formData.append("localGpuModel", this.config.localGpuModel);

      const res = await fetch("/api/caption/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (err?.error) {
          console.warn("Transcribe notice:", err.error);
        }
        return;
      }

      const data = await res.json();
      const rawText = data.text?.trim();
      if (!rawText) return;

      const translated = await this.translate(rawText, sourceCode);
      const id = "cap_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6);
      const finalItem: CaptionItem = {
        id,
        timestamp: Date.now(),
        sourceLang: sourceCode,
        sourceText: rawText,
        translatedText: translated,
        isFinal: true,
        ...this.getActiveSpeakerMeta(),
      };
      this.callbacks.onFinalCaption(finalItem);
    } catch (err: any) {
      console.warn("Chunk processing notice:", err.message);
    } finally {
      this.isProcessingChunk = false;
    }
  }

  private startChunkRecording() {
    if (!this.mediaStream) return;

    const sliceDuration = Math.max(1500, (this.config.sttChunkIntervalSec || 3) * 1000);

    const recordNextSlice = () => {
      if (!this.isListening || !this.mediaStream) return;

      try {
        const recorder = new MediaRecorder(this.mediaStream);
        const chunks: Blob[] = [];

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = () => {
          if (chunks.length > 0) {
            const blob = new Blob(chunks, { type: "audio/webm" });
            this.processAudioChunk(blob);
          }
          if (this.isListening) {
            recordNextSlice();
          }
        };

        this.activeRecorder = recorder;
        recorder.start();

        this.chunkSliceTimeout = setTimeout(() => {
          if (recorder.state === "recording") {
            recorder.stop();
          }
        }, sliceDuration);
      } catch (err: any) {
        console.warn("Audio chunk recording error:", err.message);
        this.callbacks.onError?.("Chunk recording failed: " + err.message);
      }
    };

    recordNextSlice();
  }

  public stop() {
    this.isListening = false;
    clearTimeout(this.debounceTimer);
    clearTimeout(this.restartTimeout);
    clearTimeout(this.chunkSliceTimeout);

    if (this.activeRecorder && this.activeRecorder.state === "recording") {
      try {
        this.activeRecorder.stop();
      } catch (e) {}
    }
    this.activeRecorder = null;

    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {
        // ignore
      }
      this.recognition = null;
    }

    this.callbacks.onStatusChange?.("idle");
  }

  public stopAll() {
    this.stop();
    this.isMonitoringAudio = false;

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.callbacks.onAudioLevel) {
      this.callbacks.onAudioLevel(0);
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  // Record 3-second sample and play back through headphones so user can verify audio
  public async recordTestSample(): Promise<Blob | null> {
    if (!this.mediaStream) {
      await this.startAudioAnalysis(this.currentMicId);
    }
    if (!this.mediaStream) return null;

    return new Promise((resolve) => {
      try {
        const mediaRecorder = new MediaRecorder(this.mediaStream!);
        const chunks: Blob[] = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: "audio/webm" });
          resolve(blob);
        };

        mediaRecorder.start();
        setTimeout(() => {
          if (mediaRecorder.state === "recording") {
            mediaRecorder.stop();
          }
        }, 3000);
      } catch (err) {
        console.warn("Record test sample failed:", err);
        resolve(null);
      }
    });
  }

  public async translate(text: string, sourceLang: string): Promise<string> {
    try {
      const res = await fetch("/api/caption/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          sourceLang,
          targetLang: "vi",
          glossary: this.customGlossary,
          engine: this.config.translationEngine || "google-free",
          openrouterApiKey: this.config.openrouterApiKey,
          openrouterTranslateModel: this.config.openrouterTranslateModel,
          openaiApiKey: this.config.openaiApiKey,
          openaiModel: this.config.openaiModel,
          deeplApiKey: this.config.deeplApiKey,
        }),
      });

      if (!res.ok) return text;
      const data = await res.json();
      return data.translatedText || text;
    } catch (e) {
      return text;
    }
  }
}
