import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hasWriteAccess, PIN_HEADER, stripSecrets } from "../security.ts";
import { resolveEngine, resolveKeys } from "../translationEngines.ts";
import { ChunkQueue, SpeechSegmenter } from "../segmenter.ts";
import { DEFAULT_CAPTION_CONFIG } from "../types.ts";

describe("API keys never leave the operator PC", () => {
  it("strips every API key from a config but keeps display settings", () => {
    const config = {
      ...DEFAULT_CAPTION_CONFIG,
      openrouterApiKey: "sk-or-secret",
      openaiApiKey: "sk-secret",
      deeplApiKey: "deepl:fx",
      googleCloudApiKey: "gc-secret",
    };
    const clean = stripSecrets(config);
    assert.equal(clean.openrouterApiKey, undefined);
    assert.equal(clean.openaiApiKey, undefined);
    assert.equal(clean.deeplApiKey, undefined);
    assert.equal(clean.googleCloudApiKey, undefined);
    assert.equal(clean.fontSize, config.fontSize);
    assert.equal(config.openrouterApiKey, "sk-or-secret", "original config is not mutated");
    assert.doesNotMatch(JSON.stringify(clean), /secret/);
  });

  it("passes null configs through", () => {
    assert.equal(stripSecrets(null), null);
  });
});

describe("Room PIN", () => {
  const headers = (pin?: string) => new Headers(pin === undefined ? {} : { [PIN_HEADER]: pin });

  it("allows every write when no PIN is configured", () => {
    assert.equal(hasWriteAccess(headers(), null), true);
  });

  it("requires the exact PIN when one is configured", () => {
    assert.equal(hasWriteAccess(headers(), "4821"), false);
    assert.equal(hasWriteAccess(headers("482"), "4821"), false);
    assert.equal(hasWriteAccess(headers("48210"), "4821"), false);
    assert.equal(hasWriteAccess(headers("9999"), "4821"), false);
    assert.equal(hasWriteAccess(headers(" 4821 "), "4821"), true);
  });
});

describe("Translation engine selection", () => {
  const none = { openrouter: "", openai: "", deepl: "" };

  it("auto prefers OpenRouter, then DeepL, then OpenAI, then free Google", () => {
    assert.equal(resolveEngine("auto", { ...none, openrouter: "k", deepl: "k" }), "openrouter");
    assert.equal(resolveEngine("auto", { ...none, deepl: "k", openai: "k" }), "deepl");
    assert.equal(resolveEngine("auto", { ...none, openai: "k" }), "openai");
    assert.equal(resolveEngine("auto", none), "google-free");
  });

  it("falls back to free Google when the chosen engine has no key", () => {
    assert.equal(resolveEngine("deepl", none), "google-free");
    assert.equal(resolveEngine("google-free", { ...none, openrouter: "k" }), "google-free");
  });

  it("uses server env keys when the console sends none", () => {
    const keys = resolveKeys({ openrouterApiKey: "  " }, { OPENROUTER_API_KEY: "env-key" });
    assert.equal(keys.openrouter, "env-key");
    assert.equal(resolveKeys({ deeplApiKey: "typed" }, { DEEPL_API_KEY: "env" }).deepl, "typed");
  });
});

describe("Pause-aware audio segmentation", () => {
  const QUIET = 0.002;
  const SPEECH = 0.1;

  // Feeds one reading every 50 ms and returns the time of the first cut
  function runUntilCut(seg: SpeechSegmenter, levelAt: (t: number) => number, limitMs = 20_000) {
    seg.reset(0);
    for (let t = 0; t <= limitMs; t += 50) {
      if (seg.update(levelAt(t), t) === "cut") return t;
    }
    return -1;
  }

  it("cuts shortly after the speaker pauses", () => {
    const seg = new SpeechSegmenter({ minMs: 1200, maxMs: 8000, silenceMs: 600 });
    const cut = runUntilCut(seg, (t) => (t < 2500 ? SPEECH : QUIET));
    assert.ok(seg.hasVoice);
    assert.ok(cut >= 3000 && cut <= 3200, `cut at ${cut}`);
  });

  it("still hears speech when a chunk starts mid-sentence", () => {
    const seg = new SpeechSegmenter({ maxMs: 8000 });
    // Syllables with short dips, like real speech, never reach a 600 ms pause
    const cut = runUntilCut(seg, (t) => (t % 300 < 200 ? SPEECH : 0.03));
    assert.ok(seg.hasVoice);
    assert.equal(cut, 8000);
  });

  it("caps chunk length during non-stop speech", () => {
    const seg = new SpeechSegmenter({ maxMs: 8000 });
    assert.equal(runUntilCut(seg, () => SPEECH), 8000);
  });

  it("recycles silent chunks quickly and marks them as having no voice", () => {
    const seg = new SpeechSegmenter({ minMs: 1200 });
    assert.equal(runUntilCut(seg, () => QUIET), 1200);
    assert.equal(seg.hasVoice, false);
  });

  it("adapts to a noisy room instead of treating hum as speech", () => {
    const seg = new SpeechSegmenter({ minMs: 1200, minThreshold: 0.012 });
    // Learn the hall's background level first (about 30 s of hum)
    for (let i = 0; i < 25; i++) runUntilCut(seg, () => 0.02);
    const cut = runUntilCut(seg, () => 0.02);
    assert.equal(seg.hasVoice, false, "steady 0.02 background is not speech");
    assert.equal(cut, 1200);
  });
});

describe("Chunk queue", () => {
  it("keeps order and drops only the oldest item on overflow", () => {
    const q = new ChunkQueue<number>(2);
    assert.equal(q.push(1), undefined);
    assert.equal(q.push(2), undefined);
    assert.equal(q.push(3), 1);
    assert.equal(q.shift(), 2);
    assert.equal(q.shift(), 3);
    assert.equal(q.size, 0);
  });
});
