export const QUESTIONS_PER_CATEGORY_LEVEL = 10;
export const MAX_CATEGORY_LEVEL = 12;
export const QUESTIONS_PER_CATEGORY = QUESTIONS_PER_CATEGORY_LEVEL * MAX_CATEGORY_LEVEL;

export function categoryLevelForSolved(solved: number) {
  const completed = Number.isFinite(solved) ? Math.max(0, Math.floor(solved)) : 0;
  return Math.min(MAX_CATEGORY_LEVEL, Math.floor(completed / QUESTIONS_PER_CATEGORY_LEVEL) + 1);
}

export function completedCategoryLessonsForSolved(solved: number) {
  const completed = Number.isFinite(solved) ? Math.max(0, Math.floor(solved)) : 0;
  return Math.min(MAX_CATEGORY_LEVEL, Math.floor(completed / QUESTIONS_PER_CATEGORY_LEVEL));
}

export function categoryDifficultyForLesson(lesson: number) {
  const safeLesson = Math.min(MAX_CATEGORY_LEVEL, Math.max(1, Math.floor(lesson)));
  if (safeLesson <= 4) return "초급" as const;
  if (safeLesson <= 8) return "중급" as const;
  return "고급" as const;
}

export function categoryLessonPool<
  T extends { id: string; base_id: string; category: string; difficulty: string },
>(questions: T[], category: string, lesson: number) {
  const difficulty = categoryDifficultyForLesson(lesson);
  const safeLesson = Math.min(MAX_CATEGORY_LEVEL, Math.max(1, Math.floor(lesson)));
  const variantIndex = (safeLesson - 1) % 4;
  const byConcept = new Map<string, T[]>();

  questions
    .filter((question) => question.category === category && question.difficulty === difficulty)
    .forEach((question) => {
      const variants = byConcept.get(question.base_id) || [];
      variants.push(question);
      byConcept.set(question.base_id, variants);
    });

  return [...byConcept.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, variants]) => variants.sort((left, right) => left.id.localeCompare(right.id))[variantIndex])
    .filter((question): question is T => Boolean(question));
}
