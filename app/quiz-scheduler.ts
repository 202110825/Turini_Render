export type ReviewKind = "scheduled" | "retry";

export type SchedulableQuestion = {
  id: string;
  base_id: string;
  type: string;
  category?: string;
  difficulty?: string;
  choices?: string[];
  answer?: string;
  reviewKind?: ReviewKind;
};

export type ConceptReview = {
  seen: number;
  correctStreak: number;
  nextDueSession: number;
  lastType: string;
};

export type SchedulerProgress = {
  studySessions: number;
  conceptReviews: Record<string, ConceptReview>;
  pendingRetries: PendingRetry[];
};

export type PendingRetry = {
  key: string;
  sourceId: string;
  category?: string;
  difficulty?: string;
  lastType: string;
  dueIndex: number;
};

export const CONCEPT_ALIASES: Record<string, string> = {
  RET_A_008: "BND_I_001",
};

export const REVIEW_INTERVALS = [1, 3, 7, 14, 30];
const QUESTION_TYPE_ORDER = ["4지선다", "OX", "빈칸선택", "빈칸직접입력"];

export function seededShuffle<T>(items: T[], seed: number) {
  const result = [...items];
  let value = seed || 1;
  const random = () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function conceptKey(question: SchedulableQuestion) {
  const base = question.base_id || question.id;
  return CONCEPT_ALIASES[base] || base;
}

function stringSeed(value: string) {
  return [...value].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 1000003, 7);
}

function chooseVariant<T extends SchedulableQuestion>(variants: T[], seed: number, lastType?: string, firstExposure = false) {
  if (firstExposure) {
    const introductory = variants.filter((question) => question.type === "4지선다");
    if (introductory.length) return seededShuffle(introductory, seed)[0];
  }
  const alternativeTypes = QUESTION_TYPE_ORDER.filter((type) => type !== lastType);
  const start = alternativeTypes.length ? Math.abs(seed) % alternativeTypes.length : 0;
  const orderedTypes = alternativeTypes.map((_, index) => alternativeTypes[(start + index) % alternativeTypes.length]);
  for (const type of orderedTypes) {
    if (type === lastType) continue;
    const candidates = variants.filter((question) => question.type === type);
    if (candidates.length) return seededShuffle(candidates, seed + stringSeed(type))[0];
  }
  return seededShuffle(variants, seed)[0];
}

function prepareChoices<T extends SchedulableQuestion>(question: T, seed: number) {
  if (!question.choices || question.choices.length <= 2) return question;
  return { ...question, choices: seededShuffle(question.choices, seed + 101) } as T;
}

export function planLearningQuestions<T extends SchedulableQuestion>(
  pool: T[],
  count: number,
  seed: number,
  reviews: Record<string, ConceptReview>,
  studySessions: number,
) {
  const groups = new Map<string, T[]>();
  seededShuffle(pool, seed).forEach((question) => {
    const key = conceptKey(question);
    groups.set(key, [...(groups.get(key) || []), question]);
  });
  const entries = [...groups.entries()];
  const newConcepts = seededShuffle(entries.filter(([key]) => !reviews[key]), seed + 11);
  const dueReviews = entries
    .filter(([key]) => reviews[key] && reviews[key].nextDueSession <= studySessions)
    .sort(([a], [b]) => reviews[a].correctStreak - reviews[b].correctStreak || reviews[a].nextDueSession - reviews[b].nextDueSession);
  const futureReviews = seededShuffle(entries.filter(([key]) => reviews[key] && reviews[key].nextDueSession > studySessions), seed + 23);
  const reviewTarget = newConcepts.length ? Math.min(dueReviews.length, dueReviews.length >= 3 ? 3 : 2, count) : count;
  const selected: [string, T[]][] = [];
  selected.push(...newConcepts.slice(0, Math.max(0, count - reviewTarget)));
  selected.push(...dueReviews.slice(0, reviewTarget));
  const selectedKeys = new Set(selected.map(([key]) => key));
  const fill = [...newConcepts, ...dueReviews, ...futureReviews].filter(([key]) => !selectedKeys.has(key));
  selected.push(...fill.slice(0, count - selected.length));

  return seededShuffle(selected, seed + 37).slice(0, count).map(([key, variants], index) => {
    const review = reviews[key];
    const question = chooseVariant(variants, seed + index * 13, review?.lastType, !review);
    const prepared = prepareChoices(question, seed + index * 29);
    return review ? ({ ...prepared, reviewKind: "scheduled" } as T) : prepared;
  });
}

export function recordConceptReview<T extends SchedulerProgress>(
  progress: T,
  question: SchedulableQuestion,
  correct: boolean,
) {
  const key = conceptKey(question);
  const previous = progress.conceptReviews[key] || { seen: 0, correctStreak: 0, nextDueSession: 0, lastType: "" };
  const correctStreak = correct ? previous.correctStreak + 1 : 0;
  const interval = correct ? REVIEW_INTERVALS[Math.min(correctStreak - 1, REVIEW_INTERVALS.length - 1)] : 0;
  return {
    ...progress,
    pendingRetries: question.reviewKind === "retry"
      ? progress.pendingRetries.filter((item) => item.key !== key)
      : progress.pendingRetries,
    conceptReviews: {
      ...progress.conceptReviews,
      [key]: {
        seen: previous.seen + 1,
        correctStreak,
        nextDueSession: progress.studySessions + interval,
        lastType: question.type,
      },
    },
  } as T;
}

function retryVariants<T extends SchedulableQuestion>(question: T, allQuestions: T[]) {
  const sameConcept = allQuestions.filter((item) => conceptKey(item) === conceptKey(question));
  const sameCategory = question.category
    ? sameConcept.filter((item) => item.category === question.category)
    : sameConcept;
  const sameDifficulty = question.difficulty
    ? sameCategory.filter((item) => item.difficulty === question.difficulty)
    : sameCategory;
  const scoped = sameDifficulty.length ? sameDifficulty : sameCategory;
  return scoped.filter((item) => item.id !== question.id && item.type !== question.type);
}

export function scheduleRetry<T extends SchedulableQuestion, S extends { questions: T[]; index: number }>(
  session: S,
  question: T,
  allQuestions: T[],
  pendingRetries: PendingRetry[] = [],
) {
  const key = conceptKey(question);
  if (session.questions.slice(session.index + 1).some((item) => conceptKey(item) === key)) return { session, deferred: null };
  if (question.reviewKind !== "retry" && pendingRetries.some((item) => item.key === key)) return { session, deferred: null };
  const offset = 3 + (stringSeed(question.id) % 3);
  const distances = [...new Set([offset, 3, 4, 5])];
  const occupiedDeferred = new Set(pendingRetries.map((item) => item.dueIndex));
  const placement = distances.map((distance) => {
    const targetIndex = session.index + distance;
    return targetIndex < session.questions.length
      ? { targetIndex, dueIndex: null }
      : { targetIndex: null, dueIndex: targetIndex - session.questions.length };
  }).find((candidate) => candidate.targetIndex !== null
    ? session.questions[candidate.targetIndex].reviewKind !== "retry"
    : !occupiedDeferred.has(candidate.dueIndex!));
  if (!placement) return { session, deferred: null };
  const variants = retryVariants(question, allQuestions);
  if (!variants.length) return { session, deferred: null };
  if (placement.targetIndex === null) {
    return {
      session,
      deferred: {
        key,
        sourceId: question.id,
        category: question.category,
        difficulty: question.difficulty,
        lastType: question.type,
        dueIndex: placement.dueIndex!,
      } satisfies PendingRetry,
    };
  }
  const targetIndex = placement.targetIndex;
  const retry = chooseVariant(variants, stringSeed(question.id) + targetIndex, question.type);
  const nextQuestions = [...session.questions];
  nextQuestions[targetIndex] = { ...prepareChoices(retry, stringSeed(question.id) + targetIndex), reviewKind: "retry" } as T;
  return { session: { ...session, questions: nextQuestions } as S, deferred: null };
}

export function insertRetry<T extends SchedulableQuestion, S extends { questions: T[]; index: number }>(
  session: S,
  question: T,
  allQuestions: T[],
) {
  return scheduleRetry(session, question, allQuestions).session;
}

export function planSessionQuestions<T extends SchedulableQuestion>(
  pool: T[],
  count: number,
  seed: number,
  reviews: Record<string, ConceptReview>,
  studySessions: number,
  pendingRetries: PendingRetry[],
) {
  const activePending = pendingRetries.filter((pending) => pool.some((question) =>
    conceptKey(question) === pending.key
    && (!pending.category || question.category === pending.category)
    && (!pending.difficulty || question.difficulty === pending.difficulty)
    && question.type !== pending.lastType,
  )).slice(0, count);
  const pendingKeys = new Set(activePending.map((item) => item.key));
  const normalQuestions = planLearningQuestions(
    pool.filter((question) => !pendingKeys.has(conceptKey(question))),
    Math.max(0, count - activePending.length),
    seed,
    reviews,
    studySessions,
  );
  const slots: Array<T | undefined> = Array.from({ length: count });
  const occupied = new Set<number>();

  activePending.forEach((pending, pendingIndex) => {
    const candidates = pool.filter((question) =>
      conceptKey(question) === pending.key
      && (!pending.category || question.category === pending.category)
      && (!pending.difficulty || question.difficulty === pending.difficulty)
      && question.type !== pending.lastType,
    );
    if (!candidates.length) return;
    const preferred = Math.min(count - 1, Math.max(0, pending.dueIndex));
    const target = [preferred, preferred + 1, preferred - 1, preferred + 2, preferred - 2]
      .find((index) => index >= 0 && index < count && !occupied.has(index));
    if (target === undefined) return;
    const retry = chooseVariant(candidates, seed + pendingIndex * 43, pending.lastType);
    slots[target] = { ...prepareChoices(retry, seed + target * 17), reviewKind: "retry" } as T;
    occupied.add(target);
  });

  let normalIndex = 0;
  for (let index = 0; index < slots.length; index += 1) {
    if (!slots[index]) slots[index] = normalQuestions[normalIndex++];
  }
  return slots.filter((question): question is T => Boolean(question));
}
