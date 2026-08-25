export type AssetKey = "domestic" | "overseas" | "bond" | "equityFund" | "cash" | "gold";
export type Allocation = Record<AssetKey, number>;
export type PortfolioType = "안정형" | "중립형" | "공격형";
export type PortfolioTendency = PortfolioType | "진단 전";

export type AssetDefinition = {
  key: AssetKey;
  label: string;
  short: string;
  color: string;
  icon: string;
  risk: number;
  help: string;
};

export const PORTFOLIO_RULE_VERSION = "2.1.0-equity-fund-50";

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
    help: "여러 주식에 투자하는 일반 주식형 ETF·펀드입니다. 지수형·액티브형과 섹터·테마형을 포함하되, 섹터·테마형은 집중위험이 더 클 수 있습니다. 레버리지·인버스 상품은 제외합니다.",
  },
  {
    key: "cash",
    label: "현금성자산",
    short: "현금",
    color: "#2bb6a8",
    icon: "₩",
    risk: 5,
    help: "현금, 입출금·단기 예금, CMA·MMF처럼 비교적 빠르게 사용할 수 있는 자산입니다. 상품별 원금보장 여부는 다를 수 있습니다.",
  },
  {
    key: "gold",
    label: "금",
    short: "금",
    color: "#ffc800",
    icon: "Au",
    risk: 40,
    help: "실물 금, 금 통장과 일반 금 가격 추종 상품을 합산합니다. 레버리지·인버스 상품은 제외합니다.",
  },
];

export const RISK_CENTERS: Record<PortfolioType, number> = { 안정형: 30.5, 중립형: 41, 공격형: 52.8 };
export const PORTFOLIO_TYPE_BANDS = { stableMax: 35.8, neutralMax: 46.9 } as const;
export const EMPTY_ALLOCATION: Allocation = { domestic: 20, overseas: 15, bond: 30, equityFund: 15, cash: 10, gold: 10 };

export function targetFor(tendency: PortfolioTendency): Allocation {
  const profile = tendency === "진단 전" ? "중립형" : tendency;
  if (profile === "안정형") return { domestic: 5, overseas: 10, bond: 55, equityFund: 5, cash: 15, gold: 10 };
  if (profile === "공격형") return { domestic: 20, overseas: 40, bond: 10, equityFund: 20, cash: 5, gold: 5 };
  return { domestic: 10, overseas: 20, bond: 30, equityFund: 20, cash: 10, gold: 10 };
}

export function normalizeAllocation(value: unknown): Allocation {
  const saved = value && typeof value === "object" ? value as Partial<Allocation> & { fund?: number } : {};
  const numberOr = (candidate: unknown, fallback: number) => typeof candidate === "number" && Number.isFinite(candidate) ? candidate : fallback;
  return {
    domestic: numberOr(saved.domestic, EMPTY_ALLOCATION.domestic),
    overseas: numberOr(saved.overseas, EMPTY_ALLOCATION.overseas),
    bond: numberOr(saved.bond, EMPTY_ALLOCATION.bond),
    equityFund: numberOr(saved.equityFund ?? saved.fund, EMPTY_ALLOCATION.equityFund),
    cash: numberOr(saved.cash, EMPTY_ALLOCATION.cash),
    gold: numberOr(saved.gold, EMPTY_ALLOCATION.gold),
  };
}

export function riskScoreFor(allocation: Allocation) {
  return Math.round(ASSETS.reduce((sum, asset) => sum + allocation[asset.key] * asset.risk, 0) / 10) / 10;
}

export function portfolioTypeFor(riskScore: number): PortfolioType {
  return riskScore <= PORTFOLIO_TYPE_BANDS.stableMax ? "안정형" : riskScore <= PORTFOLIO_TYPE_BANDS.neutralMax ? "중립형" : "공격형";
}
