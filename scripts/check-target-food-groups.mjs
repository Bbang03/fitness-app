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

const TARGETS = [
  '버거',
  '햄버거',
  '샌드위치',
  '치킨',
  '피자',
  '핫도그',
  '토스트',
  '볶음밥',
  '파스타',
  '떡볶이',
];

async function searchFood(
  keyword,
) {
  const params =
    new URLSearchParams({
      serviceKey,
      pageNo: '1',
      numOfRows: '500',
      type: 'json',
      FOOD_NM_KR: keyword,
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

const result = [];

for (
  const keyword
  of TARGETS
) {
  console.log(
    `${keyword} 검색 중...`,
  );

  const items =
    await searchFood(
      keyword,
    );

  let franchise = 0;
  let complete = 0;
  let valid = 0;

  const examples = [];

  for (
    const item
    of items
  ) {
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
      continue;
    }

    franchise++;

    const kcal =
      num(item.AMT_NUM1);

    const protein =
      num(item.AMT_NUM3);

    const carbs =
      num(item.AMT_NUM6);

    const fat =
      num(item.AMT_NUM4);

    if (
      kcal === null ||
      protein === null ||
      carbs === null ||
      fat === null ||
      kcal <= 0
    ) {
      continue;
    }

    complete++;

    const macroKcal =
      carbs * 4 +
      protein * 4 +
      fat * 9;

    const gap =
      Math.abs(
        macroKcal - kcal,
      ) / kcal;

    if (
      gap <= 0.15
    ) {
      valid++;

      if (
        examples.length < 5
      ) {
        examples.push({
          name:
            item.FOOD_NM_KR,

          brand:
            item.MAKER_NM,

          kcal,
          protein,
          carbs,
          fat,

          gap:
            (
              gap * 100
            ).toFixed(1) +
            '%',
        });
      }
    }
  }

  result.push({
    keyword,
    franchise,
    complete,
    valid,

    validRate:
      franchise > 0
        ? (
            valid /
            franchise *
            100
          ).toFixed(1) +
          '%'
        : '0%',
  });

  console.log(
    `  전체 ${franchise}, 완전 ${complete}, 검증 ${valid}`,
  );

  if (
    examples.length >
    0
  ) {
    console.table(
      examples,
    );
  }

  console.log('');
}

console.log('');
console.log(
  '====== 최종 요약 ======',
);

console.table(
  result,
);