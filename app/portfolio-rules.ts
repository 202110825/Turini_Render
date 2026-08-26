export type AssetKey = "domestic" | "overseas" | "bond" | "equityFund" | "cash" | "gold";
export type Allocation = Record<AssetKey, number>;
export type PortfolioType = "안정형" | "중립형" | "공격형";
export type PortfolioTendency = PortfolioType | "진단 전";
export type ScoreLabel = "Excellent" | "Good" | "Fair" | "Poor";
export type MatchLevel = "우수" | "보통" | "불일치";
export type TraitLevel = "낮음" | "보통" | "높음";
export type SignalKind = "structural" | "caution";

export type AssetDefinition = {
  key: AssetKey;
  label: string;
  short: string;
  color: string;
  icon: string;
  risk: number;
  help: string;
};

export type PortfolioSignal = {
  id: number;
  kind: SignalKind;
  text: string;
};

export type PortfolioResult = {
  score: number;
  scoreMax: number;
  scoreLabel: ScoreLabel;
  riskScore: number;
  fit: number;
  horizonFit: number;
  diversification: number;
  concentrationPenalty: number;
  components: { A: number; B: number; C: number; D: number };
  portfolioType: PortfolioType;
  profileMatch: { level: MatchLevel; gap: number };
  suitability: "적합" | "다소 공격적" | "매우 공격적" | "다소 안정적" | "매우 안정적";
  characteristics: { growth: TraitLevel; defense: TraitLevel; liquidity: TraitLevel; concentration: TraitLevel };
  target: Allocation;
  rebalancingActions: { asset: AssetKey; delta: number; action: "확대" | "축소" }[];
  residualItems: { asset: AssetKey; delta: number }[];
  signals: PortfolioSignal[];
  strengths: string[];
  cautions: string[];
  coach: string;
};

export const PORTFOLIO_RULE_VERSION = "3.0.0-portfolio-v9.1";
export const SCORE_MAX = 85;

export const ASSETS: AssetDefinition[] = [
  {
    key: "domestic",
    label: "국내주식",
    short: "국내",
    color: "#58cc02",
    icon: "KR",
    risk: 60,
    help: "국내 거래소에 상장된 개별기업 주식의 합계입니다. 국내 주식형 ETF·펀드는 ‘주식형 ETF·펀드’에 입력해 주세요.",
  },
  {
    key: "overseas",
    label: "해외주식",
    short: "해외",
    color: "#1cb0f6",
    icon: "GL",
    risk: 65,
    help: "해외 거래소에 상장된 개별기업 주식의 합계입니다. 환율·국가 위험을 함께 반영하며, 해외 주식형 ETF·펀드는 별도 항목에 입력해 주세요.",
  },
  {
    key: "bond",
    label: "채권",
    short: "채권",
    color: "#9069e7",
    icon: "B",
    risk: 25,
    help: "직접채권과 일반 채권 ETF·채권형 펀드를 합산합니다. 장기채·하이일드·환노출 해외채권은 실제 위험도가 대표값보다 높을 수 있습니다.",
  },
  {
    key: "equityFund",
    label: "주식형 ETF·펀드",
    short: "주식형",
    color: "#ff9600",
    icon: "F",
    risk: 50,
    help: "주식에 주로 투자하는 ETF·펀드입니다. 국내·해외 지수형, 액티브형, 섹터·테마형과 금광기업 주식형 상품을 포함합니다. 섹터·테마형은 집중위험이 더 클 수 있으며 레버리지·인버스 상품은 제외합니다.",
  },
  {
    key: "cash",
    label: "현금성자산",
    short: "현금",
    color: "#2bb6a8",
    icon: "₩",
    risk: 5,
    help: "현금, 입출금·단기 예금, CMA·MMF처럼 비교적 빠르게 사용할 수 있는 자산입니다. 상품별로 원금보장·예금자보호 여부가 다르며 손실 가능성이 있는 상품도 있습니다.",
  },
  {
    key: "gold",
    label: "금",
    short: "금",
    color: "#ffc800",
    icon: "Au",
    risk: 40,
    help: "실물 금, 금 통장과 금 현물·선물 가격을 추종하는 일반 상품을 합산합니다. 금광기업 주식형과 레버리지·인버스 상품은 포함하지 않습니다.",
  },
];

const ASSET_KEYS = ASSETS.map((asset) => asset.key);
const RISK_BY_ASSET = Object.fromEntries(ASSETS.map((asset) => [asset.key, asset.risk])) as Record<AssetKey, number>;
const NON_EXEMPT_CONCENTRATION: AssetKey[] = ["domestic", "overseas", "equityFund", "gold"];

// 내부 계산은 반올림 전 중심값을 사용하고 화면에서만 소수 첫째 자리로 표시한다.
export const RISK_CENTERS: Record<PortfolioType, number> = { 안정형: 30.5, 중립형: 41, 공격형: 52.75 };
export const PORTFOLIO_TYPE_BANDS = { stableMax: 35.75, neutralMax: 46.875 } as const;
export const HORIZON_CENTERS: Record<string, number> = { "1년 미만": 20, "1~3년": 40, "3~5년": 55, "5년 이상": 65 };
export const EMPTY_ALLOCATION: Allocation = { domestic: 20, overseas: 15, bond: 30, equityFund: 15, cash: 10, gold: 10 };

export function targetFor(tendency: PortfolioTendency): Allocation {
  const profile = tendency === "진단 전" ? "중립형" : tendency;
  if (profile === "안정형") return { domestic: 5, overseas: 10, bond: 55, equityFund: 5, cash: 15, gold: 10 };
  if (profile === "공격형") return { domestic: 20, overseas: 40, bond: 10, equityFund: 20, cash: 5, gold: 5 };
  return { domestic: 10, overseas: 20, bond: 30, equityFund: 20, cash: 10, gold: 10 };
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && !Number.isNaN(value);
}

export function normalizeAllocation(value: unknown): Allocation {
  const saved = value && typeof value === "object" ? value as Partial<Allocation> & { fund?: number } : {};
  const numberOr = (candidate: unknown, fallback: number) => finiteNumber(candidate)
    ? Math.min(100, Math.max(0, candidate as number))
    : fallback;
  return {
    domestic: numberOr(saved.domestic, EMPTY_ALLOCATION.domestic),
    overseas: numberOr(saved.overseas, EMPTY_ALLOCATION.overseas),
    bond: numberOr(saved.bond, EMPTY_ALLOCATION.bond),
    equityFund: numberOr(saved.equityFund ?? saved.fund, EMPTY_ALLOCATION.equityFund),
    cash: numberOr(saved.cash, EMPTY_ALLOCATION.cash),
    gold: numberOr(saved.gold, EMPTY_ALLOCATION.gold),
  };
}

export function allocationTotal(allocation: Allocation) {
  return ASSET_KEYS.reduce((sum, key) => sum + allocation[key], 0);
}

export function validateAllocation(allocation: unknown): allocation is Allocation {
  if (!allocation || typeof allocation !== "object" || Array.isArray(allocation)) return false;
  const row = allocation as Record<string, unknown>;
  if (Object.keys(row).some((key) => !ASSET_KEYS.includes(key as AssetKey))) return false;
  if (!ASSET_KEYS.every((key) => finiteNumber(row[key]) && (row[key] as number) >= 0 && (row[key] as number) <= 100)) return false;
  return Math.abs(ASSET_KEYS.reduce((sum, key) => sum + (row[key] as number), 0) - 100) < 1e-9;
}

function round1(value: number) {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function rawRiskScore(allocation: Allocation) {
  return ASSET_KEYS.reduce((sum, key) => sum + allocation[key] * RISK_BY_ASSET[key], 0) / 100;
}

export function riskScoreFor(allocation: Allocation) {
  if (!validateAllocation(allocation)) throw new Error("자산 비중은 유한한 숫자이며 합계가 정확히 100%여야 합니다.");
  return round1(rawRiskScore(allocation));
}

export function portfolioTypeFor(riskScore: number): PortfolioType {
  return riskScore <= PORTFOLIO_TYPE_BANDS.stableMax ? "안정형" : riskScore <= PORTFOLIO_TYPE_BANDS.neutralMax ? "중립형" : "공격형";
}

function trait(value: number, low: number, high: number, highInclusive = false): TraitLevel {
  if (value < low) return "낮음";
  return highInclusive ? (value >= high ? "높음" : "보통") : (value > high ? "높음" : "보통");
}

function suitabilityFor(profile: PortfolioType, portfolioType: PortfolioType): PortfolioResult["suitability"] {
  const matrix: Record<PortfolioType, Record<PortfolioType, PortfolioResult["suitability"]>> = {
    안정형: { 안정형: "적합", 중립형: "다소 공격적", 공격형: "매우 공격적" },
    중립형: { 안정형: "다소 안정적", 중립형: "적합", 공격형: "다소 공격적" },
    공격형: { 안정형: "매우 안정적", 중립형: "다소 안정적", 공격형: "적합" },
  };
  return matrix[profile][portfolioType];
}

function topAsset(allocation: Allocation) {
  return [...ASSET_KEYS].sort((left, right) => allocation[right] - allocation[left] || RISK_BY_ASSET[right] - RISK_BY_ASSET[left])[0];
}

type AllocationMetrics = { growth: number; defense: number; cash: number; topRatio: number; held: number };

function metrics(allocation: Allocation): AllocationMetrics {
  const top = topAsset(allocation);
  return {
    growth: allocation.domestic + allocation.overseas + allocation.equityFund,
    defense: allocation.bond + allocation.cash,
    cash: allocation.cash,
    topRatio: allocation[top],
    held: ASSET_KEYS.filter((key) => allocation[key] > 0).length,
  };
}

function allocationSignalIds(allocation: Allocation) {
  const value = metrics(allocation);
  const ids = new Set<number>();
  if (value.growth > 65) ids.add(1);
  if (value.growth < 35) ids.add(2);
  if (value.defense < 30) ids.add(3);
  if (value.defense > 60) ids.add(4);
  if (value.cash > 20) ids.add(5);
  if (value.cash < 5) ids.add(6);
  if (value.topRatio >= 50) ids.add(7);
  if (value.held <= 2) ids.add(8);
  return ids;
}

const SIGNAL_METRIC: Record<number, [keyof AllocationMetrics, "up" | "down"]> = {
  1: ["growth", "up"], 2: ["growth", "down"], 3: ["defense", "down"], 4: ["defense", "up"],
  5: ["cash", "up"], 6: ["cash", "down"], 7: ["topRatio", "up"], 8: ["held", "down"],
};

function signalKind(id: number, current: Allocation, target: Allocation): SignalKind {
  if (!allocationSignalIds(target).has(id)) return "caution";
  const [metric, direction] = SIGNAL_METRIC[id];
  const currentValue = metrics(current)[metric];
  const targetValue = metrics(target)[metric];
  const moreExtreme = direction === "up" ? currentValue > targetValue : currentValue < targetValue;
  return moreExtreme ? "caution" : "structural";
}

function roundedRecommendation(current: Allocation, target: Allocation): Allocation {
  const result = Object.fromEntries(ASSET_KEYS.map((key) => [key, round1((current[key] + target[key]) / 2)])) as Allocation;
  // 표시 반올림으로 생기는 0.1%p 단위 잔차는 현금성자산에서만 보정한다.
  result.cash = round1(result.cash + round1(100 - allocationTotal(result)));
  return result;
}

export function analyzeAllocation(current: Allocation, tendency: PortfolioTendency, horizon: string): PortfolioResult {
  if (!validateAllocation(current)) throw new Error("자산 비중은 유한한 숫자이며 합계가 정확히 100%여야 합니다.");
  if (!(horizon in HORIZON_CENTERS)) throw new Error("지원하지 않는 투자 기간입니다.");

  const profile: PortfolioType = tendency === "진단 전" ? "중립형" : tendency;
  const target = targetFor(profile);
  const riskRaw = rawRiskScore(current);
  const riskScore = round1(riskRaw);
  const portfolioType = portfolioTypeFor(riskRaw);
  const gapRaw = Math.abs(riskRaw - RISK_CENTERS[profile]);
  const fitRaw = Math.max(0, 100 - gapRaw * 4);
  const hhi = ASSET_KEYS.reduce((sum, key) => sum + Math.pow(current[key] / 100, 2), 0);
  const diversificationRaw = Math.max(0, Math.min(100, ((1 - hhi) / (1 - 1 / ASSET_KEYS.length)) * 100));
  const horizonCenter = HORIZON_CENTERS[horizon];
  const horizonFitRaw = Math.max(0, 100 - Math.abs(riskRaw - horizonCenter) * 1.5);
  const penaltyAsset = [...NON_EXEMPT_CONCENTRATION].sort((left, right) => current[right] - current[left] || RISK_BY_ASSET[right] - RISK_BY_ASSET[left])[0];
  const concentrationPenaltyRaw = current[penaltyAsset] > 50 ? current[penaltyAsset] - 50 : 0;
  const score = Math.max(0, Math.min(SCORE_MAX, Math.round(0.45 * fitRaw + 0.25 * diversificationRaw + 0.15 * horizonFitRaw - concentrationPenaltyRaw)));
  const scoreLabel: ScoreLabel = score >= 82 ? "Excellent" : score >= 70 ? "Good" : score >= 50 ? "Fair" : "Poor";
  const gap = round1(gapRaw);
  const fit = round1(fitRaw);
  const diversification = round1(diversificationRaw);
  const horizonFit = round1(horizonFitRaw);
  const concentrationPenalty = round1(concentrationPenaltyRaw);
  const profileMatch: PortfolioResult["profileMatch"] = { level: gapRaw <= 5 ? "우수" : gapRaw <= 12 ? "보통" : "불일치", gap };
  const currentMetrics = metrics(current);
  const top = topAsset(current);
  const characteristics: PortfolioResult["characteristics"] = {
    growth: trait(currentMetrics.growth, 35, 65),
    defense: trait(currentMetrics.defense, 30, 60),
    liquidity: trait(current.cash, 5, 20),
    concentration: current[top] < 50 ? "낮음" : current[top] < 70 ? "보통" : "높음",
  };

  const recommended = roundedRecommendation(current, target);
  const allDeltas = ASSET_KEYS.map((asset) => ({ asset, delta: round1(recommended[asset] - current[asset]) }));
  const sortByDeltaThenRisk = (left: { asset: AssetKey; delta: number }, right: { asset: AssetKey; delta: number }) =>
    Math.abs(right.delta) - Math.abs(left.delta) || RISK_BY_ASSET[right.asset] - RISK_BY_ASSET[left.asset];
  const rebalancingActions = allDeltas
    .filter((item) => Math.abs(item.delta) >= 5)
    .sort(sortByDeltaThenRisk)
    .map((item) => ({ ...item, action: (item.delta > 0 ? "확대" : "축소") as "확대" | "축소" }));
  const residualItems = allDeltas.filter((item) => Math.abs(item.delta) >= 0.5 && Math.abs(item.delta) < 5).sort(sortByDeltaThenRisk);

  const signalTexts: Record<number, string> = {
    1: "성장자산 비중이 높아 성장성과 변동성이 모두 높을 수 있어요.",
    2: "성장자산 비중이 낮아 장기 성장성이 제한될 수 있어요.",
    3: "방어자산(채권+현금성자산) 비중이 낮아요.",
    4: "방어자산 비중이 높아 하락장 방어력은 좋지만 성장성이 제한될 수 있어요.",
    5: "현금성자산 비중이 높아 유동성은 좋지만 성장성이 제한될 수 있어요.",
    6: "현금성자산 비중이 낮아 갑작스러운 자금 필요에 대응하기 어려울 수 있어요.",
    7: `특정 자산군(${ASSETS.find((asset) => asset.key === top)?.label})에 집중되어 있어요.`,
    8: `보유 자산군이 ${currentMetrics.held}종으로 적어 분산 효과가 제한적이에요.`,
    9: `위험도가 진단된 ${profile} 성향과 큰 차이가 있어요.`,
    10: "투자 기간에 비해 포트폴리오 위험도가 낮아요.",
    11: "투자 기간이 짧은 데 비해 위험자산 비중이 높아요.",
  };
  const ids = [...allocationSignalIds(current)].sort((a, b) => a - b);
  if (gapRaw > 12) ids.push(9);
  // 10번은 기간 대비 저위험, 11번은 기간 대비 고위험만 담당해 서로 중복되지 않는다.
  if (riskRaw < horizonCenter && horizonFitRaw < 50) ids.push(10);
  if (riskRaw - horizonCenter >= 25) ids.push(11);
  const signals: PortfolioSignal[] = ids.map((id) => ({
    id,
    kind: id <= 8 ? signalKind(id, current, target) : "caution",
    text: signalTexts[id],
  }));

  const strengths: string[] = [];
  if (fitRaw >= 80) strengths.push("현재 위험도가 진단 성향과 잘 맞아요.");
  if (diversificationRaw >= 85) strengths.push("여러 자산군에 고르게 나뉘어 분산도가 양호해요.");
  if (horizonFitRaw >= 80) strengths.push("투자 기간과 포트폴리오 위험도가 잘 맞아요.");
  const cautions = signals.filter((signal) => signal.kind === "caution").map((signal) => signal.text);

  const mainAction = rebalancingActions[0];
  const actionAsset = mainAction ? ASSETS.find((asset) => asset.key === mainAction.asset) : null;
  const coach = mainAction && actionAsset
    ? `${actionAsset.label} 비중을 ${Math.abs(mainAction.delta)}%p ${mainAction.action === "확대" ? "늘리는" : "줄이는"} 방향을 우선 살펴보세요.`
    : "현재 비중과 학습용 목표 배분의 차이가 모두 5%p 미만이에요. 정기적으로 다시 점검해 보세요.";

  return {
    score,
    scoreMax: SCORE_MAX,
    scoreLabel,
    riskScore,
    fit,
    horizonFit,
    diversification,
    concentrationPenalty,
    components: { A: fit, B: diversification, C: horizonFit, D: concentrationPenalty },
    portfolioType,
    profileMatch,
    suitability: suitabilityFor(profile, portfolioType),
    characteristics,
    target: recommended,
    rebalancingActions,
    residualItems,
    signals,
    strengths,
    cautions,
    coach,
  };
}
