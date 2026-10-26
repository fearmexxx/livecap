import type { CaptionConfig, CaptionItem, SourceLanguage } from "./types";
import {
  SentenceAssembler,
  isLikelyHallucination,
  normalizeWhitespace,
  relevantGlossary,
} from "./textProcessing";

export interface SpeechEngineCallbacks {
  onInterimCaption: (caption: CaptionItem) => void;
  onFinalCaption: (caption: CaptionItem) => void;
  onAudioLevel?: (level: number) => void; // 0 - 100 VU level
  onError?: (error: string) => void;
  onStatusChange?: (status: "idle" | "listening" | "reconnecting" | "paused") => void;
}

interface PendingSentence {
  seq: number;
  id: string;
  text: string;
  timestamp: number;
  sourceLang: "ko" | "en";
  speaker: ReturnType<LiveSpeechEngine["getActiveSpeakerMeta"]>;
  result?: string;
  done: boolean;
}

const MAX_SEGMENT_QUEUE = 4;
const CONTEXT_SENTENCES = 3;

export class LiveSpeechEngine {
  private recognition: any = null;
  private isListening = false;
  private isMonitoringAudio = false;
  private currentLanguage: SourceLanguage = "ko-KR";
  private callbacks: SpeechEngineCallbacks;
  private interimTimer: any = null;
  private pauseFlushTimer: any = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private gainNode: GainNode | null = null;
  private mediaStream: MediaStream | null = null;
  private animFrameId: number | null = null;
  private restartTimeout: any = null;
  private currentMicId = "default";
  private customGlossary: Array<{ from: string; to: string }> = [];
  private interimSeq = 0;
  private config: Partial<CaptionConfig> = {};
  private gainMultiplier = 1.5;

  // Sentence assembly + ordered translation
  private assembler = new SentenceAssembler();
  private sentenceSeq = 0;
  private nextEmitSeq = 1;
  private pending = new Map<number, PendingSentence>();
  private recentSource: string[] = [];

  // Whisper / cloud chunk mode (VAD segmentation)
  private currentLevel = 0;
  private noiseFloor = 3;
  private activeRecorder: MediaRecorder | null = null;
  private vadInterval: any = null;
  private segmentQueue: Blob[] = [];
  private isProcessingSegment = false;
  private lastWhisperText = "";

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

  public getActiveSpeakerMeta(): {
    speakerId?: string;
    speakerName?: string;
    speakerRole?: string;
    speakerColor?: string;
  } {
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
    return { speakerName: this.config.speakerLabel || "Diễn giả" };
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
    if (lang === this.currentLanguage) return;
    // Flush what the previous speaker said in the previous language before switching
    this.flushAssembler();
    this.currentLanguage = lang;
    this.recentSource = [];
    if (this.isListening) {
      const mic = this.currentMicId;
      this.stop();
      setTimeout(() => this.start(this.currentLanguage, mic), 250);
    }
  }

  private get sourceCode(): "ko" | "en" {
    return this.currentLanguage.startsWith("en") ? "en" : "ko";
  }

  /* ------------------------------------------------------------ */
  /* Audio monitoring (VU meter + VAD level)                       */
  /* ------------------------------------------------------------ */
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

      // Mixer feeds are already processed by the sound engineer: disable browser DSP
      // (echo cancellation / noise suppression damage speech intelligibility for ASR).
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: true,
        channelCount: 1,
      };
      if (deviceId && deviceId !== "default") {
        audioConstraints.deviceId = { exact: deviceId };
      }

      try {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      } catch (err: any) {
        // Device unplugged / renamed → fall back to the system default rather than going silent
        if (deviceId !== "default" && (err?.name === "OverconstrainedError" || err?.name === "NotFoundError")) {
          delete audioConstraints.deviceId;
          this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
          this.callbacks.onError?.("Selected microphone not found – using system default input.");
        } else {
          throw err;
        }
      }

      // Detect cable pull / USB mixer disconnect during the show
      this.mediaStream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          this.callbacks.onError?.("Audio input disconnected! Check the mixer USB cable, then re-select the microphone.");
        };
      });

      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }

      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = this.gainMultiplier;
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.2;
      source.connect(this.gainNode);
      this.gainNode.connect(this.analyser);

      const bufferLength = this.analyser.fftSize;
      const dataArray = new Uint8Array(bufferLength);
      let lastReport = 0;

      const checkVolume = (ts: number) => {
        if (!this.analyser || !this.isMonitoringAudio) return;
        this.analyser.getByteTimeDomainData(dataArray);
        let sumSquares = 0;
        for (let i = 0; i < bufferLength; i++) {
          const norm = (dataArray[i] - 128) / 128;
          sumSquares += norm * norm;
        }
        const rms = Math.sqrt(sumSquares / bufferLength);
        const level = Math.min(100, Math.round(rms * 100 * 3.5 * this.gainMultiplier));
        this.currentLevel = level;

        // Slow-adapting noise floor (tracks room/mixer hiss, ignores speech peaks)
        if (level < this.noiseFloor) this.noiseFloor = this.noiseFloor * 0.9 + level * 0.1;
        else this.noiseFloor = Math.min(30, this.noiseFloor * 0.999 + level * 0.001);

        // Throttle React updates to ~20fps
        if (ts - lastReport > 50) {
          lastReport = ts;
          this.callbacks.onAudioLevel?.(level);
        }
        this.animFrameId = requestAnimationFrame(checkVolume);
      };
      this.animFrameId = requestAnimationFrame(checkVolume);
    } catch (err: any) {
      console.warn("Audio level meter warning:", err.message);
      this.callbacks.onError?.(
        `Microphone initialization: ${err.message}. Please check browser microphone permissions.`
      );
    }
  }

  /* ------------------------------------------------------------ */
  /* Start / stop                                                  */
  /* ------------------------------------------------------------ */
  public async start(lang: SourceLanguage = "ko-KR", deviceId = "default") {
    this.currentLanguage = lang;
    this.currentMicId = deviceId;
    if (typeof window === "undefined") return;

    try {
      await this.startAudioAnalysis(deviceId);
      const sttEngine = this.config.sttEngine || "webspeech";

      if (sttEngine === "openrouter" || sttEngine === "local-gpu") {
        this.isListening = true;
        this.callbacks.onStatusChange?.("listening");
        this.startVadSegmentation();
        return;
      }

      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        this.callbacks.onError?.(
          "Web Speech API is not supported in this browser. Please use Google Chrome/Edge, or switch to OpenRouter / Local GPU STT in settings."
        );
        return;
      }

      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.maxAlternatives = 1;
      this.recognition.lang = lang === "auto" ? "ko-KR" : lang;
      this.isListening = true;

      this.recognition.onstart = () => this.callbacks.onStatusChange?.("listening");

      this.recognition.onerror = (event: any) => {
        if (event.error === "no-speech" || event.error === "aborted") return;
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          this.callbacks.onError?.(
            "Microphone access was denied. Click the lock icon in the address bar and allow Microphone."
          );
          this.stop();
          return;
        }
        if (event.error === "network") {
          this.callbacks.onError?.(
            "Web Speech lost connection to Google servers (needs Internet). Retrying… Consider Local GPU STT as backup."
          );
        }
        this.callbacks.onStatusChange?.("reconnecting");
      };

      this.recognition.onend = () => {
        // Chrome ends sessions every ~60s or on network blips: flush and restart seamlessly
        this.flushAssembler();
        if (this.isListening) {
          this.callbacks.onStatusChange?.("reconnecting");
          this.restartTimeout = setTimeout(() => {
            if (!this.isListening) return;
            try {
              this.recognition?.start();
            } catch {
              // already started
            }
          }, 150);
        } else {
          this.callbacks.onStatusChange?.("idle");
        }
      };

      this.recognition.onresult = (event: any) => {
        let interimText = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript: string = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            this.handleFinalFragment(transcript);
          } else {
            interimText += transcript;
          }
        }
        if (interimText.trim()) {
          this.handleInterim(interimText);
        }
      };

      this.recognition.start();
    } catch (err: any) {
      this.callbacks.onError?.(err?.message || "Error starting speech recognition");
    }
  }

  public stop() {
    this.isListening = false;
    clearTimeout(this.interimTimer);
    clearTimeout(this.restartTimeout);
    clearTimeout(this.pauseFlushTimer);
    clearInterval(this.vadInterval);
    this.vadInterval = null;

    if (this.activeRecorder && this.activeRecorder.state === "recording") {
      try {
        this.activeRecorder.stop(); // final segment still gets transcribed
      } catch {}
    }
    this.activeRecorder = null;

    if (this.recognition) {
      try {
        this.recognition.onend = null;
        this.recognition.stop();
      } catch {}
      this.recognition = null;
    }

    this.flushAssembler();
    this.callbacks.onStatusChange?.("idle");
  }

  public stopAll() {
    this.stop();
    this.isMonitoringAudio = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.callbacks.onAudioLevel?.(0);
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  /* ------------------------------------------------------------ */
  /* Web Speech: interim + final fragments                         */
  /* ------------------------------------------------------------ */
  private handleInterim(interim: string) {
    // Show the buffered (not yet translated) part + the live interim together
    const liveSource = normalizeWhitespace(`${this.assembler.pending} ${interim}`);
    this.schedulePauseFlush();

    clearTimeout(this.interimTimer);
    const seq = ++this.interimSeq;
    const speaker = this.getActiveSpeakerMeta();
    const sourceLang = this.sourceCode;

    // Interim preview disabled → show recognized source text only (operator monitoring)
    if (this.config.interimTranslation === false) {
      this.callbacks.onInterimCaption({
        id: "interim_live",
        timestamp: Date.now(),
        sourceLang,
        sourceText: liveSource,
        translatedText: "",
        isFinal: false,
        ...speaker,
      });
      return;
    }

    // Debounced fast preview translation (always the free engine: cheap + ~150ms)
    this.interimTimer = setTimeout(async () => {
      const translated = await this.requestTranslation(liveSource, sourceLang, {
        engineOverride: "google-free",
        withContext: false,
      });
      if (seq !== this.interimSeq || !this.isListening) return;
      this.callbacks.onInterimCaption({
        id: "interim_live",
        timestamp: Date.now(),
        sourceLang,
        sourceText: liveSource,
        translatedText: translated,
        isFinal: false,
        ...speaker,
      });
    }, 350);
  }

  private handleFinalFragment(fragment: string) {
    const sentences = this.assembler.push(fragment);
    sentences.forEach((s) => this.enqueueSentence(s));
    this.schedulePauseFlush();
  }

  private schedulePauseFlush() {
    clearTimeout(this.pauseFlushTimer);
    this.pauseFlushTimer = setTimeout(() => this.flushAssembler(), this.assembler.pauseFlushMs);
  }

  private flushAssembler() {
    clearTimeout(this.pauseFlushTimer);
    const rest = this.assembler.flush();
    if (rest) this.enqueueSentence(rest);
  }

  /* ------------------------------------------------------------ */
  /* Ordered translation pipeline                                  */
  /*   Sentences are translated concurrently but emitted strictly  */
  /*   in spoken order, each with the previous sentences as context */
  /* ------------------------------------------------------------ */
  private enqueueSentence(text: string) {
    const clean = normalizeWhitespace(text);
    if (!clean) return;
    this.interimSeq++; // invalidate any in-flight interim preview
    clearTimeout(this.interimTimer);

    const seq = ++this.sentenceSeq;
    const item: PendingSentence = {
      seq,
      id: `cap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      text: clean,
      timestamp: Date.now(),
      sourceLang: this.sourceCode,
      speaker: this.getActiveSpeakerMeta(),
      done: false,
    };
    this.pending.set(seq, item);

    const context = [...this.recentSource];
    this.recentSource = [...this.recentSource, clean].slice(-CONTEXT_SENTENCES);

    this.requestTranslation(clean, item.sourceLang, { context, speakerName: item.speaker.speakerName })
      .then((translated) => {
        item.result = translated;
      })
      .catch(() => {
        item.result = "";
      })
      .finally(() => {
        item.done = true;
        this.drainPending();
      });
  }

  private drainPending() {
    while (this.pending.has(this.nextEmitSeq)) {
      const item = this.pending.get(this.nextEmitSeq)!;
      if (!item.done) break;
      this.pending.delete(this.nextEmitSeq);
      this.nextEmitSeq++;
      this.callbacks.onFinalCaption({
        id: item.id,
        timestamp: item.timestamp,
        sourceLang: item.sourceLang,
        sourceText: item.text,
        translatedText: item.result || item.text,
        isFinal: true,
        ...item.speaker,
      });
    }
  }

  /* ------------------------------------------------------------ */
  /* Whisper / OpenRouter: VAD-based segmentation                  */
  /*   Cuts audio at natural pauses instead of fixed 3s slices, so */
  /*   words are never chopped in half. Silent segments are never  */
  /*   sent (prevents Whisper hallucinations).                     */
  /* ------------------------------------------------------------ */
  private startVadSegmentation() {
    if (!this.mediaStream) return;
    const maxSegmentMs = Math.min(12000, Math.max(3000, (this.config.sttChunkIntervalSec || 6) * 1000));
    const minSegmentMs = 1200;
    const silenceCutMs = 550;
    const minSpeechMs = 300;
    const tickMs = 100;

    let segStart = 0;
    let speechMs = 0;
    let silenceMs = 0;
    let recorder: MediaRecorder | null = null;
    let chunks: Blob[] = [];

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";

    const beginSegment = () => {
      if (!this.isListening || !this.mediaStream) return;
      chunks = [];
      speechMs = 0;
      silenceMs = 0;
      segStart = Date.now();
      try {
        recorder = new MediaRecorder(this.mediaStream, { mimeType, audioBitsPerSecond: 64000 });
      } catch (err: any) {
        this.callbacks.onError?.("Audio recorder failed: " + err.message);
        return;
      }
      const thisSpeechRef = { ms: 0 };
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        const hadSpeech = thisSpeechRef.ms >= minSpeechMs;
        if (hadSpeech && chunks.length) {
          this.enqueueSegment(new Blob(chunks, { type: mimeType }));
        }
        if (this.isListening) beginSegment();
      };
      (recorder as any)._speechRef = thisSpeechRef;
      this.activeRecorder = recorder;
      recorder.start();
    };

    clearInterval(this.vadInterval);
    this.vadInterval = setInterval(() => {
      if (!recorder || recorder.state !== "recording") return;
      const threshold = Math.max(6, this.noiseFloor * 2.5);
      const isSpeech = this.currentLevel > threshold;
      if (isSpeech) {
        speechMs += tickMs;
        silenceMs = 0;
      } else {
        silenceMs += tickMs;
      }
      (recorder as any)._speechRef.ms = speechMs;

      const elapsed = Date.now() - segStart;
      const pauseCut = speechMs >= minSpeechMs && silenceMs >= silenceCutMs && elapsed >= minSegmentMs;
      const forceCut = elapsed >= maxSegmentMs;
      // Long pure-silence segment: restart quietly to keep blobs small
      const idleReset = speechMs === 0 && elapsed >= 8000;

      if (pauseCut || forceCut || idleReset) {
        try {
          recorder.stop();
        } catch {}
      }
    }, tickMs);

    beginSegment();
  }

  private enqueueSegment(blob: Blob) {
    if (blob.size < 2000) return;
    this.segmentQueue.push(blob);
    // Never silently lose speech; only if the STT backend is badly overloaded drop the oldest
    while (this.segmentQueue.length > MAX_SEGMENT_QUEUE) {
      this.segmentQueue.shift();
      this.callbacks.onError?.("STT backend is slower than real-time – dropping oldest audio. Use a smaller model or check GPU server.");
    }
    this.processSegmentQueue();
  }

  private async processSegmentQueue() {
    if (this.isProcessingSegment) return;
    this.isProcessingSegment = true;
    try {
      while (this.segmentQueue.length) {
        const blob = this.segmentQueue.shift()!;
        await this.transcribeSegment(blob);
      }
    } finally {
      this.isProcessingSegment = false;
    }
  }

  private buildWhisperPrompt(): string {
    // Whisper's prompt biases spelling of names/terms and continues style of previous text
    const terms = (this.customGlossary || []).map((g) => g.from).filter(Boolean).slice(0, 30);
    const speakers = (this.config.speakers || []).map((s) => s.name).filter(Boolean);
    const parts: string[] = [];
    if (this.config.eventContext) parts.push(this.config.eventContext);
    if (terms.length || speakers.length) parts.push([...speakers, ...terms].join(", "));
    if (this.recentSource.length) parts.push(this.recentSource[this.recentSource.length - 1]);
    return parts.join(". ").slice(0, 600);
  }

  private async transcribeSegment(blob: Blob) {
    try {
      const formData = new FormData();
      formData.append("file", blob, "segment.webm");
      formData.append("sttEngine", this.config.sttEngine || "local-gpu");
      formData.append("sourceLang", this.currentLanguage);
      formData.append("prompt", this.buildWhisperPrompt());
      if (this.config.openrouterApiKey) formData.append("openrouterApiKey", this.config.openrouterApiKey);
      if (this.config.openrouterModel) formData.append("openrouterModel", this.config.openrouterModel);
      if (this.config.localGpuUrl) formData.append("localGpuUrl", this.config.localGpuUrl);
      if (this.config.localGpuModel) formData.append("localGpuModel", this.config.localGpuModel);

      const res = await fetch("/api/caption/transcribe", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (err?.error) {
          console.warn("Transcribe notice:", err.error);
          this.callbacks.onError?.(String(err.error).slice(0, 200));
        }
        return;
      }
      const data = await res.json();
      const rawText = normalizeWhitespace(data.text || "");
      if (!rawText || isLikelyHallucination(rawText, this.lastWhisperText)) return;
      this.lastWhisperText = rawText;

      const sentences = this.assembler.push(rawText);
      sentences.forEach((s) => this.enqueueSentence(s));
      // Segment was cut on a pause → treat remainder as a finished thought
      this.flushAssembler();
    } catch (err: any) {
      console.warn("Segment processing notice:", err.message);
    }
  }

  /* ------------------------------------------------------------ */
  /* Utilities                                                     */
  /* ------------------------------------------------------------ */
  public async recordTestSample(): Promise<Blob | null> {
    if (!this.mediaStream) await this.startAudioAnalysis(this.currentMicId);
    if (!this.mediaStream) return null;
    return new Promise((resolve) => {
      try {
        const mediaRecorder = new MediaRecorder(this.mediaStream!);
        const chunks: Blob[] = [];
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        mediaRecorder.onstop = () => resolve(new Blob(chunks, { type: "audio/webm" }));
        mediaRecorder.start();
        setTimeout(() => mediaRecorder.state === "recording" && mediaRecorder.stop(), 3000);
      } catch (err) {
        console.warn("Record test sample failed:", err);
        resolve(null);
      }
    });
  }

  private async requestTranslation(
    text: string,
    sourceLang: string,
    opts: { engineOverride?: string; withContext?: boolean; context?: string[]; speakerName?: string } = {}
  ): Promise<string> {
    try {
      const res = await fetch("/api/caption/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          sourceLang,
          targetLang: "vi",
          glossary: relevantGlossary(text, this.customGlossary).length ? this.customGlossary : [],
          context: opts.withContext === false ? [] : opts.context || [],
          eventContext: this.config.eventContext || "",
          speakerName: opts.speakerName || "",
          engine: opts.engineOverride || this.config.translationEngine || "google-free",
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
    } catch {
      return text;
    }
  }

  /** Public helper kept for demo phrases / API tests. */
  public async translate(text: string, sourceLang: string): Promise<string> {
    return this.requestTranslation(text, sourceLang, { context: this.recentSource });
  }
}
