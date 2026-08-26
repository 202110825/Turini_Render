"use client";

import { CSSProperties, FormEvent, useEffect, useMemo, useState } from "react";
import {
  conceptKey,
  planSessionQuestions,
  recordConceptReview,
  scheduleRetry,
  type ConceptReview,
  type PendingRetry,
} from "./quiz-scheduler";
import { isAnswerCorrect } from "./answer-utils";
import { financeLevelForRawScore } from "./diagnosis-utils";
import {
  categoryLessonPool,
  categoryLevelForSolved,
  completedCategoryLessonsForSolved,
  MAX_CATEGORY_LEVEL,
  QUESTIONS_PER_CATEGORY,
  QUESTIONS_PER_CATEGORY_LEVEL,
} from "./category-progress";
import {
  ASSETS,
  EMPTY_ALLOCATION,
  PORTFOLIO_RULE_VERSION,
  allocationTotal,
  analyzeAllocation,
  normalizeAllocation,
  targetFor,
  validateAllocation,
  type Allocation,
  type AssetKey,
  type PortfolioResult,
} from "./portfolio-rules";

type View = "home" | "learn" | "category" | "portfolio" | "profile";
type Difficulty = "초급" | "중급" | "고급";
type QuizMode = "daily" | "lesson" | "category" | "diagnosis";

type QuizQuestion = {
  id: string;
  base_id: string;
  category: string;
  difficulty: Difficulty;
  diagnostic_item?: string | null;
  diagnostic_linked?: boolean;
  type: string;
  question: string;
  choices: string[];
  answer: string;
  accepted_answers?: string[];
  answer_mode?: string;
  explanation: string;
  weakness_tag: string;
  parent_tag?: string;
  source_name: string;
  source_url: string;
  verification_status?: string;
  isProfile?: boolean;
  choiceScores?: number[];
  reviewKind?: "scheduled" | "retry";
};

type DiagnosticQuestionRow = {
  diagnostic_quiz_id: string;
  question_no: number;
  diagnostic_type: "LEVEL" | "STYLE";
  category: string | null;
  difficulty: Difficulty | null;
  question_type: "객관식" | "OX";
  question_text: string;
  choice_1: string | null;
  choice_2: string | null;
  choice_3: string | null;
  choice_4: string | null;
  answer: number | null;
  point: number | null;
  style_score_1: number | null;
  style_score_2: number | null;
  style_score_3: number | null;
  weakness_tag: string | null;
  explanation: string;
};

type Progress = {
  xp: number;
  streak: number;
  level: number;
  completedIds: string[];
  completedLessons: number[];
  correct: number;
  attempts: number;
  financeLevel: "진단 전" | Difficulty;
  tendency: "진단 전" | "안정형" | "중립형" | "공격형";
  weakTags: string[];
  studySessions: number;
  conceptReviews: Record<string, ConceptReview>;
  pendingRetries: PendingRetry[];
};

type QuizSession = {
  mode: QuizMode;
  title: string;
  questions: QuizQuestion[];
  index: number;
  correct: number;
  rawScore: number;
  profileScore: number;
  hearts: number;
  weakTags: string[];
  lesson?: number;
};

type AIFeedback = {
  summary_ko: string;
  strengths: string[];
  cautions: string[];
  improvements: string[];
  concept_refs: string[];
};

type Account = { username: string };
type AccountPayload = {
  account: Account;
  progress?: Partial<Progress>;
  portfolio?: {
    allocation?: unknown;
    amount?: number;
    goal?: string;
    horizon?: string;
    result?: PortfolioResult | null;
    ruleVersion?: string;
  };
};
type SaveState = "idle" | "saving" | "saved" | "error";

const CATEGORIES = [
  { name: "주식", icon: "↗", color: "green", copy: "기업과 주주의 관계부터 차근차근" },
  { name: "채권", icon: "▥", color: "purple", copy: "금리와 채권 가격의 원리 익히기" },
  { name: "펀드/ETF", icon: "◔", color: "orange", copy: "분산투자 상품을 똑똑하게 구분하기" },
  { name: "위험 관리", icon: "◇", color: "red", copy: "손실 위험과 안전장치 이해하기" },
  { name: "분산 투자", icon: "✣", color: "teal", copy: "한곳에 몰리지 않는 투자 연습" },
  { name: "수익률 계산", icon: "▦", color: "blue", copy: "수익률·복리·물가 계산 정복하기" },
] as const;

const CATEGORY_COLORS: Record<(typeof CATEGORIES)[number]["color"], string> = {
  green: "#38b54a",
  purple: "#8663e9",
  orange: "#ff9600",
  red: "#ff4b4b",
  teal: "#25b7b0",
  blue: "#2f8fe5",
};

const DEFAULT_PROGRESS: Progress = {
  xp: 0,
  streak: 0,
  level: 1,
  completedIds: [],
  completedLessons: [],
  correct: 0,
  attempts: 0,
  financeLevel: "진단 전",
  tendency: "진단 전",
  weakTags: [],
  studySessions: 0,
  conceptReviews: {},
  pendingRetries: [],
};

const DIAG_POINTS: Record<string, number> = {
  S1: 2, S2: 3, S3: 4, B1: 1, B2: 3, B3: 5,
  F1: 2, F2: 3, F3: 4, R1: 1, R2: 3, R3: 5,
  D1: 1, D2: 3, D3: 5, C1: 2, C2: 4, C3: 3,
};

const PROFILE_QUESTIONS: QuizQuestion[] = [
  {
    id: "PROFILE_P1", base_id: "PROFILE_P1", category: "투자 성향", difficulty: "초급", type: "성향 진단",
    question: "투자할 때 ‘원금 손실’에 대한 내 생각과 가장 가까운 것은?",
    choices: ["원금은 꼭 지키고 싶다", "어느 정도 손실은 감수할 수 있다", "높은 수익을 위해 큰 손실 위험도 감수할 수 있다"],
    answer: "", explanation: "정답이 없는 성향 문항이에요.", weakness_tag: "", source_name: "OECD QS1_2 기반", source_url: "https://www.oecd.org/financial/education/", isProfile: true, choiceScores: [1, 2, 3],
  },
  {
    id: "PROFILE_P2", base_id: "PROFILE_P2", category: "투자 성향", difficulty: "초급", type: "성향 진단",
    question: "내가 투자한 자산이 한 달 만에 20% 하락했다면 나는?",
    choices: ["곧바로 팔거나 안전한 자산으로 옮긴다", "하락 이유를 확인하고 계획을 다시 점검한다", "저가 매수 기회로 보고 추가 투자도 고려한다"],
    answer: "", explanation: "정답이 없는 성향 문항이에요.", weakness_tag: "", source_name: "OECD QF14 기반", source_url: "https://www.oecd.org/financial/education/", isProfile: true, choiceScores: [1, 2, 3],
  },
  {
    id: "PROFILE_P3", base_id: "PROFILE_P3", category: "투자 성향", difficulty: "초급", type: "성향 진단",
    question: "내가 바라는 투자 스타일에 가장 가까운 것은?",
    choices: ["안정적으로 천천히 불리고 싶다", "적당한 위험으로 시장 평균 수준을 추구한다", "변동성이 커도 장기적으로 높은 수익을 노린다"],
    answer: "", explanation: "정답이 없는 성향 문항이에요.", weakness_tag: "", source_name: "OECD QS1_6·QS1_8 기반", source_url: "https://www.oecd.org/financial/education/", isProfile: true, choiceScores: [1, 2, 3],
  },
];

function buildDiagnosticQuestions(rows: DiagnosticQuestionRow[], learningQuestions: QuizQuestion[]) {
  return [...rows]
    .sort((a, b) => a.question_no - b.question_no)
    .map<QuizQuestion>((row) => {
      const choices = [row.choice_1, row.choice_2, row.choice_3, row.choice_4].filter((choice): choice is string => Boolean(choice));
      const isProfile = row.diagnostic_type === "STYLE";
      const learningSource = learningQuestions.find((item) => item.diagnostic_item === row.diagnostic_quiz_id && item.type === "4지선다");
      const profileSource = PROFILE_QUESTIONS.find((item) => item.id === `PROFILE_${row.diagnostic_quiz_id}`);
      const source = learningSource || profileSource;
      return {
        id: `DIAG_${row.diagnostic_quiz_id}`,
        base_id: `DIAG_${row.diagnostic_quiz_id}`,
        category: row.category || "투자 성향",
        difficulty: row.difficulty || "초급",
        diagnostic_item: isProfile ? null : row.diagnostic_quiz_id,
        diagnostic_linked: !isProfile,
        type: isProfile ? "성향 진단" : row.question_type === "OX" ? "OX" : "4지선다",
        question: row.question_text,
        choices,
        answer: row.answer ? choices[row.answer - 1] || "" : "",
        explanation: row.explanation,
        weakness_tag: row.weakness_tag || "",
        parent_tag: row.weakness_tag || undefined,
        source_name: source?.source_name || "OECD 금융이해력 조사 기반",
        source_url: source?.source_url || "https://www.oecd.org/financial/education/",
        verification_status: "verified",
        isProfile,
        choiceScores: isProfile ? [row.style_score_1 || 1, row.style_score_2 || 2, row.style_score_3 || 3] : undefined,
      };
    });
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function sumAllocation(value: Allocation) {
  return Math.round(allocationTotal(value) * 1000) / 10;
}

function toPercent(value: number) {
  return Math.round(value * 1000) / 10;
}

function Mascot({ pose = "wave", size = "medium" }: { pose?: string; size?: "small" | "medium" | "large" }) {
  return <span className={`mascot mascot-${pose} mascot-${size}`} role="img" aria-label="투리니 기린 캐릭터" />;
}

function CharacterArt({ pose, className = "" }: { pose: "wave" | "reading" | "thinking"; className?: string }) {
  const labels = { wave: "손을 흔드는 투리니", reading: "책을 읽는 투리니", thinking: "전구를 떠올린 투리니" };
  return <span className={`character-art character-${pose} ${className}`} role="img" aria-label={labels[pose]} />;
}

export default function Home() {
  const [view, setView] = useState<View>("home");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [diagnosticQuestions, setDiagnosticQuestions] = useState<QuizQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<Progress>(DEFAULT_PROGRESS);
  const [session, setSession] = useState<QuizSession | null>(null);
  const [selected, setSelected] = useState("");
  const [typed, setTyped] = useState("");
  const [answered, setAnswered] = useState(false);
  const [answerCorrect, setAnswerCorrect] = useState(false);
  const [result, setResult] = useState<QuizSession | null>(null);
  const [allocation, setAllocation] = useState<Allocation>(EMPTY_ALLOCATION);
  const [amount, setAmount] = useState(10000000);
  const [goal, setGoal] = useState("장기 자산 증식");
  const [horizon, setHorizon] = useState("5년 이상");
  const [portfolioResult, setPortfolioResult] = useState<PortfolioResult | null>(null);
  const [aiFeedback, setAiFeedback] = useState<AIFeedback | null>(null);
  const [aiFeedbackLoading, setAiFeedbackLoading] = useState(false);
  const [aiFeedbackError, setAiFeedbackError] = useState("");
  const [portfolioTab, setPortfolioTab] = useState<"summary" | "rebalance" | "detail" | "coach">("summary");
  const [activeAssetHelp, setActiveAssetHelp] = useState<AssetKey | null>(null);
  const [activeCategoryName, setActiveCategoryName] = useState("");
  const [account, setAccount] = useState<Account | null>(null);
  const [accountError, setAccountError] = useState("");
  const [accountStateReady, setAccountStateReady] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetPin, setResetPin] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

  const hydrateAccount = (payload: AccountPayload) => {
    const savedProgress = payload.progress || {};
    const savedPortfolio = payload.portfolio || {};
    setAccount(payload.account);
    setProgress({
      ...DEFAULT_PROGRESS,
      ...savedProgress,
      completedIds: Array.isArray(savedProgress.completedIds) ? savedProgress.completedIds : [],
      completedLessons: Array.isArray(savedProgress.completedLessons) ? savedProgress.completedLessons : [],
      weakTags: Array.isArray(savedProgress.weakTags) ? savedProgress.weakTags : [],
      conceptReviews: savedProgress.conceptReviews || {},
      pendingRetries: savedProgress.pendingRetries || [],
    });
    setAllocation(normalizeAllocation(savedPortfolio.allocation));
    setAmount(typeof savedPortfolio.amount === "number" ? savedPortfolio.amount : 10000000);
    setGoal(savedPortfolio.goal || "장기 자산 증식");
    setHorizon(savedPortfolio.horizon || "5년 이상");
    setPortfolioResult(savedPortfolio.ruleVersion === PORTFOLIO_RULE_VERSION ? savedPortfolio.result || null : null);
    setAiFeedback(null);
    setAiFeedbackError("");
    setAccountStateReady(true);
    setSaveState("idle");
  };

  const resetClientState = () => {
    setProgress({ ...DEFAULT_PROGRESS, completedIds: [], completedLessons: [], weakTags: [], conceptReviews: {}, pendingRetries: [] });
    setAllocation({ ...EMPTY_ALLOCATION });
    setAmount(10000000);
    setGoal("장기 자산 증식");
    setHorizon("5년 이상");
    setPortfolioResult(null);
    setAiFeedback(null);
    setAiFeedbackError("");
    setResult(null);
    setSession(null);
    setView("home");
    setAccountStateReady(false);
    setSaveState("idle");
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [quizResponse, diagnosisResponse, accountResponse] = await Promise.all([
          fetch("/data/quizData_720_FINAL.json"),
          fetch("/data/diagnostic_quiz.json"),
          fetch("/api/account", { cache: "no-store" }),
        ]);
        const quizItems = await quizResponse.json() as QuizQuestion[];
        const diagnosticItems = await diagnosisResponse.json() as DiagnosticQuestionRow[];
        setQuestions(quizItems);
        setDiagnosticQuestions(buildDiagnosticQuestions(diagnosticItems, quizItems));
        localStorage.removeItem("turini-public-progress-v1");
        localStorage.removeItem("turini-public-portfolio-v1");
        if (accountResponse.ok) {
          hydrateAccount(await accountResponse.json() as AccountPayload);
        } else {
          setAccount(null);
          setAccountStateReady(false);
          if (accountResponse.status !== 401) {
            const body = await accountResponse.json().catch(() => ({}));
            setAccountError(body.error || "계정 서버에 연결하지 못했어요.");
          }
        }
      } catch {
        setQuestions([]);
        setDiagnosticQuestions([]);
        setAccountError("앱 데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  useEffect(() => {
    if (!account || !accountStateReady || loading) return;
    const timer = window.setTimeout(async () => {
      setSaveState("saving");
      try {
        const response = await fetch("/api/account", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            progress,
            portfolio: { allocation, amount, goal, horizon, result: portfolioResult, ruleVersion: PORTFOLIO_RULE_VERSION },
          }),
        });
        if (!response.ok) throw new Error("save failed");
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [account, accountStateReady, allocation, amount, goal, horizon, loading, portfolioResult, progress]);

  const authenticate = async (mode: "login" | "register", username: string, pin: string) => {
    try {
      setAccountError("");
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, pin }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return payload.error || "계정 정보를 확인해 주세요.";
      hydrateAccount(payload as AccountPayload);
      setView("home");
      return null;
    } catch {
      return "서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.";
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    setAccount(null);
    resetClientState();
  };

  const deleteAccount = async () => {
    if (!/^\d{4}$/.test(resetPin)) {
      setResetError("숫자 비밀번호 4자리를 입력해 주세요.");
      return;
    }
    setResetBusy(true);
    setResetError("");
    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: resetPin }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setResetError(payload.error || "계정을 초기화하지 못했어요.");
        return;
      }
      setAccount(null);
      resetClientState();
      setResetPin("");
      setResetConfirm(false);
    } catch {
      setResetError("서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setResetBusy(false);
    }
  };

  const completedSet = useMemo(() => new Set(progress.completedIds), [progress.completedIds]);
  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = {};
    questions.forEach((question) => {
      if (completedSet.has(question.id)) map[question.category] = (map[question.category] || 0) + 1;
    });
    return map;
  }, [questions, completedSet]);
  const defaultCategory = CATEGORIES[0];
  const activeCategory = CATEGORIES.find((category) => category.name === activeCategoryName) || defaultCategory;
  const activeCategorySolved = categoryCounts[activeCategory.name] || 0;
  const activeCategoryLevel = categoryLevelForSolved(activeCategorySolved);
  const activeCategoryCompletedLessons = completedCategoryLessonsForSolved(activeCategorySolved);

  const openSession = (mode: QuizMode, title: string, pool: QuizQuestion[], count = 10, lesson?: number) => {
    if (!pool.length) return;
    const seed = progress.studySessions * 997 + progress.attempts * 97 + (lesson || 0) + pool.length;
    setSession({
      mode,
      title,
      questions: planSessionQuestions(
        pool,
        count,
        seed,
        progress.conceptReviews,
        progress.studySessions,
        progress.pendingRetries,
      ),
      index: 0,
      correct: 0,
      rawScore: 0,
      profileScore: 0,
      hearts: 5,
      weakTags: [],
      lesson,
    });
    setResult(null);
    setSelected("");
    setTyped("");
    setAnswered(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const startDaily = () => openSession("daily", "오늘의 금융 퀴즈", questions, 10);

  const startCategory = (category: string, difficulty?: Difficulty) => {
    setActiveCategoryName(category);
    const pool = questions.filter((question) => question.category === category && (!difficulty || question.difficulty === difficulty));
    openSession("category", `${category} · ${difficulty || "전체"}`, pool, 10);
  };

  const startLesson = (category: string, lesson: number) => {
    setActiveCategoryName(category);
    const lessonPool = categoryLessonPool(questions, category, lesson);
    openSession("lesson", `${category} 레벨 ${lesson}`, lessonPool, QUESTIONS_PER_CATEGORY_LEVEL, lesson);
  };

  const startDiagnosis = () => {
    if (diagnosticQuestions.length !== 21) return;
    setSession({ mode: "diagnosis", title: "금융 수준·성향 진단", questions: diagnosticQuestions, index: 0, correct: 0, rawScore: 0, profileScore: 0, hearts: 5, weakTags: [] });
    setResult(null);
    setSelected("");
    setTyped("");
    setAnswered(false);
  };

  const submitAnswer = (event?: FormEvent) => {
    event?.preventDefault();
    if (!session || answered) return;
    const question = session.questions[session.index];
    const value = question.type.includes("직접입력") ? typed : selected;
    if (!value) return;
    const profileChoice = question.isProfile ? question.choices.indexOf(value) : -1;
    const correct = question.isProfile
      ? true
      : isAnswerCorrect(value, question.answer, question.accepted_answers);
    const point = correct && question.diagnostic_item ? DIAG_POINTS[question.diagnostic_item] || 0 : 0;
    const profilePoint = question.isProfile ? question.choiceScores?.[profileChoice] || 0 : 0;
    const retryPlan = !correct && session.mode !== "diagnosis"
      ? scheduleRetry(session, question, questions, progress.pendingRetries)
      : null;
    const deferredRetry = retryPlan?.deferred;
    setAnswerCorrect(correct);
    setAnswered(true);
    setSession((current) => {
      if (!current) return current;
      const updated = {
        ...current,
        correct: current.correct + (correct && !question.isProfile ? 1 : 0),
        rawScore: current.rawScore + point,
        profileScore: current.profileScore + profilePoint,
        hearts: correct ? current.hearts : Math.max(0, current.hearts - 1),
        weakTags: !correct && question.weakness_tag ? [...new Set([...current.weakTags, question.weakness_tag])] : current.weakTags,
      };
      return retryPlan ? { ...updated, questions: retryPlan.session.questions } : updated;
    });
    if (!question.isProfile && session.mode !== "diagnosis") {
      setProgress((current) => {
        const reviewed = recordConceptReview(current, question, correct);
        if (!deferredRetry || reviewed.pendingRetries.some((item) => item.key === deferredRetry.key)) return reviewed;
        return { ...reviewed, pendingRetries: [...reviewed.pendingRetries, deferredRetry] };
      });
    }
  };

  const finishSession = (finished: QuizSession) => {
    const knowledgeQuestions = finished.questions.filter((question) => !question.isProfile);
    const ids = knowledgeQuestions.map((question) => question.id);
    const xpGain = finished.mode === "diagnosis" ? finished.correct * 5 : finished.correct * 10;
    let financeLevel = progress.financeLevel;
    let tendency = progress.tendency;
    if (finished.mode === "diagnosis") {
      financeLevel = financeLevelForRawScore(finished.rawScore);
      tendency = finished.profileScore <= 4 ? "안정형" : finished.profileScore <= 7 ? "중립형" : "공격형";
    }
    setProgress((current) => ({
      ...current,
      xp: current.xp + xpGain,
      level: Math.max(current.level, Math.floor((current.xp + xpGain) / 100) + 1),
      completedIds: [...new Set([...current.completedIds, ...ids])],
      completedLessons: finished.lesson ? [...new Set([...current.completedLessons, finished.lesson])] : current.completedLessons,
      correct: current.correct + finished.correct,
      attempts: current.attempts + knowledgeQuestions.length,
      studySessions: current.studySessions + (finished.mode === "diagnosis" ? 0 : 1),
      financeLevel,
      tendency,
      weakTags: [...new Set([...current.weakTags, ...finished.weakTags])].slice(-10),
    }));
    setResult(finished);
    setSession(null);
    setAnswered(false);
  };

  const nextQuestion = () => {
    if (!session) return;
    if (session.index >= session.questions.length - 1) {
      finishSession(session);
      return;
    }
    setSession({ ...session, index: session.index + 1 });
    setSelected("");
    setTyped("");
    setAnswered(false);
    setAnswerCorrect(false);
  };

  const applyPreset = (type: "안정형" | "중립형" | "공격형") => {
    const target = targetFor(type);
    setAllocation(target);
    setPortfolioResult(null);
    setAiFeedback(null);
    setAiFeedbackError("");
  };

  const requestAiFeedback = async (analysis: PortfolioResult) => {
    setAiFeedbackLoading(true);
    setAiFeedbackError("");
    try {
      const response = await fetch("/api/portfolio-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          computed: analysis,
          context: {
            allocation,
            assetLabels: Object.fromEntries(ASSETS.map((asset) => [asset.key, asset.label])),
            portfolioRuleVersion: PORTFOLIO_RULE_VERSION,
            tendency: progress.tendency === "진단 전" ? "중립형" : progress.tendency,
            horizon,
            weakTags: progress.weakTags,
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "GPT 코칭을 불러오지 못했어요.");
      setAiFeedback(payload.feedback as AIFeedback);
    } catch (error) {
      setAiFeedback(null);
      setAiFeedbackError(error instanceof Error ? error.message : "GPT 코칭을 불러오지 못했어요.");
    } finally {
      setAiFeedbackLoading(false);
    }
  };

  const runPortfolioAnalysis = () => {
    if (!validateAllocation(allocation)) return;
    const analysis = analyzeAllocation(allocation, progress.tendency, horizon);
    setPortfolioResult(analysis);
    setAiFeedback(null);
    void requestAiFeedback(analysis);
    setPortfolioTab("summary");
    window.setTimeout(() => document.getElementById("portfolio-result")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const chartStyle = useMemo(() => {
    const chart = ASSETS.reduce<{ cursor: number; stops: string[] }>((state, asset) => {
      const end = state.cursor + toPercent(allocation[asset.key]);
      return { cursor: end, stops: [...state.stops, `${asset.color} ${state.cursor}% ${end}%`] };
    }, { cursor: 0, stops: [] });
    return { background: `conic-gradient(${chart.stops.join(",")})` } as CSSProperties;
  }, [allocation]);

  const navigate = (target: View) => {
    setView(target);
    setResult(null);
    setSession(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (loading) {
    return <main className="loading-screen"><Mascot pose="study" size="large" /><h1>투리니가 문제를 준비하고 있어요!</h1><div className="loading-track"><span /></div></main>;
  }

  if (!account) {
    return <AuthScreen onAuthenticate={authenticate} serverError={accountError} />;
  }

  if (progress.financeLevel === "진단 전" && !session && !result) {
    return (
      <main className="onboarding-stage">
        <section className="onboarding-card">
          <span className="onboarding-pill">처음 오셨군요!</span>
          <CharacterArt pose="wave" className="onboarding-mascot" />
          <p className="eyebrow">WELCOME TO TURINI</p>
          <h1>나에게 맞는 금융 학습을<br />진단부터 시작해요</h1>
          <p className="onboarding-copy">금융 수준 18문항과 투자 성향 3문항을 풀면<br />맞춤 학습 경로와 포트폴리오 기준을 알려드려요.</p>
          <div className="onboarding-info">
            <span><b>21</b><small>전체 문항</small></span>
            <span><b>약 5분</b><small>예상 시간</small></span>
            <span><b>무료</b><small>바로 시작</small></span>
          </div>
          <button className="primary-button" onClick={startDiagnosis} disabled={diagnosticQuestions.length !== 21}>진단 테스트 시작하기 <span>→</span></button>
          <small className="onboarding-note">진단은 처음 한 번만 진행하며 결과와 학습 기록은 계정에 안전하게 저장돼요.</small>
        </section>
      </main>
    );
  }

  if (session) {
    const question = session.questions[session.index];
    const isText = question.type.includes("직접입력");
    const questionGuide = question.isProfile
      ? { label: "성향 진단", copy: "나와 가장 가까운 답을 고르세요" }
      : question.type === "OX"
        ? { label: "O/X", copy: "맞으면 O · 틀리면 X" }
        : question.type === "4지선다"
          ? { label: "4지선다", copy: "문제에 맞는 답을 고르세요" }
          : question.type === "빈칸선택"
            ? { label: "빈칸 선택", copy: "빈칸에 들어갈 답을 고르세요" }
            : { label: "직접 입력", copy: "정답을 직접 입력하세요" };
    const displayQuestion = question.question
      .replace(/^다음 설명이 맞으면 O, 틀리면 X를 선택하세요\.\s*/u, "")
      .replace(/^다음 질문의 빈칸에 들어갈 알맞은 답을 고르세요\.\s*/u, "")
      .replace(/\s*선택:\s*_+\s*$/u, "")
      .trim();
    const chosen = isText ? typed : selected;
    const progressWidth = ((session.index + (answered ? 1 : 0)) / session.questions.length) * 100;
    return (
      <main className="quiz-stage">
        <section className="quiz-phone" data-question-id={question.id} data-concept-id={conceptKey(question)} data-review-kind={question.reviewKind || "new"}>
          <header className="quiz-header">
            <button className="icon-button" onClick={() => setSession(null)} aria-label="퀴즈 닫기">×</button>
            <div className="progress-track" aria-label={`문제 진행률 ${session.index + 1}/${session.questions.length}`}><span style={{ width: `${progressWidth}%` }} /></div>
            <strong className="heart-count">♥ {session.hearts}</strong>
          </header>
          <div className="quiz-meta"><span>{question.category}</span><span>{question.difficulty}</span>{question.reviewKind ? <span>{question.reviewKind === "retry" ? "오답 복습" : "복습"}</span> : null}</div>
          <div className="quiz-count"><strong>{session.index + 1}</strong> / {session.questions.length}<span>+10 XP</span></div>
          <p className="question-guide"><b>{questionGuide.label}</b><span>{questionGuide.copy}</span></p>
          <h1 className="quiz-question">{displayQuestion}</h1>
          {isText ? (
            <form className="answer-form" onSubmit={submitAnswer}>
              <label htmlFor="short-answer">정답 입력</label>
              <input id="short-answer" value={typed} onChange={(event) => setTyped(event.target.value)} placeholder="금융 용어를 입력하세요" disabled={answered} autoFocus />
            </form>
          ) : (
            <div className={`answer-grid ${question.choices.length === 2 ? "ox-grid" : ""}`}>
              {question.choices.map((choice, index) => {
                const selectedChoice = selected === choice;
                const correctChoice = answered && isAnswerCorrect(choice, question.answer);
                const wrongChoice = answered && selectedChoice && !correctChoice && !question.isProfile;
                return (
                  <button key={`${choice}-${index}`} className={`answer-choice ${selectedChoice ? "selected" : ""} ${correctChoice && !question.isProfile ? "correct" : ""} ${wrongChoice ? "wrong" : ""}`} onClick={() => !answered && setSelected(choice)} disabled={answered}>
                    <span>{index + 1}</span><strong>{choice}</strong>{correctChoice && !question.isProfile ? <b>✓</b> : null}
                  </button>
                );
              })}
            </div>
          )}
          <div className={`quiz-mascot ${answered ? "answered" : "waiting"}`}>{answered ? <Mascot pose={answerCorrect ? "correct" : "wrong"} size="medium" /> : <CharacterArt pose="thinking" />}<div className="speech">{answered ? (question.isProfile ? "선택 완료! 나에게 맞는 답이에요." : answerCorrect ? "정답이에요! 잘했어요!" : "괜찮아요. 해설로 익혀봐요!") : "천천히 생각해도 괜찮아요!"}</div></div>
          {answered ? (
            <aside className={`feedback-card ${answerCorrect ? "success" : "error"}`}>
              <h2>{question.isProfile ? "성향 선택 완료" : answerCorrect ? "정답이에요!" : `정답: ${question.answer}`}</h2>
              <p>{question.explanation}</p>
              {!question.isProfile && <a href={question.source_url} target="_blank" rel="noreferrer">✓ 공식 검증 출처 · {question.source_name}</a>}
            </aside>
          ) : null}
          <button className="primary-button quiz-submit" disabled={!chosen} onClick={answered ? nextQuestion : () => submitAnswer()}>{answered ? (session.index === session.questions.length - 1 ? "결과 보기" : "다음 문제") : "정답 확인"}</button>
        </section>
      </main>
    );
  }

  if (result) {
    const total = result.questions.filter((question) => !question.isProfile).length;
    const percent = Math.round((result.correct / Math.max(1, total)) * 100);
    return (
      <main className="result-stage">
        <section className="result-card-page">
          <div className="confetti">◆　●　✦　◆　●</div>
          <Mascot pose="celebrate" size="large" />
          <p className="eyebrow">{result.mode === "diagnosis" ? "진단 완료" : "레슨 완료"}</p>
          <h1>{result.mode === "diagnosis" ? `${progress.financeLevel} · ${progress.tendency}` : percent >= 80 ? "완벽해요, 레벨 업!" : "오늘도 한 걸음 성장!"}</h1>
          <p>{result.mode === "diagnosis" ? `수준 점수 ${result.rawScore}/54점 · 성향 점수 ${result.profileScore}/9점` : `${total}문제 중 ${result.correct}문제를 맞혔어요.`}</p>
          <div className="result-stats"><div><span>정답률</span><strong>{percent}%</strong></div><div><span>획득 XP</span><strong>+{result.mode === "diagnosis" ? result.correct * 5 : result.correct * 10}</strong></div><div><span>연속 학습</span><strong>{progress.streak}일</strong></div></div>
          {result.weakTags.length ? <div className="weak-box"><span>다음 추천 학습</span><div>{result.weakTags.slice(0, 3).map((tag) => <button key={tag} onClick={() => { setResult(null); navigate("category"); }}>{tag}</button>)}</div></div> : null}
          <button className="primary-button" onClick={() => { setResult(null); navigate("home"); }}>홈으로</button>
          <button className="secondary-button" onClick={() => { setResult(null); startDaily(); }}>10문제 더 풀기</button>
        </section>
      </main>
    );
  }

  return (
    <main className="app-bg">
      <div className="app-shell">
        <section className="app-main">
          <header className="top-status"><button className="learning-context" onClick={() => navigate("category")} aria-label={`현재 학습 ${activeCategory.name}, 레벨 ${activeCategoryLevel}`}><span className="top-category-icon" style={{ background: CATEGORY_COLORS[activeCategory.color] }}>{activeCategory.icon}</span><span className="top-learning-copy"><small>{activeCategory.name}</small><b>Lv. {activeCategoryLevel}</b></span></button><div><span>🔥 <b>{progress.streak}</b></span><span>💎 <b>{progress.xp}</b></span><span>♥ <b>5</b></span></div></header>

          {view === "home" && (
            <div className="screen home-screen">
              <section className="welcome-row">
                <div><p className="eyebrow">좋은 하루예요</p><h1>안녕하세요, {account.username}님 👋</h1><p>오늘도 투리니와 금융 지식을 키워볼까요?</p></div>
                <button className="round-notice" aria-label="알림">♧<span /></button>
              </section>
              <section className="hero-card">
                <div className="hero-copy"><span className="pill">오늘의 추천</span><h2>하루 10문제로<br /><em>금융 레벨 업!</em></h2><p>완료하면 최대 100 XP와 연속 학습 기록을 받아요.</p><button className="primary-button" onClick={startDaily} disabled={!questions.length}>지금 시작하기 <span>→</span></button></div>
                <div className="hero-mascot"><CharacterArt pose="wave" /><span className="spark spark-one">✦</span><span className="spark spark-two">◆</span></div>
              </section>
              <section className="summary-grid">
                <article className="level-card"><div className="section-title"><div><span>나의 금융 레벨</span><h2>{progress.financeLevel === "진단 전" ? `Lv. ${progress.level}` : progress.financeLevel}</h2></div><div className="level-ring">{progress.level}</div></div><div className="progress-track"><span style={{ width: `${Math.min(100, (progress.xp % 1000) / 10)}%` }} /></div><small>{progress.xp} / {Math.ceil((progress.xp + 1) / 1000) * 1000} XP</small></article>
                <article className="tendency-card"><span>투자 성향</span><h2>{progress.tendency}</h2><p>{progress.tendency === "안정형" ? "원금 보전을 중요하게 생각해요." : progress.tendency === "공격형" ? "성장을 위해 변동성을 감수해요." : "안정성과 수익의 균형을 추구해요."}</p><small className="diagnosis-complete">✓ 최초 진단 완료</small></article>
              </section>
              <section className="mission-card"><div><span className="mission-icon">🎁</span><div><p className="eyebrow">이번 주 학습 미션</p><h3>퀴즈 5회 완료하기</h3></div></div><strong>{Math.min(5, progress.studySessions)} / 5</strong><div className="progress-track"><span style={{ width: `${Math.min(100, progress.studySessions * 20)}%` }} /></div></section>
              <section className="content-section"><div className="section-heading"><div><p className="eyebrow">빠른 학습</p><h2>어떤 주제부터 시작할까요?</h2></div><button onClick={() => navigate("category")}>전체 보기 →</button></div><div className="quick-categories">{CATEGORIES.slice(0, 3).map((category) => <button key={category.name} className={`quick-card ${category.color}`} onClick={() => startCategory(category.name)}><span>{category.icon}</span><div><strong>{category.name}</strong><small>{category.copy}</small></div><b>→</b></button>)}</div></section>
            </div>
          )}

          {view === "learn" && (
            <div className="screen learn-screen">
              <PageTitle eyebrow="LEARNING PATH" title="금융 지식, 한 단계씩" copy="각 레벨은 10문항이에요. 초급부터 고급까지 차근차근 올라가요." />
              <section className="learning-banner"><div><span>{activeCategory.name} 레벨</span><h2>Lv. {activeCategoryLevel}</h2><div className="progress-track"><span style={{ width: `${Math.min(100, activeCategorySolved / QUESTIONS_PER_CATEGORY * 100)}%` }} /></div><small>{activeCategoryCompletedLessons} / {MAX_CATEGORY_LEVEL} 레슨 완료</small></div><CharacterArt pose="reading" /></section>
              <div className="learning-path">{Array.from({ length: MAX_CATEGORY_LEVEL }, (_, index) => index + 1).map((level, index) => {
                const completed = level <= activeCategoryCompletedLessons;
                const current = activeCategoryCompletedLessons < MAX_CATEGORY_LEVEL && level === activeCategoryCompletedLessons + 1;
                const locked = level > activeCategoryCompletedLessons + 1;
                return <div className={`path-row ${index % 2 ? "right" : "left"}`} key={level}><button className={`path-node ${completed ? "completed" : ""} ${current ? "current" : ""} ${locked ? "locked" : ""}`} onClick={() => !locked && startLesson(activeCategory.name, level)} disabled={locked}><span>{completed ? "✓" : locked ? "🔒" : level}</span></button>{current ? <div className="current-lesson"><b>{activeCategory.name}</b><small>현재 레벨 · 10문항</small><button onClick={() => startLesson(activeCategory.name, level)}>시작</button></div> : null}</div>;
              })}</div>
            </div>
          )}

          {view === "category" && (
            <div className="screen category-screen">
              <PageTitle eyebrow="TOPIC PRACTICE" title="카테고리 골라 배우기" copy="검증한 금융 문제를 난이도별로 골라서 학습해요." />
              <div className="category-list">{CATEGORIES.map((category) => {
                const solved = categoryCounts[category.name] || 0;
                const categoryLevel = categoryLevelForSolved(solved);
                return <article className={`category-card ${category.color}`} key={category.name}><button className="category-main" onClick={() => startCategory(category.name)}><span className="category-icon">{category.icon}</span><div><div className="category-title-row"><h2>{category.name}</h2><span>Lv. {categoryLevel}</span></div><p>{category.copy}</p><div className="progress-track"><span style={{ width: `${solved / 120 * 100}%` }} /></div><small>{solved} / 120문항 완료</small></div><b>›</b></button><div className="difficulty-row">{(["초급", "중급", "고급"] as Difficulty[]).map((difficulty) => <button key={difficulty} onClick={() => startCategory(category.name, difficulty)}>{difficulty}</button>)}</div></article>;
              })}</div>
            </div>
          )}

          {view === "portfolio" && (
            <div className="screen portfolio-screen">
              <PageTitle eyebrow="MY PORTFOLIO" title="내 포트폴리오 설계" copy="여섯 자산의 현재 비중을 입력하면 성향 적합도와 리밸런싱 금액을 바로 계산해요." />
              <section className="portfolio-intro"><div><span className="pill">핵심 기능</span><h2>비중을 입력하고<br />투리니의 코칭 받기</h2><p>개별 종목 추천이 아닌 자산배분 학습용 분석이에요.</p></div><div className="portfolio-mascot-frame"><CharacterArt pose="wave" /></div></section>
              <section className="portfolio-builder card-block">
                <div className="builder-header"><div><p className="eyebrow">STEP 1</p><h2>현재 자산 비중</h2></div><div className={`sum-badge ${validateAllocation(allocation) ? "valid" : ""}`}><span>합계</span><strong>{sumAllocation(allocation)}%</strong></div></div>
                <div className="preset-row"><span>성향 프리셋</span>{(["안정형", "중립형", "공격형"] as const).map((type) => <button key={type} className={progress.tendency === type ? "active" : ""} onClick={() => applyPreset(type)}>{type}</button>)}</div>
                <div className="allocation-layout">
                  <div className="donut-wrap"><div className="allocation-donut" style={chartStyle}><span><b>{sumAllocation(allocation)}</b><small>%</small></span></div><p>현재 자산 구성</p></div>
                  <div className="asset-inputs">
                    {ASSETS.map((asset) => <div className="asset-item" key={asset.key}>
                      <div className="asset-row">
                        <span className="asset-dot" style={{ background: asset.color }}>{asset.icon}</span>
                        <span className="asset-name"><strong>{asset.label}</strong><button type="button" className="asset-info-button" aria-label={`${asset.label} 입력 기준 보기`} aria-expanded={activeAssetHelp === asset.key} aria-controls={`asset-help-${asset.key}`} onClick={() => setActiveAssetHelp(activeAssetHelp === asset.key ? null : asset.key)}>ⓘ</button></span>
                        <input aria-label={`${asset.label} 비중 슬라이더`} type="range" min="0" max="100" step="1" value={toPercent(allocation[asset.key])} onChange={(event) => { setAllocation({ ...allocation, [asset.key]: Number(event.target.value) / 100 }); setPortfolioResult(null); }} style={{ "--range-color": asset.color } as CSSProperties} />
                        <span className="percent-input"><input aria-label={`${asset.label} 비중`} type="number" min="0" max="100" step="0.1" value={toPercent(allocation[asset.key])} onChange={(event) => { setAllocation({ ...allocation, [asset.key]: clamp(Number(event.target.value)) / 100 }); setPortfolioResult(null); }} />%</span>
                      </div>
                      {activeAssetHelp === asset.key && <div className="asset-help" id={`asset-help-${asset.key}`} role="note"><p>{asset.help}</p>{asset.key === "equityFund" && <small>혼합형 펀드는 공시된 주식·채권 비중에 따라 두 자산군으로 나누어 입력하고, 구성비를 확인할 수 없으면 임의로 분류하지 마세요.</small>}</div>}
                    </div>)}
                  </div>
                </div>
              </section>
              <section className="portfolio-options card-block"><div><label>투자 목적 <small>(기록용)</small><select value={goal} onChange={(event) => setGoal(event.target.value)}><option>장기 자산 증식</option><option>주택·목돈 마련</option><option>은퇴 준비</option><option>단기 여유자금 운용</option></select><em>현재 점수·조정 계산에는 반영되지 않아요.</em></label><label>투자 기간<select value={horizon} onChange={(event) => { setHorizon(event.target.value); setPortfolioResult(null); }}><option>1년 미만</option><option>1~3년</option><option>3~5년</option><option>5년 이상</option></select></label><label>총 투자금액<div className="money-input"><input type="number" min="0" step="100000" value={amount} onChange={(event) => setAmount(Math.max(0, Number(event.target.value) || 0))} /><span>원</span></div></label></div><button className="primary-button" disabled={!validateAllocation(allocation)} onClick={runPortfolioAnalysis}>{validateAllocation(allocation) ? "포트폴리오 분석하기" : `합계를 100%로 맞춰주세요 (${sumAllocation(allocation)}%)`}</button></section>
              {portfolioResult && <PortfolioResults result={portfolioResult} allocation={allocation} amount={amount} tab={portfolioTab} setTab={setPortfolioTab} aiFeedback={aiFeedback} aiFeedbackLoading={aiFeedbackLoading} aiFeedbackError={aiFeedbackError} retryAiFeedback={() => void requestAiFeedback(portfolioResult)} />}
            </div>
          )}

          {view === "profile" && (
            <div className="screen profile-screen">
              <section className="profile-hero"><div className="profile-mascot-frame"><Mascot pose="reading" size="large" /></div><div><p className="eyebrow">MY PROFILE</p><h1>{account.username}</h1><span>나만의 금융 학습 기록</span></div></section>
              <section className="card-block account-card">
                <div><p className="eyebrow">ACCOUNT</p><h2>{account.username}</h2><small className={`save-state ${saveState}`}>{saveState === "saving" ? "기록 저장 중…" : saveState === "error" ? "저장 실패 · 인터넷 연결을 확인해 주세요" : "학습 기록이 계정에 저장돼요"}</small></div>
                <div className="account-actions"><button onClick={logout}>로그아웃</button><button className="danger-link" onClick={() => { setResetConfirm(true); setResetError(""); }}>계정 초기화</button></div>
                {resetConfirm ? <div className="reset-panel"><h3>아이디와 모든 기록을 삭제할까요?</h3><p>삭제하면 진단 결과, 학습 기록, 포트폴리오가 모두 사라지고 되돌릴 수 없어요.</p><label>비밀번호 4자리<input type="password" inputMode="numeric" maxLength={4} value={resetPin} onChange={(event) => setResetPin(event.target.value.replace(/\D/g, "").slice(0, 4))} autoComplete="current-password" /></label>{resetError ? <p className="form-error">{resetError}</p> : null}<div><button onClick={() => { setResetConfirm(false); setResetPin(""); setResetError(""); }}>취소</button><button className="danger-button" onClick={deleteAccount} disabled={resetBusy}>{resetBusy ? "삭제 중…" : "아이디와 기록 모두 삭제"}</button></div></div> : null}
              </section>
              <section className="profile-stats"><article><span>🔥</span><strong>{progress.streak}일</strong><small>연속 학습</small></article><article><span>💎</span><strong>{progress.xp}</strong><small>총 XP</small></article><article><span>🏆</span><strong>Lv. {progress.level}</strong><small>현재 레벨</small></article><article><span>✓</span><strong>{progress.completedIds.length}</strong><small>푼 문제</small></article></section>
              <section className="card-block growth-card"><div className="section-heading"><div><p className="eyebrow">학습 현황</p><h2>나의 성장 기록</h2></div><span className="diagnosis-complete">✓ 최초 진단 완료</span></div><div className="growth-summary"><article><span>금융 수준</span><strong>{progress.financeLevel}</strong><small>진단 결과에 맞춰 학습 중</small></article><article><span>투자 성향</span><strong>{progress.tendency}</strong><small>나에게 맞는 자산배분 기준</small></article></div></section>
              <section className="card-block"><p className="eyebrow">획득 배지</p><h2>투리니 배지 컬렉션</h2><div className="badge-grid">{[{icon:"🌱",name:"첫걸음"},{icon:"🔥",name:"연속 학습"},{icon:"💎",name:"XP 수집가"},{icon:"🎯",name:"정답 명중"},{icon:"🛡️",name:"분산 투자"},{icon:"🏆",name:"금융 성장"}].map((badge,index)=><div className={index > Math.floor(progress.completedIds.length / 20) ? "locked" : ""} key={badge.name}><span>{badge.icon}</span><b>{badge.name}</b></div>)}</div></section>
            </div>
          )}
        </section>

        <nav className="mobile-nav">{(["home", "learn", "category", "portfolio", "profile"] as View[]).map((item) => <NavButton key={item} item={item} active={view === item} onClick={() => navigate(item)} />)}</nav>
      </div>
    </main>
  );
}

function AuthScreen({
  onAuthenticate,
  serverError,
}: {
  onAuthenticate: (mode: "login" | "register", username: string, pin: string) => Promise<string | null>;
  serverError: string;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [availability, setAvailability] = useState<"idle" | "available" | "taken">("idle");
  const [submitting, setSubmitting] = useState(false);

  const changeMode = (next: "login" | "register") => {
    setMode(next);
    setError("");
    setAvailability("idle");
    setPin("");
  };

  const checkUsername = async () => {
    if (!username.trim()) {
      setError("아이디를 입력해 주세요.");
      return;
    }
    setChecking(true);
    setError("");
    setAvailability("idle");
    try {
      const response = await fetch(`/api/auth/check?username=${encodeURIComponent(username.trim())}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error || "중복 확인을 하지 못했어요.");
      } else {
        setAvailability(payload.available ? "available" : "taken");
      }
    } catch {
      setError("서버에 연결하지 못했어요.");
    } finally {
      setChecking(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const nextError = await onAuthenticate(mode, username, pin);
    if (nextError) {
      setError(nextError);
      if (mode === "register" && nextError.includes("이미 사용")) setAvailability("taken");
    }
    setSubmitting(false);
  };

  return (
    <main className="auth-stage">
      <section className="auth-card">
        <div className="auth-brand"><CharacterArt pose="wave" /><div><p className="eyebrow">WELCOME TO TURINI</p><h1>나만의 금융 학습을<br />이어서 시작해요</h1><p>아이디별로 진단 결과와 학습 기록을 안전하게 보관해요.</p></div></div>
        <div className="auth-tabs" role="tablist" aria-label="계정 방식">
          <button role="tab" aria-selected={mode === "login"} className={mode === "login" ? "active" : ""} onClick={() => changeMode("login")}>로그인</button>
          <button role="tab" aria-selected={mode === "register"} className={mode === "register" ? "active" : ""} onClick={() => changeMode("register")}>새 아이디 만들기</button>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <div className="auth-intro"><h2>{mode === "login" ? "다시 만나서 반가워요!" : "처음 사용할 아이디를 만들어요"}</h2><p>{mode === "login" ? "기존 아이디와 비밀번호를 입력하면 저장된 기록을 불러와요." : "중복되지 않은 아이디와 숫자 비밀번호 4자리를 정해 주세요."}</p></div>
          <label>
            아이디
            <div className="username-row"><input value={username} onChange={(event) => { setUsername(event.target.value); setAvailability("idle"); }} minLength={3} maxLength={20} autoComplete="username" placeholder="한글·영문·숫자 3~20자" />{mode === "register" ? <button type="button" onClick={checkUsername} disabled={checking}>{checking ? "확인 중" : "중복 확인"}</button> : null}</div>
          </label>
          {mode === "register" && availability !== "idle" ? <p className={`availability ${availability}`}>{availability === "available" ? "✓ 사용할 수 있는 아이디예요." : "이미 사용 중인 아이디예요. 다른 아이디를 입력해 주세요."}</p> : null}
          <label>
            비밀번호 4자리
            <input type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="숫자 4자리" />
          </label>
          {serverError || error ? <p className="form-error">{error || serverError}</p> : null}
          <button className="primary-button auth-submit" disabled={submitting || username.trim().length < 3 || pin.length !== 4}>{submitting ? "확인 중…" : mode === "login" ? "로그인하기" : "아이디 만들고 시작하기"}<span>→</span></button>
          <small className="auth-note">비밀번호 원문은 저장하지 않아요. 4자리를 잊으면 기록을 복구할 수 없으니 기억해 주세요.</small>
        </form>
      </section>
    </main>
  );
}

function PageTitle({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return <header className="page-title"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{copy}</p></header>;
}

function NavButton({ item, active, onClick }: { item: View; active: boolean; onClick: () => void }) {
  const meta: Record<View, { icon: string; label: string }> = {
    home: { icon: "🏡", label: "홈" }, learn: { icon: "📚", label: "학습" }, category: { icon: "🧩", label: "카테고리" }, portfolio: { icon: "📊", label: "포트폴리오" }, profile: { icon: "👤", label: "마이" },
  };
  return <button className={active ? "active" : ""} onClick={onClick}><span>{meta[item].icon}</span><b>{meta[item].label}</b></button>;
}

function PortfolioResults({ result, allocation, amount, tab, setTab, aiFeedback, aiFeedbackLoading, aiFeedbackError, retryAiFeedback }: { result: PortfolioResult; allocation: Allocation; amount: number; tab: "summary" | "rebalance" | "detail" | "coach"; setTab: (tab: "summary" | "rebalance" | "detail" | "coach") => void; aiFeedback: AIFeedback | null; aiFeedbackLoading: boolean; aiFeedbackError: string; retryAiFeedback: () => void }) {
  const targetChart = ASSETS.reduce<{ cursor: number; stops: string[] }>((state, asset) => {
    const end = state.cursor + toPercent(result.target[asset.key]);
    return { cursor: end, stops: [...state.stops, `${asset.color} ${state.cursor}% ${end}%`] };
  }, { cursor: 0, stops: [] });
  const targetChartStyle = { background: `conic-gradient(${targetChart.stops.join(", ")})` } as CSSProperties;
  const starCount = Math.max(1, Math.min(5, Math.round(result.score / result.scoreMax * 5)));
  const gaugePosition = Math.max(0, Math.min(100, (result.riskScore - 5) / 60 * 100));
  return <section id="portfolio-result" className="portfolio-result card-block">
    <div className="result-hero"><div><p>내부 종합점수 · {result.scoreMax}점 만점</p><strong>{result.score}<small>점</small></strong><span>{result.scoreLabel}</span><div className="stars">{"★".repeat(starCount)}{"☆".repeat(5 - starCount)}</div></div><CharacterArt pose="wave" className="result-mascot-art" /></div>
    <div className="score-cards"><article><span>위험 점수</span><strong>{result.riskScore}점</strong><small>{result.portfolioType} 포트폴리오</small><div className="mini-gauge"><i style={{ left: `${gaugePosition}%` }} /></div></article><article><span>성향 일치도</span><strong>{result.fit}%</strong><small>{result.profileMatch.level} · {result.suitability}</small><div className="ring-score" style={{ "--score": `${result.fit * 3.6}deg` } as CSSProperties} /></article></div>
    <div className="portfolio-tabs"><button className={tab === "summary" ? "active" : ""} onClick={() => setTab("summary")}>요약</button><button className={tab === "rebalance" ? "active" : ""} onClick={() => setTab("rebalance")}>리밸런싱</button><button className={tab === "detail" ? "active" : ""} onClick={() => setTab("detail")}>상세 분석</button><button className={tab === "coach" ? "active" : ""} onClick={() => setTab("coach")}>AI 코치</button></div>
    {tab === "summary" && <div className="tab-panel"><div className="coach-banner"><CharacterArt pose="reading" className="coach-mascot-art" /><div><b>투리니 코치의 한마디!</b><p>{result.coach}</p></div></div><div className="analysis-columns"><article className="good"><h3>강점</h3>{result.strengths.length ? <ul>{result.strengths.map((item) => <li key={item}>{item}</li>)}</ul> : <p>현재 강점 기준을 충족한 항목이 없어요.</p>}</article><article className="care"><h3>개선하면 좋은 점</h3>{result.cautions.length ? <ul>{result.cautions.map((item) => <li key={item}>{item}</li>)}</ul> : <p>현재 규칙에서 별도로 주의할 점이 없어요.</p>}</article></div></div>}
    {tab === "rebalance" && <div className="tab-panel"><div className="target-chart"><div className="allocation-donut small" style={targetChartStyle}><span>예시</span></div><div><h3>학습용 조정 예시</h3><p>현재 비중과 성향별 목표의 50% 지점 · 총 {amount.toLocaleString("ko-KR")}원 기준</p></div></div>{result.rebalancingActions.length ? <div className="rebalance-table"><div className="table-head"><span>자산</span><span>현재</span><span>예시</span><span>조정 규모</span></div>{result.rebalancingActions.map((item) => { const asset = ASSETS.find((candidate) => candidate.key === item.asset)!; const money = Math.round(amount * Math.abs(item.delta) / 100); return <div key={asset.key}><strong><i style={{ background: asset.color }} />{asset.label}</strong><span>{toPercent(allocation[asset.key])}%</span><span>{toPercent(result.target[asset.key])}%</span><b className={item.delta > 0 ? "buy" : "sell"}>{item.delta > 0 ? "+" : "-"}{money.toLocaleString("ko-KR")}원</b></div>; })}</div> : <p className="fine-print">5%p 이상 차이가 나는 자산군이 없어요.</p>}{result.residualItems.length ? <div className="residual-list"><b>표에 표시되지 않은 작은 차이</b>{result.residualItems.map((item) => { const asset = ASSETS.find((candidate) => candidate.key === item.asset)!; return <span key={item.asset}>{asset.label} {item.delta > 0 ? "+" : ""}{item.delta}%p</span>; })}</div> : null}<p className="fine-print">수수료·세금·개별 상품 특성은 반영하지 않은 자산배분 학습용 계산이에요.</p></div>}
    {tab === "detail" && <div className="tab-panel detail-grid"><article><span>분산도</span><strong>{result.diversification}</strong><p>자산군 사이의 분산만 평가하며 종목·업종 내부 집중은 평가하지 않음</p></article><article><span>집중 페널티</span><strong>{result.concentrationPenalty ? `-${result.concentrationPenalty}` : "0"}</strong><p>주식·주식형 ETF·펀드·금이 50%를 넘은 만큼 직접 차감</p></article><article><span>성향 일치도</span><strong>{result.fit}</strong><p>위험점수와 진단 성향 중심의 거리</p></article><article><span>기간 적합도</span><strong>{result.horizonFit}</strong><p>위험점수와 투자기간 중심의 거리</p></article></div>}
    {tab === "coach" && <div className="tab-panel ai-coach-panel"><CharacterArt pose="reading" className="ai-coach-art" /><div><p className="eyebrow">TURINI GPT COACH</p>{aiFeedbackLoading ? <><h3>GPT가 분석 결과를 읽고 있어요…</h3><p>잠시만 기다려 주세요.</p></> : aiFeedback ? <><h3>{aiFeedback.summary_ko}</h3>{aiFeedback.strengths.length > 0 && <section className="ai-feedback-section"><b>강점</b><ul>{aiFeedback.strengths.map((item) => <li key={item}>{item}</li>)}</ul></section>}{aiFeedback.cautions.length > 0 && <section className="ai-feedback-section"><b>주의할 점</b><ul>{aiFeedback.cautions.map((item) => <li key={item}>{item}</li>)}</ul></section>}{aiFeedback.improvements.length > 0 && <section className="ai-feedback-section"><b>개선 방향</b><ul>{aiFeedback.improvements.map((item) => <li key={item}>{item}</li>)}</ul></section>}{aiFeedback.concept_refs.length > 0 && <p className="ai-concepts">함께 공부할 개념 · {aiFeedback.concept_refs.join(" · ")}</p>}</> : <><h3>{result.coach}</h3><p>{aiFeedbackError || "규칙 분석 결과를 표시하고 있어요."}</p>{aiFeedbackError && <button className="primary-button" onClick={retryAiFeedback}>GPT 코칭 다시 받기</button>}</>}<button className="primary-button" onClick={() => setTab("rebalance")}>조정 예시 보기</button></div></div>}
    <p className="result-disclaimer">본 결과는 금융 학습을 위한 자산배분 예시이며 특정 금융상품의 추천이나 매수·매도 권유가 아니에요. 세금·수수료·계좌 유형·상품별 위험·종목 내부 집중위험은 반영하지 않았어요.</p>
  </section>;
}
