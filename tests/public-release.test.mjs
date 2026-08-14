import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const feedbackRouteSource = await readFile(new URL("../app/api/portfolio-feedback/route.ts", import.meta.url), "utf8");
const envExampleSource = await readFile(new URL("../.env.example", import.meta.url), "utf8");

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

test("GPT portfolio coaching is called through a server-only API route", () => {
  assert.match(pageSource, /fetch\("\/api\/portfolio-feedback"/);
  assert.match(feedbackRouteSource, /process\.env\.OPENAI_API_KEY/);
  assert.match(feedbackRouteSource, /https:\/\/api\.openai\.com\/v1\/responses/);
  assert.match(feedbackRouteSource, /type: "json_schema"/);
  assert.doesNotMatch(pageSource, /sk-[A-Za-z0-9_-]{20,}/);
  assert.match(envExampleSource, /OPENAI_API_KEY=your_api_key_here/);
});

test("portfolio screen exposes the revised asset classification help", () => {
  assert.match(pageSource, /asset-info-button/);
  assert.match(pageSource, /asset-classification-note/);
  assert.match(pageSource, /portfolioRuleVersion: PORTFOLIO_RULE_VERSION/);
});
