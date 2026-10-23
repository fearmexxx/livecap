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

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      this.callbacks.onError?.(
        "Web Speech Recognition API is not supported in this browser. Please use Google Chrome or Microsoft Edge for live microphone capture."
      );
      return;
    }

    try {
      // 1. Start audio analysis & VU meter
      await this.startAudioAnalysis(deviceId);

      // 2. Initialize continuous speech recognition
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

  public stop() {
    this.isListening = false;
    clearTimeout(this.debounceTimer);
    clearTimeout(this.restartTimeout);

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
