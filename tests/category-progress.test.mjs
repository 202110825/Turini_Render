import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { categoryLevelForSolved } from "../app/category-progress.ts";

test("each category starts at level 1 and gains a level per 10 unique solved questions", () => {
  assert.equal(categoryLevelForSolved(0), 1);
  assert.equal(categoryLevelForSolved(9), 1);
  assert.equal(categoryLevelForSolved(10), 2);
  assert.equal(categoryLevelForSolved(20), 3);
});

test("category level is bounded to the 120-question, 12-level path", () => {
  assert.equal(categoryLevelForSolved(110), 12);
  assert.equal(categoryLevelForSolved(120), 12);
  assert.equal(categoryLevelForSolved(999), 12);
  assert.equal(categoryLevelForSolved(-1), 1);
});

test("the category header uses its own level and the waiting speech bubble fits its copy", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(page, /Lv\. \{activeCategoryLevel\}/);
  assert.match(page, /Lv\. \{categoryLevel\}/);
  assert.match(css, /\.quiz-mascot\.waiting \.speech \{[^}]*width:max-content;[^}]*justify-self:start;/s);
});
