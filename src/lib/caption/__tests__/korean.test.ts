import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  SentenceAssembler,
  buildInterpreterMessages,
  isSentenceComplete,
  looksUnfinished,
  splitAtClause,
} from "../textProcessing.ts";

describe("Korean sentence assembly", () => {
  test("recognises finished Korean sentences without punctuation", () => {
    assert.equal(isSentenceComplete("오늘 행사에 참석해 주셔서 감사합니다"), true);
    assert.equal(isSentenceComplete("내년에는 베트남에 공장을 짓겠다"), true);
    assert.equal(isSentenceComplete("질문 있으신가요"), true);
    assert.equal(isSentenceComplete("함께 성장합시다"), true);
    assert.equal(isSentenceComplete("저희 회사는 작년에"), false);
    assert.equal(isSentenceComplete("매출이 증가했고"), false);
    assert.equal(isSentenceComplete("Good morning everyone"), false);
    assert.equal(isSentenceComplete("Good morning everyone."), true);
  });

  test("waits longer when the speaker pauses mid-sentence", () => {
    assert.equal(looksUnfinished("저희 회사는 작년에"), true);
    assert.equal(looksUnfinished("시장이 어려웠는데"), true);
    assert.equal(looksUnfinished("We expanded into Vietnam and"), true);
    assert.equal(looksUnfinished("감사합니다"), false);
    const a = new SentenceAssembler();
    assert.deepEqual(a.push("저희 회사는 작년에"), []);
    assert.equal(a.flushDelayMs(), 2600);
    assert.deepEqual(a.push("베트남 시장에 진출했습니다"), ["저희 회사는 작년에 베트남 시장에 진출했습니다"]);
    assert.deepEqual(a.push("다음 슬라이드"), []);
    assert.equal(a.flushDelayMs(), 1200);
  });

  test("cuts an over-long Korean sentence at a clause boundary, not mid-phrase", () => {
    const long =
      "저희는 지난 십 년 동안 한국과 베트남에서 반도체 부품을 생산해 왔고 올해는 하노이에 새로운 연구 개발 센터를 열어서 현지 인재를 채용하고 있으며 내년에는";
    const [head, rest] = splitAtClause(long, 100);
    assert.ok(head.length <= 100 && head.length >= 40, head);
    assert.match(head, /(고|서|며)$/);
    assert.equal(`${head} ${rest}`, long);
    const a = new SentenceAssembler({ maxCharsKorean: 60 });
    const out = a.push(long);
    assert.equal(out.length, 1);
    assert.ok(a.pending.length > 0);
  });
});

describe("Korean interpreter prompt", () => {
  test("adds Korean number and title rules, and the Vietnamese already shown", () => {
    const [system, user] = buildInterpreterMessages({
      text: "매출은 3억 5천만 원입니다",
      sourceLang: "ko-KR",
      context: ["김민수 대표님을 소개합니다"],
      previousTranslations: ["Xin giới thiệu Tổng Giám đốc Kim Min-su"],
    });
    assert.match(system.content, /억 = 100,000,000/);
    assert.match(system.content, /Tổng Giám đốc/);
    assert.match(user.content, /Vietnamese already shown/);
    assert.match(user.content, /CURRENT segment to translate:\n매출은/);
    const [enSystem] = buildInterpreterMessages({ text: "Hello", sourceLang: "en-US" });
    assert.doesNotMatch(enSystem.content, /Korean specifics/);
  });
});
