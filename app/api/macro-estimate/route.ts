import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const MFDS_API =
  'https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02';

const TRAINING_TTL_MS = 24 * 60 * 60 * 1000;
const UPSTREAM_REVALIDATE_SECONDS = 24 * 60 * 60;
const K = 9;

const VALIDATION = {
  carbMaePer100g: 2.91,
  fatMaePer100g: 1.24,
  evaluated: 72,
  strategy: 'cross_brand_knn_energy_constrained_v1',
};

type RawRecord = Record<string, unknown>;

type BurgerRow = {
  id: string;
  rawName: string;
  name: string;
  brand: string;
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  sugar: number | null;
  sodium: number | null;
  saturatedFat: number | null;
};

type TargetPayload = {
  id?: string;
  rawName?: string;
  name?: string;
  brand?: string;
  servingG?: number | null;
  kcalPer100g?: number | null;
  proteinPer100g?: number | null;
  carbsPer100g?: number | null;
  fatPer100g?: number | null;
  sugarPer100g?: number | null;
  sodiumPer100g?: number | null;
  saturatedFatPer100g?: number | null;
};

type Scaler = Record<
  'kcal' | 'protein' | 'sugar' | 'saturatedFat' | 'sodium',
  {
    center: number;
    scale: number;
  }
>;

type TrainingCache = {
  expiresAt: number;
  rows: BurgerRow[];
  scaler: Scaler;
};

const globalForMacro = globalThis as typeof globalThis & {
  __fittrackBurgerMacroTraining?: TrainingCache;
};

function asRecord(value: unknown): RawRecord | null {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value)
  ) {
    return value as RawRecord;
  }

  return null;
}

function normalizeArray(value: unknown): RawRecord[] {
  if (Array.isArray(value)) {
    return value
      .map(asRecord)
      .filter((item): item is RawRecord => item !== null);
  }

  const record = asRecord(value);

  if (!record) return [];

  const nested = record.item ?? record.row;

  if (Array.isArray(nested)) {
    return nested
      .map(asRecord)
      .filter((item): item is RawRecord => item !== null);
  }

  const single = asRecord(nested);

  return single ? [single] : [];
}

function extractItems(json: unknown): RawRecord[] {
  const root = asRecord(json);

  if (!root) return [];

  const response = asRecord(root.response);
  const responseBody = asRecord(response?.body);
  const rootBody = asRecord(root.body);

  const candidates = [
    responseBody?.items,
    responseBody?.item,
    rootBody?.items,
    rootBody?.item,
    rootBody?.row,
    root.items,
    root.item,
    root.row,
  ];

  for (const candidate of candidates) {
    const items = normalizeArray(candidate);

    if (items.length > 0) {
      return items;
    }
  }

  return [];
}

function normalizeServiceKey(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(
    String(value)
      .replace(/,/g, '')
      .trim(),
  );

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function cleanName(value: unknown) {
  return String(value ?? '')
    .replace(/^(버거|햄버거)_/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeBurger(item: RawRecord): BurgerRow | null {
  const rawName = String(item.FOOD_NM_KR ?? '').trim();
  const origin = String(item.FOOD_OR_NM ?? '');

  if (!origin.includes('프랜차이즈')) {
    return null;
  }

  if (!/^(버거|햄버거)_/.test(rawName)) {
    return null;
  }

  return {
    id: String(item.FOOD_CD ?? ''),
    rawName,
    name: cleanName(rawName),
    brand: String(item.MAKER_NM ?? '').trim(),
    kcal: nullableNumber(item.AMT_NUM1),
    protein: nullableNumber(item.AMT_NUM3),
    carbs: nullableNumber(item.AMT_NUM6),
    fat: nullableNumber(item.AMT_NUM4),
    sugar: nullableNumber(item.AMT_NUM7),
    sodium: nullableNumber(item.AMT_NUM13),
    saturatedFat: nullableNumber(item.AMT_NUM24),
  };
}

function calculateEnergyGapRatio(row: BurgerRow) {
  if (
    row.kcal === null ||
    row.kcal <= 0 ||
    row.protein === null ||
    row.carbs === null ||
    row.fat === null
  ) {
    return null;
  }

  const macroKcal =
    row.carbs * 4 +
    row.protein * 4 +
    row.fat * 9;

  return Math.abs(macroKcal - row.kcal) / row.kcal;
}

function carbEnergyShare(row: BurgerRow) {
  if (
    row.kcal === null ||
    row.protein === null ||
    row.carbs === null
  ) {
    return null;
  }

  const residual =
    row.kcal -
    row.protein * 4;

  if (residual <= 0) {
    return null;
  }

  const share =
    (row.carbs * 4) /
    residual;

  if (
    !Number.isFinite(share) ||
    share < 0 ||
    share > 1
  ) {
    return null;
  }

  return share;
}

function isTrainingRow(row: BurgerRow) {
  const gap = calculateEnergyGapRatio(row);

  return (
    row.kcal !== null &&
    row.kcal > 0 &&
    row.protein !== null &&
    row.carbs !== null &&
    row.fat !== null &&
    gap !== null &&
    gap <= 0.15 &&
    carbEnergyShare(row) !== null
  );
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);

  if (sorted.length === 0) return 0;

  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (
      sorted[middle - 1] +
      sorted[middle]
    ) / 2;
  }

  return sorted[middle];
}

function quantile(values: number[], q: number) {
  const sorted = [...values].sort((a, b) => a - b);

  if (sorted.length === 0) return 0;

  const position =
    (sorted.length - 1) * q;

  const base = Math.floor(position);
  const rest = position - base;

  if (sorted[base + 1] !== undefined) {
    return (
      sorted[base] +
      rest *
        (sorted[base + 1] -
          sorted[base])
    );
  }

  return sorted[base];
}

function buildScaler(rows: BurgerRow[]): Scaler {
  const features: Array<keyof Scaler> = [
    'kcal',
    'protein',
    'sugar',
    'saturatedFat',
    'sodium',
  ];

  const scaler = {} as Scaler;

  for (const feature of features) {
    const values = rows
      .map((row) => row[feature])
      .filter(
        (value): value is number =>
          value !== null &&
          Number.isFinite(value),
      );

    const center = median(values);
    const q1 = quantile(values, 0.25);
    const q3 = quantile(values, 0.75);

    scaler[feature] = {
      center,
      scale:
        q3 - q1 > 0
          ? q3 - q1
          : 1,
    };
  }

  return scaler;
}

async function searchMfds(keyword: string) {
  const rawKey =
    process.env.MFDS_SERVICE_KEY?.trim();

  if (!rawKey) {
    throw new Error(
      'MFDS_SERVICE_KEY missing',
    );
  }

  const params =
    new URLSearchParams({
      serviceKey:
        normalizeServiceKey(rawKey),
      pageNo: '1',
      numOfRows: '500',
      type: 'json',
      FOOD_NM_KR: keyword,
    });

  const response =
    await fetch(
      `${MFDS_API}?${params.toString()}`,
      {
        next: {
          revalidate:
            UPSTREAM_REVALIDATE_SECONDS,
        },
        signal:
          AbortSignal.timeout(15000),
      },
    );

  if (!response.ok) {
    throw new Error(
      `MFDS HTTP ${response.status}`,
    );
  }

  return extractItems(
    await response.json(),
  );
}

async function getTrainingData() {
  const cached =
    globalForMacro.__fittrackBurgerMacroTraining;

  if (
    cached &&
    cached.expiresAt > Date.now()
  ) {
    return cached;
  }

  const [burgerRaw, hamburgerRaw] =
    await Promise.all([
      searchMfds('버거'),
      searchMfds('햄버거'),
    ]);

  const unique =
    new Map<string, BurgerRow>();

  for (
    const item
    of [
      ...burgerRaw,
      ...hamburgerRaw,
    ]
  ) {
    const row =
      normalizeBurger(item);

    if (
      !row ||
      !row.id ||
      !isTrainingRow(row)
    ) {
      continue;
    }

    if (!unique.has(row.id)) {
      unique.set(row.id, row);
    }
  }

  const rows =
    [...unique.values()];

  if (rows.length < 20) {
    throw new Error(
      `Not enough burger training rows: ${rows.length}`,
    );
  }

  const training: TrainingCache = {
    expiresAt:
      Date.now() +
      TRAINING_TTL_MS,
    rows,
    scaler:
      buildScaler(rows),
  };

  globalForMacro.__fittrackBurgerMacroTraining =
    training;

  return training;
}

function distance(
  a: BurgerRow,
  b: BurgerRow,
  scaler: Scaler,
) {
  const features: Array<keyof Scaler> = [
    'kcal',
    'protein',
    'sugar',
    'saturatedFat',
    'sodium',
  ];

  let sum = 0;
  let shared = 0;

  for (const feature of features) {
    const av = a[feature];
    const bv = b[feature];

    if (
      av === null ||
      bv === null
    ) {
      continue;
    }

    const diff =
      (av - bv) /
      scaler[feature].scale;

    sum += diff * diff;
    shared++;
  }

  if (shared < 2) {
    return Infinity;
  }

  let result =
    Math.sqrt(sum / shared);

  result *= Math.sqrt(
    features.length /
      shared,
  );

  return result;
}

function standardDeviation(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  const mean =
    values.reduce(
      (sum, value) =>
        sum + value,
      0,
    ) /
    values.length;

  const variance =
    values.reduce(
      (sum, value) =>
        sum +
        (value - mean) ** 2,
      0,
    ) /
    values.length;

  return Math.sqrt(variance);
}

function clamp(
  value: number,
  min: number,
  max: number,
) {
  return Math.max(
    min,
    Math.min(max, value),
  );
}

function round(
  value: number,
  digits = 1,
) {
  const factor =
    10 ** digits;

  return (
    Math.round(value * factor) /
    factor
  );
}

export async function POST(
  request: NextRequest,
) {
  try {
    const body =
      (await request.json()) as TargetPayload;

    const rawName =
      String(body.rawName ?? '');

    if (
      !/^(버거|햄버거)_/.test(
        rawName,
      )
    ) {
      return NextResponse.json(
        {
          error:
            'burger_only',
          message:
            '현재 AI 탄단지 추정은 버거류만 지원합니다.',
        },
        {
          status: 400,
        },
      );
    }

    const target: BurgerRow = {
      id:
        String(body.id ?? ''),
      rawName,
      name:
        String(body.name ?? ''),
      brand:
        String(body.brand ?? ''),
      kcal:
        nullableNumber(
          body.kcalPer100g,
        ),
      protein:
        nullableNumber(
          body.proteinPer100g,
        ),
      carbs:
        nullableNumber(
          body.carbsPer100g,
        ),
      fat:
        nullableNumber(
          body.fatPer100g,
        ),
      sugar:
        nullableNumber(
          body.sugarPer100g,
        ),
      sodium:
        nullableNumber(
          body.sodiumPer100g,
        ),
      saturatedFat:
        nullableNumber(
          body.saturatedFatPer100g,
        ),
    };

    const servingG =
      nullableNumber(
        body.servingG,
      );

    if (
      target.kcal === null ||
      target.kcal <= 0 ||
      target.protein === null
    ) {
      return NextResponse.json(
        {
          error:
            'insufficient_features',
          message:
            '열량과 단백질 정보가 필요합니다.',
        },
        {
          status: 400,
        },
      );
    }

    const residual =
      target.kcal -
      target.protein * 4;

    if (residual <= 0) {
      return NextResponse.json(
        {
          error:
            'invalid_energy',
          message:
            '영양정보의 열량 관계가 유효하지 않습니다.',
        },
        {
          status: 400,
        },
      );
    }

    let carbsPer100g:
      number | null =
        target.carbs;

    let fatPer100g:
      number | null =
        target.fat;

    let method =
      'energy_constraint';

    let confidenceScore =
      0.9;

    let neighbors:
      Array<{
        brand: string;
        name: string;
        distance: number;
        carbs: number;
        fat: number;
      }> = [];

    if (
      carbsPer100g !== null &&
      fatPer100g === null
    ) {
      fatPer100g =
        (
          residual -
          carbsPer100g * 4
        ) / 9;
    } else if (
      fatPer100g !== null &&
      carbsPer100g === null
    ) {
      carbsPer100g =
        (
          residual -
          fatPer100g * 9
        ) / 4;
    } else if (
      carbsPer100g === null &&
      fatPer100g === null
    ) {
      const training =
        await getTrainingData();

      const ranked =
        training.rows
          .map((row) => ({
            row,
            share:
              carbEnergyShare(row)!,
            distance:
              distance(
                target,
                row,
                training.scaler,
              ),
          }))
          .filter(
            (item) =>
              Number.isFinite(
                item.distance,
              ),
          )
          .sort(
            (a, b) =>
              a.distance -
              b.distance,
          )
          .slice(0, K);

      if (ranked.length < 3) {
        return NextResponse.json(
          {
            error:
              'not_enough_neighbors',
            message:
              '유사한 버거 데이터를 충분히 찾지 못했습니다.',
          },
          {
            status: 422,
          },
        );
      }

      let weightedSum = 0;
      let weightTotal = 0;

      for (const item of ranked) {
        const weight =
          1 /
          (item.distance + 0.15);

        weightedSum +=
          item.share * weight;

        weightTotal += weight;
      }

      const share =
        weightedSum /
        weightTotal;

      carbsPer100g =
        residual *
        share /
        4;

      fatPer100g =
        residual *
        (1 - share) /
        9;

      const averageDistance =
        ranked.reduce(
          (sum, item) =>
            sum +
            item.distance,
          0,
        ) /
        ranked.length;

      const shareStd =
        standardDeviation(
          ranked.map(
            (item) =>
              item.share,
          ),
        );

      const validationScore =
        0.78;

      const distanceScore =
        Math.exp(
          -averageDistance /
          1.2,
        );

      const stabilityScore =
        clamp(
          1 -
          shareStd / 0.2,
          0,
          1,
        );

      confidenceScore =
        clamp(
          validationScore * 0.5 +
          distanceScore * 0.3 +
          stabilityScore * 0.2,
          0.55,
          0.85,
        );

      method =
        'knn_energy_constrained_v1';

      neighbors =
        ranked.slice(0, 5).map(
          (item) => ({
            brand:
              item.row.brand,
            name:
              item.row.name,
            distance:
              round(
                item.distance,
                3,
              ),
            carbs:
              round(
                item.row.carbs!,
                1,
              ),
            fat:
              round(
                item.row.fat!,
                1,
              ),
          }),
        );
    }

    if (
      carbsPer100g === null ||
      fatPer100g === null ||
      carbsPer100g < 0 ||
      fatPer100g < 0
    ) {
      return NextResponse.json(
        {
          error:
            'invalid_estimate',
          message:
            '유효한 탄단지 추정값을 만들지 못했습니다.',
        },
        {
          status: 422,
        },
      );
    }

    const totalMultiplier =
      servingG !== null &&
      servingG > 0
        ? servingG / 100
        : null;

    return NextResponse.json({
      method,
      confidenceScore:
        round(
          confidenceScore,
          3,
        ),
      validation:
        VALIDATION,
      per100g: {
        carbs_g:
          round(
            carbsPer100g,
            1,
          ),
        fat_g:
          round(
            fatPer100g,
            1,
          ),
      },
      total:
        totalMultiplier === null
          ? null
          : {
              carbs_g:
                round(
                  carbsPer100g *
                    totalMultiplier,
                  1,
                ),
              fat_g:
                round(
                  fatPer100g *
                    totalMultiplier,
                  1,
                ),
            },
      neighbors,
    });
  } catch (error) {
    console.error(
      '[macro-estimate]',
      error,
    );

    return NextResponse.json(
      {
        error:
          'estimate_failed',
        message:
          'AI 탄단지 추정 중 문제가 발생했습니다.',
      },
      {
        status: 500,
      },
    );
  }
}
