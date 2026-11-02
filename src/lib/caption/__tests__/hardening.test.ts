import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hasWriteAccess, PIN_HEADER, stripSecrets } from "../security.ts";
import { resolveEngine, resolveKeys } from "../translationEngines.ts";
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
