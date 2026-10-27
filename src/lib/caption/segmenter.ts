/**
 * Pause-aware audio segmentation for the chunked STT engines (OpenRouter / local Whisper).
 * Instead of slicing every N seconds (which splits words), a chunk ends at the first speech
 * pause after `minMs`, or at `maxMs` at the latest. Chunks with no speech are discarded,
 * which also stops Whisper from hallucinating text on silence.
 */
export interface SegmenterOptions {
  minMs: number; // shortest chunk worth sending
  maxMs: number; // hard cap so captions keep flowing during non-stop speech
  silenceMs: number; // pause length that ends a sentence
  minThreshold: number; // RMS floor (0..1) that counts as voice in a quiet room
}

export const DEFAULT_SEGMENTER_OPTIONS: SegmenterOptions = {
  minMs: 1200,
  maxMs: 8000,
  silenceMs: 600,
  minThreshold: 0.012,
};

export type SegmentDecision = "continue" | "cut";

export class SpeechSegmenter {
  private opts: SegmenterOptions;
  private startedAt = 0;
  private lastVoiceAt = 0;
  private voiced = false;
  private noiseFloor = 0;

  constructor(opts: Partial<SegmenterOptions> = {}) {
    this.opts = { ...DEFAULT_SEGMENTER_OPTIONS, ...opts };
  }

  /** Start a new chunk. Keeps the learned noise floor across chunks. */
  public reset(now: number) {
    this.startedAt = now;
    this.lastVoiceAt = now;
    this.voiced = false;
  }

  /** True once the current chunk has contained any speech. */
  public get hasVoice(): boolean {
    return this.voiced;
  }

  public get threshold(): number {
    return Math.max(this.opts.minThreshold, this.noiseFloor * 3);
  }

  /** Feed one RMS reading (0..1). Returns "cut" when the current chunk should be closed. */
  public update(rms: number, now: number): SegmentDecision {
    // Noise floor falls fast and rises slowly (~25 s), so it settles on the room's background
    // level (speech always has gaps) and a humming hall stops counting as speech. It errs on
    // the side of "voice": a wasted API call is cheap, discarding real speech is not.
    if (rms < this.noiseFloor) {
      this.noiseFloor = (this.noiseFloor + rms) / 2;
    } else {
      this.noiseFloor += (rms - this.noiseFloor) * 0.002;
    }

    if (rms >= this.threshold) {
      this.voiced = true;
      this.lastVoiceAt = now;
    }

    const elapsed = now - this.startedAt;
    if (elapsed >= this.opts.maxMs) return "cut";
    if (!this.voiced) {
      // Nothing said yet: recycle the chunk so the next one starts close to the speech
      return elapsed >= this.opts.minMs ? "cut" : "continue";
    }
    if (elapsed >= this.opts.minMs && now - this.lastVoiceAt >= this.opts.silenceMs) return "cut";
    return "continue";
  }
}

/** Bounded FIFO so slow STT responses delay captions instead of silently dropping speech. */
export class ChunkQueue<T> {
  private items: T[] = [];
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  /** Adds an item; returns the oldest item dropped when the queue overflows, if any. */
  public push(item: T): T | undefined {
    this.items.push(item);
    return this.items.length > this.maxSize ? this.items.shift() : undefined;
  }

  public shift(): T | undefined {
    return this.items.shift();
  }

  public clear() {
    this.items = [];
  }

  public get size(): number {
    return this.items.length;
  }
}
