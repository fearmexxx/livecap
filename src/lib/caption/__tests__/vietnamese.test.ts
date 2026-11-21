import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  buildInterpreterMessages,
  glossaryForTarget,
  langCode,
  langInfo,
  preApplyGlossary,
  targetLangFor,
} from "../textProcessing.ts";

describe("Vietnamese speech → English subtitles", () => {
  test("Vietnamese speech gets English subtitles; Korean and English still get Vietnamese", () => {
    assert.equal(targetLangFor("vi-VN"), "en");
    assert.equal(targetLangFor("vi"), "en");
    assert.equal(targetLangFor("ko-KR"), "vi");
    assert.equal(targetLangFor("en"), "vi");
    assert.equal(targetLangFor("auto"), "vi");
    assert.equal(langCode("vi-VN"), "vi");
    assert.equal(langInfo("vi").flag, "🇻🇳");
  });

  test("the glossary runs the other way for English subtitles", () => {
    const glossary = [
      { from: "AI", to: "Trí tuệ nhân tạo" },
      { from: "VBE", to: "VBE Event Group" },
    ];
    assert.deepEqual(glossaryForTarget(glossary, "vi"), glossary);
    assert.deepEqual(glossaryForTarget(glossary, "en"), [
      { from: "Trí tuệ nhân tạo", to: "AI" },
      { from: "VBE Event Group", to: "VBE" },
    ]);
    assert.equal(preApplyGlossary("ứng dụng trí tuệ nhân tạo", glossaryForTarget(glossary, "en")), "ứng dụng AI");
  });

  test("the interpreter prompt asks for English with Vietnamese rules", () => {
    const [system, user] = buildInterpreterMessages({
      text: "Kính thưa quý vị, vốn đầu tư đạt 2 tỷ đô la",
      sourceLang: "vi",
      targetLang: "en",
      glossary: glossaryForTarget([{ from: "FDI", to: "vốn đầu tư" }], "en"),
      previousTranslations: ["Good morning, ladies and gentlemen."],
    });
    assert.match(system.content, /Vietnamese speech into English/);
    assert.match(system.content, /tỷ = billion/);
    assert.match(system.content, /"vốn đầu tư" → "FDI"/);
    assert.match(system.content, /exact English renderings/);
    assert.doesNotMatch(system.content, /Korean specifics/);
    assert.match(user.content, /English already shown on screen/);
  });

  test("Korean prompts are unchanged", () => {
    const [system] = buildInterpreterMessages({ text: "안녕하세요", sourceLang: "ko" });
    assert.match(system.content, /Korean speech into Vietnamese/);
    assert.match(system.content, /Korean specifics/);
  });
});
