import {
  NextRequest,
  NextResponse,
} from 'next/server';

export const runtime = 'nodejs';

const MFDS_API =
  'https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02';

const MEMORY_CACHE_TTL_MS =
  6 * 60 * 60 * 1000;

const UPSTREAM_REVALIDATE_SECONDS =
  6 * 60 * 60;

type NutritionValues = {
  kcal: number | null;
  carbs_g: number | null;
  protein_g: number | null;
  fat_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
  saturated_fat_g: number | null;
};

type MfdsFood = {
  id: string;
  name: string;
  rawName: string;
  brand: string;
  foodGroup: string;
  foodOrigin: string;

  servingG:
    number | null;

  servingDescription:
    string;

  per100g:
    NutritionValues;

  total:
    NutritionValues;

  macroComplete:
    boolean;

  source:
    'MFDS';

  researchDate:
    string | null;

  updatedDate:
    string | null;
};

type MfdsPayload = {
  foods:
    MfdsFood[];

  meta: {
    rawCount:
      number;

    brandCount:
      number;

    incompleteMacroCount:
      number;

    cache:
      | 'miss'
      | 'memory';
  };
};

type CacheEntry = {
  expiresAt:
    number;

  payload:
    MfdsPayload;
};

type UnknownRecord =
  Record<
    string,
    unknown
  >;

const globalForMfds =
  globalThis as
    typeof globalThis & {
      __fittrackMfdsSearchCache?:
        Map<
          string,
          CacheEntry
        >;
    };

const memoryCache =
  globalForMfds
    .__fittrackMfdsSearchCache ??
  new Map<
    string,
    CacheEntry
  >();

globalForMfds
  .__fittrackMfdsSearchCache =
  memoryCache;

function asRecord(
  value: unknown,
): UnknownRecord | null {
  if (
    value &&
    typeof value ===
      'object' &&
    !Array.isArray(
      value,
    )
  ) {
    return value as
      UnknownRecord;
  }

  return null;
}

function normalizeServiceKey(
  value: string,
) {
  try {
    return decodeURIComponent(
      value,
    );
  } catch {
    return value;
  }
}

function parseNumber(
  value: unknown,
): number | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const text =
    String(
      value,
    )
      .replace(
        /,/g,
        '',
      )
      .trim();

  if (
    !text ||
    text === '-' ||
    text === 'N/A'
  ) {
    return null;
  }

  const parsed =
    Number(
      text,
    );

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : null;
}

function firstNumber(
  ...values: unknown[]
): number | null {
  for (
    const value
    of values
  ) {
    const parsed =
      parseNumber(
        value,
      );

    if (
      parsed !== null
    ) {
      return parsed;
    }
  }

  return null;
}

function roundOne(
  value: number,
) {
  return (
    Math.round(
      value * 10,
    ) / 10
  );
}

function scaleNullable(
  value: number | null,
  multiplier: number,
) {
  if (
    value === null
  ) {
    return null;
  }

  return roundOne(
    value *
      multiplier,
  );
}

function parseWeightG(
  value: unknown,
): number | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const text =
    String(
      value,
    )
      .replace(
        /,/g,
        '',
      )
      .trim();

  if (!text) {
    return null;
  }

  const gramMatch =
    text.match(
      /([\d.]+)\s*g\b/i,
    );

  if (
    gramMatch
  ) {
    const parsed =
      Number(
        gramMatch[1],
      );

    return Number.isFinite(
      parsed,
    )
      ? parsed
      : null;
  }

  const kilogramMatch =
    text.match(
      /([\d.]+)\s*kg\b/i,
    );

  if (
    kilogramMatch
  ) {
    const parsed =
      Number(
        kilogramMatch[1],
      );

    return Number.isFinite(
      parsed,
    )
      ? parsed * 1000
      : null;
  }

  return null;
}

function rawServingText(
  item:
    UnknownRecord,
) {
  const candidates = [
    item.Z10500,
    item.NUTRI_AMOUNT_SERVING,
    item.SERVING_SIZE,
  ];

  for (
    const candidate
    of candidates
  ) {
    if (
      candidate ===
        null ||
      candidate ===
        undefined
    ) {
      continue;
    }

    const text =
      String(
        candidate,
      ).trim();

    if (text) {
      return text;
    }
  }

  return '';
}

function isVolumeServing(
  value: string,
) {
  const normalized =
    value
      .replace(
        /,/g,
        '',
      )
      .trim();

  return (
    /[\d.]+\s*(?:ml|㎖)\b/i.test(
      normalized,
    ) ||
    /[\d.]+\s*l\b/i.test(
      normalized,
    ) ||
    /밀리리터/i.test(
      normalized,
    ) ||
    /리터/i.test(
      normalized,
    )
  );
}

function extractItems(
  json: unknown,
): UnknownRecord[] {
  const root =
    asRecord(
      json,
    );

  if (!root) {
    return [];
  }

  const response =
    asRecord(
      root.response,
    );

  const responseBody =
    asRecord(
      response?.body,
    );

  const rootBody =
    asRecord(
      root.body,
    );

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

  for (
    const candidate
    of candidates
  ) {
    if (
      Array.isArray(
        candidate,
      )
    ) {
      return candidate
        .map(
          asRecord,
        )
        .filter(
          (
            item,
          ): item is
            UnknownRecord =>
            item !==
            null,
        );
    }

    const record =
      asRecord(
        candidate,
      );

    if (!record) {
      continue;
    }

    const nested =
      record.item ??
      record.row;

    if (
      Array.isArray(
        nested,
      )
    ) {
      return nested
        .map(
          asRecord,
        )
        .filter(
          (
            item,
          ): item is
            UnknownRecord =>
            item !==
            null,
        );
    }

    const one =
      asRecord(
        nested,
      );

    if (one) {
      return [
        one,
      ];
    }
  }

  for (
    const value
    of Object.values(
      root,
    )
  ) {
    const record =
      asRecord(
        value,
      );

    if (!record) {
      continue;
    }

    for (
      const key
      of [
        'items',
        'item',
        'row',
      ]
    ) {
      const nested =
        record[
          key
        ];

      if (
        Array.isArray(
          nested,
        )
      ) {
        return nested
          .map(
            asRecord,
          )
          .filter(
            (
              item,
            ): item is
              UnknownRecord =>
              item !==
              null,
          );
      }
    }
  }

  return [];
}

function cleanFoodName(
  raw: string,
) {
  let value =
    raw
      .replace(
        /_/g,
        ' ',
      )
      .replace(
        /\s+/g,
        ' ',
      )
      .trim();

  value =
    value.replace(
      /^(버거|햄버거)\s+/,
      '',
    );

  value =
    value.replace(
      /\s+버거$/,
      '',
    );

  return (
    value.trim() ||
    raw
  );
}

function dateScore(
  value: unknown,
) {
  const text =
    String(
      value ??
      '',
    ).trim();

  if (!text) {
    return 0;
  }

  const timestamp =
    Date.parse(
      text,
    );

  return Number.isFinite(
    timestamp,
  )
    ? timestamp
    : 0;
}

function normalizeItem(
  item:
    UnknownRecord,
): MfdsFood | null {
  const rawName =
    String(
      item.FOOD_NM_KR ??
        '',
    ).trim();

  const brand =
    String(
      item.MAKER_NM ??
        '',
    ).trim();

  const id =
    String(
      item.FOOD_CD ??
        '',
    ).trim();

  if (
    !rawName ||
    !brand ||
    !id
  ) {
    return null;
  }

  const originalServing =
    rawServingText(
      item,
    );

  const volumeServing =
    isVolumeServing(
      originalServing,
    );

  /*
   * mL 제품은 g 중량으로 강제로 변환하지 않는다.
   */
  const servingG =
    volumeServing
      ? null
      : (
          parseWeightG(
            item.Z10500,
          ) ??
          parseWeightG(
            item.NUTRI_AMOUNT_SERVING,
          ) ??
          parseWeightG(
            item.SERVING_SIZE,
          )
        );

  const per100g:
    NutritionValues = {
    kcal:
      firstNumber(
        item.AMT_NUM1,
        item.NUTR_CONT1,
      ),

    carbs_g:
      firstNumber(
        item.AMT_NUM6,
        item.NUTR_CONT2,
      ),

    protein_g:
      firstNumber(
        item.AMT_NUM3,
        item.NUTR_CONT3,
      ),

    fat_g:
      firstNumber(
        item.AMT_NUM4,
        item.NUTR_CONT4,
      ),

    sugar_g:
      firstNumber(
        item.AMT_NUM7,
        item.NUTR_CONT5,
      ),

    sodium_mg:
      firstNumber(
        item.AMT_NUM13,
        item.NUTR_CONT6,
      ),

    saturated_fat_g:
      firstNumber(
        item.AMT_NUM24,
        item.NUTR_CONT8,
      ),
  };

  /*
   * g 식품은 실제 제공 중량으로 환산한다.
   *
   * mL 음료는 현재 MFDS 100 기준 영양정보를
   * 화면상 100mL 기준 baseline으로 사용한다.
   */
  const multiplier =
    servingG !==
      null &&
    servingG > 0
      ? servingG /
        100
      : 1;

  const total:
    NutritionValues = {
    kcal:
      per100g.kcal ===
        null
        ? null
        : roundOne(
            per100g.kcal *
              multiplier,
          ),

    carbs_g:
      scaleNullable(
        per100g.carbs_g,
        multiplier,
      ),

    protein_g:
      scaleNullable(
        per100g.protein_g,
        multiplier,
      ),

    fat_g:
      scaleNullable(
        per100g.fat_g,
        multiplier,
      ),

    sugar_g:
      scaleNullable(
        per100g.sugar_g,
        multiplier,
      ),

    sodium_mg:
      scaleNullable(
        per100g.sodium_mg,
        multiplier,
      ),

    saturated_fat_g:
      scaleNullable(
        per100g
          .saturated_fat_g,
        multiplier,
      ),
  };

  const servingDescription =
    volumeServing
      ? (
          originalServing
            ? `100mL 기준 · 원본 ${originalServing}`
            : '100mL 기준'
        )
      : servingG !==
          null
        ? `1개 (${roundOne(
            servingG,
          )}g)`
        : originalServing ||
          '100g 기준';

  return {
    id,

    name:
      cleanFoodName(
        rawName,
      ),

    rawName,

    brand,

    foodGroup:
      String(
        item.DB_GRP_NM ??
          '',
      ).trim(),

    foodOrigin:
      String(
        item.FOOD_OR_NM ??
          '',
      ).trim(),

    servingG,

    servingDescription,

    per100g,

    total,

    macroComplete:
      per100g
        .carbs_g !==
        null &&
      per100g
        .protein_g !==
        null &&
      per100g
        .fat_g !==
        null,

    source:
      'MFDS',

    researchDate:
      item.RESEARCH_YMD
        ? String(
            item.RESEARCH_YMD,
          )
        : null,

    updatedDate:
      item.UPDATE_DATE
        ? String(
            item.UPDATE_DATE,
          )
        : null,
  };
}

function dedupeLatest(
  foods:
    MfdsFood[],
) {
  const map =
    new Map<
      string,
      MfdsFood
    >();

  for (
    const food
    of foods
  ) {
    const key =
      `${food.brand}|${food.name}`
        .toLocaleLowerCase(
          'ko-KR',
        );

    const previous =
      map.get(
        key,
      );

    if (!previous) {
      map.set(
        key,
        food,
      );

      continue;
    }

    const previousScore =
      Math.max(
        dateScore(
          previous.updatedDate,
        ),

        dateScore(
          previous.researchDate,
        ),
      );

    const nextScore =
      Math.max(
        dateScore(
          food.updatedDate,
        ),

        dateScore(
          food.researchDate,
        ),
      );

    if (
      nextScore >
      previousScore
    ) {
      map.set(
        key,
        food,
      );
    }
  }

  return Array.from(
    map.values(),
  );
}

export async function GET(
  req:
    NextRequest,
) {
  const query =
    req.nextUrl
      .searchParams
      .get(
        'q',
      )
      ?.trim() ??
    '';

  if (
    query.length <
    1
  ) {
    return NextResponse.json(
      {
        foods: [],
      },
    );
  }

  const cacheKey =
    query
      .toLocaleLowerCase(
        'ko-KR',
      );

  const cached =
    memoryCache.get(
      cacheKey,
    );

  if (
    cached &&
    cached.expiresAt >
      Date.now()
  ) {
    return NextResponse.json(
      {
        ...cached.payload,

        meta: {
          ...cached
            .payload
            .meta,

          cache:
            'memory',
        },
      },
      {
        headers: {
          'Cache-Control':
            'public, s-maxage=21600, stale-while-revalidate=86400',
        },
      },
    );
  }

  if (cached) {
    memoryCache.delete(
      cacheKey,
    );
  }

  const rawServiceKey =
    process.env
      .MFDS_SERVICE_KEY
      ?.trim();

  if (
    !rawServiceKey
  ) {
    return NextResponse.json(
      {
        error:
          'MFDS_SERVICE_KEY missing',
      },
      {
        status:
          500,
      },
    );
  }

  const params =
    new URLSearchParams({
      serviceKey:
        normalizeServiceKey(
          rawServiceKey,
        ),

      pageNo:
        '1',

      numOfRows:
        '30',

      type:
        'json',

      FOOD_NM_KR:
        query,
    });

  try {
    const response =
      await fetch(
        `${MFDS_API}?${params.toString()}`,
        {
          next: {
            revalidate:
              UPSTREAM_REVALIDATE_SECONDS,
          },

          signal:
            AbortSignal.timeout(
              12000,
            ),
        },
      );

    const responseText =
      await response.text();

    if (
      !response.ok
    ) {
      console.error(
        '[mfds/search] HTTP error',
        response.status,
        responseText,
      );

      return NextResponse.json(
        {
          error:
            'MFDS HTTP error',

          detail:
            responseText.slice(
              0,
              1000,
            ),
        },
        {
          status:
            502,
        },
      );
    }

    let json:
      unknown;

    try {
      json =
        JSON.parse(
          responseText,
        );
    } catch {
      console.error(
        '[mfds/search] invalid JSON',
        responseText,
      );

      return NextResponse.json(
        {
          error:
            'MFDS returned invalid JSON',
        },
        {
          status:
            502,
        },
      );
    }

    const rawItems =
      extractItems(
        json,
      );

    const normalized =
      rawItems
        .map(
          normalizeItem,
        )
        .filter(
          (
            food,
          ): food is
            MfdsFood =>
            food !==
            null,
        );

    const foods =
      dedupeLatest(
        normalized,
      ).sort(
        (
          a,
          b,
        ) => {
          const exactA =
            a.name ===
            query;

          const exactB =
            b.name ===
            query;

          if (
            exactA !==
            exactB
          ) {
            return exactA
              ? -1
              : 1;
          }

          const startsA =
            a.name
              .startsWith(
                query,
              );

          const startsB =
            b.name
              .startsWith(
                query,
              );

          if (
            startsA !==
            startsB
          ) {
            return startsA
              ? -1
              : 1;
          }

          const kcalA =
            a.per100g
              .kcal !==
            null;

          const kcalB =
            b.per100g
              .kcal !==
            null;

          if (
            kcalA !==
            kcalB
          ) {
            return kcalA
              ? -1
              : 1;
          }

          return (
            dateScore(
              b.updatedDate,
            ) -
            dateScore(
              a.updatedDate,
            )
          );
        },
      );

    const payload:
      MfdsPayload = {
        foods,

        meta: {
          rawCount:
            rawItems.length,

          brandCount:
            foods.length,

          incompleteMacroCount:
            foods.filter(
              (
                food,
              ) =>
                !food
                  .macroComplete,
            ).length,

          cache:
            'miss',
        },
      };

    memoryCache.set(
      cacheKey,
      {
        expiresAt:
          Date.now() +
          MEMORY_CACHE_TTL_MS,

        payload,
      },
    );

    return NextResponse.json(
      payload,
      {
        headers: {
          'Cache-Control':
            'public, s-maxage=21600, stale-while-revalidate=86400',
        },
      },
    );
  } catch (
    error
  ) {
    console.error(
      '[mfds/search]',
      error,
    );

    return NextResponse.json(
      {
        error:
          'MFDS request failed',
      },
      {
        status:
          500,
      },
    );
  }
}