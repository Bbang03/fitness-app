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
        .replace(/,/g, ''),
    );

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

function createStat() {
  return {
    total: 0,
    complete: 0,
    valid: 0,
    missingCarbs: 0,
    missingFat: 0,
  };
}

function addToStat(
  map,
  key,
  item,
) {
  const name =
    String(key || '기타')
      .trim() || '기타';

  if (!map.has(name)) {
    map.set(
      name,
      createStat(),
    );
  }

  const stat =
    map.get(name);

  stat.total++;

  const kcal =
    num(item.AMT_NUM1);

  const protein =
    num(item.AMT_NUM3);

  const fat =
    num(item.AMT_NUM4);

  const carbs =
    num(item.AMT_NUM6);

  if (carbs === null) {
    stat.missingCarbs++;
  }

  if (fat === null) {
    stat.missingFat++;
  }

  if (
    kcal === null ||
    protein === null ||
    carbs === null ||
    fat === null ||
    kcal <= 0
  ) {
    return;
  }

  stat.complete++;

  const macroKcal =
    carbs * 4 +
    protein * 4 +
    fat * 9;

  const gap =
    Math.abs(
      macroKcal - kcal,
    ) / kcal;

  if (gap <= 0.15) {
    stat.valid++;
  }
}

function printMap(
  title,
  map,
  limit = 20,
) {
  console.log('');
  console.log(
    `====== ${title} ======`,
  );

  const rows =
    [...map.entries()]
      .map(
        ([name, stat]) => ({
          name,
          ...stat,

          validRate:
            stat.total > 0
              ? (
                  stat.valid /
                  stat.total *
                  100
                ).toFixed(1) +
                '%'
              : '0%',
        }),
      )
      .sort(
        (a, b) =>
          b.total -
          a.total,
      )
      .slice(
        0,
        limit,
      );

  console.table(
    rows,
  );
}

const originStats =
  new Map();

const groupStats =
  new Map();

const franchiseRows =
  [];

const PAGE_SIZE = 500;
const MAX_PAGES = 10;

for (
  let page = 1;
  page <= MAX_PAGES;
  page++
) {
  console.log(
    `MFDS page ${page} 요청 중...`,
  );

  const params =
    new URLSearchParams({
      serviceKey,
      pageNo:
        String(page),
      numOfRows:
        String(PAGE_SIZE),
      type: 'json',
    });

  const response =
    await fetch(
      `${API}?${params}`,
    );

  if (!response.ok) {
    throw new Error(
      `MFDS ${response.status}`,
    );
  }

  const json =
    await response.json();

  const items =
    getItems(json);

  if (
    items.length === 0
  ) {
    break;
  }

  for (
    const item
    of items
  ) {
    addToStat(
      originStats,
      item.FOOD_OR_NM,
      item,
    );

    addToStat(
      groupStats,
      item.DB_GRP_NM ||
        item.FOOD_CAT1_NM ||
        item.DB_CLASS_NM,
      item,
    );

    const origin =
      String(
        item.FOOD_OR_NM ??
          '',
      );

    if (
      origin.includes(
        '프랜차이즈',
      )
    ) {
      const kcal =
        num(item.AMT_NUM1);

      const protein =
        num(item.AMT_NUM3);

      const carbs =
        num(item.AMT_NUM6);

      const fat =
        num(item.AMT_NUM4);

      const complete =
        kcal !== null &&
        protein !== null &&
        carbs !== null &&
        fat !== null;

      franchiseRows.push({
        name:
          item.FOOD_NM_KR,

        brand:
          item.MAKER_NM,

        origin:
          item.FOOD_OR_NM,

        kcal,
        protein,
        carbs,
        fat,

        complete,
      });
    }
  }
}

printMap(
  'FOOD_OR_NM 분포',
  originStats,
);

printMap(
  'DB 그룹 분포',
  groupStats,
);

const completeFranchise =
  franchiseRows.filter(
    (row) =>
      row.complete,
  );

console.log('');
console.log(
  '====== 프랜차이즈 ======',
);

console.log(
  '프랜차이즈 전체:',
  franchiseRows.length,
);

console.log(
  '프랜차이즈 탄단지 완전:',
  completeFranchise.length,
);

console.log(
  '완전 비율:',
  franchiseRows.length
    ? (
        completeFranchise.length /
        franchiseRows.length *
        100
      ).toFixed(1) + '%'
    : '0%',
);

console.log('');
console.log(
  '탄단지 완전 프랜차이즈 예시:',
);

console.table(
  completeFranchise
    .slice(
      0,
      30,
    ),
);