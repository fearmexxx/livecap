import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hasWriteAccess, PIN_HEADER, stripSecrets } from "../security.ts";
import { resolveEngine, resolveKeys } from "../translationEngines.ts";
import { DEFAULT_CAPTION_CONFIG } from "../types.ts";
import { buildEventFile, parseEventFile, roomDisplayName } from "../roomSettings.ts";

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

describe("Event settings file", () => {
  it("round-trips every room without API keys or the laptop's microphone", () => {
    const hall1 = {
      ...DEFAULT_CAPTION_CONFIG,
      eventContext: "Samsung AI summit",
      micDeviceId: "usb-mixer-123",
      openrouterApiKey: "sk-or-secret",
    };
    const hall2 = { ...DEFAULT_CAPTION_CONFIG, speakerLabel: "Mr. Kim" };
    const file = buildEventFile({ "hall-1": hall1, "hall-2": hall2 }, new Date("2026-11-02T00:00:00Z"));
    const text = JSON.stringify(file);
    assert.doesNotMatch(text, /sk-or-secret|usb-mixer-123/);

    const rooms = parseEventFile(text);
    assert.deepEqual(Object.keys(rooms), ["hall-1", "hall-2"]);
    assert.equal(rooms["hall-1"].eventContext, "Samsung AI summit");
    assert.equal(rooms["hall-2"].speakerLabel, "Mr. Kim");
    assert.equal(rooms["hall-1"].micDeviceId, undefined);
  });

  it("rejects files that are not LiveCap event settings", () => {
    assert.throws(() => parseEventFile("not json"), /invalid JSON/);
    assert.throws(() => parseEventFile(JSON.stringify({ kind: "other" })), /not a LiveCap event settings file/);
    assert.throws(
      () => parseEventFile(JSON.stringify({ kind: "livecap-event-settings", rooms: {} })),
      /no rooms/
    );
  });

  it("names hall rooms for the operator", () => {
    assert.equal(roomDisplayName("hall-3"), "Hall 3");
    assert.equal(roomDisplayName("workshop-a"), "workshop-a");
  });
});
