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
const officialSourceDomains = new Set([
  "blogs.cfainstitute.org", "data.krx.co.kr", "files.stlouisfed.org", "global.krx.co.kr", "kind.krx.co.kr",
  "law.kofia.or.kr", "pdf.krx.co.kr", "www.bis.org", "www.bok.or.kr", "www.cfainstitute.org", "www.cftc.gov",
  "www.ecb.europa.eu", "www.finra.org", "www.fsc.go.kr", "www.imf.org", "www.investor.gov", "www.ishares.com",
  "www.kdic.or.kr", "www.oecd.org", "www.samsungfund.com",
]);

test("all 720 learning questions are structurally usable", () => {
  assert.equal(questions.length, 720);
  assert.equal(new Set(questions.map((question) => question.id)).size, 720);
  assert.equal(new Set(questions.map((question) => question.question.trim().replace(/\s+/gu, " "))).size, 720);
  const groups = new Map();
  for (const question of questions) {
    assert.ok(question.id && question.base_id && question.question && question.answer && question.explanation);
    assert.ok(expectedTypes.has(question.type), `${question.id}: ${question.type}`);
    assert.ok(["ORIGINAL_SOURCE", "VERIFIED_OFFICIAL", "SOURCE_REVALIDATED"].includes(question.verification_status), question.id);
    assert.match(question.source_url, /^https?:\/\//u, question.id);
    assert.ok(officialSourceDomains.has(new URL(question.source_url).hostname), `${question.id}: ${question.source_url}`);
    assert.ok(Array.isArray(question.source_references) && question.source_references.length > 0, question.id);
    for (const reference of question.source_references) {
      assert.ok(reference.source_name, question.id);
      assert.match(reference.source_url, /^https?:\/\//u, question.id);
      assert.ok(officialSourceDomains.has(new URL(reference.source_url).hostname), `${question.id}: ${reference.source_url}`);
    }
    assert.ok(question.weakness_tag && question.parent_tag, question.id);
    assert.doesNotMatch(`${question.question} ${question.explanation}`, /�|\u0000|의 정답은/gu, question.id);
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
    for (const field of ["category", "difficulty", "key_concept", "weakness_tag", "parent_tag", "diagnostic_item"]) {
      assert.equal(new Set(variants.map((question) => question[field])).size, 1, `${baseId}: ${field}`);
    }
  }
});

test("tag crosswalk and parent index exactly match the 720-question dataset", () => {
  const csv = fs.readFileSync(new URL("../reference-data/tag_crosswalk_FINAL.csv", import.meta.url), "utf8").replace(/^\uFEFF/u, "").trim();
  const [headerLine, ...lines] = csv.split(/\r?\n/u);
  const headers = headerLine.split(",");
  const crosswalk = lines.map((line) => Object.fromEntries(headers.map((header, index) => [header, line.split(",")[index]])));
  assert.equal(crosswalk.length, 20);

  for (const row of crosswalk) {
    const matches = questions.filter((question) => question.parent_tag === row.상위태그);
    assert.equal(matches.length, Number(row.학습문항수), `${row.상위태그}: 학습문항수`);
    assert.equal(new Set(matches.map((question) => question.base_id)).size, Number(row.개념카드수), `${row.상위태그}: 개념카드수`);
    const actualTags = [...new Set(matches.map((question) => question.weakness_tag))].sort();
    const listedTags = row.하위태그목록.split("|").sort();
    assert.equal(actualTags.length, Number(row.하위태그수), `${row.상위태그}: 하위태그수`);
    assert.deepEqual(actualTags, listedTags, `${row.상위태그}: 하위태그목록`);
    const expectedDiagnostic = row.진단연동.startsWith("X") ? null : row.진단문항;
    assert.ok(matches.every((question) => question.diagnostic_item === expectedDiagnostic), `${row.상위태그}: 진단문항`);
  }

  const index = JSON.parse(fs.readFileSync(new URL("../reference-data/parent_tag_index_FINAL.json", import.meta.url), "utf8"));
  assert.equal(index.parent_tags.length, 20);
  for (const parent of index.parent_tags) {
    const matches = questions.filter((question) => question.parent_tag === parent.tag);
    assert.deepEqual([...new Set(matches.map((question) => question.weakness_tag))].sort(), [...parent.sub_tags].sort(), `${parent.tag}: sub_tags`);
    assert.deepEqual([...new Set(matches.map((question) => question.base_id))].sort(), [...parent.card_ids].sort(), `${parent.tag}: card_ids`);
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
