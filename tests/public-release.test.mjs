import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

test("public release uses only a generic learner identity", () => {
  assert.match(pageSource, /투리니 학습자/);
  assert.match(pageSource, /학습자님/);
});

test("new users are routed to diagnosis before the main app", () => {
  assert.match(pageSource, /progress\.financeLevel === "진단 전" && !session && !result/);
  assert.match(pageSource, /진단 테스트 시작하기/);
  assert.match(pageSource, /onClick=\{startDiagnosis\}/);
});

test("public release uses fresh per-browser storage keys", () => {
  assert.match(pageSource, /turini-public-progress-v1/);
  assert.match(pageSource, /turini-public-portfolio-v1/);
  assert.doesNotMatch(pageSource, /turini-progress-v2|turini-portfolio-v2/);
});
