import assert from "node:assert/strict";
import test from "node:test";

import {
  ASSETS,
  HORIZON_CENTERS,
  RISK_CENTERS,
  SCORE_MAX,
  allocationTotal,
  analyzeAllocation,
  validateAllocation,
} from "../app/portfolio-rules.ts";

const PROFILES = ["안정형", "중립형", "공격형"];
const HORIZONS = ["1년 미만", "1~3년", "3~5년", "5년 이상"];

function randomGenerator(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function randomAllocation(random) {
  const cuts = Array.from({ length: 5 }, () => Math.floor(random() * 101)).sort((a, b) => a - b);
  const values = [cuts[0], cuts[1] - cuts[0], cuts[2] - cuts[1], cuts[3] - cuts[2], cuts[4] - cuts[3], 100 - cuts[4]];
  return {
    domestic: values[0] / 100,
    overseas: values[1] / 100,
    bond: values[2] / 100,
    equityFund: values[3] / 100,
    cash: values[4] / 100,
    gold: values[5] / 100,
  };
}

test("20,000 randomized portfolios preserve calculation invariants", () => {
  const random = randomGenerator(20260826);

  for (let index = 0; index < 20_000; index += 1) {
    const allocation = randomAllocation(random);
    const profile = PROFILES[index % PROFILES.length];
    const horizon = HORIZONS[index % HORIZONS.length];

    assert.equal(validateAllocation(allocation), true);
    const result = analyzeAllocation(allocation, profile, horizon);

    assert.ok(result.riskScore >= 5 && result.riskScore <= 65);
    assert.ok(result.fit >= 0 && result.fit <= 100);
    assert.ok(result.diversification >= 0 && result.diversification <= 100);
    assert.ok(result.horizonFit >= 0 && result.horizonFit <= 100);
    assert.ok(result.score >= 0 && result.score <= SCORE_MAX);
    assert.ok(Math.abs(allocationTotal(result.target) - 1) < 1e-9);

    const signalIds = new Set(result.signals.map((signal) => signal.id));
    assert.equal(signalIds.has(10) && signalIds.has(11), false);

    for (const item of result.rebalancingActions) assert.ok(Math.abs(item.delta) >= 5);
    for (const item of result.residualItems) assert.ok(Math.abs(item.delta) >= 0.5 && Math.abs(item.delta) < 5);

    const riskRaw = ASSETS.reduce((sum, asset) => sum + allocation[asset.key] * asset.risk, 0);
    const fitRaw = Math.max(0, 100 - Math.abs(riskRaw - RISK_CENTERS[profile]) * 4);
    const hhi = ASSETS.reduce((sum, asset) => sum + allocation[asset.key] ** 2, 0);
    const diversificationRaw = ((1 - hhi) / (1 - 1 / ASSETS.length)) * 100;
    const horizonFitRaw = Math.max(0, 100 - Math.abs(riskRaw - HORIZON_CENTERS[horizon]) * 1.5);
    const expectedStrengthCount = Number(fitRaw >= 80)
      + Number(diversificationRaw >= 85)
      + Number(horizonFitRaw >= 80);
    assert.equal(result.strengths.length, expectedStrengthCount);
    assert.equal(result.strengthAxes.length, expectedStrengthCount);
    const strengths = new Set(result.strengthAxes.map((item) => item.axis));
    assert.equal(strengths.has("A") && signalIds.has(9), false);
    assert.equal(strengths.has("B") && (signalIds.has(7) || result.concentrationPenalty > 0), false);
    assert.equal(strengths.has("C") && (signalIds.has(10) || signalIds.has(11)), false);
  }
});
