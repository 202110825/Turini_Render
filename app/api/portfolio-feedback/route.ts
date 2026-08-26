import { NextResponse } from "next/server";

import {
  ASSETS,
  PORTFOLIO_RULE_VERSION,
  analyzeAllocation,
  validateAllocation,
  type Allocation,
  type PortfolioTendency,
} from "@/app/portfolio-rules";
import { getCurrentUser } from "@/app/server/auth";

export const runtime = "nodejs";

const CONCEPT_TAGS = [
  "주식의 개념", "주주의 권리·배당", "자산군별 장기 수익", "채권의 개념", "채권 위험·신용위험",
  "금리와 채권 가격", "펀드의 개념", "ETF의 개념", "인덱스 ETF 분산효과", "위험-수익 관계",
  "원금 손실 위험", "MDD(최대낙폭)", "분산투자 기본 원리", "분산투자 사례 판단", "리밸런싱 전략",
  "투자 수익률 계산", "복리 개념", "실질수익률·물가상승률", "투자 사기 판별", "레버리지·부채 위험",
] as const;

const FEEDBACK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary_ko: { type: "string" },
    strengths: { type: "array", items: { type: "string" }, maxItems: 3 },
    cautions: { type: "array", items: { type: "string" }, maxItems: 8 },
    improvements: { type: "array", items: { type: "string" }, maxItems: 6 },
    concept_refs: { type: "array", items: { type: "string", enum: CONCEPT_TAGS }, minItems: 1, maxItems: 3 },
  },
  required: ["summary_ko", "strengths", "cautions", "improvements", "concept_refs"],
} as const;

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_REQUESTS = 10;
const globalRate = globalThis as typeof globalThis & {
  turiniPortfolioRate?: Map<string, { start: number; count: number }>;
};
const rateStore = globalRate.turiniPortfolioRate ??= new Map();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function withinRateLimit(userId: string) {
  const now = Date.now();
  const current = rateStore.get(userId);
  if (!current || now - current.start >= RATE_LIMIT_WINDOW_MS) {
    rateStore.set(userId, { start: now, count: 1 });
    return true;
  }
  if (current.count >= RATE_LIMIT_REQUESTS) return false;
  current.count += 1;
  return true;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function safeSummary(value: unknown, allowedNumbers: number[], fallback: string) {
  if (typeof value !== "string" || value.length < 10 || value.length > 350) return fallback;
  if (/사세요|파세요|매수하세요|매도하세요|추천합니다|수익\s*보장|원금\s*보장|예상\s*수익률|목표\s*수익률/.test(value)) return fallback;
  if (/\d[\d,]*\s*(원|만원|억)/.test(value)) return fallback;
  const numbers = [...value.matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
  if (numbers.some((number) => !allowedNumbers.some((allowed) => Math.abs(allowed - number) < 0.051))) return fallback;
  return value;
}

export async function POST(request: Request) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  if (!withinRateLimit(user.id)) {
    return NextResponse.json({ error: "GPT 코칭 요청이 너무 많아요. 1분 뒤 다시 시도해 주세요." }, { status: 429 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "서버에 OpenAI API 키가 아직 등록되지 않았어요." }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  if (!isRecord(body) || !isRecord(body.context)) {
    return NextResponse.json({ error: "포트폴리오 분석 데이터가 올바르지 않아요." }, { status: 400 });
  }
  const context = body.context;
  const tendency = context.tendency;
  const horizon = context.horizon;
  if (!validateAllocation(context.allocation) || !["안정형", "중립형", "공격형"].includes(String(tendency)) || typeof horizon !== "string") {
    return NextResponse.json({ error: "포트폴리오 입력값을 다시 확인해 주세요." }, { status: 400 });
  }

  let computed;
  try {
    // 브라우저가 보낸 computed는 신뢰하지 않고 원시 입력으로 서버에서 다시 계산한다.
    computed = analyzeAllocation(context.allocation as Allocation, tendency as PortfolioTendency, horizon);
  } catch {
    return NextResponse.json({ error: "포트폴리오 입력값을 다시 확인해 주세요." }, { status: 400 });
  }

  const assetLabels = Object.fromEntries(ASSETS.map((asset) => [asset.key, asset.label]));
  const deterministicImprovements = computed.rebalancingActions.map((action) => {
    const label = assetLabels[action.asset];
    return `${label} 비중을 ${Math.abs(action.delta)}%p ${action.action === "확대" ? "늘리는" : "줄이는"} 방향을 살펴보세요.`;
  });
  const weakTags = stringArray(context.weakTags).filter((tag) => CONCEPT_TAGS.includes(tag as typeof CONCEPT_TAGS[number]));
  const fallbackSummary = `종합점수는 ${computed.score}점(${computed.scoreLabel})이고 위험점수는 ${computed.riskScore}점이에요.`;
  const allowedNumbers = [
    computed.score, computed.scoreMax, computed.riskScore, computed.fit, computed.horizonFit,
    computed.diversification, computed.concentrationPenalty, computed.profileMatch.gap, ASSETS.length,
    ...Object.values(context.allocation as Allocation),
    ...Object.values(computed.target),
    ...computed.rebalancingActions.map((action) => Math.abs(action.delta)),
  ];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  try {
    const openAIResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini-2025-04-14",
        temperature: 0.1,
        max_output_tokens: 900,
        store: false,
        instructions: [
          "당신은 Turini 금융 학습 앱의 포트폴리오 설명 코치입니다.",
          "서버가 계산한 computed와 context만 근거로 쉽고 친절한 한국어를 사용하세요.",
          "strengths와 cautions는 computed의 같은 배열을 문장 변경 없이 그대로 반환하세요.",
          "improvements는 context.allowedImprovements를 순서와 문장 변경 없이 그대로 반환하세요.",
          "입력에 없는 숫자, 금액, 자산, 종목, 상품, 회사, 티커, 수익률을 만들지 마세요.",
          "금광기업 주식형 ETF는 금이 아니라 주식형 ETF·펀드로 해석하세요.",
          "특정 종목·상품 추천, 직접적인 매수·매도 지시, 미래 수익률 예측, 원금·수익 보장을 하지 마세요.",
          "강점 근거가 없으면 strengths는 빈 배열로 반환하세요.",
        ].join("\n"),
        input: `다음 JSON만 근거로 피드백을 작성하세요.\n${JSON.stringify({
          computed,
          context: {
            assetLabels,
            portfolioRuleVersion: PORTFOLIO_RULE_VERSION,
            tendency,
            horizon,
            allocation: context.allocation,
            weakTags,
            allowedImprovements: deterministicImprovements,
          },
        })}`,
        text: { format: { type: "json_schema", name: "turini_portfolio_feedback", strict: true, schema: FEEDBACK_SCHEMA } },
      }),
    });

    const responseBody = await openAIResponse.json().catch(() => null);
    if (!openAIResponse.ok) {
      console.error("OpenAI portfolio feedback failed", openAIResponse.status, responseBody?.error?.code || "unknown");
      return NextResponse.json({ error: "GPT 코칭을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." }, { status: 502 });
    }

    const outputText = responseBody?.output
      ?.flatMap((item: { content?: { type?: string; text?: string }[] }) => item.content || [])
      .find((item: { type?: string; text?: string }) => item.type === "output_text")?.text;
    if (typeof outputText !== "string") {
      return NextResponse.json({ error: "GPT 응답을 읽지 못했어요. 잠시 후 다시 시도해 주세요." }, { status: 502 });
    }

    const parsed = JSON.parse(outputText) as Record<string, unknown>;
    const returnedRefs = stringArray(parsed.concept_refs).filter((tag) => CONCEPT_TAGS.includes(tag as typeof CONCEPT_TAGS[number]));
    const conceptRefs = (weakTags.length ? weakTags : returnedRefs).slice(0, 3);
    return NextResponse.json({
      feedback: {
        summary_ko: safeSummary(parsed.summary_ko, allowedNumbers, fallbackSummary),
        // 핵심 판정 문장은 LLM 출력 대신 서버 계산값을 사용해 모순과 환각을 차단한다.
        strengths: computed.strengths,
        cautions: computed.cautions,
        improvements: deterministicImprovements,
        concept_refs: conceptRefs.length ? conceptRefs : ["분산투자 기본 원리"],
      },
    });
  } catch (error) {
    console.error("Portfolio feedback route error", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "GPT 코칭 연결이 지연되고 있어요. 잠시 후 다시 시도해 주세요." }, { status: 504 });
  } finally {
    clearTimeout(timeout);
  }
}
