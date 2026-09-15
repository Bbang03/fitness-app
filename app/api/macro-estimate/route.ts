import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  createClient,
} from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL =
  process.env.GEMINI_NUTRITION_MODEL?.trim() ||
  'gemini-3.5-flash-lite';

const GEMINI_ENDPOINT =
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const CACHE_SOURCE =
  'CHAGOK AI + MFDS';

const MAX_ATTEMPTS = 2;

type TargetPayload = {
  id?: string;
  rawName?: string;
  name?: string;
  brand?: string;
  foodGroup?: string;

  servingG?: number | null;
  servingDescription?: string | null;

  kcalPer100g?: number | null;
  proteinPer100g?: number | null;
  carbsPer100g?: number | null;
  fatPer100g?: number | null;

  sugarPer100g?: number | null;
  sodiumPer100g?: number | null;
  saturatedFatPer100g?: number | null;
};

type GeminiShareEstimate = {
  carb_energy_share: number;
  confidence: number;
  reasoning: string;
};

type CachedBrandFood = {
  id: string;
  external_id: string | null;
  serving_g: number | null;
  kcal: number;
  carbs_g: number | null;
  protein_g: number | null;
  fat_g: number | null;
  macro_status: string;
  macro_confidence: number | null;
  macro_provenance:
    | Record<string, unknown>
    | null;
};

function nullableNumber(
  value: unknown,
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const parsed =
    Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function round(
  value: number,
  digits = 1,
) {
  const factor =
    10 ** digits;

  return (
    Math.round(
      value * factor,
    ) / factor
  );
}

function clamp(
  value: number,
  min: number,
  max: number,
) {
  return Math.max(
    min,
    Math.min(
      max,
      value,
    ),
  );
}

function toPer100g(
  value: number | null,
  servingG: number | null,
) {
  if (
    value === null ||
    servingG === null ||
    servingG <= 0
  ) {
    return null;
  }

  return (
    value * 100 /
    servingG
  );
}

function closeEnough(
  actual: number,
  expected: number,
  minimumTolerance: number,
  ratioTolerance: number,
) {
  const tolerance =
    Math.max(
      minimumTolerance,
      Math.abs(
        expected,
      ) * ratioTolerance,
    );

  return (
    Math.abs(
      actual -
      expected,
    ) <= tolerance
  );
}

function getSupabaseAdmin() {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

  const secret =
    process.env.SUPABASE_SECRET_KEY?.trim();

  if (
    !url ||
    !secret
  ) {
    return null;
  }

  return createClient(
    url,
    secret,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

const responseSchema = {
  type: 'OBJECT',

  properties: {
    carb_energy_share: {
      type: 'NUMBER',
    },

    confidence: {
      type: 'NUMBER',
    },

    reasoning: {
      type: 'STRING',
    },
  },

  required: [
    'carb_energy_share',
    'confidence',
    'reasoning',
  ],
};

async function requestGemini(
  apiKey: string,
  prompt: string,
) {
  const requestBody =
    JSON.stringify({
      contents: [
        {
          role: 'user',

          parts: [
            {
              text: prompt,
            },
          ],
        },
      ],

      generationConfig: {
        temperature: 0.1,

        responseMimeType:
          'application/json',

        responseSchema,
      },
    });

  let response:
    | Response
    | undefined;

  for (
    let attempt = 0;
    attempt < MAX_ATTEMPTS;
    attempt++
  ) {
    try {
      response =
        await fetch(
          `${GEMINI_ENDPOINT}?key=${apiKey}`,
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              requestBody,

            signal:
              AbortSignal.timeout(
                20_000,
              ),
          },
        );
    } catch {
      response =
        undefined;
    }

    if (
      response?.ok
    ) {
      break;
    }

    const transient =
      !response ||
      response.status === 408 ||
      response.status === 429 ||
      response.status >= 500;

    if (
      !transient ||
      attempt ===
        MAX_ATTEMPTS - 1
    ) {
      break;
    }

    await new Promise(
      (
        resolve,
      ) => {
        setTimeout(
          resolve,
          response?.status === 429
            ? 4000
            : 1200,
        );
      },
    );
  }

  return response;
}

async function readCachedEstimate({
  externalId,
  servingG,
  kcalPer100g,
  proteinPer100g,
}: {
  externalId: string;
  servingG: number | null;
  kcalPer100g: number;
  proteinPer100g: number;
}) {
  if (
    !externalId ||
    servingG === null ||
    servingG <= 0
  ) {
    return null;
  }

  const supabase =
    getSupabaseAdmin();

  if (!supabase) {
    return null;
  }

  const {
    data,
    error,
  } =
    await supabase
      .from(
        'brand_foods',
      )
      .select(`
        id,
        external_id,
        serving_g,
        kcal,
        carbs_g,
        protein_g,
        fat_g,
        macro_status,
        macro_confidence,
        macro_provenance
      `)
      .eq(
        'source_name',
        CACHE_SOURCE,
      )
      .eq(
        'external_id',
        externalId,
      )
      .eq(
        'is_active',
        true,
      )
      .maybeSingle();

  if (
    error ||
    !data
  ) {
    if (error) {
      console.warn(
        '[macro-estimate] cache read failed',
        error.message,
      );
    }

    return null;
  }

  const row =
    data as CachedBrandFood;

  if (
    row.macro_status !==
      'ai_estimated'
  ) {
    return null;
  }

  const cachedServing =
    nullableNumber(
      row.serving_g,
    );

  const cachedKcal =
    nullableNumber(
      row.kcal,
    );

  const cachedProtein =
    nullableNumber(
      row.protein_g,
    );

  const cachedCarbs =
    nullableNumber(
      row.carbs_g,
    );

  const cachedFat =
    nullableNumber(
      row.fat_g,
    );

  if (
    cachedServing === null ||
    cachedKcal === null ||
    cachedProtein === null ||
    cachedCarbs === null ||
    cachedFat === null
  ) {
    return null;
  }

  /*
   * MFDS 원본이 나중에 수정됐을 수 있으므로
   * 현재 요청과 저장된 캐시의 기준량 / kcal /
   * 단백질이 크게 다르면 캐시를 버린다.
   */
  if (
    !closeEnough(
      cachedServing,
      servingG,
      5,
      0.05,
    )
  ) {
    return null;
  }

  const multiplier =
    servingG / 100;

  const expectedKcal =
    kcalPer100g *
    multiplier;

  const expectedProtein =
    proteinPer100g *
    multiplier;

  if (
    !closeEnough(
      cachedKcal,
      expectedKcal,
      5,
      0.08,
    ) ||
    !closeEnough(
      cachedProtein,
      expectedProtein,
      1,
      0.1,
    )
  ) {
    return null;
  }

  const carbsPer100g =
    toPer100g(
      cachedCarbs,
      cachedServing,
    );

  const fatPer100g =
    toPer100g(
      cachedFat,
      cachedServing,
    );

  if (
    carbsPer100g === null ||
    fatPer100g === null
  ) {
    return null;
  }

  const provenance =
    row.macro_provenance &&
    typeof row.macro_provenance ===
      'object'
      ? row.macro_provenance
      : {};

  return {
    method:
      typeof provenance.method ===
        'string'
        ? provenance.method
        : 'cached_ai_estimate',

    confidenceScore:
      clamp(
        nullableNumber(
          row.macro_confidence,
        ) ?? 0.7,
        0,
        1,
      ),

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

    total: {
      carbs_g:
        round(
          cachedCarbs,
          1,
        ),

      fat_g:
        round(
          cachedFat,
          1,
        ),
    },

    meta: {
      source:
        'database_cache',

      cached:
        true,

      model:
        typeof provenance.model ===
          'string'
          ? provenance.model
          : null,

      reasoning:
        typeof provenance.reasoning ===
          'string'
          ? provenance.reasoning
          : '',

      energyGapRatio:
        nullableNumber(
          provenance.energy_gap_ratio,
        ),

      officialMissing:
        Array.isArray(
          provenance.official_missing,
        )
          ? provenance.official_missing
          : [],
    },
  };
}

async function saveEstimateToCache({
  body,
  carbsPer100g,
  fatPer100g,
  confidenceScore,
  method,
  reasoning,
  energyGapRatio,
  usedGemini,
  officialMissing,
}: {
  body: TargetPayload;
  carbsPer100g: number;
  fatPer100g: number;
  confidenceScore: number;
  method: string;
  reasoning: string;
  energyGapRatio: number;
  usedGemini: boolean;
  officialMissing: string[];
}) {
  const externalId =
    String(
      body.id ?? '',
    ).trim();

  const name =
    String(
      body.name ??
      body.rawName ??
      '',
    ).trim();

  const rawName =
    String(
      body.rawName ?? '',
    ).trim();

  const brand =
    String(
      body.brand ?? '',
    ).trim();

  const foodGroup =
    String(
      body.foodGroup ?? '',
    ).trim();

  const servingG =
    nullableNumber(
      body.servingG,
    );

  const kcalPer100g =
    nullableNumber(
      body.kcalPer100g,
    );

  const proteinPer100g =
    nullableNumber(
      body.proteinPer100g,
    );

  const sugarPer100g =
    nullableNumber(
      body.sugarPer100g,
    );

  const sodiumPer100g =
    nullableNumber(
      body.sodiumPer100g,
    );

  const saturatedFatPer100g =
    nullableNumber(
      body.saturatedFatPer100g,
    );

  /*
   * 현재 brand_foods는 1회/제품 기준 값을 저장하고
   * 프론트에서 serving_g를 이용해 100g으로 환산한다.
   * 따라서 servingG가 없는 음식은 영구 캐시하지 않는다.
   */
  if (
    !externalId ||
    !name ||
    servingG === null ||
    servingG <= 0 ||
    kcalPer100g === null ||
    proteinPer100g === null
  ) {
    return false;
  }

  const supabase =
    getSupabaseAdmin();

  if (!supabase) {
    console.warn(
      '[macro-estimate] Supabase admin env missing; estimate will not be cached.',
    );

    return false;
  }

  const multiplier =
    servingG / 100;

  const now =
    new Date();

  const today =
    now
      .toISOString()
      .slice(
        0,
        10,
      );

  const servingDescription =
    String(
      body.servingDescription ??
      '',
    ).trim() ||
    `기준량 ${round(
      servingG,
      1,
    )}g`;

  const aliases =
    rawName &&
    rawName !== name
      ? [
          rawName,
        ]
      : [];

  const cacheRow = {
    external_id:
      externalId,

    brand_name:
      brand ||
      'MFDS',

    menu_name:
      name,

    serving_desc:
      servingDescription,

    serving_g:
      round(
        servingG,
        1,
      ),

    /*
     * brand_foods의 영양값은 serving_g 기준 총량.
     */
    kcal:
      round(
        kcalPer100g *
          multiplier,
        1,
      ),

    carbs_g:
      round(
        carbsPer100g *
          multiplier,
        1,
      ),

    protein_g:
      round(
        proteinPer100g *
          multiplier,
        1,
      ),

    fat_g:
      round(
        fatPer100g *
          multiplier,
        1,
      ),

    sugar_g:
      sugarPer100g === null
        ? null
        : round(
            sugarPer100g *
              multiplier,
            1,
          ),

    sodium_mg:
      sodiumPer100g === null
        ? null
        : round(
            sodiumPer100g *
              multiplier,
            1,
          ),

    saturated_fat_g:
      saturatedFatPer100g === null
        ? null
        : round(
            saturatedFatPer100g *
              multiplier,
            1,
          ),

    aliases,

    source_name:
      CACHE_SOURCE,

    source_url:
      null,

    source_checked_at:
      today,

    source_updated_at:
      null,

    is_active:
      true,

    macro_status:
      'ai_estimated',

    macro_confidence:
      round(
        confidenceScore,
        3,
      ),

    macro_provenance: {
      provider:
        usedGemini
          ? 'gemini'
          : 'chagok_energy_constraint',

      model:
        usedGemini
          ? MODEL
          : null,

      method,

      reasoning,

      official_missing:
        officialMissing,

      energy_gap_ratio:
        round(
          energyGapRatio,
          4,
        ),

      mfds_food_id:
        externalId,

      food_group:
        foodGroup || null,

      generated_at:
        now.toISOString(),

      per100g: {
        kcal:
          kcalPer100g,

        protein_g:
          proteinPer100g,

        carbs_g:
          carbsPer100g,

        fat_g:
          fatPer100g,

        sugar_g:
          sugarPer100g,

        sodium_mg:
          sodiumPer100g,

        saturated_fat_g:
          saturatedFatPer100g,
      },
    },

    updated_at:
      now.toISOString(),
  };

  /*
   * partial unique index 때문에 단순 upsert 대신
   * source_name + external_id로 기존 행을 먼저 찾고
   * update / insert를 나눈다.
   */
  const {
    data: existing,
    error: existingError,
  } =
    await supabase
      .from(
        'brand_foods',
      )
      .select(
        'id',
      )
      .eq(
        'source_name',
        CACHE_SOURCE,
      )
      .eq(
        'external_id',
        externalId,
      )
      .maybeSingle();

  if (existingError) {
    console.warn(
      '[macro-estimate] cache lookup before write failed',
      existingError.message,
    );

    return false;
  }

  if (existing?.id) {
    const {
      error,
    } =
      await supabase
        .from(
          'brand_foods',
        )
        .update(
          cacheRow,
        )
        .eq(
          'id',
          existing.id,
        );

    if (error) {
      console.warn(
        '[macro-estimate] cache update failed',
        error.message,
      );

      return false;
    }

    return true;
  }

  const {
    error,
  } =
    await supabase
      .from(
        'brand_foods',
      )
      .insert(
        cacheRow,
      );

  if (error) {
    console.warn(
      '[macro-estimate] cache insert failed',
      error.message,
    );

    return false;
  }

  return true;
}

export async function POST(
  request: NextRequest,
) {
  try {
    const body =
      (
        await request.json()
      ) as TargetPayload;

    const name =
      String(
        body.name ??
        body.rawName ??
        '',
      ).trim();

    const rawName =
      String(
        body.rawName ?? '',
      ).trim();

    const brand =
      String(
        body.brand ?? '',
      ).trim();

    const foodGroup =
      String(
        body.foodGroup ?? '',
      ).trim();

    const externalId =
      String(
        body.id ?? '',
      ).trim();

    if (!name) {
      return NextResponse.json(
        {
          error:
            'missing_food_name',

          message:
            '음식 이름이 필요합니다.',
        },
        {
          status: 400,
        },
      );
    }

    const servingG =
      nullableNumber(
        body.servingG,
      );

    const kcal =
      nullableNumber(
        body.kcalPer100g,
      );

    const protein =
      nullableNumber(
        body.proteinPer100g,
      );

    const officialCarbs =
      nullableNumber(
        body.carbsPer100g,
      );

    const officialFat =
      nullableNumber(
        body.fatPer100g,
      );

    const sugar =
      nullableNumber(
        body.sugarPer100g,
      );

    const sodium =
      nullableNumber(
        body.sodiumPer100g,
      );

    const saturatedFat =
      nullableNumber(
        body.saturatedFatPer100g,
      );

    if (
      officialCarbs !== null &&
      officialFat !== null
    ) {
      return NextResponse.json(
        {
          error:
            'nothing_to_estimate',

          message:
            '탄수화물과 지방 정보가 이미 존재합니다.',
        },
        {
          status: 400,
        },
      );
    }

    if (
      kcal === null ||
      kcal <= 0 ||
      protein === null ||
      protein < 0
    ) {
      return NextResponse.json(
        {
          error:
            'insufficient_features',

          message:
            '영양정보 보정을 위해 열량과 단백질 정보가 필요합니다.',
        },
        {
          status: 400,
        },
      );
    }

    /*
     * 동일한 MFDS 음식에 대해 이미 보정한 값이 있으면
     * Gemini를 호출하지 않고 DB 캐시를 즉시 반환한다.
     */
    const cached =
      await readCachedEstimate({
        externalId,
        servingG,
        kcalPer100g:
          kcal,
        proteinPer100g:
          protein,
      });

    if (cached) {
      return NextResponse.json({
        ...cached,

        validation: {
          carbMaePer100g:
            null,

          fatMaePer100g:
            null,

          evaluated:
            0,

          strategy:
            cached.method,
        },

        neighbors: [],
      });
    }

    const residualKcal =
      kcal -
      protein * 4;

    if (
      residualKcal <= 0
    ) {
      return NextResponse.json(
        {
          error:
            'invalid_energy',

          message:
            '영양정보의 열량 관계가 유효하지 않습니다.',
        },
        {
          status: 422,
        },
      );
    }

    let carbsPer100g:
      number | null =
        officialCarbs;

    let fatPer100g:
      number | null =
        officialFat;

    let method =
      'energy_constraint';

    let confidenceScore =
      0.95;

    let reasoning =
      '';

    let usedGemini =
      false;

    let rawCarbEnergyShare:
      number | null =
        null;

    let finalCarbEnergyShare:
      number | null =
        null;

    /*
     * 탄수 공식값 O / 지방 X
     * → Gemini 없이 에너지 식으로 지방 계산.
     */
    if (
      carbsPer100g !== null &&
      fatPer100g === null
    ) {
      fatPer100g =
        (
          residualKcal -
          carbsPer100g * 4
        ) / 9;

      method =
        'energy_constraint_fat';

      reasoning =
        '공식 열량·단백질·탄수화물 값으로 누락된 지방을 계산했습니다.';
    }

    /*
     * 지방 공식값 O / 탄수 X
     * → Gemini 없이 에너지 식으로 탄수 계산.
     */
    else if (
      fatPer100g !== null &&
      carbsPer100g === null
    ) {
      carbsPer100g =
        (
          residualKcal -
          fatPer100g * 9
        ) / 4;

      method =
        'energy_constraint_carbs';

      reasoning =
        '공식 열량·단백질·지방 값으로 누락된 탄수화물을 계산했습니다.';
    }

    /*
     * 탄수 X / 지방 X
     * → 음식 종류를 가리지 않고 Gemini가
     *   탄수/지방 에너지 분배 비율을 판단.
     *
     * 실제 g 값은 Gemini가 직접 결정하지 않고
     * 공식 kcal + protein으로 서버가 계산한다.
     */
    else if (
      carbsPer100g === null &&
      fatPer100g === null
    ) {
      const apiKey =
        process.env
          .GEMINI_NUTRITION_API_KEY
          ?.trim();

      if (!apiKey) {
        return NextResponse.json(
          {
            error:
              'missing_api_key',

            message:
              '영양 추정용 Gemini API 키가 설정되지 않았습니다.',
          },
          {
            status: 500,
          },
        );
      }

      const prompt = `
너는 CHAGOK의 범용 식품 영양정보 보완 시스템이다.

이 기능은 햄버거 전용이 아니다.
김밥, 밥류, 면류, 떡류, 치킨, 피자, 샌드위치,
빵, 디저트, 한식, 중식, 일식, 양식, 가공식품,
프랜차이즈 음식 등 모든 종류의 음식을 대상으로 한다.

식품의 공식 영양 데이터에서
100g 기준 탄수화물과 지방 값이 모두 누락되었다.

네 역할은 탄수화물과 지방의 g 수치를 임의로 만들어내는 것이 아니라,
음식 종류와 알려진 공식 정보를 바탕으로
단백질을 제외한 남은 열량에서
탄수화물이 차지할 에너지 비율을 추정하는 것이다.

[음식 정보]

음식명:
${name}

원본 음식명:
${rawName || '정보 없음'}

제조사 또는 브랜드:
${brand || '정보 없음'}

식품군:
${foodGroup || '정보 없음'}

[공식 영양정보 / 100g]

열량:
${kcal} kcal

단백질:
${protein} g

탄수화물:
누락

지방:
누락

당류:
${
  sugar === null
    ? '정보 없음'
    : `${sugar} g`
}

나트륨:
${
  sodium === null
    ? '정보 없음'
    : `${sodium} mg`
}

포화지방:
${
  saturatedFat === null
    ? '정보 없음'
    : `${saturatedFat} g`
}

단백질을 제외한 남은 열량:
${round(
  residualKcal,
  2,
)} kcal

carb_energy_share는
이 남은 열량 중 탄수화물이 차지하는 에너지 비율이다.

예를 들어 carb_energy_share=0.70이면
남은 열량의 70%를 탄수화물,
30%를 지방으로 배분한다.

규칙:

1. carb_energy_share는 반드시 0~1 사이 숫자다.

2. 음식 종류와 일반적인 조리법을 최우선으로 고려한다.

3. 제조사명만 보고 특정 제품의 정확한 영양성분을 안다고 가정하지 않는다.

4. 당류가 알려져 있다면 최종 탄수화물은 당류보다 작을 수 없다.

5. 포화지방이 알려져 있다면 최종 지방은 포화지방보다 작을 수 없다.

6. 밥·면·떡·빵처럼 일반적으로 탄수화물 비중이 높은 음식과,
튀김·크림·치즈·지방이 많은 음식의 차이를 반영한다.

7. 한식, 외식, 가공식품 등 음식군에 맞는 일반적인 영양 구성을 참고한다.

8. 근거가 약하거나 음식명이 모호하면 confidence를 낮춘다.

9. confidence는 0~1 사이 숫자다.

10. reasoning은 판단 근거를 한국어 한 문장으로 짧게 작성한다.

11. 다른 영양소 값을 새로 생성하지 않는다.
`;

      const response =
        await requestGemini(
          apiKey,
          prompt,
        );

      if (!response) {
        return NextResponse.json(
          {
            error:
              'gemini_connection_failed',

            message:
              'AI 영양 추정 서버에 연결하지 못했습니다.',
          },
          {
            status: 502,
          },
        );
      }

      if (!response.ok) {
        const detail =
          await response
            .text()
            .catch(
              () => '',
            );

        console.error(
          '[macro-estimate] Gemini error',
          response.status,
          detail.slice(
            0,
            500,
          ),
        );

        return NextResponse.json(
          {
            error:
              'gemini_error',

            message:
              response.status === 429
                ? 'AI 요청 한도에 도달했습니다. 잠시 후 다시 시도해주세요.'
                : 'AI 영양정보 추정에 실패했습니다.',
          },
          {
            status:
              response.status === 429
                ? 429
                : 502,
          },
        );
      }

      const json =
        await response.json();

      const text:
        | string
        | undefined =
        json?.candidates?.[0]
          ?.content
          ?.parts?.find(
            (
              part: {
                text?: unknown;
              },
            ) =>
              typeof part.text ===
              'string',
          )?.text;

      if (!text) {
        return NextResponse.json(
          {
            error:
              'empty_response',

            message:
              'AI 추정 결과가 비어 있습니다.',
          },
          {
            status: 502,
          },
        );
      }

      let parsed:
        GeminiShareEstimate;

      try {
        parsed =
          JSON.parse(
            text,
          );
      } catch {
        return NextResponse.json(
          {
            error:
              'invalid_response',

            message:
              'AI 추정 결과를 해석하지 못했습니다.',
          },
          {
            status: 502,
          },
        );
      }

      const parsedShare =
        nullableNumber(
          parsed
            .carb_energy_share,
        );

      if (
        parsedShare === null ||
        parsedShare < 0 ||
        parsedShare > 1
      ) {
        return NextResponse.json(
          {
            error:
              'invalid_estimate',

            message:
              'AI가 유효한 탄수·지방 비율을 만들지 못했습니다.',
          },
          {
            status: 422,
          },
        );
      }

      rawCarbEnergyShare =
        parsedShare;

      /*
       * 공식 당류가 있으면
       * 탄수 >= 당류 제약.
       */
      let minShare =
        0;

      if (
        sugar !== null &&
        sugar >= 0
      ) {
        const sugarShare =
          (
            sugar * 4
          ) /
          residualKcal;

        if (
          sugarShare >
          1.05
        ) {
          return NextResponse.json(
            {
              error:
                'source_energy_conflict',

              message:
                '공식 당류와 열량 정보가 서로 맞지 않아 자동 보정을 적용하지 않았습니다.',
            },
            {
              status: 422,
            },
          );
        }

        minShare =
          clamp(
            sugarShare,
            0,
            1,
          );
      }

      /*
       * 공식 포화지방이 있으면
       * 지방 >= 포화지방 제약.
       */
      let maxShare =
        1;

      if (
        saturatedFat !== null &&
        saturatedFat >= 0
      ) {
        const maxAllowed =
          1 -
          (
            saturatedFat *
            9
          ) /
            residualKcal;

        if (
          maxAllowed <
          -0.05
        ) {
          return NextResponse.json(
            {
              error:
                'source_energy_conflict',

              message:
                '공식 포화지방과 열량 정보가 서로 맞지 않아 자동 보정을 적용하지 않았습니다.',
            },
            {
              status: 422,
            },
          );
        }

        maxShare =
          clamp(
            maxAllowed,
            0,
            1,
          );
      }

      if (
        minShare >
        maxShare
      ) {
        return NextResponse.json(
          {
            error:
              'source_constraint_conflict',

            message:
              '공식 영양정보 사이에 충돌이 있어 자동 보정을 적용할 수 없습니다.',
          },
          {
            status: 422,
          },
        );
      }

      const constrainedShare =
        clamp(
          parsedShare,
          minShare,
          maxShare,
        );

      finalCarbEnergyShare =
        constrainedShare;

      carbsPer100g =
        (
          residualKcal *
          constrainedShare
        ) / 4;

      fatPer100g =
        (
          residualKcal *
          (
            1 -
            constrainedShare
          )
        ) / 9;

      const modelConfidence =
        clamp(
          nullableNumber(
            parsed.confidence,
          ) ??
            0.6,
          0.2,
          0.95,
        );

      const shareAdjustment =
        Math.abs(
          constrainedShare -
          parsedShare,
        );

      confidenceScore =
        clamp(
          modelConfidence *
            (
              1 -
              Math.min(
                shareAdjustment *
                  1.2,
                0.35,
              )
            ),
          0.3,
          0.95,
        );

      method =
        'gemini_energy_constrained_v2';

      reasoning =
        String(
          parsed.reasoning ??
          '',
        ).trim();

      usedGemini =
        true;
    }

    /*
     * 공식 당류 / 포화지방 하한 검증.
     */
    if (
      carbsPer100g !== null &&
      sugar !== null &&
      carbsPer100g + 0.2 <
        sugar
    ) {
      return NextResponse.json(
        {
          error:
            'carb_constraint_failed',

          message:
            '계산된 탄수화물이 공식 당류보다 작아 자동 보정을 사용하지 않았습니다.',
        },
        {
          status: 422,
        },
      );
    }

    if (
      fatPer100g !== null &&
      saturatedFat !== null &&
      fatPer100g + 0.2 <
        saturatedFat
    ) {
      return NextResponse.json(
        {
          error:
            'fat_constraint_failed',

          message:
            '계산된 지방이 공식 포화지방보다 작아 자동 보정을 사용하지 않았습니다.',
        },
        {
          status: 422,
        },
      );
    }

    if (
      carbsPer100g === null ||
      fatPer100g === null ||
      !Number.isFinite(
        carbsPer100g,
      ) ||
      !Number.isFinite(
        fatPer100g,
      ) ||
      carbsPer100g < 0 ||
      fatPer100g < 0 ||
      carbsPer100g > 100 ||
      fatPer100g > 100
    ) {
      return NextResponse.json(
        {
          error:
            'invalid_estimate',

          message:
            '유효한 탄수화물·지방 보정값을 만들지 못했습니다.',
        },
        {
          status: 422,
        },
      );
    }

    carbsPer100g =
      round(
        carbsPer100g,
        1,
      );

    fatPer100g =
      round(
        fatPer100g,
        1,
      );

    const calculatedKcal =
      protein * 4 +
      carbsPer100g * 4 +
      fatPer100g * 9;

    const energyGapRatio =
      Math.abs(
        calculatedKcal -
        kcal,
      ) / kcal;

    if (
      energyGapRatio >
      0.2
    ) {
      return NextResponse.json(
        {
          error:
            'energy_validation_failed',

          message:
            '보정값이 공식 열량과 충분히 일치하지 않아 사용하지 않았습니다.',
        },
        {
          status: 422,
        },
      );
    }

    const officialMissing:
      string[] =
      [];

    if (
      officialCarbs === null
    ) {
      officialMissing.push(
        'carbs_g',
      );
    }

    if (
      officialFat === null
    ) {
      officialMissing.push(
        'fat_g',
      );
    }

    /*
     * 보정이 성공하면 DB에 영구 캐시한다.
     * 저장 실패가 사용자 요청 자체를 실패시키지는 않는다.
     */
    const cachedToDatabase =
      await saveEstimateToCache({
        body,
        carbsPer100g,
        fatPer100g,
        confidenceScore,
        method,
        reasoning,
        energyGapRatio,
        usedGemini,
        officialMissing,
      });

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

      /*
       * 기존 프론트가 아직 이 필드를 읽고 있으므로
       * 다음 단계에서 UI를 바꾸기 전까지 호환용으로 유지.
       */
      validation: {
        carbMaePer100g:
          null,

        fatMaePer100g:
          null,

        evaluated:
          0,

        strategy:
          method,
      },

      per100g: {
        carbs_g:
          carbsPer100g,

        fat_g:
          fatPer100g,
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

      neighbors: [],

      meta: {
        source:
          usedGemini
            ? 'gemini'
            : 'official_energy_constraint',

        cached:
          false,

        cachedToDatabase,

        model:
          usedGemini
            ? MODEL
            : null,

        reasoning,

        energyGapRatio:
          round(
            energyGapRatio,
            4,
          ),

        rawCarbEnergyShare,
        finalCarbEnergyShare,

        officialMissing,

        food: {
          id:
            externalId,

          name,

          rawName,

          brand,

          foodGroup,
        },

        official: {
          kcal,

          protein_g:
            protein,

          carbs_g:
            officialCarbs,

          fat_g:
            officialFat,

          sugar_g:
            sugar,

          saturated_fat_g:
            saturatedFat,

          sodium_mg:
            sodium,
        },
      },
    });
  } catch (
    error
  ) {
    console.error(
      '[macro-estimate]',
      error,
    );

    return NextResponse.json(
      {
        error:
          'estimate_failed',

        message:
          '영양정보 자동 보정 중 문제가 발생했습니다.',
      },
      {
        status: 500,
      },
    );
  }
}