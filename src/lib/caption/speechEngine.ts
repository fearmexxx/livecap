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

  public async startAudioAnalysis(deviceId = "default") {
    try {
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach((t) => t.stop());
      }
      if (this.audioContext && this.audioContext.state !== "closed") {
        await this.audioContext.close();
      }

      const constraints: MediaStreamConstraints = {
        audio:
          deviceId === "default"
            ? {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              }
            : {
                deviceId: { ideal: deviceId },
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
      };

      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

      // Ensure AudioContext is resumed in modern Chromium
      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }

      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      
      // Gain booster node
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = this.gainMultiplier;

      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 64;
      this.analyser.smoothingTimeConstant = 0.3;

      source.connect(this.gainNode);
      this.gainNode.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const checkVolume = () => {
        if (!this.analyser || !this.isListening) return;
        this.analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        // Boost dynamic range display
        const normalized = Math.min(100, Math.round((avg / 100) * 100));

        if (this.callbacks.onAudioLevel) {
          this.callbacks.onAudioLevel(normalized);
        }

        this.animFrameId = requestAnimationFrame(checkVolume);
      };

      checkVolume();
    } catch (err: any) {
      console.warn("Audio level meter warning:", err.message);
      this.callbacks.onError?.(
        `Microphone initialization warning: ${err.message}. Please allow microphone permissions in Chrome/Edge.`
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
      // 1. Request microphone access first so Chrome grants Web Speech access
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
          // Normal silence, keep listening
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
        // Auto-restart continuous recognition if flagged as active
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

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.callbacks.onAudioLevel) {
      this.callbacks.onAudioLevel(0);
    }

    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {
        // ignore
      }
      this.recognition = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.callbacks.onStatusChange?.("idle");
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
