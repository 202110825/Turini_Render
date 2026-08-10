import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

test("signed-in pages display the active account ID", () => {
  assert.match(pageSource, /account\.username/);
  assert.match(pageSource, /안녕하세요, \{account\.username\}님/);
});

test("new users are routed to diagnosis before the main app", () => {
  assert.match(pageSource, /progress\.financeLevel === "진단 전" && !session && !result/);
  assert.match(pageSource, /진단 테스트 시작하기/);
  assert.match(pageSource, /onClick=\{startDiagnosis\}/);
});

test("account state is saved through the server and old browser demo data is discarded", () => {
  assert.match(pageSource, /fetch\("\/api\/account"/);
  assert.match(pageSource, /method: "PUT"/);
  assert.match(pageSource, /turini-public-progress-v1/);
  assert.match(pageSource, /turini-public-portfolio-v1/);
  assert.doesNotMatch(pageSource, /localStorage\.setItem/);
});
