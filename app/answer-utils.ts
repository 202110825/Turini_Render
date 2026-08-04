const ENDINGS = /(입니다|입니까|합니다|합니까|됩니다|됩니까|한다|된다|이다)$/u;

const SYNONYMS: Array<[RegExp, string]> = [
  [/(상장지수펀드|이티에프|etf)/gu, "etf"],
  [/(시세차익|자본이득|매매차익)/gu, "매매차익"],
  [/(배당금|배당)/gu, "배당"],
  [/(떨어짐|떨어진다|내려감|내려간다|하락)/gu, "하락"],
  [/(오름|오른다|올라감|올라간다|상승)/gu, "상승"],
  [/(낮아진다|낮아집니다|작아진다|작아집니다|감소한다|감소합니다|줄어든다|줄어듭니다)/gu, "감소"],
  [/(높아진다|높아집니다|커진다|커집니다|증가한다|증가합니다|늘어난다|늘어납니다)/gu, "증가"],
  [/(재조정|비중조정|자산재배분|리밸런싱)/gu, "리밸런싱"],
  [/(분산투자|위험분산)/gu, "분산투자"],
  [/(주식보유자|기업의일부소유자|기업소유자|주주)/gu, "주주"],
  [/(채권보유자|돈을빌려준사람|채권자)/gu, "채권자"],
];

export function normalizeAnswer(value: string) {
  let normalized = value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/퍼센트/gu, "%")
    .replace(/[\s.,·'"()\[\]{}]/g, "")
    .replace(/^약/u, "")
    .replace(/^([0-9]+)원$/u, "$1")
    .replace(/원$/u, "");
  for (const [pattern, replacement] of SYNONYMS) normalized = normalized.replace(pattern, replacement);
  return normalized
    .replace(ENDINGS, "")
    .replace(ENDINGS, "")
    .replace(/^([0-9]+)원$/u, "$1");
}

export function isAnswerCorrect(input: string, answer: string, acceptedAnswers: string[] = []) {
  const actual = normalizeAnswer(input);
  if (!actual) return false;
  return [answer, ...acceptedAnswers].some((candidate) => {
    const expected = normalizeAnswer(candidate);
    if (!expected) return false;
    if (actual === expected) return true;
    return Math.min(actual.length, expected.length) >= 3 && (actual.includes(expected) || expected.includes(actual));
  });
}
