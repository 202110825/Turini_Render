export type FinanceLevel = "초급" | "중급" | "고급";

export function financeLevelForRawScore(rawScore: number): FinanceLevel {
  if (rawScore <= 21) return "초급";
  if (rawScore <= 38) return "중급";
  return "고급";
}
