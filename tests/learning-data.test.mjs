import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  conceptKey,
  planLearningQuestions,
  planSessionQuestions,
  recordConceptReview,
  scheduleRetry,
} from "../app/quiz-scheduler.ts";

const questions = JSON.parse(fs.readFileSync(new URL("../public/data/quizData_720_FINAL.json", import.meta.url), "utf8"));
const expectedTypes = new Set(["4지선다", "OX", "빈칸선택", "빈칸직접입력"]);

test("all 720 learning questions are structurally usable", () => {
  assert.equal(questions.length, 720);
  const groups = new Map();
  for (const question of questions) {
    assert.ok(question.id && question.base_id && question.question && question.answer && question.explanation);
    assert.ok(expectedTypes.has(question.type), `${question.id}: ${question.type}`);
    assert.ok(["ORIGINAL_SOURCE", "VERIFIED_OFFICIAL", "SOURCE_REVALIDATED"].includes(question.verification_status), question.id);
    assert.match(question.source_url, /^https?:\/\//u, question.id);
    assert.ok(question.weakness_tag && question.parent_tag, question.id);
    groups.set(question.base_id, [...(groups.get(question.base_id) || []), question]);
    if (question.type === "4지선다") {
      assert.equal(question.choices.length, 4, question.id);
      assert.equal(new Set(question.choices).size, 4, question.id);
      assert.ok(question.choices.includes(question.answer), question.id);
    }
    if (question.type === "OX") {
      assert.deepEqual(new Set(question.choices), new Set(["O", "X"]), question.id);
      assert.ok(question.choices.includes(question.answer), question.id);
    }
  }
  assert.equal(groups.size, 180);
  for (const [baseId, variants] of groups) {
    assert.equal(variants.length, 4, baseId);
    assert.deepEqual(new Set(variants.map((question) => question.type)), expectedTypes, baseId);
  }
});

test("2,500 planned sessions contain no accidental canonical duplicate", () => {
  const categories = [...new Set(questions.map((question) => question.category))];
  const difficulties = [...new Set(questions.map((question) => question.difficulty))];
  const pools = [questions];
  for (const category of categories) {
    pools.push(questions.filter((question) => question.category === category));
    for (const difficulty of difficulties) {
      const pool = questions.filter((question) => question.category === category && question.difficulty === difficulty);
      if (new Set(pool.map(conceptKey)).size >= 10) pools.push(pool);
    }
  }
  assert.equal(pools.length, 25);
  let sessions = 0;
  for (const pool of pools) {
    for (let seed = 1; seed <= 100; seed += 1) {
      const planned = planLearningQuestions(pool, 10, seed, {}, 0);
      assert.equal(planned.length, 10);
      assert.equal(new Set(planned.map(conceptKey)).size, 10);
      sessions += 1;
    }
  }
  assert.equal(sessions, 2500);
});

test("actual four-choice answers are not tied to one display position", () => {
  const positions = [0, 0, 0, 0];
  for (let seed = 1; seed <= 300; seed += 1) {
    const planned = planLearningQuestions(questions, 10, seed, {}, 0);
    for (const question of planned) {
      if (question.type === "4지선다") positions[question.choices.indexOf(question.answer)] += 1;
    }
  }
  assert.ok(positions.every((count) => count > 650), `positions=${positions.join(",")}`);
  assert.ok(Math.max(...positions) - Math.min(...positions) < 180, `positions=${positions.join(",")}`);
});

test("real-data study runs keep retries 3-5 positions away across session boundaries", () => {
  let observedRetries = 0;
  for (let run = 0; run < 40; run += 1) {
    let progress = { studySessions: 0, conceptReviews: {}, pendingRetries: [] };
    const outstanding = new Map();
    for (let sessionNumber = 0; sessionNumber < 12; sessionNumber += 1) {
      let session = {
        questions: planSessionQuestions(
          questions,
          10,
          run * 1009 + sessionNumber * 97 + 1,
          progress.conceptReviews,
          progress.studySessions,
          progress.pendingRetries,
        ),
        index: 0,
      };
      assert.equal(session.questions.length, 10);
      assert.equal(new Set(session.questions.map(conceptKey)).size, 10);

      for (let index = 0; index < session.questions.length; index += 1) {
        session.index = index;
        const question = session.questions[index];
        const key = conceptKey(question);
        const absoluteIndex = sessionNumber * 10 + index;
        if (question.reviewKind === "retry") {
          const wrong = outstanding.get(key);
          assert.ok(wrong, `${question.id}: retry without a tracked wrong answer`);
          assert.ok(absoluteIndex - wrong.absoluteIndex >= 3 && absoluteIndex - wrong.absoluteIndex <= 5);
          assert.notEqual(question.type, wrong.type);
          assert.equal(question.category, wrong.category);
          assert.equal(question.difficulty, wrong.difficulty);
          outstanding.delete(key);
          observedRetries += 1;
        }

        const shouldBeWrong = question.reviewKind !== "retry" && (index === 1 || index === 8);
        const retryPlan = shouldBeWrong
          ? scheduleRetry(session, question, questions, progress.pendingRetries)
          : null;
        if (retryPlan) {
          session = retryPlan.session;
          const hasScheduledRetry = session.questions.slice(index + 1).some((candidate) =>
            candidate.reviewKind === "retry" && conceptKey(candidate) === key,
          );
          if (retryPlan.deferred || hasScheduledRetry) {
            outstanding.set(key, {
              absoluteIndex,
              type: question.type,
              category: question.category,
              difficulty: question.difficulty,
            });
          }
        }

        progress = recordConceptReview(progress, question, !shouldBeWrong);
        if (retryPlan?.deferred && !progress.pendingRetries.some((pending) => pending.key === retryPlan.deferred.key)) {
          progress = { ...progress, pendingRetries: [...progress.pendingRetries, retryPlan.deferred] };
        }
      }
      progress = { ...progress, studySessions: progress.studySessions + 1 };
    }
  }
  assert.ok(observedRetries >= 700, `only ${observedRetries} retries were observed`);
});
