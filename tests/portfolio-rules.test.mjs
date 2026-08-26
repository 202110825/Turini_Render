import assert from "node:assert/strict";
import test from "node:test";

import {
  ASSETS,
  PORTFOLIO_RULE_VERSION,
  PORTFOLIO_TYPE_BANDS,
  RISK_CENTERS,
  SCORE_MAX,
  allocationTotal,
  analyzeAllocation,
  normalizeAllocation,
  portfolioTypeFor,
  riskScoreFor,
  targetFor,
  validateAllocation,
} from "../app/portfolio-rules.ts";

test("portfolio uses six documented asset classes and underlying-asset classification", () => {
  assert.equal(ASSETS.length, 6);
  assert.deepEqual(ASSETS.map((asset) => asset.label), ["국내주식", "해외주식", "채권", "주식형 ETF·펀드", "현금성자산", "금"]);
  assert.deepEqual(ASSETS.map((asset) => asset.risk), [60, 65, 25, 50, 5, 40]);
  assert.match(ASSETS.find((asset) => asset.key === "bond")?.help || "", /채권 ETF·채권형 펀드/);
  assert.match(ASSETS.find((asset) => asset.key === "equityFund")?.help || "", /금광기업 주식형/);
  assert.match(ASSETS.find((asset) => asset.key === "gold")?.help || "", /금광기업 주식형.*포함하지/);
  assert.match(ASSETS.find((asset) => asset.key === "cash")?.help || "", /손실 가능성/);
});

test("each target allocation sums to 100 and exactly reproduces the unrounded profile center", () => {
  for (const profile of ["안정형", "중립형", "공격형"]) {
    const target = targetFor(profile);
    assert.equal(allocationTotal(target), 100);
    const result = analyzeAllocation(target, profile, "1~3년");
    assert.equal(result.fit, 100);
    assert.equal(result.profileMatch.gap, 0);
    assert.equal(result.portfolioType, profile);
  }
  assert.equal(RISK_CENTERS.공격형, 52.75);
  assert.equal(riskScoreFor(targetFor("공격형")), 52.8);
});

test("portfolio type boundaries use unrounded center midpoints", () => {
  assert.deepEqual(PORTFOLIO_TYPE_BANDS, { stableMax: 35.75, neutralMax: 46.875 });
  assert.equal(portfolioTypeFor(35.75), "안정형");
  assert.equal(portfolioTypeFor(35.751), "중립형");
  assert.equal(portfolioTypeFor(46.875), "중립형");
  assert.equal(portfolioTypeFor(46.876), "공격형");
});

test("invalid, non-finite and non-normalized allocations cannot be analyzed", () => {
  assert.equal(validateAllocation({ domestic: 0, overseas: 100.5, bond: 0, equityFund: 0, cash: 0, gold: 0 }), false);
  assert.equal(validateAllocation({ domestic: 0, overseas: 0, bond: 0, equityFund: 0, cash: true, gold: 0 }), false);
  assert.equal(validateAllocation({ domestic: 0, overseas: 0, bond: 0, equityFund: 0, cash: Number.NaN, gold: 0 }), false);
  assert.throws(() => riskScoreFor({ domestic: 0, overseas: 100.5, bond: 0, equityFund: 0, cash: 0, gold: 0 }));
});

test("score, risk, diversification and recommendations stay inside their declared ranges", () => {
  const cases = [
    { domestic: 0, overseas: 0, bond: 0, equityFund: 0, cash: 100, gold: 0 },
    { domestic: 0, overseas: 100, bond: 0, equityFund: 0, cash: 0, gold: 0 },
    { domestic: 10, overseas: 20, bond: 30, equityFund: 20, cash: 10, gold: 10 },
  ];
  for (const allocation of cases) {
    const result = analyzeAllocation(allocation, "중립형", "1~3년");
    assert.ok(result.riskScore >= 5 && result.riskScore <= 65);
    assert.ok(result.diversification >= 0 && result.diversification <= 100);
    assert.ok(result.score >= 0 && result.score <= SCORE_MAX);
    assert.equal(allocationTotal(result.target), 100);
  }
});

test("period cautions have exclusive low-risk and high-risk directions", () => {
  const highRiskShort = analyzeAllocation({ domestic: 0, overseas: 100, bond: 0, equityFund: 0, cash: 0, gold: 0 }, "공격형", "1년 미만");
  assert.ok(highRiskShort.signals.some((signal) => signal.id === 11));
  assert.ok(!highRiskShort.signals.some((signal) => signal.id === 10));
  const lowRiskLong = analyzeAllocation({ domestic: 0, overseas: 0, bond: 0, equityFund: 0, cash: 100, gold: 0 }, "중립형", "5년 이상");
  assert.ok(lowRiskLong.signals.some((signal) => signal.id === 10));
  assert.ok(!lowRiskLong.signals.some((signal) => signal.id === 11));
});

test("five-year horizon center is attainable and bond/cash are concentration-penalty exemptions", () => {
  const longRisk = analyzeAllocation({ domestic: 0, overseas: 100, bond: 0, equityFund: 0, cash: 0, gold: 0 }, "공격형", "5년 이상");
  assert.equal(longRisk.horizonFit, 100);
  const bondHeavy = analyzeAllocation({ domestic: 0, overseas: 0, bond: 100, equityFund: 0, cash: 0, gold: 0 }, "안정형", "1~3년");
  assert.equal(bondHeavy.concentrationPenalty, 0);
  const stockHeavy = analyzeAllocation({ domestic: 100, overseas: 0, bond: 0, equityFund: 0, cash: 0, gold: 0 }, "공격형", "1~3년");
  assert.equal(stockHeavy.concentrationPenalty, 50);
});

test("strengths use only A>=80, B>=85 and C>=80 without fallback", () => {
  const poor = analyzeAllocation({ domestic: 0, overseas: 0, bond: 40, equityFund: 0, cash: 60, gold: 0 }, "공격형", "5년 이상");
  assert.deepEqual(poor.strengths, []);
  const balanced = analyzeAllocation(targetFor("중립형"), "중립형", "1~3년");
  assert.ok(balanced.strengths.some((line) => /진단 성향/.test(line)));
  assert.ok(balanced.strengths.some((line) => /분산도/.test(line)));
  assert.ok(balanced.strengths.some((line) => /투자 기간/.test(line)));
});

test("legacy fund allocation migrates and old analyses are invalidated by a new rule version", () => {
  const migrated = normalizeAllocation({ domestic: 10, overseas: 20, bond: 30, fund: 20, cash: 10, gold: 10 });
  assert.equal(migrated.equityFund, 20);
  assert.equal(allocationTotal(migrated), 100);
  assert.equal(PORTFOLIO_RULE_VERSION, "3.0.0-portfolio-v9.1");
});
