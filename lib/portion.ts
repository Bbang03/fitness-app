export type PortionPreset = {
  label: string;
  grams: number;
};

export type PortionSuggestion = {
  unit: string;
  unitGrams: number;
  presets: PortionPreset[];
  note?: string;
};

type PortionInput = {
  name: string;
  servingDescription?: string | null;
  defaultGrams: number;
};

function roundAmount(value: number) {
  return Math.round(value * 10) / 10;
}

function formatAmount(value: number) {
  return Number.isInteger(value)
    ? String(value)
    : String(roundAmount(value));
}

function parseFraction(value: string) {
  const normalized =
    value.replace(/\s+/g, '');

  const fraction =
    normalized.match(/^(\d+)\/(\d+)$/);

  if (fraction) {
    const numerator =
      Number(fraction[1]);

    const denominator =
      Number(fraction[2]);

    if (
      Number.isFinite(numerator) &&
      Number.isFinite(denominator) &&
      denominator > 0
    ) {
      return numerator / denominator;
    }
  }

  const parsed =
    Number(normalized);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function buildPresets(
  unit: string,
  unitGrams: number,
  amounts: number[],
): PortionPreset[] {
  return amounts.map(
    (amount) => ({
      label:
        `${formatAmount(amount)}${unit}`,

      grams:
        Math.max(
          1,
          roundAmount(
            unitGrams * amount,
          ),
        ),
    }),
  );
}

function proteinPowderSuggestion(
  name: string,
  defaultGrams: number,
): PortionSuggestion | null {
  const normalized =
    name.toLocaleLowerCase('ko-KR');

  /*
   * 브랜드명에 "프로틴"이라는 단어가 들어간다는 이유만으로
   * 무조건 분말 제품으로 판단하지 않는다.
   *
   * 웨이/WPI/WPC/카제인/파우더/쉐이크 등
   * 실제 단백질 분말을 나타내는 표현이 있을 때만 적용한다.
   */
  const looksLikeProteinPowder =
    /웨이|whey|wpi|wpc|isolate|카제인|casein|단백질\s*(?:파우더|분말|쉐이크)|프로틴\s*(?:파우더|분말|쉐이크)/i.test(
      normalized,
    );

  if (!looksLikeProteinPowder) {
    return null;
  }

  /*
   * 200g 이상이면 1회 섭취량보다는
   * 제품 전체 중량일 가능성이 있는 것으로 본다.
   *
   * 이 경우 UI용 fallback으로
   * 1스쿱 ≈ 30g을 제안한다.
   */
  if (defaultGrams < 200) {
    return null;
  }

  const unitGrams = 30;

  return {
    unit: '스쿱',
    unitGrams,

    presets: buildPresets(
      '스쿱',
      unitGrams,
      [0.5, 1, 2],
    ),

    note:
      '제품마다 스쿱 중량이 다를 수 있어요. 제품 라벨과 다르면 g을 직접 입력해주세요.',
  };
}

function getPresetAmounts(
  unit: string,
  baseAmount: number,
) {
  switch (unit) {
    case '스쿱':
      return [0.5, 1, 2];

    case '공기':
    case '컵':
    case '그릇':
    case '잔':
    case '인분':
      return [0.5, 1, 1.5];

    case '큰술':
    case '작은술':
      return baseAmount < 1
        ? [baseAmount, 1, 2]
        : [1, 2, 3];

    case '팩':
    case '개':
    case '장':
    case '조각':
    case '줄':
    case '봉지':
    case '병':
    case '캔':
    case '토막':
      return baseAmount < 1
        ? [baseAmount, 1, 2]
        : [1, 2, 3];

    case '모':
      if (baseAmount <= 0.25) {
        return [
          0.25,
          0.5,
          1,
        ];
      }

      if (baseAmount <= 0.5) {
        return [
          0.5,
          1,
          1.5,
        ];
      }

      return [
        0.5,
        1,
        1.5,
      ];

    case '줌':
      return [
        0.5,
        1,
        2,
      ];

    default:
      return [
        0.5,
        1,
        1.5,
      ];
  }
}

function parseServingDescription(
  servingDescription: string,
  defaultGrams: number,
): PortionSuggestion | null {
  const text =
    servingDescription.trim();

  if (!text) {
    return null;
  }

  /*
   * 예:
   *
   * 1공기 (210g)
   * 2장 (70g)
   * 중간크기 1개 (150g)
   * 1/2팩 (150g)
   * 1/4모 (100g)
   * 2큰술 (32g)
   * 1스쿱 (30g)
   */
  const match =
    text.match(
      /(\d+(?:\.\d+)?|\d+\s*\/\s*\d+)\s*(스쿱|공기|개|팩|컵|장|조각|큰술|작은술|그릇|줄|봉지|병|캔|토막|모|잔|인분|줌)(?=\s|\(|$)/,
    );

  if (!match) {
    return null;
  }

  const baseAmount =
    parseFraction(match[1]);

  const unit =
    match[2];

  if (
    baseAmount === null ||
    baseAmount <= 0 ||
    defaultGrams <= 0
  ) {
    return null;
  }

  /*
   * 2장 = 70g
   * → 1장 = 35g
   *
   * 1/2팩 = 150g
   * → 1팩 = 300g
   */
  const unitGrams =
    defaultGrams /
    baseAmount;

  const amounts =
    getPresetAmounts(
      unit,
      baseAmount,
    );

  return {
    unit,

    unitGrams:
      roundAmount(unitGrams),

    presets:
      buildPresets(
        unit,
        unitGrams,
        amounts,
      ),
  };
}

export function getPortionSuggestion({
  name,
  servingDescription,
  defaultGrams,
}: PortionInput): PortionSuggestion {
  const safeDefaultGrams =
    Number.isFinite(defaultGrams) &&
    defaultGrams > 0
      ? defaultGrams
      : 100;

  /*
   * 대용량 단백질 분말 제품부터 검사한다.
   *
   * 예:
   * 제품 전체 중량 1000g
   * → UI에서는 0.5 / 1 / 2스쿱 추천
   */
  const proteinSuggestion =
    proteinPowderSuggestion(
      name,
      safeDefaultGrams,
    );

  if (proteinSuggestion) {
    return proteinSuggestion;
  }

  /*
   * 일반 음식은 기존 제공량 문자열을 활용한다.
   */
  if (servingDescription) {
    const parsed =
      parseServingDescription(
        servingDescription,
        safeDefaultGrams,
      );

    if (parsed) {
      return parsed;
    }
  }

  /*
   * 단위를 확실히 알 수 없으면
   * 억지로 개/팩 등을 추정하지 않고
   * g 단위로 fallback한다.
   */
  const low =
    Math.max(
      1,
      roundAmount(
        safeDefaultGrams * 0.7,
      ),
    );

  const normal =
    Math.max(
      1,
      roundAmount(
        safeDefaultGrams,
      ),
    );

  const high =
    Math.max(
      1,
      roundAmount(
        safeDefaultGrams * 1.5,
      ),
    );

  return {
    unit: 'g',
    unitGrams: 1,

    presets: [
      {
        label:
          `${formatAmount(low)}g`,
        grams: low,
      },
      {
        label:
          `${formatAmount(normal)}g`,
        grams: normal,
      },
      {
        label:
          `${formatAmount(high)}g`,
        grams: high,
      },
    ],
  };
}

export function getInitialPortionGrams(
  input: PortionInput,
) {
  const suggestion =
    getPortionSuggestion(input);

  /*
   * 기존 DB의 기본 제공량과 일치하는 버튼이 있으면
   * 그것을 기본 선택한다.
   *
   * 예:
   * 계란 1개 60g → 1개
   * 식빵 2장 70g → 2장
   * 밥 1공기 210g → 1공기
   */
  const defaultMatch =
    suggestion.presets.find(
      (preset) =>
        Math.abs(
          preset.grams -
            input.defaultGrams,
        ) < 0.05,
    );

  if (defaultMatch) {
    return defaultMatch.grams;
  }

  /*
   * 대용량 프로틴처럼 원본 1000g과
   * 추천 섭취량이 전혀 다른 경우에는
   * 가운데 preset을 기본값으로 사용한다.
   *
   * 0.5스쿱 / 1스쿱 / 2스쿱
   * → 기본 1스쿱
   */
  return (
    suggestion.presets[1]?.grams ??
    suggestion.presets[0]?.grams ??
    input.defaultGrams
  );
}