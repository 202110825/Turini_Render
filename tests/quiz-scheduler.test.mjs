import assert from "node:assert/strict";
import test from "node:test";

import {
  conceptKey,
  insertRetry,
  planLearningQuestions,
  planSessionQuestions,
  recordConceptReview,
  scheduleRetry,
} from "../app/quiz-scheduler.ts";

const TYPES = ["4지선다", "OX", "빈칸선택", "빈칸직접입력"];

function makePool(concepts = 30) {
  return Array.from({ length: concepts }, (_, conceptIndex) =>
    TYPES.map((type, typeIndex) => ({
      id: `C${conceptIndex}_${typeIndex}`,
      base_id: `C${conceptIndex}`,
      type,
    })),
  ).flat();
}

test("a normal ten-question session contains ten distinct concepts", () => {
  const session = planLearningQuestions(makePool(), 10, 41, {}, 0);
  assert.equal(session.length, 10);
  assert.equal(new Set(session.map(conceptKey)).size, 10);
  assert.equal(session.filter((question) => question.reviewKind).length, 0);
});

test("the next session mixes seven new concepts with three due reviews", () => {
  const pool = makePool();
  const first = planLearningQuestions(pool, 10, 41, {}, 0);
  let progress = { studySessions: 0, conceptReviews: {}, pendingRetries: [] };
  for (const question of first) progress = recordConceptReview(progress, question, true);
  progress = { ...progress, studySessions: 1 };

  const second = planLearningQuestions(pool, 10, 73, progress.conceptReviews, progress.studySessions);
  const reviews = second.filter((question) => question.reviewKind === "scheduled");
  assert.equal(second.length, 10);
  assert.equal(new Set(second.map(conceptKey)).size, 10);
  assert.equal(reviews.length, 3);
  assert.equal(second.length - reviews.length, 7);
  for (const question of reviews) {
    assert.notEqual(question.type, progress.conceptReviews[conceptKey(question)].lastType);
  }
});

test("a wrong concept returns three to five positions later in a different form", () => {
  const pool = makePool();
  const questions = planLearningQuestions(pool, 10, 101, {}, 0);
  const first = questions[0];
  const retried = insertRetry({ questions, index: 0 }, first, pool);
  const retryIndex = retried.questions.findIndex((question) => question.reviewKind === "retry");

  assert.ok(retryIndex >= 3 && retryIndex <= 5);
  assert.equal(conceptKey(retried.questions[retryIndex]), conceptKey(first));
  assert.notEqual(retried.questions[retryIndex].type, first.type);
  assert.equal(retried.questions.length, 10);

  const secondWrong = retried.questions[1];
  const twiceRetried = insertRetry({ ...retried, index: 1 }, secondWrong, pool);
  assert.equal(twiceRetried.questions.filter((question) => question.reviewKind === "retry").length, 2);
});

test("a retry answered incorrectly is scheduled again in another form", () => {
  const pool = makePool(20);
  const questions = planLearningQuestions(pool, 10, 401, {}, 0);
  const firstPlan = scheduleRetry({ questions, index: 0 }, questions[0], pool, []);
  const firstRetryIndex = firstPlan.session.questions.findIndex((question) => question.reviewKind === "retry");
  const firstRetry = firstPlan.session.questions[firstRetryIndex];
  const secondPlan = scheduleRetry({ questions: firstPlan.session.questions, index: firstRetryIndex }, firstRetry, pool, []);
  const laterRetryIndex = secondPlan.session.questions.findIndex((question, index) =>
    index > firstRetryIndex && question.reviewKind === "retry" && conceptKey(question) === conceptKey(firstRetry),
  );
  if (laterRetryIndex >= 0) {
    assert.ok(laterRetryIndex - firstRetryIndex >= 3 && laterRetryIndex - firstRetryIndex <= 5);
    assert.notEqual(secondPlan.session.questions[laterRetryIndex].type, firstRetry.type);
  } else {
    assert.ok(secondPlan.deferred);
  }
});

test("correct streaks increase the review interval", () => {
  const question = makePool(1)[0];
  let progress = { studySessions: 0, conceptReviews: {}, pendingRetries: [] };
  progress = recordConceptReview(progress, question, true);
  assert.equal(progress.conceptReviews.C0.nextDueSession, 1);
  progress = recordConceptReview({ ...progress, studySessions: 1 }, question, true);
  assert.equal(progress.conceptReviews.C0.nextDueSession, 4);
  progress = recordConceptReview({ ...progress, studySessions: 4 }, question, true);
  assert.equal(progress.conceptReviews.C0.nextDueSession, 11);
});

test("BND_I_001 and RET_A_008 share one scheduling concept", () => {
  assert.equal(
    conceptKey({ id: "BND_I_001_MCQ", base_id: "BND_I_001", type: "4지선다" }),
    conceptKey({ id: "RET_A_008_OX", base_id: "RET_A_008", type: "OX" }),
  );
});

test("a late wrong answer is deferred to the next session at the promised distance", () => {
  const pool = makePool(40);
  const questions = planLearningQuestions(pool, 10, 127, {}, 0);
  const lateQuestion = questions[8];
  const scheduled = scheduleRetry({ questions, index: 8 }, lateQuestion, pool, []);

  assert.ok(scheduled.deferred);
  assert.ok(scheduled.deferred.dueIndex >= 1 && scheduled.deferred.dueIndex <= 3);

  const next = planSessionQuestions(pool, 10, 211, {}, 1, [scheduled.deferred]);
  const retryIndex = next.findIndex((question) => question.reviewKind === "retry");
  assert.equal(next.length, 10);
  assert.equal(new Set(next.map(conceptKey)).size, 10);
  assert.equal(retryIndex, scheduled.deferred.dueIndex);
  assert.equal(conceptKey(next[retryIndex]), conceptKey(lateQuestion));
  assert.notEqual(next[retryIndex].type, lateQuestion.type);
  assert.ok((10 - 8 + retryIndex) >= 3 && (10 - 8 + retryIndex) <= 5);
});

test("an aliased retry stays inside the source category", () => {
  const pool = [
    ...TYPES.map((type, index) => ({ id: `BND_I_001_${index}`, base_id: "BND_I_001", category: "채권", type })),
    ...TYPES.map((type, index) => ({ id: `RET_A_008_${index}`, base_id: "RET_A_008", category: "수익률 계산", type })),
    ...makePool(20),
  ];
  const source = pool[0];
  const sessionQuestions = [source, ...makePool(9).filter((question) => question.type === "4지선다")];
  const scheduled = scheduleRetry({ questions: sessionQuestions, index: 0 }, source, pool, []);
  const retry = scheduled.session.questions.find((question) => question.reviewKind === "retry");
  assert.ok(retry);
  assert.equal(retry.category, "채권");
  assert.notEqual(retry.type, source.type);
});

test("a pending retry waits for a compatible category session", () => {
  const stockPool = Array.from({ length: 12 }, (_, concept) => TYPES.map((type, index) => ({
    id: `STK_${concept}_${index}`,
    base_id: `STK_${concept}`,
    category: "주식",
    difficulty: "초급",
    type,
  }))).flat();
  const bondPool = Array.from({ length: 12 }, (_, concept) => TYPES.map((type, index) => ({
    id: `BND_${concept}_${index}`,
    base_id: `BND_${concept}`,
    category: "채권",
    difficulty: "초급",
    type,
  }))).flat();
  const pending = [{ key: "STK_0", sourceId: "STK_0_0", category: "주식", difficulty: "초급", lastType: "4지선다", dueIndex: 1 }];

  const unrelated = planSessionQuestions(bondPool, 10, 19, {}, 1, pending);
  assert.equal(unrelated.some((question) => question.reviewKind === "retry"), false);

  const compatible = planSessionQuestions(stockPool, 10, 23, {}, 1, pending);
  assert.equal(compatible[1].reviewKind, "retry");
  assert.equal(compatible[1].category, "주식");
  assert.equal(compatible[1].difficulty, "초급");
});

test("four-choice answers rotate across every display position", () => {
  const pool = Array.from({ length: 40 }, (_, index) => ({
    id: `Q${index}`,
    base_id: `Q${index}`,
    type: "4지선다",
    choices: ["A", "B", "C", "D"],
    answer: "A",
  }));
  const positions = [0, 0, 0, 0];
  for (let seed = 1; seed <= 100; seed += 1) {
    const planned = planLearningQuestions(pool, 10, seed, {}, 0);
    for (const question of planned) positions[question.choices.indexOf(question.answer)] += 1;
  }
  assert.ok(positions.every((count) => count > 200), `answer positions were ${positions.join(",")}`);
  assert.ok(Math.max(...positions) - Math.min(...positions) < 100, `answer positions were ${positions.join(",")}`);
});
