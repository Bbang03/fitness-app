import fs from 'node:fs/promises';

const API =
  'https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02';

const envText =
  await fs.readFile(
    '.env.local',
    'utf8',
  );

const keyLine =
  envText
    .split(/\r?\n/)
    .find((line) =>
      line.startsWith(
        'MFDS_SERVICE_KEY=',
      ),
    );

if (!keyLine) {
  throw new Error(
    'MFDS_SERVICE_KEY가 없습니다.',
  );
}

let serviceKey =
  keyLine
    .slice(
      'MFDS_SERVICE_KEY='.length,
    )
    .trim();

try {
  serviceKey =
    decodeURIComponent(
      serviceKey,
    );
} catch {}

// ─────────────────────────────
// 기본 파싱
// ─────────────────────────────

function num(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const parsed =
    Number(
      String(value)
        .replace(/,/g, '')
        .trim(),
    );

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function parseGram(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const match =
    String(value)
      .replace(/,/g, '')
      .match(
        /([\d.]+)\s*g/i,
      );

  if (!match) {
    return null;
  }

  const parsed =
    Number(match[1]);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function getItems(json) {
  if (
    Array.isArray(
      json.body?.items,
    )
  ) {
    return json.body.items;
  }

  if (
    Array.isArray(
      json.response?.body?.items,
    )
  ) {
    return json.response.body.items;
  }

  return [];
}

function cleanName(value) {
  return String(
    value ?? '',
  )
    .replace(
      /^(버거|햄버거)_/,
      '',
    )
    .replace(
      /\s+/g,
      ' ',
    )
    .trim();
}

function dateScore(value) {
  const digits =
    String(value ?? '')
      .replace(/\D/g, '');

  const parsed =
    Number(digits);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

async function searchMFDS(
  keyword,
  rows = 500,
) {
  const params =
    new URLSearchParams({
      serviceKey,
      pageNo: '1',
      numOfRows:
        String(rows),
      type: 'json',
      FOOD_NM_KR:
        keyword,
    });

  const response =
    await fetch(
      `${API}?${params}`,
    );

  if (!response.ok) {
    throw new Error(
      `${keyword}: MFDS ${response.status}`,
    );
  }

  const json =
    await response.json();

  return getItems(json);
}

// ─────────────────────────────
// 버거 데이터 변환
// ─────────────────────────────

function normalizeBurger(
  item,
) {
  const rawName =
    String(
      item.FOOD_NM_KR ??
        '',
    ).trim();

  const origin =
    String(
      item.FOOD_OR_NM ??
        '',
    );

  if (
    !origin.includes(
      '프랜차이즈',
    )
  ) {
    return null;
  }

  // "치킨" → "먼치킨" 같은 오염을 막기 위해
  // MFDS의 실제 음식 분류 prefix를 사용한다.
  if (
    !/^(버거|햄버거)_/.test(
      rawName,
    )
  ) {
    return null;
  }

  const kcal =
    num(
      item.AMT_NUM1,
    );

  const protein =
    num(
      item.AMT_NUM3,
    );

  const fat =
    num(
      item.AMT_NUM4,
    );

  const carbs =
    num(
      item.AMT_NUM6,
    );

  const sugar =
    num(
      item.AMT_NUM7,
    );

  const sodium =
    num(
      item.AMT_NUM13,
    );

  const saturatedFat =
    num(
      item.AMT_NUM24,
    );

  const servingG =
    parseGram(
      item.Z10500,
    ) ??
    parseGram(
      item.NUTRI_AMOUNT_SERVING,
    ) ??
    parseGram(
      item.SERVING_SIZE,
    );

  return {
    id:
      String(
        item.FOOD_CD ??
          '',
      ),

    rawName,

    name:
      cleanName(
        rawName,
      ),

    brand:
      String(
        item.MAKER_NM ??
          '',
      ).trim(),

    kcal,
    protein,
    carbs,
    fat,
    sugar,
    sodium,
    saturatedFat,
    servingG,

    updatedDate:
      item.UPDATE_DATE ??
      null,

    researchDate:
      item.RESEARCH_YMD ??
      null,
  };
}

// ─────────────────────────────
// 학습 가능 여부
// ─────────────────────────────

function isComplete(
  row,
) {
  if (
    row.kcal === null ||
    row.kcal <= 0 ||
    row.protein === null ||
    row.carbs === null ||
    row.fat === null
  ) {
    return false;
  }

  const macroKcal =
    row.carbs * 4 +
    row.protein * 4 +
    row.fat * 9;

  const gap =
    Math.abs(
      macroKcal -
        row.kcal,
    ) /
    row.kcal;

  return gap <= 0.15;
}

// ─────────────────────────────
// 예측 target:
//
// 남은 열량 = kcal - 단백질×4
//
// share = 탄수 열량 / 남은 열량
// ─────────────────────────────

function carbEnergyShare(
  row,
) {
  const residual =
    row.kcal -
    row.protein * 4;

  if (
    residual <= 0
  ) {
    return null;
  }

  const share =
    (
      row.carbs * 4
    ) /
    residual;

  if (
    !Number.isFinite(
      share,
    )
  ) {
    return null;
  }

  if (
    share < 0 ||
    share > 1
  ) {
    return null;
  }

  return share;
}

// ─────────────────────────────
// Robust normalization
// ─────────────────────────────

const FEATURE_NAMES = [
  'kcal',
  'protein',
  'sugar',
  'saturatedFat',
  'sodium',
];

function median(values) {
  if (
    values.length === 0
  ) {
    return null;
  }

  const sorted =
    [...values].sort(
      (a, b) =>
        a - b,
    );

  const middle =
    Math.floor(
      sorted.length / 2,
    );

  if (
    sorted.length % 2 === 0
  ) {
    return (
      sorted[middle - 1] +
      sorted[middle]
    ) / 2;
  }

  return sorted[middle];
}

function quantile(
  values,
  q,
) {
  if (
    values.length === 0
  ) {
    return null;
  }

  const sorted =
    [...values].sort(
      (a, b) =>
        a - b,
    );

  const position =
    (
      sorted.length - 1
    ) * q;

  const base =
    Math.floor(
      position,
    );

  const rest =
    position - base;

  if (
    sorted[base + 1] !==
    undefined
  ) {
    return (
      sorted[base] +
      rest *
        (
          sorted[base + 1] -
          sorted[base]
        )
    );
  }

  return sorted[base];
}

function buildScaler(
  rows,
) {
  const scaler = {};

  for (
    const feature
    of FEATURE_NAMES
  ) {
    const values =
      rows
        .map(
          (row) =>
            row[feature],
        )
        .filter(
          (value) =>
            value !== null &&
            Number.isFinite(
              value,
            ),
        );

    const med =
      median(values) ??
      0;

    const q1 =
      quantile(
        values,
        0.25,
      ) ??
      med;

    const q3 =
      quantile(
        values,
        0.75,
      ) ??
      med;

    let scale =
      q3 - q1;

    if (
      !Number.isFinite(
        scale,
      ) ||
      scale <= 0
    ) {
      scale = 1;
    }

    scaler[feature] = {
      center:
        med,

      scale,
    };
  }

  return scaler;
}

// ─────────────────────────────
// Missing-aware 거리
// ─────────────────────────────

function distance(
  a,
  b,
  scaler,
) {
  let sum = 0;
  let shared = 0;

  for (
    const feature
    of FEATURE_NAMES
  ) {
    const av =
      a[feature];

    const bv =
      b[feature];

    if (
      av === null ||
      bv === null
    ) {
      continue;
    }

    const {
      scale,
    } =
      scaler[feature];

    const diff =
      (
        av - bv
      ) /
      scale;

    sum +=
      diff * diff;

    shared++;
  }

  // kcal + protein 정도는 최소한 같이 있어야 한다.
  if (
    shared < 2
  ) {
    return Infinity;
  }

  let d =
    Math.sqrt(
      sum / shared,
    );

  // 누락 feature가 많으면 약간의 penalty
  d *=
    Math.sqrt(
      FEATURE_NAMES.length /
        shared,
    );

  return d;
}

// ─────────────────────────────
// kNN
// ─────────────────────────────

function predictShare({
  target,
  candidates,
  scaler,
  k,
}) {
  const neighbors =
    candidates
      .map(
        (row) => {
          const share =
            carbEnergyShare(
              row,
            );

          return {
            row,
            share,

            distance:
              distance(
                target,
                row,
                scaler,
              ),
          };
        },
      )
      .filter(
        (item) =>
          item.share !==
            null &&
          Number.isFinite(
            item.distance,
          ),
      )
      .sort(
        (a, b) =>
          a.distance -
          b.distance,
      )
      .slice(
        0,
        k,
      );

  if (
    neighbors.length ===
    0
  ) {
    return null;
  }

  let weightedSum = 0;
  let weightTotal = 0;

  for (
    const neighbor
    of neighbors
  ) {
    // 아주 가까운 row가 과도하게 폭주하지 않도록
    // 0.15 offset 사용
    const weight =
      1 /
      (
        neighbor.distance +
        0.15
      );

    weightedSum +=
      neighbor.share *
      weight;

    weightTotal +=
      weight;
  }

  const share =
    weightedSum /
    weightTotal;

  return {
    share,
    neighbors,
  };
}

function shareToMacros(
  row,
  share,
) {
  const residual =
    row.kcal -
    row.protein * 4;

  if (
    residual <= 0
  ) {
    return null;
  }

  const carbs =
    (
      residual *
      share
    ) /
    4;

  const fat =
    (
      residual *
      (
        1 - share
      )
    ) /
    9;

  return {
    carbs,
    fat,
  };
}

function mae(
  values,
) {
  if (
    values.length === 0
  ) {
    return null;
  }

  return (
    values.reduce(
      (
        sum,
        value,
      ) =>
        sum +
        Math.abs(value),
      0,
    ) /
    values.length
  );
}

function round(
  value,
  digits = 2,
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const factor =
    10 ** digits;

  return (
    Math.round(
      value *
        factor,
    ) /
    factor
  );
}

// ─────────────────────────────
// 데이터 수집
// ─────────────────────────────

console.log('');
console.log(
  '====== FitTrack Burger Macro Estimator ======',
);

console.log('');
console.log(
  'MFDS 버거 데이터 수집 중...',
);

const [
  burgerRaw,
  hamburgerRaw,
] =
  await Promise.all([
    searchMFDS(
      '버거',
      500,
    ),

    searchMFDS(
      '햄버거',
      500,
    ),
  ]);

const dedup =
  new Map();

for (
  const item
  of [
    ...burgerRaw,
    ...hamburgerRaw,
  ]
) {
  const id =
    String(
      item.FOOD_CD ??
        '',
    );

  if (!id) {
    continue;
  }

  const previous =
    dedup.get(id);

  if (
    !previous ||
    dateScore(
      item.UPDATE_DATE,
    ) >
      dateScore(
        previous.UPDATE_DATE,
      )
  ) {
    dedup.set(
      id,
      item,
    );
  }
}

const burgers =
  [...dedup.values()]
    .map(
      normalizeBurger,
    )
    .filter(
      Boolean,
    );

const complete =
  burgers
    .filter(
      isComplete,
    )
    .filter(
      (row) =>
        carbEnergyShare(
          row,
        ) !==
        null,
    );

console.log(
  '버거 분류 전체:',
  burgers.length,
);

console.log(
  '탄단지 검증 완료:',
  complete.length,
);

// 브랜드 분포
const brandCount =
  new Map();

for (
  const row
  of complete
) {
  brandCount.set(
    row.brand,
    (
      brandCount.get(
        row.brand,
      ) ??
      0
    ) + 1,
  );
}

console.log('');
console.log(
  '완전 데이터 브랜드 분포:',
);

console.table(
  [...brandCount.entries()]
    .sort(
      (a, b) =>
        b[1] - a[1],
    )
    .map(
      (
        [
          brand,
          count,
        ],
      ) => ({
        brand,
        count,
      }),
    ),
);

// ─────────────────────────────
// Cross-brand validation
//
// 같은 브랜드 제품은 neighbor에서 제외.
// 즉 "처음 보는 브랜드"에 얼마나 잘 일반화하는지 본다.
// ─────────────────────────────

const scaler =
  buildScaler(
    complete,
  );

const K_VALUES = [
  3,
  5,
  7,
  9,
];

const evaluation = [];

for (
  const k
  of K_VALUES
) {
  const carbErrors = [];
  const fatErrors = [];

  let evaluated = 0;

  for (
    const target
    of complete
  ) {
    const candidates =
      complete.filter(
        (row) =>
          row.id !==
            target.id &&
          row.brand !==
            target.brand,
      );

    if (
      candidates.length <
      k
    ) {
      continue;
    }

    const prediction =
      predictShare({
        target,
        candidates,
        scaler,
        k,
      });

    if (!prediction) {
      continue;
    }

    const macros =
      shareToMacros(
        target,
        prediction.share,
      );

    if (!macros) {
      continue;
    }

    carbErrors.push(
      macros.carbs -
        target.carbs,
    );

    fatErrors.push(
      macros.fat -
        target.fat,
    );

    evaluated++;
  }

  const carbMae =
    mae(
      carbErrors,
    );

  const fatMae =
    mae(
      fatErrors,
    );

  evaluation.push({
    k,
    evaluated,

    carbMae:
      round(
        carbMae,
        2,
      ),

    fatMae:
      round(
        fatMae,
        2,
      ),

    combined:
      round(
        (
          carbMae ??
          999
        ) +
          (
            fatMae ??
            999
          ),
        2,
      ),
  });
}

console.log('');
console.log(
  '====== Cross-brand 평가 ======',
);

console.log(
  '단위: g / 100g',
);

console.table(
  evaluation,
);

const best =
  [...evaluation]
    .filter(
      (row) =>
        row.evaluated >
        0,
    )
    .sort(
      (a, b) =>
        a.combined -
        b.combined,
    )[0];

if (!best) {
  throw new Error(
    '평가 가능한 모델이 없습니다.',
  );
}

console.log(
  `선택된 k = ${best.k}`,
);

// ─────────────────────────────
// 단순 baseline 비교
// ─────────────────────────────

const baselineCarbErrors =
  [];

const baselineFatErrors =
  [];

for (
  const target
  of complete
) {
  const otherBrands =
    complete.filter(
      (row) =>
        row.brand !==
        target.brand,
    );

  const shares =
    otherBrands
      .map(
        carbEnergyShare,
      )
      .filter(
        (value) =>
          value !== null,
      );

  const baseShare =
    median(
      shares,
    );

  if (
    baseShare === null
  ) {
    continue;
  }

  const macros =
    shareToMacros(
      target,
      baseShare,
    );

  if (!macros) {
    continue;
  }

  baselineCarbErrors.push(
    macros.carbs -
      target.carbs,
  );

  baselineFatErrors.push(
    macros.fat -
      target.fat,
  );
}

console.log('');
console.log(
  '====== 단순 중앙값 baseline ======',
);

console.log({
  carbMaePer100g:
    round(
      mae(
        baselineCarbErrors,
      ),
      2,
    ),

  fatMaePer100g:
    round(
      mae(
        baselineFatErrors,
      ),
      2,
    ),
});

// ─────────────────────────────
// 불고기와퍼 실제 추정
// ─────────────────────────────

console.log('');
console.log(
  '불고기와퍼 검색 중...',
);

const targetRaw =
  await searchMFDS(
    '불고기와퍼',
    50,
  );

const targetCandidates =
  targetRaw
    .map(
      normalizeBurger,
    )
    .filter(
      Boolean,
    )
    .filter(
      (row) =>
        row.brand ===
          '버거킹' &&
        row.name ===
          '불고기와퍼',
    )
    .sort(
      (a, b) =>
        dateScore(
          b.updatedDate,
        ) -
        dateScore(
          a.updatedDate,
        ),
    );

const target =
  targetCandidates[0];

if (!target) {
  throw new Error(
    '최신 불고기와퍼 MFDS 데이터를 찾지 못했습니다.',
  );
}

console.log('');
console.log(
  '====== 불고기와퍼 입력 ======',
);

console.log({
  brand:
    target.brand,

  name:
    target.name,

  servingG:
    target.servingG,

  kcalPer100g:
    target.kcal,

  proteinPer100g:
    target.protein,

  sugarPer100g:
    target.sugar,

  saturatedFatPer100g:
    target.saturatedFat,

  sodiumPer100g:
    target.sodium,
});

if (
  target.kcal === null ||
  target.protein === null
) {
  throw new Error(
    '불고기와퍼 입력값이 부족합니다.',
  );
}

const targetPrediction =
  predictShare({
    target,
    candidates:
      complete,
    scaler,
    k:
      best.k,
  });

if (
  !targetPrediction
) {
  throw new Error(
    '불고기와퍼 예측 실패',
  );
}

const targetMacros =
  shareToMacros(
    target,
    targetPrediction.share,
  );

if (
  !targetMacros
) {
  throw new Error(
    '불고기와퍼 macro 계산 실패',
  );
}

const servingMultiplier =
  target.servingG !==
    null
    ? target.servingG /
      100
    : null;

console.log('');
console.log(
  '====== 불고기와퍼 AI 추정 ======',
);

console.log({
  carbEnergyShare:
    round(
      targetPrediction.share,
      3,
    ),

  carbsPer100g:
    round(
      targetMacros.carbs,
      1,
    ),

  fatPer100g:
    round(
      targetMacros.fat,
      1,
    ),

  estimatedCarbsTotal:
    servingMultiplier !==
      null
      ? round(
          targetMacros.carbs *
            servingMultiplier,
          1,
        )
      : null,

  estimatedFatTotal:
    servingMultiplier !==
      null
      ? round(
          targetMacros.fat *
            servingMultiplier,
          1,
        )
      : null,

  proteinTotal:
    servingMultiplier !==
      null
      ? round(
          target.protein *
            servingMultiplier,
          1,
        )
      : null,

  kcalTotal:
    servingMultiplier !==
      null
      ? round(
          target.kcal *
            servingMultiplier,
          0,
        )
      : null,
});

console.log('');
console.log(
  '====== 참고한 가장 가까운 버거 ======',
);

console.table(
  targetPrediction.neighbors.map(
    (neighbor) => ({
      brand:
        neighbor.row.brand,

      name:
        neighbor.row.name,

      distance:
        round(
          neighbor.distance,
          3,
        ),

      kcal:
        neighbor.row.kcal,

      protein:
        neighbor.row.protein,

      carbs:
        neighbor.row.carbs,

      fat:
        neighbor.row.fat,

      sugar:
        neighbor.row.sugar,

      saturatedFat:
        neighbor.row.saturatedFat,

      sodium:
        neighbor.row.sodium,
    }),
  ),
);

console.log('');
console.log(
  '완료.',
);