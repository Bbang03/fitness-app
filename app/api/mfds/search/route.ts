import {
  NextRequest,
  NextResponse,
} from 'next/server';

export const runtime = 'nodejs';

const MFDS_API =
  'https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02';

const MEMORY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const UPSTREAM_REVALIDATE_SECONDS = 6 * 60 * 60;

type MfdsPayload = {
  foods: MfdsFood[];
  meta: {
    rawCount: number;
    brandCount: number;
    incompleteMacroCount: number;
    cache: 'miss' | 'memory';
  };
};

type CacheEntry = {
  expiresAt: number;
  payload: MfdsPayload;
};

const globalForMfds = globalThis as typeof globalThis & {
  __fittrackMfdsSearchCache?: Map<string, CacheEntry>;
};

const memoryCache =
  globalForMfds.__fittrackMfdsSearchCache ??
  new Map<string, CacheEntry>();

globalForMfds.__fittrackMfdsSearchCache = memoryCache;

type UnknownRecord =
  Record<string, unknown>;

type MfdsFood = {
  id: string;
  name: string;
  rawName: string;
  brand: string;
  foodGroup: string;
  foodOrigin: string;
  servingG: number | null;
  servingDescription: string;
  per100g: {
    kcal: number | null;
    carbs_g: number | null;
    protein_g: number | null;
    fat_g: number | null;
    sugar_g: number | null;
    sodium_mg: number | null;
    saturated_fat_g: number | null;
  };
  total: {
    kcal: number | null;
    carbs_g: number | null;
    protein_g: number | null;
    fat_g: number | null;
    sugar_g: number | null;
    sodium_mg: number | null;
    saturated_fat_g: number | null;
  } | null;
  macroComplete: boolean;
  source: 'MFDS';
  researchDate: string | null;
  updatedDate: string | null;
};

function asRecord(
  value: unknown,
): UnknownRecord | null {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value)
  ) {
    return value as UnknownRecord;
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
    String(value)
      .replace(/,/g, '')
      .trim();

  if (!text) {
    return null;
  }

  const parsed =
    Number(text);

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : null;
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
  if (value === null) {
    return null;
  }

  return roundOne(
    value * multiplier,
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
    String(value)
      .replace(/,/g, '')
      .trim();

  if (!text) {
    return null;
  }

  const match =
    text.match(
      /([\d.]+)\s*g\b/i,
    );

  if (!match) {
    return null;
  }

  const parsed =
    Number(match[1]);

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : null;
}

function extractItems(
  json: unknown,
): UnknownRecord[] {
  const root =
    asRecord(json);

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
        .map(asRecord)
        .filter(
          (
            item,
          ): item is UnknownRecord =>
            item !== null,
        );
    }

    const record =
      asRecord(
        candidate,
      );

    if (record) {
      const nested =
        record.item ??
        record.row;

      if (
        Array.isArray(
          nested,
        )
      ) {
        return nested
          .map(asRecord)
          .filter(
            (
              item,
            ): item is UnknownRecord =>
              item !== null,
          );
      }

      const one =
        asRecord(
          nested,
        );

      if (one) {
        return [one];
      }
    }
  }

  for (
    const value
    of Object.values(
      root,
    )
  ) {
    const record =
      asRecord(value);

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
        record[key];

      if (
        Array.isArray(
          nested,
        )
      ) {
        return nested
          .map(asRecord)
          .filter(
            (
              item,
            ): item is UnknownRecord =>
              item !== null,
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
      .replace(/_/g, ' ')
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
      value ?? '',
    ).trim();

  if (!text) {
    return 0;
  }

  const timestamp =
    Date.parse(text);

  return Number.isFinite(
    timestamp,
  )
    ? timestamp
    : 0;
}

function normalizeItem(
  item: UnknownRecord,
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

  const servingG =
    parseWeightG(
      item.Z10500,
    ) ??
    parseWeightG(
      item.NUTRI_AMOUNT_SERVING,
    );

  const per100g = {
    kcal:
      parseNumber(
        item.AMT_NUM1,
      ),

    protein_g:
      parseNumber(
        item.AMT_NUM3,
      ),

    fat_g:
      parseNumber(
        item.AMT_NUM4,
      ),

    carbs_g:
      parseNumber(
        item.AMT_NUM6,
      ),

    sugar_g:
      parseNumber(
        item.AMT_NUM7,
      ),

    sodium_mg:
      parseNumber(
        item.AMT_NUM13,
      ),

    saturated_fat_g:
      parseNumber(
        item.AMT_NUM24,
      ),
  };

  const multiplier =
    servingG !== null
      ? servingG / 100
      : null;

  const total =
    multiplier !== null
      ? {
          kcal:
            per100g.kcal === null
              ? null
              : Math.round(
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
              per100g.saturated_fat_g,
              multiplier,
            ),
        }
      : null;

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

    servingDescription:
      servingG !== null
        ? `1개 (${roundOne(
            servingG,
          )}g)`
        : String(
            item.Z10500 ??
              item.NUTRI_AMOUNT_SERVING ??
              item.SERVING_SIZE ??
              '1회',
          ).trim(),

    per100g,

    total,

    macroComplete:
      per100g.carbs_g !==
        null &&
      per100g.protein_g !==
        null &&
      per100g.fat_g !==
        null,

    source: 'MFDS',

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
  foods: MfdsFood[],
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
        .toLowerCase();

    const previous =
      map.get(key);

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
  req: NextRequest,
) {
  const query =
    req.nextUrl
      .searchParams
      .get('q')
      ?.trim() ??
    '';

  if (
    query.length < 1
  ) {
    return NextResponse.json(
      {
        foods: [],
      },
    );
  }

  const cacheKey =
    query.toLocaleLowerCase(
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
          ...cached.payload.meta,
          cache: 'memory',
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

  if (!rawServiceKey) {
    return NextResponse.json(
      {
        error:
          'MFDS_SERVICE_KEY missing',
      },
      {
        status: 500,
      },
    );
  }

  const params =
    new URLSearchParams({
      serviceKey:
        normalizeServiceKey(
          rawServiceKey,
        ),

      pageNo: '1',

      // 검색 UI에서 충분한 후보 수만 가져온다.
      // 기존 50건보다 응답 크기를 줄인다.
      numOfRows: '30',

      type: 'json',

      FOOD_NM_KR:
        query,
    });

  try {
    const response =
      await fetch(
        `${MFDS_API}?${params.toString()}`,
        {
          // Next/Vercel 데이터 캐시도 함께 사용한다.
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

    if (!response.ok) {
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
          status: 502,
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
          status: 502,
        },
      );
    }

    const rawItems =
      extractItems(
        json,
      );

    const brandFoods =
      rawItems
        .map(
          normalizeItem,
        )
        .filter(
          (
            item,
          ): item is MfdsFood =>
            item !== null,
        );

    const foods =
      dedupeLatest(
        brandFoods,
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
            a.name.startsWith(
              query,
            );

          const startsB =
            b.name.startsWith(
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
              (food) =>
                !food.macroComplete,
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
        status: 500,
      },
    );
  }
}
