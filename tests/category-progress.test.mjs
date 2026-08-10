import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  categoryDifficultyForLesson,
  categoryLessonPool,
  categoryLevelForSolved,
  completedCategoryLessonsForSolved,
  MAX_CATEGORY_LEVEL,
} from "../app/category-progress.ts";

const quizData = JSON.parse(readFileSync(new URL("../public/data/quizData_720_FINAL.json", import.meta.url), "utf8"));

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

test("the learning path derives completed lessons only from the active category's solved count", () => {
  assert.equal(completedCategoryLessonsForSolved(0), 0);
  assert.equal(completedCategoryLessonsForSolved(9), 0);
  assert.equal(completedCategoryLessonsForSolved(10), 1);
  assert.equal(completedCategoryLessonsForSolved(119), 11);
  assert.equal(completedCategoryLessonsForSolved(120), MAX_CATEGORY_LEVEL);
});

test("each category's 12 lessons map to four lessons per difficulty", () => {
  assert.equal(categoryDifficultyForLesson(1), "초급");
  assert.equal(categoryDifficultyForLesson(4), "초급");
  assert.equal(categoryDifficultyForLesson(5), "중급");
  assert.equal(categoryDifficultyForLesson(8), "중급");
  assert.equal(categoryDifficultyForLesson(9), "고급");
  assert.equal(categoryDifficultyForLesson(12), "고급");
});

test("every category lesson contains ten distinct concepts and covers all 120 variants", () => {
  const categories = [...new Set(quizData.map((question) => question.category))];
  for (const category of categories) {
    const ids = new Set();
    for (let lesson = 1; lesson <= MAX_CATEGORY_LEVEL; lesson += 1) {
      const pool = categoryLessonPool(quizData, category, lesson);
      assert.equal(pool.length, 10, `${category} level ${lesson}`);
      assert.equal(new Set(pool.map((question) => question.base_id)).size, 10, `${category} level ${lesson}`);
      pool.forEach((question) => ids.add(question.id));
    }
    assert.equal(ids.size, 120, category);
  }
});

test("the category header uses its own level and the waiting speech bubble fits its copy", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(page, /Lv\. \{activeCategoryLevel\}/);
  assert.match(page, /Lv\. \{categoryLevel\}/);
  assert.match(page, /\{activeCategory\.name\} 레벨/);
  assert.match(page, /activeCategoryCompletedLessons < MAX_CATEGORY_LEVEL/);
  assert.doesNotMatch(page, /전체 레벨/);
  assert.doesNotMatch(page, /const category = CATEGORIES\[\(level - 1\) % CATEGORIES\.length\]/);
  assert.match(css, /\.quiz-mascot\.waiting \.speech \{[^}]*width:max-content;[^}]*justify-self:start;/s);
});
