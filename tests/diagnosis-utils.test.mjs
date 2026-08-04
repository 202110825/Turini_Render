import assert from "node:assert/strict";
import test from "node:test";

import { financeLevelForRawScore } from "../app/diagnosis-utils.ts";

test("diagnosis follows the documented 54-point raw-score boundaries", () => {
  assert.equal(financeLevelForRawScore(0), "초급");
  assert.equal(financeLevelForRawScore(21), "초급");
  assert.equal(financeLevelForRawScore(22), "중급");
  assert.equal(financeLevelForRawScore(38), "중급");
  assert.equal(financeLevelForRawScore(39), "고급");
  assert.equal(financeLevelForRawScore(54), "고급");
});
