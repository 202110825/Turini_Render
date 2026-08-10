export const QUESTIONS_PER_CATEGORY_LEVEL = 10;
export const MAX_CATEGORY_LEVEL = 12;

export function categoryLevelForSolved(solved: number) {
  const completed = Number.isFinite(solved) ? Math.max(0, Math.floor(solved)) : 0;
  return Math.min(MAX_CATEGORY_LEVEL, Math.floor(completed / QUESTIONS_PER_CATEGORY_LEVEL) + 1);
}

