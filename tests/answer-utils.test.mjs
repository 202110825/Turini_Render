import assert from "node:assert/strict";
import test from "node:test";

import fs from "node:fs";

import { isAnswerCorrect, normalizeAnswer } from "../app/answer-utils.ts";

test("direct-input grading accepts natural Korean endings and common equivalents", () => {
  assert.equal(isAnswerCorrect("하락한다", "하락"), true);
  assert.equal(isAnswerCorrect("떨어진다", "하락"), true);
  assert.equal(isAnswerCorrect("주주입니다", "주주"), true);
  assert.equal(isAnswerCorrect("상장지수펀드", "ETF"), true);
  assert.equal(isAnswerCorrect("시세차익과 배당", "매매차익과 배당금"), true);
  assert.equal(isAnswerCorrect("감소합니다", "낮아진다"), true);
  assert.equal(isAnswerCorrect("증가합니다", "커진다"), true);
});

test("direct-input grading normalizes numeric finance answers without over-accepting", () => {
  assert.equal(isAnswerCorrect("0", "0원"), true);
  assert.equal(isAnswerCorrect("3퍼센트", "3%"), true);
  assert.equal(isAnswerCorrect("상승", "하락"), false);
  assert.equal(isAnswerCorrect("채권", "주식"), false);
});

test("question-specific accepted answers are honored", () => {
  assert.equal(isAnswerCorrect("주식보유자", "주주", ["기업의 일부 소유자"]), true);
});

test("all 180 direct-input official answers remain gradeable", () => {
  const questions = JSON.parse(fs.readFileSync(new URL("../public/data/quizData_720_FINAL.json", import.meta.url), "utf8"));
  const directAnswers = questions.filter((question) => question.type === "빈칸직접입력");
  assert.equal(directAnswers.length, 180);
  for (const question of directAnswers) {
    assert.ok(normalizeAnswer(question.answer), question.id);
    assert.equal(isAnswerCorrect(question.answer, question.answer), true, question.id);
    assert.equal(isAnswerCorrect(`${question.answer}입니다`, question.answer), true, question.id);
  }
});
