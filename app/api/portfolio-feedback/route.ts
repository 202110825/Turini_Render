import { NextResponse } from "next/server";

export const runtime = "nodejs";

const FEEDBACK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary_ko: { type: "string" },
    strengths: { type: "array", items: { type: "string" }, maxItems: 3 },
    cautions: { type: "array", items: { type: "string" }, maxItems: 3 },
    improvements: { type: "array", items: { type: "string" }, maxItems: 3 },
    concept_refs: {
      type: "array",
      items: {
        type: "string",
        enum: ["위험과 수익", "분산투자", "집중위험", "리밸런싱", "자산배분", "투자기간", "유동성"],
      },
      maxItems: 3,
    },
  },
  required: ["summary_ko", "strengths", "cautions", "improvements", "concept_refs"],
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasValidComputed(value: unknown) {
  if (!isRecord(value)) return false;
  return ["score", "riskScore", "fit", "horizonFit", "diversification", "concentrationPenalty"]
    .every((key) => typeof value[key] === "number" && Number.isFinite(value[key]));
}

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "서버에 OpenAI API 키가 아직 등록되지 않았어요." }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  if (!isRecord(body) || !hasValidComputed(body.computed) || !isRecord(body.context)) {
    return NextResponse.json({ error: "포트폴리오 분석 데이터가 올바르지 않아요." }, { status: 400 });
  }

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
          "computed와 context에 명시된 규칙 계산 결과만 쉽고 친절한 한국어로 설명하세요.",
          "context.assetLabels를 사용해 자산명을 표시하세요. equityFund는 주식형 ETF·펀드이며, 채권 ETF·채권형 펀드는 bond에 포함된 것으로 해석하세요.",
          "입력에 없는 숫자, 자산, 종목, 상품, 회사, 티커, 수익률을 만들지 마세요.",
          "computed.signals 밖의 새로운 주의사항을 만들지 말고, rebalancingActions의 확대·축소 방향을 바꾸지 마세요.",
          "특정 종목·상품 추천, 직접적인 매수·매도 지시, 미래 수익률 예측, 원금·수익 보장을 하지 마세요.",
          "개선 방향은 자산군 비중 조정에 대한 교육적 설명으로만 작성하세요.",
          "빈 근거가 있는 항목은 빈 배열로 반환하세요.",
        ].join("\n"),
        input: `다음 JSON만 근거로 포트폴리오 피드백을 작성하세요.\n${JSON.stringify({ computed: body.computed, context: body.context })}`,
        text: {
          format: {
            type: "json_schema",
            name: "turini_portfolio_feedback",
            strict: true,
            schema: FEEDBACK_SCHEMA,
          },
        },
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

    return NextResponse.json({ feedback: JSON.parse(outputText) });
  } catch (error) {
    console.error("Portfolio feedback route error", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "GPT 코칭 연결이 지연되고 있어요. 잠시 후 다시 시도해 주세요." }, { status: 504 });
  } finally {
    clearTimeout(timeout);
  }
}
