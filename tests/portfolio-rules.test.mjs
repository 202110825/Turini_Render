import assert from "node:assert/strict";
import test from "node:test";

import {
  ASSETS,
  PORTFOLIO_RULE_VERSION,
  PORTFOLIO_TYPE_BANDS,
  RISK_CENTERS,
  normalizeAllocation,
  portfolioTypeFor,
  riskScoreFor,
  targetFor,
} from "../app/portfolio-rules.ts";

test("portfolio uses six documented asset classes with help text", () => {
  assert.equal(ASSETS.length, 6);
  assert.deepEqual(ASSETS.map((asset) => asset.label), [
    "국내주식",
    "해외주식",
    "채권",
    "주식형 ETF·펀드",
    "현금성자산",
    "금",
  ]);
  assert.ok(ASSETS.every((asset) => asset.help.length >= 20));
});

test("equity funds and bond funds use their underlying asset risk", () => {
  const equityFund = ASSETS.find((asset) => asset.key === "equityFund");
  const bond = ASSETS.find((asset) => asset.key === "bond");
  assert.equal(equityFund?.risk, 55);
  assert.equal(bond?.risk, 25);
  assert.match(equityFund?.help || "", /레버리지·인버스 상품은 제외/);
  assert.match(bond?.help || "", /채권 ETF·채권형 펀드/);
});

test("each target allocation sums to 100 and reproduces its risk center", () => {
  for (const profile of ["안정형", "중립형", "공격형"]) {
    const target = targetFor(profile);
    assert.equal(Object.values(target).reduce((sum, value) => sum + value, 0), 100);
    assert.equal(riskScoreFor(target), RISK_CENTERS[profile]);
    assert.equal(portfolioTypeFor(riskScoreFor(target)), profile);
  }
});

test("portfolio type boundaries match the new target midpoints", () => {
  assert.deepEqual(PORTFOLIO_TYPE_BANDS, { stableMax: 36.4, neutralMax: 47.9 });
  assert.equal(portfolioTypeFor(36.4), "안정형");
  assert.equal(portfolioTypeFor(36.5), "중립형");
  assert.equal(portfolioTypeFor(47.9), "중립형");
  assert.equal(portfolioTypeFor(48), "공격형");
});

test("legacy fund allocation migrates without losing the saved percentage", () => {
  const migrated = normalizeAllocation({ domestic: 10, overseas: 20, bond: 30, fund: 20, cash: 10, gold: 10 });
  assert.equal(migrated.equityFund, 20);
  assert.equal(Object.values(migrated).reduce((sum, value) => sum + value, 0), 100);
  assert.equal(PORTFOLIO_RULE_VERSION, "2.0.0-equity-fund-55");
});
